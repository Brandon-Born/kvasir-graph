// Browser smoke test: drives index.html (Kvasir landing page) and graph.html
// (Kvasir Graph editor) in headless Chromium. Run with `node e2e/smoke.mjs`
// (needs the playwright package).
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const home_url = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const page_url = pathToFileURL(fileURLToPath(new URL('../graph.html', import.meta.url))).href;
let browser, page, errors;

test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); });
test.beforeEach(async () => {
  page = await browser.newPage({viewport: {width: 1366, height: 800}});
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(page_url);
});
test.afterEach(async () => {
  await page.close();
  assert.deepEqual(errors, [], 'page errors');
});

const objects = () => page.$$eval('#objects button', rows => rows.map(row => row.textContent));
// Screen position of a graph coordinate (quantity x, price y).
const at = (x, y) => page.evaluate(([x, y]) => {
  const p = new DOMPoint(X(x), Y(y)).matrixTransform(plot.getScreenCTM());
  return [p.x, p.y];
}, [x, y]);

test('the landing page loads, adapts its nav, and links to Kvasir Graph', async () => {
  await page.goto(home_url);
  assert.match(await page.textContent('h1'), /MBA coursework/);
  assert.equal(await page.locator('.site-header.is-wide').count(), 1);
  // Narrow viewport collapses navigation to the native popover menu.
  await page.setViewportSize({width: 420, height: 800});
  await page.waitForFunction(() => !document.querySelector('.site-header').classList.contains('is-wide'));
  await page.click('.menu-button');
  await page.waitForFunction(() => document.getElementById('site-menu').matches(':popover-open'));
  await page.setViewportSize({width: 1366, height: 800});
  await page.waitForFunction(() => document.querySelector('.site-header').classList.contains('is-wide'));
  await page.locator('a.card-link', {hasText: 'Kvasir Graph'}).click();
  await page.waitForSelector('#plot');
  assert.ok((await objects()).includes('Demand'));
  await page.click('.brand-home');
  await page.waitForSelector('#tools');
});

test('the demo graph loads with its objects', async () => {
  assert.deepEqual(await objects(), ['Demand', 'Supply', 'Price guide', 'Quantity guide', 'E', 'Consumer surplus', 'Producer surplus']);
  assert.match(await page.textContent('#hint'), /Select an object/);
});

test('a straight line can be entered by coordinates', async () => {
  await page.click('#toolbar button:text("Draw")');
  await page.click('#options button:text("Enter coordinates")');
  const numbers = page.locator('#fields input[type=number]:not([aria-label$="font size (px)"])');
  await numbers.nth(0).fill('0'); await numbers.nth(1).fill('8');
  await numbers.nth(2).fill('100'); await numbers.nth(3).fill('2');
  await page.click('button[type=submit]');
  assert.equal((await objects()).length, 8);
  assert.deepEqual(await page.evaluate(() => graph().objects.at(-1).pts), [{x: 0, y: 8}, {x: 100, y: 2}]);
});

test('clicking an area shades it', async () => {
  await page.click('#toolbar button:text("Shade")');
  await page.mouse.click(...await at(80, 1));
  await page.fill('#fields input[type=text]', 'DWL');
  await page.click('button[type=submit]');
  assert.ok((await objects()).includes('DWL'));
});

test('a new graph from equations marks the equilibrium', async () => {
  await page.click('#new');
  await page.selectOption('#fields select', 'equations');
  await page.fill('input[placeholder^="Qd"]', 'Qd = 136 - 2P');
  await page.fill('input[placeholder^="Qs"]', 'Qs = 3P - 69');
  await page.click('button[type=submit]');
  assert.deepEqual(await objects(), ['Demand', 'Supply', 'Price guide', 'Quantity guide', 'E']);
  assert.equal(await page.textContent('#hint'), 'E is at Q = 54, P = 41.');
});

test('selecting an object shows its actions in the sidebar', async () => {
  await page.locator('#objects button', {hasText: 'Supply'}).click();
  assert.equal(await page.textContent('.inspector-head'), 'Supply');
  const actions = await page.$$eval('#inspector button.action', rows => rows.map(row => row.textContent));
  assert.equal(actions[0], 'EditEnter');
  assert.equal(actions.at(-1), 'DeleteDel');
  await page.click('#plot');
  await page.keyboard.press('Escape');
});

test('export opens a menu and edits survive a reload', async () => {
  await page.click('#export');
  assert.equal(await page.$$eval('#object-menu [role=menuitem]', items => items.length), 5);
  await page.keyboard.press('Escape');
  await page.locator('#objects button').nth(4).click();
  await page.keyboard.press('Delete');
  await page.reload();
  assert.ok(!(await objects()).includes('E'));
});
