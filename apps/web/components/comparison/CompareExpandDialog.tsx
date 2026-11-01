"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crosshair, X } from "lucide-react";
import { Spinner } from "@/components/ui/loading";
import type { LineagePlot, RunTreeListItem, TreeNodeAttrs } from "@phylo/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RunsApi } from "@/features/runs/api";
import TreeView, { type CollapseSignal } from "@/components/phylo/tree/TreeView";
import SequenceTraceInfoIcon from "@/components/sequence-trace/SequenceTraceInfoIcon";
import SnapPager from "@/components/common/SnapPager";
import { useBackdropDismiss } from "@/lib/hooks/useDismissOnOutside";

export type CompareExpandTreeRef = {
  panelId: string;
  /** Short name for this tree in the phone pager. */
  label: string;
  runId: string;
  treeIndex: number;
};

type CompareExpandDialogProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  trees: CompareExpandTreeRef[];
  /** The tree to show first on a phone, where only one is visible at a time. */
  initialPanelId?: string;
  /** Initial search text seeded from the page when the dialog opens. */
  highlightText: string;
  displayIdField: string;
  methodNameById: Map<string, string>;
  /** Broadcast collapse/expand-all from the page toolbar. */
  collapseSignal?: CollapseSignal;
  /** Resolved colour-by field from the page toolbar. */
  colorByField?: string;
};

type ExpandTreeTileProps = {
  open: boolean;
  treeRef: CompareExpandTreeRef;
  highlightText: string;
  displayIdField: string;
  markMatches: boolean;
  focusSignal: number;
  collapseSignal?: CollapseSignal;
  colorByField?: string;
  methodNameById: Map<string, string>;
};

function useRunStatus(runId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["runStatus", runId],
    queryFn: () => RunsApi.status(runId!),
    enabled: !!runId && enabled,
    refetchInterval: false,
  });
}

function useRunTrees(runId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["runTrees", runId],
    queryFn: () => RunsApi.trees(runId!),
    enabled: !!runId && enabled,
  });
}

function useTreePayload(runId: string | null, treeId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["runTree", runId, treeId],
    queryFn: () => RunsApi.tree(runId!, treeId!),
    enabled: !!runId && !!treeId && enabled,
  });
}

function treeStatusLabel(tree: RunTreeListItem | undefined, treeIndex: number): string {
  const cloneText = String(tree?.cloneId ?? "").trim();
  if (cloneText) return `Tree ${treeIndex + 1} (clone ${cloneText})`;
  return `Tree ${treeIndex + 1}`;
}

const ExpandTreeTile = memo(function ExpandTreeTile({
  open,
  treeRef,
  highlightText,
  displayIdField,
  markMatches,
  focusSignal,
  collapseSignal,
  colorByField,
  methodNameById,
}: ExpandTreeTileProps) {
  const { data: status, isLoading: statusLoading } = useRunStatus(treeRef.runId, open);
  const done = status?.status === "DONE";
  const { data: treesResponse, isLoading: treesLoading } = useRunTrees(treeRef.runId, open && done);
  const trees = treesResponse?.trees ?? [];

  const resolvedTreeIndex =
    trees.length === 0 ? 0 : Math.max(0, Math.min(treeRef.treeIndex, trees.length - 1));
  const tree = trees[resolvedTreeIndex] as RunTreeListItem | undefined;
  const treeId = tree?.treeId ?? null;

  const { data: payload, isLoading: payloadLoading } = useTreePayload(
    treeRef.runId,
    treeId,
    open && done && !!treeId,
  );

  const lineagePlot = payload?.lineage_plot as LineagePlot | null | undefined;
  const nodeAttributes = (payload?.node_attributes ?? undefined) as
    | Record<string, TreeNodeAttrs>
    | undefined;
  const newickText = payload?.original_newick ?? payload?.newick ?? "";
  const canRenderLineage = (tree?.hasLineagePlot ?? false) && !!lineagePlot;

  const methodId = status?.method_id ?? "";
  const methodTitle = (methodId && (methodNameById.get(methodId) ?? methodId)) || "—";

  return (
    <Card className="flex w-full shrink-0 flex-col md:w-[min(92vw,680px)]">
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-base">{methodTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {treeStatusLabel(tree, resolvedTreeIndex)} · {status?.status ?? "—"}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4">
        {(statusLoading || treesLoading || payloadLoading) && (
          <div className="flex items-center gap-2 rounded border p-4 text-sm text-muted-foreground">
            <Spinner className="shrink-0" />
            Loading tree…
          </div>
        )}

        {!statusLoading && status && !done && (
          <p className="rounded border p-3 text-sm text-muted-foreground">
            Run status is <strong>{status.status}</strong>. Expanded view is available once the run is DONE.
          </p>
        )}

        {!statusLoading && done && trees.length === 0 && (
          <p className="rounded border p-3 text-sm text-muted-foreground">No trees are available for this run.</p>
        )}

        {!payloadLoading && canRenderLineage && lineagePlot && (
          <div className="h-[calc(100dvh-19rem)] min-h-72 md:h-[70dvh]">
            <TreeView
              source={{ kind: "lineage", lineagePlot, nodeAttributes }}
              displayIdField={displayIdField || undefined}
              filename={`comparison-expand-${treeRef.runId}-${treeId}`}
              newickText={newickText || undefined}
              highlightText={highlightText || undefined}
              markMatches={markMatches}
              focusSignal={focusSignal}
              collapseSignal={collapseSignal}
              colorByField={colorByField}
              germlineLabel={lineagePlot?.meta?.germlineLabel ?? null}
              height="100%"
            />
          </div>
        )}

        {!payloadLoading && done && tree && !canRenderLineage && (
          <p className="rounded border p-3 text-sm text-muted-foreground">
            No lineage plot is available for this tree.
          </p>
        )}
      </CardContent>
    </Card>
  );
});

export default function CompareExpandDialog({
  open,
  onOpenChange,
  trees,
  initialPanelId,
  highlightText,
  displayIdField,
  methodNameById,
  collapseSignal,
  colorByField,
}: CompareExpandDialogProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const backdropProps = useBackdropDismiss(close);
  const [query, setQuery] = useState(highlightText);
  const [mark, setMark] = useState(false);
  const [focus, setFocus] = useState(0);

  useEffect(() => {
    if (!open) return;
    // Seed the in-dialog search from the page's current text each time it opens.
    setQuery(highlightText);
    setMark(false);
  }, [open, highlightText]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

  if (!open) return null;

  const showMe = () => {
    if (!query.trim()) return;
    setMark(true);
    setFocus((n) => n + 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 overscroll-contain bg-black/60 sm:p-5"
      role="dialog"
      aria-modal="true"
      {...backdropProps}
    >
      <div className="mx-auto flex h-full w-full flex-col border bg-background shadow-xl max-sm:border-0 sm:max-w-[99vw] sm:rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-none">
            <h3 className="truncate text-base font-semibold">Expanded Sequence Trace gallery</h3>
            <SequenceTraceInfoIcon />
          </div>
          <div className="order-last flex w-full flex-wrap items-center justify-end gap-2 md:order-none md:w-auto md:flex-1">
            <Input
              placeholder="full sequence_id…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMark(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && showMe()}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-auto min-w-0 flex-1 md:max-w-xs"
            />
            <Button type="button" onClick={showMe} disabled={!query.trim()} className="gap-1.5">
              <Crosshair className="h-4 w-4" />
              Show me
            </Button>
            {(query || mark) && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setQuery("");
                  setMark(false);
                }}
              >
                Clear
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close expanded Sequence Trace"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-2 sm:p-4">
          {trees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trees are currently selected in this Sequence Trace panel.</p>
          ) : (
            <SnapPager
              labels={trees.map((treeRef) => treeRef.label)}
              initialIndex={Math.max(0, trees.findIndex((treeRef) => treeRef.panelId === initialPanelId))}
              className="md:flex md:items-start md:gap-4 md:overflow-x-auto md:pb-2"
            >
              {trees.map((treeRef) => (
                <ExpandTreeTile
                  key={treeRef.panelId}
                  open={open}
                  treeRef={treeRef}
                  highlightText={query}
                  displayIdField={displayIdField}
                  markMatches={mark}
                  focusSignal={focus}
                  collapseSignal={collapseSignal}
                  colorByField={colorByField}
                  methodNameById={methodNameById}
                />
              ))}
            </SnapPager>
          )}
        </div>
      </div>
    </div>
  );
}
