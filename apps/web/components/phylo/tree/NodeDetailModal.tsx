"use client";

import { ChevronsDownUp, Copy } from "lucide-react";
import { notify } from "@/lib/notify";
import Overlay from "@/components/common/Overlay";
import { Button } from "@/components/ui/button";
import type { NodeDetail } from "@/components/phylo/tree/core";

function CopyableValue({ value }: { value: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value).then(
      () => notify.success("Copied"),
      () => notify.error("Copy failed"),
    );
  };
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 flex-1 break-all font-mono text-xs" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy value"
        title="Copy"
        className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground pointer-coarse:p-3.5"
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Modal showing a clicked node's full info as a two-column (Field / Value) table.
 * Long values wrap, with a copy button. Open when `detail` is non-null.
 * `onCollapse` adds a button for nodes with children: the reachable way to collapse
 * on touch, where right-click does not exist and long-press is hidden.
 */
export default function NodeDetailModal({
  detail,
  onClose,
  onCollapse,
}: {
  detail: NodeDetail | null;
  onClose: () => void;
  onCollapse?: () => void;
}) {
  return (
    <Overlay open={!!detail} onClose={onClose} title={detail?.title ?? "Node"}>
      {detail && detail.rows.length > 0 ? (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-1/3 py-2 pr-4 font-medium">Field</th>
              <th className="py-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {detail.rows.map((row) => (
              <tr key={row.key} className="border-b align-top last:border-0">
                <td className="w-1/3 py-2 pr-4 font-medium text-muted-foreground">
                  <span className="block wrap-anywhere" title={row.key}>
                    {row.key}
                  </span>
                </td>
                <td className="min-w-0 py-2">
                  <CopyableValue value={row.value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No additional information for this node.</p>
      )}
      {onCollapse && (
        <Button type="button" variant="outline" size="sm" className="mt-4 w-full gap-1.5" onClick={onCollapse}>
          <ChevronsDownUp className="size-4" />
          Collapse subtree
        </Button>
      )}
    </Overlay>
  );
}
