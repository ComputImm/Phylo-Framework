"use client";

import Link from "next/link";
import { useRunsList } from "@/features/runs/hooks";
import type { RunListFilters } from "@/features/runs/api";
import RunHistoryFilters from "@/components/runs/RunHistoryFilters";
import { formatRunDuration } from "@/lib/runDuration";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ResponsiveTable,
  ResponsiveTableBody,
  ResponsiveTableCell,
  ResponsiveTableHeader,
  ResponsiveTableRow,
} from "@/components/ui/responsive-table";
import { Button } from "@/components/ui/button";
import { ExternalLink, ChevronLeft, ChevronRight, Copy, GitCompare } from "lucide-react";
import { Loading } from "@/components/ui/loading";
import { useState } from "react";
import { notify } from "@/lib/notify";
import { retentionDate } from "@/features/runs/retention";

const PAGE_SIZE = 10;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function formatDatasetLabel(datasetName?: string | null, datasetFiles?: string[] | null) {
  if (datasetName && datasetName.trim()) return datasetName;
  if (datasetFiles && datasetFiles.length > 0) return datasetFiles.join(", ");
  return "—";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: "bg-muted text-muted-foreground",
    QUEUED: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    RUNNING: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    DONE: "bg-green-500/15 text-green-600 dark:text-green-400",
    ERROR: "bg-destructive/15 text-destructive",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

const RESULTS_EXPIRED_REASON =
  "The results of this run were removed at the end of the retention period. The run itself stays in your history.";

export default function RunHistoryPage() {
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<RunListFilters>({});
  const skip = page * PAGE_SIZE;
  const { data: runs, isLoading, error } = useRunsList({ skip, limit: PAGE_SIZE, filters });

  const hasMore = runs != null && runs.length === PAGE_SIZE;
  const hasPrev = page > 0;
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const handleFiltersChange = (next: RunListFilters) => {
    setFilters(next);
    setPage(0);
  };

  return (
    <main className="mx-auto max-w-5xl w-full p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Run history
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          View and manage your past runs.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
          <CardDescription>Your runs, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <RunHistoryFilters value={filters} onChange={handleFiltersChange} />

          {isLoading && <Loading label="Loading runs…" />}
          {error && (
            <p className="text-destructive text-sm py-4">
              Failed to load runs. Please try again.
            </p>
          )}
          {!isLoading && !error && (!runs || runs.length === 0) && (
            <p className="text-muted-foreground text-sm py-8 text-center">
              {hasActiveFilters
                ? "No runs match your filters. Try adjusting or clearing them."
                : "No runs yet. Start a run from the Run model page."}
            </p>
          )}
          {!isLoading && !error && runs && runs.length > 0 && (
            <>
              <ResponsiveTable stackBelow="lg" labelPlacement="side">
                <ResponsiveTableHeader
                  columns={[
                    "Run ID",
                    "Method",
                    "Dataset",
                    "Status",
                    "Duration",
                    "Created",
                    { label: "Action", className: "text-right" },
                  ]}
                />
                <ResponsiveTableBody>
                  {runs.map((run) => {
                    const datasetLabel = formatDatasetLabel(run.dataset_name, run.dataset_files);
                    const durationLabel = formatRunDuration(run.started_at, run.finished_at);
                    return (
                      <ResponsiveTableRow key={run.id}>
                        <ResponsiveTableCell label="Run ID" className="font-mono text-xs">
                          <div className="flex items-center gap-1 @4xl:max-w-[14rem]">
                            <span className="min-w-0 break-all @4xl:truncate" title={run.id}>
                              {run.id}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => {
                                navigator.clipboard.writeText(run.id).then(
                                  () => notify.success("Run ID copied"),
                                  () => notify.error("Copy failed")
                                );
                              }}
                              title="Copy Run ID"
                              aria-label="Copy Run ID"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </ResponsiveTableCell>
                        <ResponsiveTableCell label="Method">{run.method_id}</ResponsiveTableCell>
                        <ResponsiveTableCell label="Dataset" className="text-muted-foreground">
                          <span
                            className="@4xl:inline-block @4xl:max-w-[16rem] @4xl:truncate @4xl:align-bottom"
                            title={datasetLabel}
                          >
                            {datasetLabel}
                          </span>
                        </ResponsiveTableCell>
                        <ResponsiveTableCell label="Status">
                          {statusBadge(run.status)}
                          {run.progress != null && run.status === "RUNNING" && (
                            <span className="ml-2 text-muted-foreground">
                              {run.progress}%
                            </span>
                          )}
                          {run.results_expired ? (
                            <>
                              <span
                                data-testid="run-results-expired"
                                className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                                title={RESULTS_EXPIRED_REASON}
                              >
                                Results expired
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground pointer-fine:hidden">
                                {RESULTS_EXPIRED_REASON}
                              </span>
                            </>
                          ) : (
                            run.status === "DONE" && retentionDate(run.expires_at) && (
                              <span
                                data-testid="run-results-kept-until"
                                className="mt-1 block text-xs text-muted-foreground"
                              >
                                kept until {retentionDate(run.expires_at)}
                              </span>
                            )
                          )}
                        </ResponsiveTableCell>
                        <ResponsiveTableCell label="Duration" className="text-muted-foreground">
                          {durationLabel ?? "—"}
                        </ResponsiveTableCell>
                        <ResponsiveTableCell label="Created" className="text-muted-foreground">
                          {formatDate(run.created_at)}
                        </ResponsiveTableCell>
                        <ResponsiveTableCell>
                          <div className="flex flex-wrap items-center gap-2 pt-1 @4xl:flex-nowrap @4xl:justify-end @4xl:gap-1 @4xl:pt-0">
                            <Link href={`/dashboard?runId=${run.id}`} className="flex-1 @4xl:flex-none">
                              <Button variant="ghost" size="sm" className="w-full gap-1 border @4xl:w-auto @4xl:border-0">
                                View details
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </Link>
                            {run.status === "DONE" && !run.results_expired && (
                              <Link
                                href={`/dashboard/comparison?baseRunId=${encodeURIComponent(run.id)}`}
                                className="flex-1 @4xl:flex-none"
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full gap-1 border @4xl:w-auto @4xl:border-0"
                                  title="Open Sequence Trace with other runs on the same dataset"
                                >
                                  <GitCompare className="h-3 w-3" />
                                  Sequence Trace
                                </Button>
                              </Link>
                            )}
                          </div>
                        </ResponsiveTableCell>
                      </ResponsiveTableRow>
                    );
                  })}
                </ResponsiveTableBody>
              </ResponsiveTable>
              {(hasPrev || hasMore) && (
                <div className="flex items-center justify-between gap-4 pt-4 mt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={!hasPrev}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page + 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasMore}
                    className="gap-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
