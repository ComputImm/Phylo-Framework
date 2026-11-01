import {describe, expect, it} from 'vitest';
import type {LineagePlot} from '@phylo/contracts';
import {buildColorScale} from '../colorScale';
import {fromLineagePlot} from '../fromLineagePlot';
import {quantizeZoom} from '../math';
import {layoutTree, narrowPanePlotWidth} from '../layout';
import {MIN_CONTENT_WIDTH, MIN_NARROW_PLOT_WIDTH, NARROW_PANE_WIDTH} from '../constants';
import {buildTreeVisuals, nearestNodeId, type TreeVisualOptions} from '../visuals';

const plot: LineagePlot = {
  format: 'lineage-plot-v1',
  nodes: [
    {id: 'r', label: 'r', x: 0, y: 50, isLeaf: false, abundance: 1},
    {id: 'a', label: 'a', x: 10, y: 20, isLeaf: true, abundance: 2},
    {id: 'b', label: 'a-rather-long-sequence-name', x: 20, y: 80, isLeaf: true, abundance: 3},
  ],
  edges: [
    {source: 'r', target: 'a'},
    {source: 'r', target: 'b'},
  ],
};
const model = fromLineagePlot(plot);
const layoutOptions = {showLabels: true, showInternalNodes: true, displayLabelOf: (n: {label: string}) => n.label};
const options: TreeVisualOptions = {
  isLineage: true,
  matchIds: new Set(),
  focusIds: null,
  trace: null,
  showLabels: true,
  showInternalNodes: true,
  showNodeNumbers: false,
  colorScale: buildColorScale(model, 'abundance'),
  highlightColor: null,
};

describe('narrowPanePlotWidth', () => {
  it('leaves wide and unmeasured panes on the default width', () => {
    expect(narrowPanePlotWidth(0)).toBeUndefined();
    expect(narrowPanePlotWidth(NARROW_PANE_WIDTH)).toBeUndefined();
    expect(narrowPanePlotWidth(1400)).toBeUndefined();
  });

  it('follows a narrow pane, down to a floor', () => {
    expect(narrowPanePlotWidth(500)).toBe(250);
    expect(narrowPanePlotWidth(300)).toBe(MIN_NARROW_PLOT_WIDTH);
  });
});

describe('layoutTree width', () => {
  it('keeps the minimum content width by default', () => {
    expect(layoutTree(model, layoutOptions).width).toBeGreaterThanOrEqual(MIN_CONTENT_WIDTH);
  });

  it('fits a narrow pane when given a target width, at the same height', () => {
    const wide = layoutTree(model, layoutOptions);
    const narrow = layoutTree(model, {...layoutOptions, targetWidth: 200});
    expect(narrow.width).toBeLessThan(500);
    expect(narrow.height).toBe(wide.height);
  });
});

describe('buildTreeVisuals', () => {
  it('draws every node and edge, with details for each', () => {
    const {visuals, edges, detailById, focusBounds} = buildTreeVisuals(layoutTree(model, layoutOptions), model, options);
    expect(visuals.map((v) => v.id).sort()).toEqual(['a', 'b', 'r']);
    expect(edges).toHaveLength(2);
    expect([...detailById.keys()].sort()).toEqual(['a', 'b', 'r']);
    expect(focusBounds).toBeNull();
  });

  it('marks matches and fades what is out of focus, with bounds around the focus', () => {
    const {visuals, focusBounds} = buildTreeVisuals(layoutTree(model, layoutOptions), model, {
      ...options,
      matchIds: new Set(['a']),
      focusIds: new Set(['r', 'a']),
    });
    const byId = new Map(visuals.map((v) => [v.id, v]));
    expect(byId.get('a')!.isMatch).toBe(true);
    expect(byId.get('b')!.faded).toBe(true);
    expect(byId.get('a')!.faded).toBe(false);
    expect(focusBounds).not.toBeNull();
  });

  it('marks only nodes with children as collapsible', () => {
    const {visuals} = buildTreeVisuals(layoutTree(model, layoutOptions), model, options);
    const collapsible = visuals.filter((v) => v.isCollapsible).map((v) => v.id);
    expect(collapsible).toEqual(['r']);
  });
});

describe('nearestNodeId', () => {
  const node = (id: string, cx: number, cy: number, faded = false) => ({id, cx, cy, faded}) as never;

  it('picks the closest node within reach, and none beyond it', () => {
    const nodes = [node('a', 0, 0), node('b', 10, 0)];
    expect(nearestNodeId(nodes, 8, 0, 20)).toBe('b');
    expect(nearestNodeId(nodes, 2, 0, 20)).toBe('a');
    expect(nearestNodeId(nodes, 100, 100, 20)).toBeNull();
  });

  it('ignores faded nodes, which cannot be opened', () => {
    expect(nearestNodeId([node('a', 0, 0, true), node('b', 15, 0)], 0, 0, 20)).toBe('b');
  });
});

describe('quantizeZoom', () => {
  it('gives nearby zoom levels one value, and stays close to the real level', () => {
    expect(quantizeZoom(0.901)).toBe(quantizeZoom(0.902));
    for (const k of [0.05, 0.3, 1, 2.7, 8]) {
      expect(Math.abs(quantizeZoom(k) / k - 1)).toBeLessThan(0.03);
    }
  });
});
