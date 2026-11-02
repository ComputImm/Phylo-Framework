"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useMethods } from "@/features/methods/hooks";
import type { RunListFilters } from "@/features/runs/api";
import { cn } from "@/lib/utils";

const STATUSES = ["PENDING", "QUEUED", "RUNNING", "DONE", "ERROR", "CANCELLED"] as const;
const ALL = "__all";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default function RunHistoryFilters({
  value,
  onChange,
}: {
  value: RunListFilters;
  onChange: (next: RunListFilters) => void;
}) {
  const { data: methods } = useMethods();
  const [runIdInput, setRunIdInput] = useState(value.runId ?? "");
  const [datasetInput, setDatasetInput] = useState(value.dataset ?? "");

  // Read latest props inside the debounce without making them effect deps.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  // Debounce the free-text fields before hitting the backend.
  useEffect(() => {
    const id = setTimeout(() => {
      const { value: v, onChange: cb } = latest.current;
      const next = runIdInput.trim() || undefined;
      if ((v.runId ?? undefined) !== next) cb({ ...v, runId: next });
    }, 300);
    return () => clearTimeout(id);
  }, [runIdInput]);

  useEffect(() => {
    const id = setTimeout(() => {
      const { value: v, onChange: cb } = latest.current;
      const next = datasetInput.trim() || undefined;
      if ((v.dataset ?? undefined) !== next) cb({ ...v, dataset: next });
    }, 300);
    return () => clearTimeout(id);
  }, [datasetInput]);

  // Keep inputs in sync when filters are cleared/changed externally.
  useEffect(() => setRunIdInput(value.runId ?? ""), [value.runId]);
  useEffect(() => setDatasetInput(value.dataset ?? ""), [value.dataset]);

  const activeCount = [value.runId, value.dataset, value.status, value.methodId, value.createdOn].filter(
    Boolean,
  ).length;
  const hasActive = activeCount > 0;
  // Phones only: the filters would otherwise push the results off the first screen.
  const [expanded, setExpanded] = useState(false);

  const clear = () => {
    setRunIdInput("");
    setDatasetInput("");
    onChange({});
  };

  return (
    <div className="mb-5 rounded-xl border bg-card/40 p-4">
      <div className="flex items-center justify-between gap-2 md:mb-3">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="flex min-h-11 flex-1 items-center gap-2 text-left text-sm font-medium md:hidden"
        >
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          Filters{activeCount > 0 && ` (${activeCount})`}
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </button>
        <div className="hidden items-center gap-2 text-sm font-medium md:flex">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          Filters
        </div>
        {hasActive && (
          <Button variant="ghost" size="sm" onClick={clear} className="h-7 gap-1.5 px-2 text-xs">
            <X className="size-3.5" />
            Clear all
          </Button>
        )}
      </div>

      <div className={cn("grid-cols-1 gap-3 max-md:mt-3 sm:grid-cols-2 md:grid lg:grid-cols-3 xl:grid-cols-5", expanded ? "grid" : "hidden")}>
        <Field label="Run ID">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={runIdInput}
              onChange={(e) => setRunIdInput(e.target.value)}
              placeholder="Search run ID…"
              className="pl-8"
            />
          </div>
        </Field>

        <Field label="Dataset">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={datasetInput}
              onChange={(e) => setDatasetInput(e.target.value)}
              placeholder="Search dataset…"
              className="pl-8"
            />
          </div>
        </Field>

        <Field label="Status">
          <Select
            value={value.status ?? ALL}
            onValueChange={(v) => onChange({ ...value, status: v === ALL ? undefined : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Method">
          <Select
            value={value.methodId ?? ALL}
            onValueChange={(v) => onChange({ ...value, methodId: v === ALL ? undefined : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All methods</SelectItem>
              {(methods ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name || m.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Created">
          <Input
            type="date"
            value={value.createdOn ?? ""}
            onChange={(e) => onChange({ ...value, createdOn: e.target.value || undefined })}
          />
        </Field>
      </div>
    </div>
  );
}
