// End-to-end smoke test for the built game (dist/index.html).
//
// Serves dist/ over HTTP (IndexedDB is unavailable on file://), drives
// the real menus in headless Chromium, rides a Downhill run and a
// Half-pipe run, and fails on any page error, console error, or the
// red bootstrap error screen. Run after `npm run web:build`:
//
//   npm run test:smoke
//
// Chromium comes from PLAYWRIGHT_BROWSERS_PATH / CHROMIUM_PATH so no
// browser download is needed.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';

const DIST = 'dist';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function findChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium',
    process.env.PLAYWRIGHT_BROWSERS_PATH && join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'),
  ].filter(Boolean);
  return candidates.find(p => existsSync(p));
}

async function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return server;
}

// Menus run in portrait (native side unlocks orientation); runs are
// locked landscape. Small landscape keeps software WebGL fast enough.
const PORTRAIT = { width: 412, height: 915 };
const LANDSCAPE = { width: 640, height: 300 };

const errors = [];
function fail(msg) { throw new Error(msg); }

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) fail('dist/index.html missing — run npm run web:build first');
  const executablePath = findChromium();
  if (!executablePath) fail('Chromium not found (set CHROMIUM_PATH)');

  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const page = await browser.newPage({ viewport: PORTRAIT, hasTouch: true });
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => {
      // Audio elements without injected native music URLs log benign
      // media errors in a plain browser; everything else is a failure.
      if (m.type() === 'error' && !/media|audio|Failed to load resource/i.test(m.text())) {
        errors.push(`console.error: ${m.text()}`);
      }
    });
    page.setDefaultTimeout(90_000);
    await page.goto(`http://127.0.0.1:${port}/?e2e`);

    const checkNoCrash = async (where) => {
      const crashed = await page.evaluate(() => document.body.firstElementChild?.tagName === 'PRE');
      if (crashed) fail(`bootstrap error screen shown at ${where}: ${await page.textContent('pre')}`);
      if (errors.length) fail(`errors at ${where}:\n${errors.join('\n')}`);
    };
    const step = async (name, fn) => {
      process.stdout.write(`smoke: ${name} … `);
      await fn();
      await checkNoCrash(name);
      console.log('ok');
    };

    // Patch the active profile straight in IndexedDB, then reload and
    // continue as that profile (lets steps set up balances/levels).
    const patchProfile = async (patch) => {
      await page.evaluate((p) => new Promise((resolve, reject) => {
        const req = indexedDB.open('boarder');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('profiles', 'readwrite');
          const store = tx.objectStore('profiles');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const prof of all.result) store.put({ ...prof, ...p });
          };
          tx.oncomplete = () => { db.close(); resolve(null); };
          tx.onerror = () => reject(tx.error);
        };
      }), patch);
      await page.reload();
      await page.click('#continue');
      await page.waitForSelector('#downhill');
    };

    await step('create profile', async () => {
      await page.click('#new-profile');
      await page.click('#confirm');
      await page.waitForSelector('#downhill');
    });

    const hold = async (sel, ms) => {
      const box = await page.locator(sel).boundingBox();
      if (!box) fail(`${sel} not on screen`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(ms);
      await page.mouse.up();
    };
    const ride = async (mode) => {
      await page.click(`#${mode}`);
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      const intro = page.locator('#halfpipe-intro');
      if (await intro.isVisible().catch(() => false)) await intro.click();
      const before = await page.textContent('#score');
      await page.waitForTimeout(2500);
      // Charge + release a jump, then steer. Real mouse input so
      // setPointerCapture sees a live pointer.
      await hold('#jump', 400);
      await hold('#dpad-left', 600);
      await page.waitForTimeout(1500);
      const after = await page.textContent('#score');
      if (before === after) fail(`${mode}: HUD score never changed (${before})`);
      await page.click('#pause');
      await page.waitForSelector('#pause-menu', { state: 'visible' });
      await page.click('#quit');
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
    };

    await step('downhill run', () => ride('downhill'));
    await step('half-pipe intro: once per profile, run paused behind it (#8)', async () => {
      await page.click('#half-pipe');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#halfpipe-intro', { state: 'visible' });
      const before = await page.textContent('#score');
      await page.waitForTimeout(1500);
      if (await page.textContent('#score') !== before) fail('run advanced while the intro was up');
      await page.click('#halfpipe-intro');
      await page.waitForFunction((b) => document.getElementById('score').textContent !== b, before);
      // How to play is in the pause menu and returns to it.
      await page.click('#pause');
      await page.click('#pause-howto');
      await page.waitForSelector('#halfpipe-intro', { state: 'visible' });
      await page.click('#halfpipe-intro');
      await page.waitForSelector('#pause-menu', { state: 'visible' });
      await page.click('#quit');
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#half-pipe');
      // Second ride: no intro.
      await page.click('#half-pipe');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await page.waitForTimeout(600);
      if (await page.isVisible('#halfpipe-intro')) fail('intro shown again on the second ride');
      await page.click('#pause');
      await page.click('#quit');
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
    });

    await step('half-pipe run', () => ride('half-pipe'));
    await step('crash locks pause; only the fell screen shows (#9)', async () => {
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        window.__wtb.game.fall();
        document.getElementById('pause').click();     // tap pause right after the hit
        document.getElementById('hud-settings').click();
      });
      await page.waitForSelector('#fell-overlay', { state: 'visible' });
      if (await page.isVisible('#pause-menu')) fail('pause menu opened after the crash');
      if (await page.isVisible('#settings-overlay')) fail('settings opened after the crash');
      if (await page.isVisible('#pause')) fail('pause button still visible after the crash');
      await page.click('#fell-ok');
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
    });

    await step('stats: records + lifetime, from menu and profile picker (#7)', async () => {
      await page.click('#stats');
      await page.waitForSelector('#stats-lifetime');
      const life = await page.textContent('#stats-lifetime');
      // downhill run, 2 intro rides, half-pipe run, crash run = 5 runs.
      if (!/Runs\s*5\b/.test(life)) fail(`expected 5 lifetime runs, got: ${life}`);
      const down = await page.textContent('#stats-downhill');
      const m = down.match(/Longest run\s*([\d,]+) m/);
      if (!m || Number(m[1].replace(/,/g, '')) <= 0) fail(`downhill longest not recorded: ${down}`);
      await page.click('#stats-back');
      await page.click('#switch');
      await page.click('.profile-stats-btn');
      await page.waitForSelector('#stats-lifetime');
      if (!/Runs\s*5\b/.test(await page.textContent('#stats-lifetime'))) fail('picker stats differ');
      await page.click('#stats-back');
      await page.click('#profile-list .profile-line button');
      await page.waitForSelector('#downhill');
    });

    await step('back button + backgrounding pause the run (#2)', async () => {
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__wtbBack());
      await page.waitForSelector('#pause-menu', { state: 'visible' });
      await page.evaluate(() => window.__wtbBack());
      await page.waitForSelector('#pause-menu', { state: 'hidden' });
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      });
      await page.waitForSelector('#pause-menu', { state: 'visible' });
      await page.click('#quit');
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
      // Back on the root menu asks the native shell to exit.
      const posted = await page.evaluate(() => {
        const sent = [];
        window.ReactNativeWebView = { postMessage: (m) => sent.push(m) };
        window.__wtbBack();
        delete window.ReactNativeWebView;
        return sent;
      });
      if (!posted.includes('back:exit')) fail(`menu Back should exit, posted ${JSON.stringify(posted)}`);
    });

    const lifetimeRuns = async () => {
      await page.click('#stats');
      await page.waitForSelector('#stats-lifetime');
      const m = (await page.textContent('#stats-lifetime')).match(/Runs\s*(\d+)/);
      await page.click('#stats-back');
      await page.waitForSelector('#downhill');
      return Number(m[1]);
    };

    await step('killed mid-run: Run interrupted, collected exactly once (#2)', async () => {
      const runsBefore = await lifetimeRuns();
      for (const crashFirst of [false, true]) {
        await page.click('#downhill');
        await page.setViewportSize(LANDSCAPE);
        await page.waitForSelector('#hud');
        await page.waitForTimeout(2600);                    // past one 2 s mirror save
        if (crashFirst) {
          await page.evaluate(() => window.__wtb.game.fall());
          await page.waitForSelector('#fell-overlay', { state: 'visible' });
        }
        await page.setViewportSize(PORTRAIT);
        await page.reload();                                // app killed
        await page.click('#continue');
        await page.waitForSelector('#interrupted-collect');
        const txt = await page.textContent('#interrupted-stats');
        const m = txt.match(/Distance\s*(\d+) m/);
        if (!m || Number(m[1]) <= 0) fail(`interrupted run shows no distance: ${txt}`);
        await page.click('#interrupted-collect');
        await page.waitForSelector('#downhill');
        await page.reload();                                // relaunch again: nothing to collect
        await page.click('#continue');
        await page.waitForSelector('#downhill');
        if (await page.isVisible('#interrupted-collect')) fail('interrupted run offered twice');
      }
      const runsAfter = await lifetimeRuns();
      if (runsAfter !== runsBefore + 2) fail(`expected ${runsBefore + 2} runs after two collects, got ${runsAfter}`);
    });

    await step('OTA reload deferred: run:start/run:end bracket every run (#1)', async () => {
      await page.evaluate(() => {
        window.__posted = [];
        window.ReactNativeWebView = { postMessage: (m) => window.__posted.push(m) };
      });
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await page.waitForTimeout(400);
      let posted = await page.evaluate(() => window.__posted.slice());
      if (!posted.includes('run:start') || posted.includes('run:end')) fail(`in run: ${JSON.stringify(posted)}`);
      // Switch Style: straight into the next run, still "in run".
      await page.click('#pause');
      await page.click('#switch-style');
      await page.waitForSelector('#hud');
      await page.waitForTimeout(400);
      posted = await page.evaluate(() => window.__posted.slice());
      if (posted.includes('run:end')) fail(`run:end sent between switched runs: ${JSON.stringify(posted)}`);
      const intro = page.locator('#halfpipe-intro');
      if (await intro.isVisible().catch(() => false)) await intro.click();
      await page.click('#pause');
      await page.click('#quit');
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
      await page.waitForFunction(() => window.__posted.includes('run:end'));
      posted = await page.evaluate(() => { const p = window.__posted.slice(); delete window.ReactNativeWebView; return p; });
      if (posted.lastIndexOf('run:end') < posted.lastIndexOf('run:start')) fail(`bad order: ${JSON.stringify(posted)}`);
    });

    await step('upgrade double-tap buys once (#3)', async () => {
      // 10.7 ❄: menu must show whole flakes (#4), and one purchase leaves
      // the 0.7 fraction in the bank.
      await patchProfile({ currency: 10.7 });
      const menu = await page.textContent('.fullscreen-panel');
      if (!/— 10 ❄/.test(menu)) fail(`menu should show 10 ❄ for 10.7, got: ${menu}`);
      await page.click('#upgrades');
      await page.waitForSelector('.upgrade-buy:not([disabled])');
      await page.evaluate(() => {
        const b = document.querySelector('.upgrade-buy');
        b.click(); b.click(); b.click();
      });
      await page.waitForFunction(() => document.querySelector('.upgrade-desc')?.textContent?.includes('1/20'));
      await page.waitForTimeout(300);
      const text = await page.textContent('.fullscreen-panel');
      if (!/\b0 ❄/.test(text)) fail(`expected 0 ❄ after one purchase, got: ${text}`);
      if (/2\/20/.test(text)) fail('double tap bought two levels');
      await page.click('#upgrades-back');
      await page.waitForSelector('#downhill');
    });

    await step('upgrades screen', async () => {
      await page.click('#upgrades');
      await page.waitForSelector('.upgrade-row');
      await page.click('#upgrades-back');
      await page.waitForSelector('#downhill');
    });
    console.log('smoke: PASS');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(`\nsmoke: FAIL\n${e.stack ?? e}`);
  process.exit(1);
});
