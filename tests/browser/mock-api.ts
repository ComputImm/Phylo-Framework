/**
 * A stand-in for the API, for tests about layout rather than science. Answers every
 * request from the page with fixed data, so these tests need no backend and show the
 * same trees and tables on every run.
 */
import type {Page, Route} from '@playwright/test';

const API = 'http://127.0.0.1:58000';
export const DONE_RUN_ID = '3f2b8c1e-6d4a-4b7e-9a10-1c2d3e4f5a6b';
export const OTHER_RUN_ID = '7a9e0d2c-1b3f-4c5d-8e6f-0a1b2c3d4e5f';
const NOW = '2026-11-01T10:00:00Z';
const USER = {id: 'u1', email: 'tester@example.org', username: 'tester', email_verified: true, verification_required: false};

const leafName = (i: number) => `seq_${String(i).padStart(4, '0')}_IGHV3-23_clone`;

/** A caterpillar-shaped tree with long labels: the hardest shape for a narrow pane. */
function lineagePlot(leafCount: number) {
  const nodes: Array<Record<string, unknown>> = [{id: 'root', label: 'germline', x: 0, y: 0, isLeaf: false, abundance: 0}];
  const edges: Array<{source: string; target: string}> = [];
  let parent = 'root';
  for (let i = 0; i < leafCount; i++) {
    const internal = `n${i}`;
    nodes.push({id: internal, label: internal, x: i + 1, y: i, isLeaf: false, abundance: 0});
    edges.push({source: parent, target: internal});
    const leaf = leafName(i);
    nodes.push({id: leaf, label: leaf, x: i + 2, y: i, isLeaf: true, abundance: 1 + (i % 7)});
    edges.push({source: internal, target: leaf});
    parent = internal;
  }
  return {format: 'lineage-plot-v1', nodes, edges, meta: {rootId: 'root', germlineLabel: 'germline'}};
}

const NEWICK = `${Array.from({length: 40}, (_, i) => leafName(i)).reduce((tree, leaf) => `(${tree}:1,${leaf}:1)`)};`;

const TREE_PAYLOAD = {
  treeId: 't1',
  newick: NEWICK,
  node_attributes: {},
  lineage_plot: lineagePlot(40),
};

const runSummary = (id: string, status = 'DONE') => ({
  id,
  method_id: 'gctree',
  status,
  progress: status === 'RUNNING' ? 40 : 100,
  params: {seed: 1},
  dataset_name: 'a_rather_long_dataset_name_from_a_real_experiment.fasta',
  dataset_files: [],
  created_at: NOW,
  started_at: NOW,
  finished_at: status === 'DONE' ? '2026-11-01T10:04:12Z' : null,
  expires_at: status === 'DONE' ? '2026-12-31T10:00:00Z' : null,
  results_expired: false,
});

// Enough fields, in enough sections, to make the phone form long.
const properties = (prefix: string, count: number) =>
  Object.fromEntries(
    Array.from({length: count}, (_, i) => [`${prefix}_${i}`, {type: 'string', title: `${prefix} field ${i}`, default: 'value'}]),
  );
const METHOD_SPEC = {
  id: 'gctree',
  name: 'GCtree',
  version: '1.0',
  accepts: ['text/fasta'],
  paramSchema: {type: 'object', properties: {...properties('input', 8), ...properties('model', 8)}},
  uiHints: {
    sections: [
      {id: 'input', label: 'Input', fields: Object.keys(properties('input', 8))},
      {id: 'model', label: 'Model', fields: Object.keys(properties('model', 8))},
    ],
  },
};

const FILE = {
  id: 'f1',
  original_filename: 'a_rather_long_dataset_name_from_a_real_experiment.fasta',
  file_size: 123456,
  mime_type: 'text/x-fasta',
  uploaded_at: NOW,
  run_id: DONE_RUN_ID,
};

function respond(pathname: string): unknown {
  if (pathname === '/auth/me') return USER;
  if (pathname === '/methods') return [{id: 'gctree', name: 'GCtree', version: '1.0', description: 'Lineage trees from abundance.'}];
  if (pathname.startsWith('/methods/')) return METHOD_SPEC;
  if (pathname === '/runs/current') return null;
  if (pathname === '/runs/dashboard') return {active: null, queue: [], limits: {max_queued: 5, queued_count: 0, can_add: true}};
  if (pathname === '/runs/quota') return null;
  if (pathname === '/runs') return [runSummary(DONE_RUN_ID), runSummary(OTHER_RUN_ID, 'RUNNING')];
  if (pathname === '/files') return {files: [FILE], total: 1};
  if (pathname === '/uploads/limits') return {max_bytes: 1_000_000_000};

  const run = pathname.match(/^\/runs\/([^/]+)(?:\/(.+))?$/);
  if (run) {
    const [, id, rest] = run;
    if (rest === 'status') return runSummary(id);
    if (rest === 'result') {
      return {
        ...runSummary(id),
        run_id: id,
        result: {},
        tables: {},
        warnings: [],
        trees: [{id: 't1', newick: NEWICK, has_lineage_plot: true, clone_id: 'clone-1'}],
      };
    }
    if (rest === 'trees') return {trees: [{treeId: 't1', treeIndex: 0, hasLineagePlot: true, hasServiceImage: false, cloneId: 'clone-1'}]};
    if (rest?.startsWith('trees/')) return TREE_PAYLOAD;
    if (rest === 'same-dataset') return [runSummary(id === DONE_RUN_ID ? OTHER_RUN_ID : DONE_RUN_ID)];
    if (rest === 'artifacts') return [];
  }
  return {};
}

/** Answer the page's API calls from fixed data and, unless told otherwise, sign it in. */
export async function useMockApi(page: Page, {signedIn = true}: {signedIn?: boolean} = {}): Promise<void> {
  if (signedIn) {
    await page.addInitScript((user) => {
      localStorage.setItem('phylo_access_token', 'mock-token');
      localStorage.setItem('phylo_refresh_token', 'mock-refresh');
      localStorage.setItem('phylo_user', JSON.stringify(user));
    }, USER);
  }
  // The dev server's floating badges sit over the tab bar, where no real user sees them.
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.tsqd-parent-container, nextjs-portal { display: none !important; }';
      document.head.append(style);
    });
  });
  await page.route(`${API}/**`, (route: Route) => {
    const {pathname} = new URL(route.request().url());
    const request = route.request().headers();
    const headers = {
      'access-control-allow-origin': request.origin ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': request['access-control-request-headers'] ?? '*',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({status: 204, headers});
    return route.fulfill({status: 200, headers, json: respond(pathname)});
  });
}
