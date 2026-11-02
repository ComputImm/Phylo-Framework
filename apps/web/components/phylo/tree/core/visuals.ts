// Turns a layout into the arrays both the SVG renderer and the export serialiser
// draw from (one source of truth for "what to draw"). Pure and unit-testable.

import { subtreeColorSummary } from "./collapse";
import type { EdgeVisual, GlyphVisual, NodeVisual } from "./download";
import { buildRows } from "./lineageDisplay";
import { buildTipRows, resolveTipDisplayLabel } from "./phyloDisplay";
import { truncateLabel } from "./text";
import type { TraceResult } from "./trace";
import type { ColorScale, NodeDetail, TreeLayout, TreeModel } from "./types";

const PHYLO_INTERNAL_RADIUS = 2.5;
const PHYLO_INTERNAL_HIT_RADIUS = 4; // invisible click target when internals hidden
const PHYLO_INTERNAL_FILL = "transparent";

export type TreeVisualOptions = {
  isLineage: boolean;
  matchIds: ReadonlySet<string>;
  /** Path + subtree of a Sequence Trace; everything else is faded. Null = no focus. */
  focusIds: ReadonlySet<string> | null;
  trace: TraceResult | null;
  displayIdField?: string | null;
  showLabels: boolean;
  showInternalNodes: boolean;
  showNodeNumbers: boolean;
  colorScale: ColorScale;
  highlightColor: string | null;
};

export type TreeVisuals = {
  visuals: NodeVisual[];
  edges: EdgeVisual[];
  glyphs: GlyphVisual[];
  detailById: Map<string, NodeDetail>;
  /** Bounding box of the in-focus set, for "Show me" → fitToView. */
  focusBounds: { x: number; y: number; width: number; height: number } | null;
};

/**
 * The node closest to a point, if any lies within `maxDistance` (content px). For
 * touch: at fit zoom most nodes are far smaller than a fingertip.
 */
export function nearestNodeId(
  nodes: readonly NodeVisual[],
  x: number,
  y: number,
  maxDistance: number,
): string | null {
  let nearest: string | null = null;
  let best = maxDistance * maxDistance;
  for (const node of nodes) {
    if (node.faded) continue;
    const distance = (node.cx - x) ** 2 + (node.cy - y) ** 2;
    if (distance <= best) {
      best = distance;
      nearest = node.id;
    }
  }
  return nearest;
}

export function buildTreeVisuals(layout: TreeLayout, model: TreeModel, options: TreeVisualOptions): TreeVisuals {
  const {
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
  } = options;
  const out: NodeVisual[] = [];
  const glyphOut: GlyphVisual[] = [];
  const details = new Map<string, NodeDetail>();
  let internalCount = 0;
  // bbox of the in-focus set (for "Show me" → fitToView).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x0: number, y0: number, x1: number, y1: number) => {
    if (x0 < minX) minX = x0;
    if (y0 < minY) minY = y0;
    if (x1 > maxX) maxX = x1;
    if (y1 > maxY) maxY = y1;
  };
  const inFocus = (id: string) => focusIds == null || focusIds.has(id);

  for (const ln of layout.nodes) {
    const label = ln.node.label;
    const anno = ln.node.attrs;
    const faded = focusIds != null && !focusIds.has(ln.id);

    // Collapsed subtree → a wedge glyph (expand on click), no circle.
    if (ln.isCollapsed) {
      const summary = subtreeColorSummary(model, ln.id, (node) => {
        const c = colorScale.colorFor(node);
        return { key: c, color: c };
      });
      const farX = ln.glyphFarXPixel ?? ln.xPixel;
      const hh = ln.glyphHalfHeight ?? 0;
      glyphOut.push({
        id: ln.id,
        apexX: ln.xPixel,
        y: ln.y,
        farX,
        halfHeight: hh,
        fill: summary ? summary.modalColor : colorScale.colorFor(ln.node),
        striped: summary ? summary.multiple : false,
        isMatch: false,
        faded,
        labelText: showLabels
          ? `n=${ln.node.subtreeLeafCount} · Σ=${ln.node.subtreeAbundanceSum ?? "unknown"}`
          : null,
      });
      if (inFocus(ln.id)) grow(ln.xPixel, ln.y - hh, farX, ln.y + hh);
      continue;
    }

    const isMatch = matchIds.has(ln.id);
    if (inFocus(ln.id)) {
      grow(ln.xPixel - ln.radius, ln.y - ln.radius, ln.xPixel + ln.radius, ln.y + ln.radius);
    }

    if (isLineage) {
      const fill = colorScale.colorFor(ln.node);
      out.push({
        id: ln.id,
        abundance: ln.node.abundance,
        cx: ln.xPixel,
        cy: ln.y,
        r: ln.radius,
        fill,
        stroke: "#111827",
        strokeWidth: 1.1,
        hollow: false,
        isMatch,
        ringed: highlightColor != null && fill === highlightColor,
        isCollapsible: ln.node.childIds.length > 0,
        faded,
        labelShown: ln.labelShown,
        labelText: truncateLabel(ln.displayLabel, layout.maxLabelChars),
        numberText: null,
      });
      details.set(ln.id, { title: ln.displayLabel || label || ln.id, rows: buildRows(ln.node) });
      continue;
    }

    // Phylogeny
    if (ln.isLeaf) {
      const fill = colorScale.colorFor(ln.node);
      const displayLabel = resolveTipDisplayLabel(label, anno, displayIdField ?? null);
      out.push({
        id: ln.id,
        abundance: ln.node.abundance,
        cx: ln.xPixel,
        cy: ln.y,
        r: ln.radius,
        fill,
        stroke: null,
        strokeWidth: 0,
        hollow: false,
        isMatch,
        ringed: highlightColor != null && fill === highlightColor,
        isCollapsible: false,
        faded,
        labelShown: showLabels,
        labelText: truncateLabel(displayLabel, layout.maxLabelChars),
        numberText: null,
      });
      details.set(ln.id, buildTipRows(label, anno, displayIdField ?? null));
    } else {
      // Internal node. When internals are shown: hollow ring + optional number.
      // When hidden: an invisible hit target so the branch point stays
      // collapsible (a chevron marks it at full zoom).
      internalCount += 1;
      out.push({
        id: ln.id,
        abundance: ln.node.abundance,
        cx: ln.xPixel,
        cy: ln.y,
        r: showInternalNodes ? PHYLO_INTERNAL_RADIUS : PHYLO_INTERNAL_HIT_RADIUS,
        fill: showInternalNodes ? "none" : PHYLO_INTERNAL_FILL,
        stroke: showInternalNodes ? "currentColor" : null,
        strokeWidth: showInternalNodes ? 1.2 : 0,
        hollow: showInternalNodes,
        isMatch: false,
        ringed: false,
        isCollapsible: ln.node.childIds.length > 0,
        faded,
        labelShown: false,
        labelText: "",
        numberText: showInternalNodes && showNodeNumbers ? `#${internalCount}` : null,
      });
      details.set(ln.id, buildTipRows(label, anno, displayIdField ?? null));
    }
  }

  const edgeVisuals: EdgeVisual[] = layout.edges.map((e) => ({
    key: e.key,
    d: `M ${e.sx} ${e.sy} L ${e.sx} ${e.ty} L ${e.tx} ${e.ty}`,
    onPath: trace != null && trace.pathIds.has(e.sourceId) && trace.pathIds.has(e.targetId),
    faded: focusIds != null && !(focusIds.has(e.sourceId) && focusIds.has(e.targetId)),
  }));

  const bounds =
    focusIds && Number.isFinite(minX)
      ? { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
      : null;

  return { visuals: out, edges: edgeVisuals, glyphs: glyphOut, detailById: details, focusBounds: bounds };
}
