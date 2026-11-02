"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { LineagePlot, TreeNodeAttrs } from "@phylo/contracts";
import { Maximize, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import NodeDetailModal from "@/components/phylo/tree/NodeDetailModal";
import DownloadMenu from "@/components/phylo/tree/DownloadMenu";
import TreeSkeleton from "@/components/phylo/tree/TreeSkeleton";
import TreeLegend from "@/components/phylo/tree/TreeLegend";
import SvgTreeRenderer from "@/components/phylo/tree/renderers/SvgTreeRenderer";
import { useContainerSize } from "@/components/phylo/tree/hooks/useContainerSize";
import { useZoomPan } from "@/components/phylo/tree/hooks/useZoomPan";
import { COARSE_POINTER, PHONE_SIZED, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  fromLineagePlot,
  fromNewick,
  layoutTree,
  narrowPanePlotWidth,
  buildColorScale,
  buildTreeVisuals,
  nearestNodeId,
  resolveNodeDisplayLabel,
  resolveTipDisplayLabel,
  serializeTreeSvg,
  downloadSvg,
  downloadPng,
  downloadNewick,
  newickExportEntries,
  defaultCollapsed,
  collapseAll,
  expandAll,
  toggleCollapse,
  computeTrace,
  deriveTraceCollapsed,
  computeMatchIds,
  LOD_DETAIL_K,
  quantizeZoom,
  type PhyloAnnotation,
  type ColorScale,
  type TreeNodeModel,
} from "@/components/phylo/tree/core";

export type TreeSource =
  | { kind: "lineage"; lineagePlot: LineagePlot; nodeAttributes?: Record<string, TreeNodeAttrs> }
  | { kind: "phylogeny"; newick: string; annotations?: ReadonlyArray<PhyloAnnotation> };

export type CollapseSignal = { type: "expandAll" | "collapseAll"; nonce: number } | null;

export type TreeViewProps = {
  source: TreeSource;
  /** Display */
  displayIdField?: string | null;
  showLabels?: boolean;
  showInternalNodes?: boolean;
  showNodeNumbers?: boolean;
  /** Colour by (Phase 4). Concrete field: "abundance" | attr key | "none" | null.
   * Callers resolve the view-aware "auto" default before passing. */
  colorByField?: string | null;
  /** Cross-panel colour domain (union of values) so siblings agree. */
  colorDomain?: readonly string[] | null;
  /** Label whose value marks the germline/root (given its own token, excluded). */
  germlineLabel?: string | null;
  unknownValue?: string;
  onColorScaleChange?: (scale: ColorScale) => void;
  sizeBy?: string | null;
  /** Sequence Trace */
  highlightText?: string | null;
  markMatches?: boolean;
  focusSignal?: number;
  /** Collapse (Phase 3): bump `nonce` to expand-all / collapse-all. */
  collapseSignal?: CollapseSignal;
  /** Chrome */
  filename?: string;
  newickText?: string | null;
  displayNewick?: string | null;
  height?: number | string;
  isLoading?: boolean;
  /** Opens a full-screen copy of this tree. When given, phones show a touch-scrollable preview. */
  onExplore?: () => void;
  className?: string;
};

const DEFAULT_HEIGHT = 520;
const PREVIEW_HEIGHT = "min(60dvh, 420px)";
const TOUCH_REACH = 24; // screen px
const COMPACT_LEGEND_WIDTH = 480; // px; below this an open legend would cover the tree

export default function TreeView({
  source,
  displayIdField,
  showLabels = true,
  showInternalNodes = false,
  showNodeNumbers = false,
  colorByField = "abundance",
  colorDomain,
  germlineLabel,
  unknownValue,
  onColorScaleChange,
  sizeBy = null,
  highlightText,
  markMatches = false,
  focusSignal,
  collapseSignal,
  filename = "tree",
  newickText,
  displayNewick,
  height,
  isLoading = false,
  onExplore,
  className,
}: TreeViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightColor, setHighlightColor] = useState<string | null>(null);

  // Stable primitives for memo deps (caller passes a fresh `source` object each render).
  const lineagePlot = source.kind === "lineage" ? source.lineagePlot : null;
  const lineageAttrs = source.kind === "lineage" ? source.nodeAttributes : undefined;
  const newick = source.kind === "phylogeny" ? source.newick : "";
  const annotations = source.kind === "phylogeny" ? source.annotations : undefined;

  const model = useMemo(
    () =>
      source.kind === "lineage"
        ? fromLineagePlot(lineagePlot!, lineageAttrs)
        : fromNewick(newick, {
            annotations: annotations ? [...annotations] : undefined,
            sizeByField: sizeBy ?? null,
          }),
    [source.kind, lineagePlot, lineageAttrs, newick, annotations, sizeBy],
  );

  const isLineage = source.kind === "lineage";

  // Collapse state (a Set of ids) — never mutates the model. Reset per model.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => defaultCollapsed(model));
  useEffect(() => {
    setCollapsed(defaultCollapsed(model));
  }, [model]);

  // Expand-all / Collapse-all broadcasts.
  const lastNonce = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!collapseSignal) return;
    if (lastNonce.current === collapseSignal.nonce) return;
    lastNonce.current = collapseSignal.nonce;
    setCollapsed(collapseSignal.type === "collapseAll" ? collapseAll(model) : expandAll());
  }, [collapseSignal, model]);

  const toggle = useCallback(
    (id: string) => {
      const node = model.nodes.get(id);
      if (!node || node.childIds.length === 0) return; // leaves never collapse
      setCollapsed((prev) => toggleCollapse(prev, id));
    },
    [model],
  );

  // Colour scale — one encoding for BOTH views (abundance / categorical / continuous).
  const colorScale = useMemo(
    () =>
      buildColorScale(model, colorByField ?? "none", {
        explicitValues: colorDomain ?? null,
        germlineLabel: germlineLabel ?? undefined,
        unknownValue,
      }),
    [model, colorByField, colorDomain, germlineLabel, unknownValue],
  );
  useEffect(() => {
    onColorScaleChange?.(colorScale);
  }, [colorScale, onColorScaleChange]);
  // Clear a legend highlight when the encoding changes.
  useEffect(() => {
    setHighlightColor(null);
  }, [colorScale]);

  const needle = highlightText?.trim().toLowerCase() ?? "";

  // Matched node ids. EXACT, whole-string match on identifier fields (lineage =
  // any node; phylogeny = leaves) — see core/match.ts.
  const matchIds = useMemo(
    () =>
      computeMatchIds(model, needle, {
        isLineage,
        displayIdField,
        showInternalNodes,
        showNodeNumbers,
      }),
    [needle, model, isLineage, displayIdField, showInternalNodes, showNodeNumbers],
  );

  // Sequence-Trace focus + context. Active only after "Show me" (markMatches). The
  // user's collapse set is LAYERED, never mutated → clearing the search restores it.
  const trace = useMemo(
    () => (markMatches && matchIds.size > 0 ? computeTrace(model, matchIds) : null),
    [markMatches, matchIds, model],
  );
  const effectiveCollapsed = useMemo(
    () => (trace ? deriveTraceCollapsed(model, collapsed, trace.pathIds, trace.subtreeIds) : collapsed),
    [trace, model, collapsed],
  );
  const focusIds = useMemo(() => {
    if (!trace) return null;
    const s = new Set(trace.pathIds);
    for (const id of trace.subtreeIds) s.add(id);
    return s;
  }, [trace]);

  const layoutOptions = useMemo(
    () => ({
      collapsed: effectiveCollapsed,
      showLabels,
      // Phylogeny internals never get right-column text labels (they get a
      // hollow ring + optional "#n"), so keep them out of the label geometry.
      showInternalNodes: isLineage ? showInternalNodes : false,
      displayLabelOf: isLineage
        ? (n: TreeNodeModel) => resolveNodeDisplayLabel(n, displayIdField, showInternalNodes, showNodeNumbers)
        : (n: TreeNodeModel) => resolveTipDisplayLabel(n.label, n.attrs, displayIdField ?? null),
    }),
    [effectiveCollapsed, isLineage, showLabels, showInternalNodes, showNodeNumbers, displayIdField],
  );

  const { ref: containerRef, size } = useContainerSize<HTMLDivElement>();
  // Narrow panes lay out to their own width so labels stay readable at fit zoom.
  const targetWidth = narrowPanePlotWidth(size.width);
  const layout = useMemo(
    () => layoutTree(model, { ...layoutOptions, targetWidth }),
    [model, layoutOptions, targetWidth],
  );

  const visualOptions = useMemo(
    () => ({
      isLineage,
      matchIds,
      focusIds,
      trace,
      displayIdField,
      showLabels,
      showInternalNodes,
      showNodeNumbers,
      colorScale,
      highlightColor,
    }),
    [
      isLineage,
      matchIds,
      focusIds,
      trace,
      displayIdField,
      showLabels,
      showInternalNodes,
      showNodeNumbers,
      colorScale,
      highlightColor,
    ],
  );
  const { visuals, edges, glyphs, detailById, focusBounds } = useMemo(
    () => buildTreeVisuals(layout, model, visualOptions),
    [layout, model, visualOptions],
  );

  // Exports always use the default width, so a figure saved on a phone matches one
  // saved on a desktop.
  const buildExport = () => {
    const full = layoutTree(model, layoutOptions);
    const exported = buildTreeVisuals(full, model, visualOptions);
    const markup = serializeTreeSvg(
      exported.visuals,
      exported.edges,
      { width: full.width, height: full.height, labelX: full.labelX, connectorX: full.connectorX, strokeWidth: 1 },
      exported.glyphs,
    );
    return { markup, width: full.width, height: full.height };
  };

  // On phones an inline tree lets touches scroll the page, and "Explore" opens the
  // full-screen copy that takes every gesture.
  const isPhone = useMediaQuery(PHONE_SIZED);
  const isPreview = isPhone && !!onExplore;
  const isCoarsePointer = useMediaQuery(COARSE_POINTER);

  // Zoom / pan. The svg is held as state (via a callback ref) so the zoom
  // behaviour attaches reliably even when the pane mounts after a skeleton.
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
  // Re-fit when the tree changes or the pane changes layout width (not on
  // display/collapse toggles).
  const fitKey = useMemo(() => ({ model, targetWidth }), [model, targetWidth]);
  const zoomApi = useZoomPan({
    svgEl,
    contentWidth: layout.width,
    contentHeight: layout.height,
    containerWidth: size.width,
    containerHeight: size.height,
    fitKey,
    touchGestures: !isPreview,
    readableInitialFit: isPhone && !isPreview,
  });

  // A tap that misses every node opens the nearest one within a fingertip's reach.
  const onTreeTap = (event: MouseEvent<SVGSVGElement>) => {
    if (!isCoarsePointer || (event.target as Element).closest('[role="button"]')) return;
    const box = event.currentTarget.getBoundingClientRect();
    const [x, y] = zoomApi.transform.invert([event.clientX - box.left, event.clientY - box.top]);
    const id = nearestNodeId(visuals, x, y, TOUCH_REACH / zoomApi.transform.k);
    if (id) setSelectedId(id);
  };

  const selectedDetail = selectedId ? (detailById.get(selectedId) ?? null) : null;

  // Two tiers: a compact "dots" overview only at extreme zoom-out, else "full".
  const k = zoomApi.transform.k || 1;
  const lod = k < LOD_DETAIL_K ? "dots" : "full";

  // "Show me" → fit to the path+subtree bbox (replaces scroll/point-zoom). Read
  // latest state via a ref so this fires only when focusSignal (the click) changes.
  const focusState = useRef({ focusBounds, markMatches, fitToView: zoomApi.fitToView });
  focusState.current = { focusBounds, markMatches, fitToView: zoomApi.fitToView };
  useEffect(() => {
    if (!focusSignal) return;
    const { focusBounds: fb, markMatches: mm, fitToView } = focusState.current;
    if (!mm || !fb) return;
    fitToView(fb, true);
  }, [focusSignal]);

  const newickForExport = newickText ?? (isLineage ? (lineagePlot?.meta?.normalizedNewick ?? "") : newick);
  const newickDownloads = newickExportEntries({
    filename,
    internalNewick: newickForExport,
    displayNewick,
  });

  const paneHeight = isPreview ? PREVIEW_HEIGHT : (height ?? DEFAULT_HEIGHT);

  if (isLoading) return <TreeSkeleton height={paneHeight} />;

  if (!visuals.length && !glyphs.length) {
    return (
      <div
        className="flex items-center justify-center rounded border bg-background p-6 text-sm text-muted-foreground"
        style={{ height: paneHeight }}
      >
        {layout.warnings[0]?.message ?? "No renderable tree data."}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`@container relative w-full overflow-hidden rounded border bg-background text-foreground ${className ?? ""}`}
      style={{ height: paneHeight }}
    >
      <svg
        ref={setSvgEl}
        className={cn(
          "absolute inset-0 h-full w-full select-none [-webkit-touch-callout:none]",
          isPreview ? "touch-manipulation" : "touch-none",
        )}
        role="img"
        onClick={onTreeTap}
      >
        <g transform={zoomApi.transform.toString()}>
          <SvgTreeRenderer
            nodes={visuals}
            edges={edges}
            glyphs={glyphs}
            zoomK={quantizeZoom(k)}
            lod={lod}
            labelX={layout.labelX}
            connectorX={layout.connectorX}
            highlightText={highlightText ?? null}
            markMatches={markMatches}
            onNodeClick={setSelectedId}
            onToggleCollapse={toggle}
          />
        </g>
      </svg>

      {/* Legend (top-left) */}
      <TreeLegend
        scale={colorScale}
        compact={size.width > 0 && size.width < COMPACT_LEGEND_WIDTH}
        activeColor={highlightColor}
        onToggle={(color) => setHighlightColor((prev) => (prev === color ? null : color))}
      />

      {/* Download (top-right) */}
      <div className="absolute right-3 top-3">
        <DownloadMenu
          formats={[
            {
              label: "PNG image",
              description: "Raster image of the whole tree",
              onSelect: () => {
                const { markup, width, height: exportHeight } = buildExport();
                downloadPng(markup, width, exportHeight, `${filename}.png`, () =>
                  notify.error("This device could not create the PNG. Try the SVG image instead."),
                );
              },
            },
            {
              label: "SVG image",
              description: "Scalable vector graphic",
              onSelect: () => downloadSvg(buildExport().markup, `${filename}.svg`),
            },
            ...newickDownloads.map((entry) => ({
              label: entry.label,
              description: entry.description,
              onSelect: () => downloadNewick(entry.newick, entry.filename),
              disabled: entry.disabled,
            })),
          ]}
        />
      </div>

      {/* Zoom controls, or the way into them on a phone (bottom-right) */}
      {isPreview ? (
        <Button type="button" size="sm" className="absolute bottom-3 right-3 gap-1.5 shadow-md" onClick={onExplore}>
          <Maximize2 className="size-4" />
          Explore
        </Button>
      ) : (
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <Button type="button" variant="outline" size="icon" onClick={zoomApi.zoomIn} aria-label="Zoom in">
            <ZoomIn className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={zoomApi.zoomOut} aria-label="Zoom out">
            <ZoomOut className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => zoomApi.fitToView(undefined, true)}
            aria-label="Fit to view"
          >
            <Maximize className="size-4" />
          </Button>
        </div>
      )}

      <NodeDetailModal
        detail={selectedDetail}
        onClose={() => setSelectedId(null)}
        onCollapse={
          selectedId && model.nodes.get(selectedId)?.childIds.length
            ? () => {
                toggle(selectedId);
                setSelectedId(null);
              }
            : undefined
        }
      />
    </div>
  );
}
