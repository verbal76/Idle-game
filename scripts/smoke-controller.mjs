// Controller / keyboard smoke test for the built game (dist/index.html).
//
// Drives the REAL game in headless Chromium with a SIMULATED standard-mapping
// gamepad (navigator.getGamepads is replaced by a scriptable fake). This proves
// the software path end to end; it is not a physical-controller test.
//
//   npm run web:build && npm run test:smoke:controller
//
// Env: CHROMIUM_PATH, SMOKE_URL (test an already-served build, e.g. the
// packaged desktop app), SMOKE_SHOTS (directory for screenshots).

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { FAKE_PAD, BTN } from './lib/fake-pad.mjs';

const DIST = 'dist';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function findChromium() {
  return [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium',
    process.env.PLAYWRIGHT_BROWSERS_PATH && join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')].filter(Boolean).find(existsSync);
}

async function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return server;
}

const errors = [];
const fail = (m) => { throw new Error(m); };

async function main() {
  const executablePath = findChromium();
  if (!executablePath) fail('Chromium not found (set CHROMIUM_PATH)');
  let server = null;
  let base = process.env.SMOKE_URL;
  if (!base) {
    if (!existsSync(join(DIST, 'index.html'))) fail('dist/index.html missing: run npm run web:build first');
    server = await serve();
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  const shots = process.env.SMOKE_SHOTS;
  if (shots) await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(FAKE_PAD);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/media|audio|Failed to load resource/i.test(m.text())) errors.push(`console.error: ${m.text()}`); });
    page.setDefaultTimeout(60_000);

    const frames = (n = 3) => page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
    const guard = () => page.waitForFunction(() => !(window.__tapsLocked && window.__tapsLocked()), null, { polling: 30 }).catch(() => {});
    const press = async (...names) => {
      await guard();
      await page.evaluate((i) => window.__pad.set(i), names.map((n) => BTN[n]));
      await frames(3);
      await page.evaluate(() => window.__pad.set([]));
      await frames(3);
    };
    const hold = (names, axes) => page.evaluate(([i, a]) => window.__pad.set(i, a), [names.map((n) => BTN[n]), axes]);
    const focused = () => page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? (a.id || a.textContent.trim().slice(0, 30)) : null; });
    const ringOn = () => page.evaluate(() => document.documentElement.classList.contains('nav-ring'));
    const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`) }); };
    const step = async (name, fn) => {
      process.stdout.write(`controller smoke: ${name} … `);
      await fn();
      if (errors.length) fail(`errors at ${name}:\n${errors.join('\n')}`);
      console.log('ok');
    };
    const expectFocus = async (want, where) => {
      const got = await focused();
      if (got !== want) fail(`${where}: focus is ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
    };
    const visible = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
    const waitFor = (sel) => page.waitForSelector(sel, { state: 'visible' });
    const game = (fn, arg) => page.evaluate(fn, arg);

    // The UI swallows taps for 200 ms after a screen appears (ui/tapGuard.ts); scripted clicks wait it out like a person.
    const rawClick = page.click.bind(page);
    page.click = async (sel, opts) => { await guard(); return rawClick(sel, opts); };
    await page.goto(`${base}?e2e`);
    await page.evaluate(() => window.__pad.connect());

    await step('first launch is operable with the pad alone (create a profile)', async () => {
      await waitFor('#new-profile');
      await frames(5);
      if (await ringOn()) fail('focus ring visible before any pad input');
      await press('down');                                  // reveals focus; presses nothing
      if (!(await ringOn())) fail('focus ring did not appear on pad input');
      await expectFocus('new-profile', 'profile picker');
      await shot('01-profile-picker');
      await press('south');                                 // New profile
      await waitFor('#confirm');                            // name picker
      await expectFocus('confirm', 'name picker');
      await press('south');                                 // Use this
      await waitFor('#downhill');
      await expectFocus('downhill', 'main menu');
      await shot('02-main-menu');
    });

    await step('menu focus moves with d-pad and left stick, wraps, and never dead-ends', async () => {
      const seen = new Set([await focused()]);
      for (let i = 0; i < 8; i++) { await press('down'); seen.add(await focused()); await press('right'); seen.add(await focused()); await press('left'); seen.add(await focused()); }
      for (const id of ['downhill', 'half-pipe', 'upgrades', 'stats', 'switch', 'quit']) if (!seen.has(id)) fail(`menu control ${id} unreachable (saw ${[...seen]})`);
      await hold([], [0, 0.95, 0, 0]); await frames(4); await hold([], [0, 0, 0, 0]); await frames(3);
      await press('up');
      if (!(await focused())) fail('focus lost');
    });

    await step('Back / East at a root menu does nothing (never exits or traps)', async () => {
      await press('east');
      await waitFor('#downhill');
    });

    await step('Settings: open, adjust a slider with left/right, toggle, Back returns', async () => {
      await page.focus('#menu-settings');
      await press('south');
      await waitFor('#music-vol');
      await frames(3);
      await page.focus('#music-vol');
      const v0 = await page.$eval('#music-vol', (e) => Number(e.value));
      await press('left');
      const v1 = await page.$eval('#music-vol', (e) => Number(e.value));
      if (!(v1 < v0)) fail(`slider did not go down (${v0} -> ${v1})`);
      await press('right'); await press('right');
      const v2 = await page.$eval('#music-vol', (e) => Number(e.value));
      if (!(v2 > v1)) fail('slider did not go up');
      const label = await page.textContent('#music-vol-val');
      if (label !== `${v2}%`) fail(`slider label out of step: ${label} vs ${v2}`);
      // Prompt bar teaches Adjust on a slider, with the Xbox pad's artwork.
      await frames(30);
      const bar = await page.$eval('#prompt-bar', (e) => ({ on: e.classList.contains('on'), style: e.dataset.style, ctx: e.dataset.context, labels: [...e.querySelectorAll('.prompt-label')].map((x) => x.textContent) }));
      if (!bar.on || bar.style !== 'xbox' || bar.ctx !== 'adjust' || !bar.labels.includes('Adjust')) fail(`prompt bar wrong on slider: ${JSON.stringify(bar)}`);
      await shot('03-settings');
      await page.focus('#haptics-toggle');
      const h0 = await page.$eval('#haptics-toggle', (e) => e.getAttribute('aria-pressed'));
      await press('south');
      const h1 = await page.$eval('#haptics-toggle', (e) => e.getAttribute('aria-pressed'));
      if (h0 === h1) fail('toggle did not toggle');
      await press('east');                                  // Back
      await waitFor('#downhill');
    });

    await step('manual prompt style in Settings overrides auto and is remembered', async () => {
      await page.focus('#menu-settings'); await press('south'); await waitFor('#prompt-style');
      await page.focus('#prompt-style');
      await press('south');                                 // Auto -> Xbox
      await press('south');                                 // -> PlayStation
      if ((await page.textContent('#prompt-style')) !== 'PlayStation') fail('prompt style did not cycle');
      await frames(30);
      const style = await page.$eval('#prompt-bar', (e) => e.dataset.style);
      if (style !== 'playstation') fail(`bar did not follow the manual choice: ${style}`);
      const stored = await page.evaluate(() => localStorage.getItem('wtb.promptStyle'));
      if (stored !== 'playstation') fail(`choice not stored: ${stored}`);
      await press('south'); await press('south'); await press('south');   // -> Switch, Steam Deck, Keyboard
      await press('south');                                 // -> Auto
      if ((await page.textContent('#prompt-style')) !== 'Auto') fail('did not return to Auto');
      await press('east'); await waitFor('#downhill');
    });

    await step('start Downhill with South; the A that started it does not start a jump', async () => {
      await page.focus('#downhill');
      await guard();
      await hold(['south']);                                // still held when the run begins
      await frames(2);
      await page.evaluate(() => document.activeElement.click());
      await page.waitForSelector('#hud');
      await page.waitForFunction(() => !!window.__wtb?.game);
      await frames(20);
      const charge = await game(() => window.__wtb.game.jumpCharge);
      await hold([]);
      await frames(5);
      if (typeof charge !== 'number') fail('could not read the jump charge from the game');
      if (charge > 0.05) fail(`held South from the menu charged a jump (${charge})`);
    });

    await step('riding: stick steers, South charges + releases a jump, West flips, LB carves', async () => {
      await rode(page, 8);
      await hold([], [1, 0, 0, 0]); await frames(40);
      const lean = await game(() => window.__wtb.game.edgeAngle);
      await hold([], [0, 0, 0, 0]); await frames(10);
      if (!(Math.abs(lean) > 0.05)) fail(`stick did not steer (edgeAngle ${lean})`);
      await hold(['south']); await frames(30);
      const charged = await page.$eval('#jump-charge-bar', (e) => Number(getComputedStyle(e).getPropertyValue('--charge')));
      if (!(charged > 0.1)) fail(`South did not charge the jump (${charged})`);
      await hold([]); await frames(3);
      await page.waitForFunction(() => window.__wtb.game.grounded === false, null, { polling: 30 });
      await hold(['west']); await frames(20); await hold([]);
      await page.waitForFunction(() => window.__wtb.game.grounded === true, null, { polling: 30 });
      await shot('04-riding');
    });

    await step('Start pauses; focus lands in the pause menu; Start resumes with nothing stuck', async () => {
      await press('start');
      await waitFor('#pause-menu');
      await frames(5);
      await expectFocus('resume', 'pause menu');
      await shot('05-paused');
      await press('down'); await press('down');
      if ((await focused()) === 'resume') fail('focus did not move in the pause menu');
      await press('start');
      await page.waitForFunction(() => document.querySelector('#pause-menu').style.display === 'none');
    });

    await step('East pauses in a run (same as Android Back) and resumes from the pause menu', async () => {
      await press('east');
      await waitFor('#pause-menu');
      await press('east');
      await page.waitForFunction(() => document.querySelector('#pause-menu').style.display === 'none');
    });

    await step('resume with South does not start a jump', async () => {
      await press('start');
      await waitFor('#pause-menu'); await frames(5);
      await hold(['south']);                                // A on "Resume"
      await frames(3);
      await page.evaluate(() => document.activeElement.click());
      await frames(25);
      const c = await page.$eval('#jump-charge-bar', (e) => Number(getComputedStyle(e).getPropertyValue('--charge')) || 0);
      await hold([]); await frames(3);
      if (c > 0.05) fail(`A on Resume charged a jump (${c})`);
    });

    await step('pad disconnect mid-run pauses; reconnect and resume works', async () => {
      await hold([], [0, 0, 0, 0]);
      await frames(30);                                     // the player is on the pad
      await press('west');
      await page.evaluate(() => window.__pad.disconnect());
      await waitFor('#pause-menu');
      await page.evaluate(() => window.__pad.connect());
      await frames(5);
      await press('down');                                  // reveals / moves focus
      await press('start');
      await page.waitForFunction(() => document.querySelector('#pause-menu').style.display === 'none');
    });

    await step('controller-only: Pause > Settings > Back > Quit run > summary > Back to menu', async () => {
      await press('start'); await waitFor('#pause-menu'); await frames(5);
      await page.focus('#pause-settings');
      await press('south'); await waitFor('#settings-back');
      await press('east');                                  // Back out of Settings
      await waitFor('#pause-menu');
      await page.focus('#quit');
      await press('south');
      await waitFor('#fell-ok'); await frames(5);
      await shot('06-summary');
      await press('east');                                  // Back to menu via the summary's Back
      await waitFor('#downhill');
    });

    await step('Half-pipe starts from the pad and shows its card; Got it with South', async () => {
      await page.focus('#half-pipe'); await press('south');
      await waitFor('#halfpipe-intro-ok');
      await frames(5);
      await expectFocus('halfpipe-intro-ok', 'half-pipe intro');
      await press('south');
      await page.waitForFunction(() => document.querySelector('#halfpipe-intro').style.display === 'none');
      await press('start'); await waitFor('#pause-menu');
      await page.focus('#quit'); await press('south');
      await waitFor('#fell-ok'); await press('east'); await waitFor('#downhill');
    });

    await step('touch still works with a pad connected (pointer input hides the focus ring)', async () => {
      await page.evaluate(() => window.__pad.disconnect());
      await page.click('#stats');
      await waitFor('#stats-back');
      if (await ringOn()) fail('focus ring stayed on after a click');
      await page.click('#stats-back');
      await waitFor('#downhill');
    });

    await step('keyboard: arrows move focus, Escape goes back, Enter presses', async () => {
      await page.keyboard.press('ArrowDown');
      await frames(3);
      if (!(await ringOn())) fail('keyboard did not show the focus ring');
      await page.focus('#stats');
      await guard();
      await page.keyboard.press('Enter');
      await waitFor('#stats-back');
      await guard();
      await page.keyboard.press('Escape');
      await waitFor('#downhill');
    });

    await step('typing a name is never hijacked by keyboard navigation', async () => {
      await page.focus('#switch'); await guard(); await page.keyboard.press('Enter');
      await waitFor('#new-profile');
      await page.click('#new-profile'); await waitFor('#custom-mode');
      await page.click('#custom-mode'); await waitFor('#name-input');
      await page.fill('#name-input', '');
      await page.keyboard.type('WASD ad');
      const v = await page.$eval('#name-input', (e) => e.value);
      if (v !== 'WASD ad') fail(`typing was intercepted: ${JSON.stringify(v)}`);
    });

    console.log('controller smoke: PASS');
  } finally {
    await browser.close();
    server?.close();
  }
}

async function rode(page, m) { await page.waitForFunction((m) => (window.__wtb?.game?.rider?.root?.position?.z ?? 0) > m, m); }

main().catch((e) => { console.error(`\ncontroller smoke: FAIL\n${e.stack ?? e}`); process.exit(1); });
