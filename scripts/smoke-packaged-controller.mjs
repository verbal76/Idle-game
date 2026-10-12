// Runs the PACKAGED Linux desktop app (the tar.gz's executable, Electron + the same game page) under Xvfb,
// attaches to it over the DevTools protocol, plugs in a SIMULATED gamepad and drives the real menus.
// Proves: the packaged app boots, the preload bridge exists, the pad drives menus, Steam Deck mode
// (SteamDeck=1) goes full screen with Deck prompts, and "Quit game" from the pad exits the process.
// SIMULATION ONLY: this is not a physical-controller or Steam Deck test.
//
//   node scripts/smoke-packaged-controller.mjs <extracted app dir containing "Wheres the Bottom">
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { FAKE_PAD, BTN } from './lib/fake-pad.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: smoke-packaged-controller.mjs <app dir>'); process.exit(2); }
const exe = join(dir, 'Wheres the Bottom');
if (!existsSync(exe)) { console.error(`not found: ${exe}`); process.exit(2); }
const fail = (m) => { throw new Error(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(port, env) {
  const ud = mkdtempSync(join(tmpdir(), 'wtb-ud-'));
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1280x800x24', exe, '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--user-data-dir=${ud}`, `--remote-debugging-port=${port}`], {
    env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,   // own process group, so cleanup reaches Xvfb and every Electron child
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; }); child.stderr.on('data', (d) => { log += d; });
  const exited = new Promise((res) => child.on('exit', (code, sig) => res({ code, sig })));
  let browser;
  for (let i = 0; i < 60 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await sleep(500); }
  }
  if (!browser) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } fail(`could not attach to the packaged app\n${log.slice(-800)}`); }
  const context = browser.contexts()[0];
  let page = context.pages()[0];
  for (let i = 0; i < 40 && !page; i++) { await sleep(250); page = context.pages()[0]; }
  if (!page) fail('the packaged app opened no window');
  const killTree = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } };
  return { child, exited, browser, context, page, killTree, log: () => log };
}

async function session(name, env, port, body) {
  process.stdout.write(`packaged: ${name} … `);
  const app = await launch(port, env);
  try {
    const { page } = app;
    page.setDefaultTimeout(60_000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(FAKE_PAD);
    await page.reload();
    await page.waitForSelector('#new-profile', { state: 'visible' });
    // The studio splash covers start-up (about 3 s) and pad input is ignored under it, by design.
    await page.waitForFunction(() => !document.getElementById('studio-splash'), null, { timeout: 30_000 });
    await body(app, page);
    if (errors.length) fail(`page errors: ${errors.join('; ')}`);
    console.log('ok');
  } finally { app.killTree(); await app.browser.close().catch(() => {}); }
}

const frames = (page, n = 3) => page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const guard = (page) => page.waitForFunction(() => !(window.__tapsLocked && window.__tapsLocked()), null, { polling: 30 }).catch(() => {});
const press = async (page, name) => { await guard(page); await page.evaluate((i) => window.__pad.set([i]), BTN[name]); await frames(page); await page.evaluate(() => window.__pad.set([])); await frames(page); };
const focused = (page) => page.evaluate(() => document.activeElement?.id || null);

await session('boots; bridge present; pad runs first launch to the main menu; Quit game exits', {}, 9333, async (app, page) => {
  const bridge = await page.evaluate(() => ({ platform: window.wtbDesktop?.platform, steamDeck: window.wtbDesktop?.steamDeck, quit: typeof window.wtbDesktop?.quit, node: typeof window.require, proc: typeof window.process }));
  if (bridge.platform !== 'linux' || bridge.steamDeck !== false || bridge.quit !== 'function') fail(`bridge wrong: ${JSON.stringify(bridge)}`);
  if (bridge.node !== 'undefined' || bridge.proc !== 'undefined') fail(`the page can see Node: ${JSON.stringify(bridge)}`);
  await page.evaluate(() => window.__pad.connect());
  await frames(page, 5);
  await press(page, 'down');
  if ((await focused(page)) !== 'new-profile') fail(`first focus ${await focused(page)}`);
  await press(page, 'south'); await page.waitForSelector('#confirm'); await press(page, 'south');
  await page.waitForSelector('#downhill', { state: 'visible' });
  await frames(page, 30);
  const bar = await page.$eval('#prompt-bar', (e) => ({ on: e.classList.contains('on'), style: e.dataset.style }));
  if (!bar.on || bar.style !== 'xbox') fail(`prompt bar: ${JSON.stringify(bar)}`);
  // Quit game from the pad: focus it by navigating, press South.
  for (let i = 0; i < 12 && (await focused(page)) !== 'quit'; i++) { await press(page, i % 2 ? 'right' : 'down'); }
  if ((await focused(page)) !== 'quit') fail('could not reach Quit game with the pad');
  await guard(page);
  await page.evaluate((i) => window.__pad.set([i]), BTN.south).catch(() => {});   // the app may close under this call
  const r = await Promise.race([app.exited, sleep(15000).then(() => null)]);
  if (!r) fail('Quit game from the pad did not exit the packaged app');
});

await session('Steam Deck mode (SteamDeck=1): bridge flag, full screen, Deck prompts', { SteamDeck: '1' }, 9334, async (app, page) => {
  const info = await page.evaluate(() => ({ deck: window.wtbDesktop?.steamDeck, w: window.innerWidth, h: window.innerHeight, sw: screen.width, sh: screen.height }));
  if (info.deck !== true) fail(`steamDeck flag not set: ${JSON.stringify(info)}`);
  if (info.w < info.sw - 2 || info.h < info.sh - 2) fail(`not full screen: ${JSON.stringify(info)}`);
  await page.evaluate(() => window.__pad.connect('Steam Deck Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)'));
  await frames(page, 5); await press(page, 'down'); await frames(page, 30);
  const bar = await page.$eval('#prompt-bar', (e) => ({ on: e.classList.contains('on'), style: e.dataset.style }));
  if (!bar.on || bar.style !== 'steamdeck') fail(`Deck prompt bar: ${JSON.stringify(bar)}`);
});

console.log('packaged controller smoke: PASS');
process.exit(0);
