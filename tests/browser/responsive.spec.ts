/**
 * The app stays usable at every size. Runs on the phone, tablet and desktop projects
 * against a mock API, since these tests are about layout, not science.
 */
import {test, expect, type Page} from './fixtures';
import {useMockApi, DONE_RUN_ID} from './mock-api';

const PUBLIC_ROUTES = [
  '/',
  '/auth',
  '/auth/forgot-password',
  '/documents',
  '/documents/architecture',
  '/documents/data-model',
  '/documents/data-requirements',
  '/documents/try-it-yourself',
  '/documents/gctree',
  '/documents/dowser',
  '/documents/clonaltree',
  '/documents/brepphylo',
  '/privacy',
  '/terms',
];
const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/history',
  '/dashboard/files',
  `/dashboard?runId=${DONE_RUN_ID}`,
  `/dashboard/comparison?baseRunId=${DONE_RUN_ID}`,
];

/** Elements poking out of the viewport with nothing to scroll or clip them, so they can't be reached. */
async function unreachableElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipsOrScrolls = (element: Element) => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const {overflowX} = getComputedStyle(node);
        // The shell's own scrollers must not count, or real overflow would go unseen.
        const isShell = node.matches('body, html, [data-testid="dashboard-pane"], body > * , body > * > *');
        if (overflowX !== 'visible' && !isShell) return true;
      }
      return false;
    };
    return [...document.querySelectorAll('body *')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.right > width + 1 && !clipsOrScrolls(element)
          && getComputedStyle(element).position !== 'fixed';
      })
      .slice(0, 5)
      .map((element) => `${element.tagName}.${String(element.getAttribute('class')).slice(0, 80)}`);
  });
}

async function expectNoSidewaysScroll(page: Page) {
  expect(await unreachableElements(page)).toEqual([]);
  const pane = page.getByTestId('dashboard-pane');
  if (await pane.count()) {
    const overflow = await pane.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
}

/**
 * Touch a point and drag, as a finger does. Needs a touch-enabled project.
 * Not Input.synthesizeScrollGesture: on Linux it sends the page no touchmove, so
 * d3-zoom never sees the drag and a sideways swipe does not page.
 */
async function swipe(page: Page, from: {x: number; y: number}, delta: {x?: number; y?: number}) {
  const session = await page.context().newCDPSession(page);
  const steps = 10;
  await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [from]});
  for (let step = 1; step <= steps; step++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x: from.x + (delta.x ?? 0) * step / steps, y: from.y + (delta.y ?? 0) * step / steps}],
    });
    await page.waitForTimeout(16);
  }
  await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await session.detach();
}

const center = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).first().boundingBox())!;
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
};
const zoomTransform = (page: Page, scope = 'body') =>
  page.locator(`${scope} svg[role="img"] > g`).first().getAttribute('transform');

for (const route of PUBLIC_ROUTES) {
  test(`${route} has nothing out of reach`, async ({page}) => {
    await useMockApi(page, {signedIn: false});
    await page.goto(route);
    await expect(page.locator('main, h1').first()).toBeVisible();
    await expectNoSidewaysScroll(page);
  });
}

for (const route of DASHBOARD_ROUTES) {
  test(`${route} has nothing out of reach`, async ({page}) => {
    await useMockApi(page);
    await page.goto(route);
    await expect(page.getByTestId('dashboard-pane').locator('main').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectNoSidewaysScroll(page);
  });
}

test('controls are big enough to touch', async ({page, hasTouch}) => {
  test.skip(!hasTouch, 'touch only');
  await useMockApi(page);
  await page.goto('/dashboard/history');
  await expect(page.getByRole('heading', {name: 'Run history'})).toBeVisible();
  await page.getByRole('button', {name: /view details/i}).first().waitFor();
  const tooSmall = await page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="button"], [data-slot="input"], [data-slot="select-trigger"]')]
      .map((element) => ({element, box: element.getBoundingClientRect()}))
      .filter(({box}) => box.width > 0 && (box.height < 44 || box.width < 44))
      .map(({element, box}) => `${element.textContent || element.getAttribute('aria-label')}: ${box.width}x${box.height}`),
  );
  expect(tooSmall).toEqual([]);
});

test.describe('dashboard navigation', () => {
  test('phone: the tab bar reaches every workspace page', async ({page, viewport}) => {
    test.skip(viewport!.width >= 768, 'phone only');
    await useMockApi(page);
    await page.goto('/dashboard');
    await expect(page.locator('aside')).toBeHidden();
    const tabs = page.getByRole('navigation', {name: 'Workspace'});
    await tabs.getByRole('link', {name: 'Run history'}).click();
    await expect(page).toHaveURL(/\/dashboard\/history/);
    await tabs.getByRole('link', {name: 'File management'}).click();
    await expect(page).toHaveURL(/\/dashboard\/files/);
    await tabs.getByRole('link', {name: 'Sequence Trace'}).click();
    await expect(page).toHaveURL(/\/dashboard\/comparison/);
  });

  test('phone: the menu reaches the site pages and closes on backdrop tap', async ({page, viewport}) => {
    test.skip(viewport!.width >= 640, 'phone only');
    await useMockApi(page);
    await page.goto('/');
    await page.getByRole('button', {name: 'Open menu'}).click();
    const menu = page.getByRole('dialog');
    await expect(menu.getByRole('link', {name: 'Privacy policy'})).toBeVisible();
    await page.mouse.click(page.viewportSize()!.width - 5, 300); // the backdrop
    await expect(menu).toBeHidden();
    await page.getByRole('button', {name: 'Open menu'}).click();
    await menu.getByRole('link', {name: 'Documentation'}).click();
    await expect(page).toHaveURL(/\/documents/);
    await expect(menu).toBeHidden();
  });

  test('tablet: the sidebar is a labelled rail', async ({page, viewport}) => {
    test.skip(viewport!.width < 768 || viewport!.width >= 1024, 'tablet only');
    await useMockApi(page);
    await page.goto('/dashboard');
    const rail = page.locator('aside');
    await expect(rail).toBeVisible();
    await expect(rail.getByText('History')).toBeVisible();
    await expect(rail.getByRole('button', {name: /sidebar/i})).toBeHidden();
    expect((await rail.boundingBox())!.width).toBeLessThan(80);
  });

  test('desktop: the sidebar is full and collapsible', async ({page, viewport}) => {
    test.skip(viewport!.width < 1024, 'desktop only');
    await useMockApi(page);
    await page.goto('/dashboard');
    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('Run history')).toBeVisible();
    await sidebar.getByRole('button', {name: 'Collapse sidebar'}).click();
    await expect(sidebar.getByText('Run history')).toBeHidden();
  });
});

test.describe('tables', () => {
  test('history shows whichever form fits, with its actions in reach', async ({page, viewport}) => {
    await useMockApi(page);
    await page.goto('/dashboard/history');
    const details = page.getByRole('button', {name: /view details/i}).first();
    await expect(details).toBeVisible();
    const header = page.locator('thead').first();
    if (viewport!.width < 1024) {
      await expect(header).toBeHidden();
      await expect(page.locator('tbody tr').first().getByText('Dataset', {exact: true})).toBeVisible();
    } else {
      await expect(header).toBeVisible();
      await expect(page.locator('tbody tr').first().getByText('Dataset', {exact: true})).toBeHidden();
    }
    expect((await details.boundingBox())!.x + (await details.boundingBox())!.width).toBeLessThanOrEqual(viewport!.width);
  });

  test('phone: history filters stay out of the way until asked for', async ({page, viewport}) => {
    test.skip(viewport!.width >= 768, 'phone only');
    await useMockApi(page);
    await page.goto('/dashboard/history');
    const search = page.getByPlaceholder('Search run ID…');
    await expect(search).toBeHidden();
    await page.getByRole('button', {name: 'Filters'}).click();
    await expect(search).toBeVisible();
  });
});

test.describe('tree', () => {
  const results = `/dashboard?runId=${DONE_RUN_ID}`;

  test.beforeEach(async ({page}) => {
    await useMockApi(page);
    await page.goto(results);
    await page.locator('svg[role="img"] [data-node-id]').first().waitFor({state: 'attached'});
  });

  test('phone: a swipe on the inline tree scrolls the page, not the tree', async ({page, viewport}) => {
    test.skip(viewport!.width >= 768, 'phone only');
    const tree = page.locator('svg[role="img"]').first();
    await tree.scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');
    const pane = page.getByTestId('dashboard-pane');
    const before = await pane.evaluate((el) => el.scrollTop);
    const transform = await zoomTransform(page);
    await swipe(page, await center(page, 'svg[role="img"]'), {y: 150}); // positive: finger moves down, page up
    await expect.poll(() => pane.evaluate((el) => el.scrollTop)).toBeLessThan(before - 50);
    expect(await zoomTransform(page)).toBe(transform);
  });

  test('phone: Explore opens a full-screen tree that takes the gestures', async ({page, viewport}) => {
    test.skip(viewport!.width >= 768, 'phone only');
    await page.getByRole('button', {name: 'Explore'}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = (await dialog.locator('svg[role="img"]').boundingBox())!;
    expect(box.width).toBeGreaterThan(viewport!.width - 40);
    expect(box.height).toBeGreaterThan(viewport!.height - 140);
    const transform = await zoomTransform(page, '[role="dialog"]');
    await swipe(page, {x: box.x + box.width / 2, y: box.y + box.height / 2}, {y: -120});
    await expect.poll(() => zoomTransform(page, '[role="dialog"]')).not.toBe(transform);
    await dialog.getByRole('button', {name: 'Zoom in'}).click();
    await dialog.getByRole('button', {name: 'Close'}).click();
    await expect(dialog).toBeHidden();
  });

  test('phone: labels are readable when the explorer opens', async ({page, viewport}) => {
    test.skip(viewport!.width >= 768, 'phone only');
    await page.getByRole('button', {name: 'Explore'}).click();
    const label = page.getByRole('dialog').locator('svg[role="img"] text').first();
    await expect(label).toBeAttached();
    await expect.poll(async () => {
      return label.evaluate((el) => {
        const size = parseFloat(el.getAttribute('font-size') ?? '0');
        const scale = (el as SVGGraphicsElement).getScreenCTM()!.a;
        return size * scale;
      });
    }).toBeGreaterThanOrEqual(9);
  });

  test('tablet: the inline tree takes the gestures itself', async ({page, viewport}) => {
    test.skip(viewport!.width < 768 || viewport!.width >= 1024, 'tablet only');
    await page.locator('svg[role="img"]').first().scrollIntoViewIfNeeded();
    const transform = await zoomTransform(page);
    await swipe(page, await center(page, 'svg[role="img"]'), {y: -120});
    await expect.poll(() => zoomTransform(page)).not.toBe(transform);
  });

  test('tapping a node shows its details and can collapse it', async ({page, hasTouch}) => {
    test.skip(!hasTouch, 'touch only');
    const nodes = page.locator('svg[role="img"] [data-node-id]');
    const collapsible = page.locator('svg[role="img"] [data-node-id][aria-expanded="true"]').first();
    await collapsible.scrollIntoViewIfNeeded();
    const count = await nodes.count();
    const box = (await collapsible.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', {name: 'Collapse subtree'}).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => nodes.count()).toBeLessThan(count);
  });

  test('a tap near a tiny node reaches it', async ({page, hasTouch}) => {
    test.skip(!hasTouch, 'touch only');
    const leaf = page.locator('svg[role="img"] [data-node-id]:not([aria-expanded])').last();
    await leaf.scrollIntoViewIfNeeded();
    const box = (await leaf.locator('circle').first().boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2 + box.width + 5, box.y + box.height / 2);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('a saved image is the same at every screen size', async ({page}) => {
    const name = /^Download$/;
    await page.getByRole('button', {name}).first().click();
    const dialog = page.getByRole('dialog');
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', {name: /SVG image/}).click();
    const stream = await (await download).createReadStream();
    let markup = '';
    for await (const chunk of stream) markup += chunk;
    const width = Number(markup.match(/<svg[^>]* width="(\d+)"/)?.[1]);
    expect(width).toBeGreaterThanOrEqual(920);
  });
});

test.describe('phone on its side', () => {
  test.beforeEach(async ({page, viewport}) => {
    test.skip(viewport!.width >= 768, 'phone only');
    await page.setViewportSize({width: 844, height: 390});
    await useMockApi(page);
  });

  test('the rail reaches every page', async ({page}) => {
    await page.goto('/dashboard');
    const last = page.locator('aside').getByRole('link', {name: 'Sequence Trace'});
    await last.scrollIntoViewIfNeeded();
    const box = (await last.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(390);
  });

  test('the inline tree lets the page scroll, and Explore opens readable', async ({page}) => {
    await page.goto(`/dashboard?runId=${DONE_RUN_ID}`);
    const tree = page.locator('svg[role="img"]').first();
    await tree.waitFor();
    await tree.scrollIntoViewIfNeeded();
    expect(await tree.evaluate((el) => getComputedStyle(el).touchAction)).toBe('manipulation');
    await page.getByRole('button', {name: 'Explore'}).click();
    const dialog = page.getByRole('dialog');
    expect(await dialog.locator('svg[role="img"]').evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
    await expect.poll(() =>
      dialog.locator('svg[role="img"] text').first().evaluate((el) =>
        parseFloat(el.getAttribute('font-size') ?? '0') * (el as SVGGraphicsElement).getScreenCTM()!.a),
    ).toBeGreaterThanOrEqual(9);
  });
});

test.describe('Sequence Trace', () => {
  const trace = `/dashboard/comparison?baseRunId=${DONE_RUN_ID}`;

  test('phone: panels page sideways by chip and by swipe', async ({page, viewport}) => {
    test.skip(viewport!.width >= 768, 'phone only');
    await useMockApi(page);
    await page.goto(trace);
    await page.getByRole('button', {name: 'Add Sequence Trace'}).click();
    const chip = page.getByRole('button', {name: 'Trace 1', exact: true});
    const base = page.getByRole('button', {name: 'Base', exact: true});
    await expect(base).toHaveAttribute('aria-current', 'true');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-current', 'true');
    await base.click();
    await expect(base).toHaveAttribute('aria-current', 'true');
    const tree = page.locator('svg[role="img"]').first();
    await tree.waitFor();
    await tree.scrollIntoViewIfNeeded();
    // Start right of centre, so the finger stays on the screen.
    const {x, y} = await center(page, 'svg[role="img"]');
    await swipe(page, {x: x + 100, y}, {x: -250});
    await expect(chip).toHaveAttribute('aria-current', 'true');
  });

  test('the info icon answers a tap', async ({page, hasTouch}) => {
    test.skip(!hasTouch, 'touch only');
    await useMockApi(page);
    await page.goto(trace);
    await page.getByRole('button', {name: 'What is Sequence Trace?'}).first().tap();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.getByRole('heading', {name: 'Sequence Trace'}).first().tap();
    await expect(page.getByRole('tooltip')).toBeHidden();
  });
});

test.describe('run wizard', () => {
  async function toParameters(page: Page) {
    await useMockApi(page);
    await page.goto('/dashboard');
    await page.getByRole('button', {name: 'Select', exact: true}).click();
    await page.getByRole('listitem').filter({hasText: 'a_rather_long_dataset_name'}).getByRole('button').click();
    await expect(page.getByRole('button', {name: /^run$/i})).toBeVisible();
  }

  test('the stepper fits and Run stays on screen', async ({page, viewport}) => {
    await toParameters(page);
    const stepper = page.locator('ol').first();
    const box = (await stepper.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport!.width);
    await expectNoSidewaysScroll(page);
    if (viewport!.width < 768) {
      const run = (await page.getByRole('button', {name: /^run$/i}).boundingBox())!;
      expect(run.y + run.height).toBeLessThanOrEqual(viewport!.height);
    }
  });

  test('phone: only the first section starts open, and sections open on tap', async ({page, viewport}) => {
    test.skip(viewport!.width >= 768, 'phone only');
    await toParameters(page);
    await expect(page.getByLabel('input field 0')).toBeVisible();
    await expect(page.getByLabel('model field 0')).toBeHidden();
    await page.getByRole('button', {name: 'Model'}).click();
    await expect(page.getByLabel('model field 0')).toBeVisible();
  });

  test('tapping a label focuses its field, which does not auto-capitalize', async ({page}) => {
    await toParameters(page);
    await page.getByText('input field 1', {exact: true}).click();
    const field = page.getByLabel('input field 1');
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('autocapitalize', 'none');
  });

  test('phone: any file can be picked, and a wrong one is refused with a reason', async ({page, viewport}) => {
    test.skip(viewport!.width >= 768, 'phone only');
    await useMockApi(page);
    await page.goto('/dashboard');
    await page.getByRole('button', {name: 'Select', exact: true}).click();
    const picker = page.locator('input[type="file"]');
    await expect(picker).not.toHaveAttribute('accept');
    await picker.setInputFiles({name: 'notes.docx', mimeType: 'application/msword', buffer: Buffer.from('x')});
    await expect(page.getByRole('alert').filter({hasText: 'notes.docx'})).toBeVisible();
  });
});
