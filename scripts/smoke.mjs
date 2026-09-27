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
