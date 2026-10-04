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
import { PNG } from 'pngjs';

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
    // The UI swallows taps for 200 ms after a screen appears (double-tap
    // guard, ui/tapGuard.ts); scripted clicks wait it out like a person.
    const waitTapGuard = () => page.waitForFunction(() => !(window.__tapsLocked && window.__tapsLocked()), null, { polling: 30 }).catch(() => {});
    // State-based waits (instead of sleeping and hoping):
    // the rider has covered `m` metres of the run (game time, not wall time) ...
    const rode = (m) => page.waitForFunction((m) => (window.__wtb?.game?.rider?.root?.position?.z ?? 0) > m, m);
    // ... the 2 s mirror of the run started after `since` (with some distance on it) has reached IndexedDB ...
    const pendingSaved = async (since) => {
      const read = () => page.evaluate((since) => new Promise((res) => {
        const r = indexedDB.open('boarder');
        r.onerror = () => res(false);
        r.onsuccess = () => {
          const g = r.result.transaction('profiles').objectStore('profiles').getAll();
          g.onsuccess = () => { r.result.close(); res(g.result.some(p => p.pendingRun && p.pendingRun.distanceMeters > 0 && p.pendingRun.savedAtMs >= since)); };
          g.onerror = () => res(false);
        };
      }), since);
      const deadline = Date.now() + 30000;
      while (!(await read())) {
        if (Date.now() > deadline) throw new Error('the run mirror never reached IndexedDB');
        await page.waitForTimeout(100);
      }
    };
    const rawClick = page.click.bind(page);
    page.click = async (sel, opts) => { await waitTapGuard(); return rawClick(sel, opts); };
    await page.goto(`http://127.0.0.1:${port}/?e2e`);

    const checkNoCrash = async (where) => {
      const crashed = await page.evaluate(() => document.body.firstElementChild?.tagName === 'PRE' || !!document.querySelector('.fatal-panel'));
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

    // Quit from the pause menu: it now shows the run summary first (#21).
    const quitRun = async () => {
      await page.click('#quit');
      await page.waitForSelector('#fell-overlay', { state: 'visible' });
      await page.click('#fell-ok');
    };
    const hold = async (sel, ms) => {
      const box = await page.locator(sel).boundingBox();
      if (!box) fail(`${sel} not on screen`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(ms);
      await page.mouse.up();
    };
    // Real mouse press at a position across the steering strip (0 = far left, 1 = far right).
    const holdStrip = async (frac, ms) => {
      const box = await page.locator('#steer-strip').boundingBox();
      if (!box) fail('#steer-strip not on screen');
      await page.mouse.move(box.x + box.width * frac, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(ms);
      await page.mouse.up();
    };
    const ride = async (mode) => {
      await page.click(`#${mode}`);
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      const intro = page.locator('#halfpipe-intro');
      if (await intro.isVisible().catch(() => false)) await page.click('#halfpipe-intro-ok');
      // One steering strip replaces LEFT / RIGHT / CARVE.
      const strip = await page.evaluate(() => ({
        label: document.getElementById('steer-strip')?.getAttribute('aria-label') ?? '',
        old: ['dpad-left', 'dpad-right', 'dpad-up'].filter(id => document.getElementById(id)),
      }));
      if (!/carve/i.test(strip.label) || strip.old.length) fail(`steering strip: ${JSON.stringify(strip)}`);
      const before = await page.textContent('#score');
      await rode(15);
      // Charge + release a jump, then steer. Real mouse input so
      // setPointerCapture sees a live pointer.
      await hold('#jump', 400);
      await holdStrip(0.15, 600);
      await page.waitForFunction((b) => document.getElementById('score').textContent !== b, before, { timeout: 15000 })
        .catch(() => fail(`${mode}: HUD score never changed (${before})`));
      await page.click('#pause');
      await page.waitForSelector('#pause-menu', { state: 'visible' });
      await quitRun();
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
      await page.click('#halfpipe-intro-ok');
      await page.waitForFunction((b) => document.getElementById('score').textContent !== b, before);
      // How to play is in the pause menu and returns to it.
      await page.click('#pause');
      await page.click('#pause-howto');
      await page.waitForSelector('#halfpipe-intro', { state: 'visible' });
      await page.click('#halfpipe-intro-ok');
      await page.waitForSelector('#pause-menu', { state: 'visible' });
      await quitRun();
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#half-pipe');
      // Second ride: no intro.
      await page.click('#half-pipe');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await rode(5);
      if (await page.isVisible('#halfpipe-intro')) fail('intro shown again on the second ride');
      await page.click('#pause');
      await quitRun();
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
    });

    await step('half-pipe run', () => ride('half-pipe'));
    await step('crash locks pause; only the fell screen shows (#9)', async () => {
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await rode(8);
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
      // The screen shows the saved count. Rides abandoned at the start
      // (the intro rides, quit at once) don't count as runs (records.ts
      // isMeaningfulRun); the downhill, half-pipe and crash runs do.
      const saved = await page.evaluate(() => new Promise((res) => {
        const r = indexedDB.open('boarder');
        r.onsuccess = () => { const g = r.result.transaction('profiles').objectStore('profiles').getAll(); g.onsuccess = () => res(g.result[0].stats.lifetime.runs); };
      }));
      const shownRuns = Number((life.match(/Runs\s*(\d+)/) ?? [])[1]);
      if (shownRuns !== saved || saved > 5) fail(`lifetime runs: shown ${shownRuns}, saved ${saved}`);
      const down = await page.textContent('#stats-downhill');
      const m = down.match(/Longest run\s*([\d,]+) m/);
      if (!m || Number(m[1].replace(/,/g, '')) <= 0) fail(`downhill longest not recorded: ${down}`);
      await page.click('#stats-back');
      await page.click('#switch');
      await page.click('.profile-stats-btn');
      await page.waitForSelector('#stats-lifetime');
      if (!new RegExp(`Runs\\s*${saved}\\b`).test(await page.textContent('#stats-lifetime'))) fail('picker stats differ');
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
      await quitRun();
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

    const lifetimeDistance = () => page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('boarder');
      r.onsuccess = () => { const g = r.result.transaction('profiles').objectStore('profiles').getAll(); g.onsuccess = () => { r.result.close(); res(Math.max(...g.result.map(p => p.stats.lifetime.distance))); }; };
    }));
    const lifetimeRuns = async () => {
      await page.click('#stats');
      await page.waitForSelector('#stats-lifetime');
      const m = (await page.textContent('#stats-lifetime')).match(/Runs\s*(\d+)/);
      await page.click('#stats-back');
      await page.waitForSelector('#downhill');
      return Number(m[1]);
    };

    await step('killed mid-run: Run interrupted, collected exactly once (#2); crash banked at once (#21)', async () => {
      const runsBefore = await lifetimeRuns();
      const distBefore = await lifetimeDistance();
      for (const crashFirst of [false, true]) {
        const since = Date.now();
        await page.click('#downhill');
        await page.setViewportSize(LANDSCAPE);
        await page.waitForSelector('#hud');
        await pendingSaved(since);                               // the 2 s mirror save has landed
        if (crashFirst) {
          await page.evaluate(() => window.__wtb.game.fall());
          await page.waitForSelector('#fell-overlay', { state: 'visible' });
        }
        await page.setViewportSize(PORTRAIT);
        await page.reload();                                // app killed
        await page.click('#continue');
        if (crashFirst) {
          // #21: the fell screen already banked the run; nothing to recover.
          await page.waitForSelector('#downhill');
          if (await page.isVisible('#interrupted-collect')) fail('banked crash offered as interrupted');
          continue;
        }
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
      // Both rides were credited (lifetime distance grew by both); the
      // checks above prove neither was credited twice. (2.6 s rides are
      // under the 50 m 'accidental start' line, so they don't add to the
      // run count; records.ts isMeaningfulRun.)
      const distAfter = await lifetimeDistance();
      if (!(distAfter > distBefore)) fail(`interrupted/crashed rides not credited: ${distBefore} -> ${distAfter}`);
      if ((await lifetimeRuns()) !== runsBefore) fail('short rides counted as runs');
    });

    await step('run summary: breakdown + records; banked once (#21)', async () => {
      const runsBefore = await lifetimeRuns();
      const distBefore = await lifetimeDistance();
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await rode(30);
      await page.click('#pause');
      await page.click('#quit');
      await page.waitForSelector('#run-summary', { state: 'visible' });
      const title = await page.textContent('#fell-title');
      if (title !== 'Run over') fail(`summary title: ${title}`);
      const total = await page.textContent('#summary-total');
      if (!/^\+[\d,]+$/.test(total.trim())) fail(`summary total: ${total}`);
      const rows = await page.$$eval('.summary-record', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
      if (rows.length !== 2 || !rows[0].startsWith('Distance')) fail(`downhill records: ${JSON.stringify(rows)}`);
      // The pending mirror must not come back after banking.
      await page.waitForTimeout(2600);
      await page.setViewportSize(PORTRAIT);
      await page.reload();
      await page.click('#continue');
      await page.waitForSelector('#downhill');
      if (await page.isVisible('#interrupted-collect')) fail('a banked run was offered again');
      if (!((await lifetimeDistance()) > distBefore)) fail('the quit run was not banked');
      void runsBefore;
    });

    await step('milestones + dailies auto-paid at run end, shown in stats (#22)', async () => {
      const day = await page.evaluate(() => {
        const d = new Date(); const z = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
      });
      // Two runs done today toward 'Finish 3 runs today'; no milestones paid yet.
      await patchProfile({
        currency: 0, milestones: [],
        daily: { day, ids: ['runs', 'ride', 'flips'], progress: [2, 0, 0], done: [false, false, false], allPaid: false },
      });
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await rode(8);
      await page.click('#pause');
      // A real run (past the 50 m 'accidental start' line) counts toward
      // the run goals; carry the paused rider 60 m on.
      await page.evaluate(() => { window.__wtb.game.rider.root.position.z += 60; });
      await page.click('#quit');
      await page.waitForSelector('#run-summary', { state: 'visible' });
      const summary = (await page.textContent('#run-summary')).replace(/\s+/g, ' ');
      if (!/Milestone: Finish your first run ?\+10/.test(summary)) fail(`summary lacks milestone: ${summary}`);
      if (!/Daily: Finish 3 runs today ?\+15/.test(summary)) fail(`summary lacks daily: ${summary}`);
      await page.click('#fell-ok');
      await page.waitForSelector('#downhill');
      // Persisted across a reload and not paid twice.
      await page.setViewportSize(PORTRAIT);
      const read = async () => {
        await page.click('#stats');
        await page.waitForSelector('#stats-milestones');
        const r = {
          miles: await page.textContent('#stats-milestones h2'),
          daily: (await page.textContent('#stats-daily')).replace(/\s+/g, ' '),
        };
        await page.click('#stats-back');
        await page.waitForSelector('#downhill');
        return r;
      };
      const a = await read();
      if (!/Milestones [1-9]\d*\/15/.test(a.miles)) fail(`milestones header: ${a.miles}`);
      if (!(await page.evaluate(() => [...document.querySelectorAll('.goal-row.done')].length)) && !/Finish 3 runs today/.test(a.daily)) fail(`daily not done: ${a.daily}`);
      const bal = Number((await page.textContent('.menu-profile .pill-flakes')).replace(/\D/g, ''));
      if (!(bal >= 25)) fail(`expected >= 25 ❄ (10 first-run milestone + 15 daily), got ${bal}`);
      await page.reload();
      await page.click('#continue');
      await page.waitForSelector('#downhill');
      const b = await read();
      if (b.miles !== a.miles || b.daily !== a.daily) fail(`goals changed on reload: ${JSON.stringify([a, b])}`);
      const bal2 = Number((await page.textContent('.menu-profile .pill-flakes')).replace(/\D/g, ''));
      if (bal2 !== bal) fail('balance changed on reload');
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
      // Switch Style: the summary first (nothing banked silently), then
      // straight into the next run, still "in run".
      await page.click('#pause');
      await page.click('#switch-style');
      await page.waitForSelector('#fell-overlay', { state: 'visible' });
      if (!/Ride Half-pipe/.test(await page.textContent('#fell-switch'))) fail('summary switch button not labelled');
      await page.click('#fell-switch');
      await page.waitForSelector('#hud');
      await page.waitForTimeout(400);
      posted = await page.evaluate(() => window.__posted.slice());
      if (posted.includes('run:end')) fail(`run:end sent between switched runs: ${JSON.stringify(posted)}`);
      const intro = page.locator('#halfpipe-intro');
      if (await intro.isVisible().catch(() => false)) await page.click('#halfpipe-intro-ok');
      await page.click('#pause');
      await quitRun();
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
      await page.waitForFunction(() => window.__posted.includes('run:end'));
      posted = await page.evaluate(() => { const p = window.__posted.slice(); delete window.ReactNativeWebView; return p; });
      if (posted.lastIndexOf('run:end') < posted.lastIndexOf('run:start')) fail(`bad order: ${JSON.stringify(posted)}`);
      // An update may only apply on the main menu: busy before every run,
      // idle again once back on the menu.
      const start = posted.indexOf('run:start');
      if (posted.lastIndexOf('ui:busy', start) < posted.lastIndexOf('ui:idle', start)) fail(`run started while 'idle': ${JSON.stringify(posted)}`);
      if (posted.lastIndexOf('ui:idle') < posted.lastIndexOf('run:end')) fail(`menu not reported idle: ${JSON.stringify(posted)}`);
    });

    await step('upgrade double-tap buys once (#3)', async () => {
      // 10.7 ❄: menu must show whole flakes (#4), and one purchase leaves
      // the 0.7 fraction in the bank.
      await patchProfile({ currency: 10.7 });
      const menu = (await page.textContent('.menu-profile .pill-flakes')).trim();
      if (menu !== '10') fail(`menu should show 10 ❄ for 10.7, got: ${menu}`);
      await page.click('#upgrades');
      await page.waitForSelector('.upgrade-buy:not(.poor):not(.maxed)');
      await waitTapGuard();
      await page.evaluate(() => {
        const b = document.querySelector('.upgrade-buy');
        b.click(); b.click(); b.click();
      });
      await page.waitForFunction(() => document.querySelector('.upgrade-level')?.textContent?.includes('1/20'));
      await page.waitForTimeout(700);                       // past the balance tick-down (#28)
      const text = await page.textContent('.fullscreen-panel');
      const shop = (await page.textContent('#shop-balance')).trim();
      if (shop !== '0') fail(`expected 0 ❄ after one purchase, got: ${shop}`);
      if (/2\/20/.test(text)) fail('double tap bought two levels');
      await page.click('#upgrades-back');
      await page.waitForSelector('#downhill');
    });

    await step('shop updates in place: scroll kept, can\'t-afford says why (R6)', async () => {
      await patchProfile({ currency: 30 });
      await page.click('#upgrades');
      await page.waitForSelector('#upgrades-list');
      await waitTapGuard();
      // Scroll down, then buy something that is on screen: the list must not jump.
      await page.evaluate(() => { document.querySelector('.fullscreen-panel').scrollTop = 200; });
      const before = await page.evaluate(() => document.querySelector('.fullscreen-panel').scrollTop);
      const target = page.locator('.upgrade-buy:not(.poor):not(.maxed)').first();
      const id = await target.evaluate(el => el.closest('.upgrade-row').dataset.id);
      const lvl0 = await page.textContent(`.upgrade-row[data-id="${id}"] .upgrade-level`);
      await target.evaluate(el => el.click());
      await page.waitForFunction(([id, lvl0]) => document.querySelector(`.upgrade-row[data-id="${id}"] .upgrade-level`).textContent !== lvl0, [id, lvl0]);
      const after = await page.evaluate(() => document.querySelector('.fullscreen-panel').scrollTop);
      if (Math.abs(after - before) > 2 || before < 50) fail(`shop scroll jumped: ${before} -> ${after}`);
      // Something unaffordable (Grace costs 40; balance is now < 40): tap says what's missing.
      const grace = page.locator('.upgrade-row[data-id="grace"] .upgrade-buy');
      if (!(await grace.evaluate(el => el.classList.contains('poor')))) fail('Grace should be marked unaffordable');
      await grace.evaluate(el => el.click());
      const msg = (await grace.textContent()).trim();
      if (!/^Need \d+/.test(msg)) fail(`unaffordable tap gave no reason: '${msg}'`);
      await page.waitForFunction(() => !/Need/.test(document.querySelector('.upgrade-row[data-id="grace"] .upgrade-buy').textContent), null, { timeout: 4000 });
      if ((await grace.getAttribute('aria-disabled')) !== 'true') fail('unaffordable button not marked aria-disabled');
      await page.click('#upgrades-back');
      await page.waitForSelector('#downhill');
    });

    await step('upgrade rename + Air Control split migrates in IndexedDB (#19)', async () => {
      // A pre-split save: Air Control (spin) 7, no Flip Speed key.
      await patchProfile({ upgrades: { speed: 0, jump: 0, turn: 0, charge: 0, spin: 7, coin: 3 } });
      await page.click('#upgrades');
      await page.waitForSelector('.upgrade-row');
      const rows = await page.$$eval('.upgrade-row', els => els.map(e => e.textContent.replace(/\s+/g, ' ')));
      const find = (label) => rows.find(r => r.includes(label)) ?? '';
      for (const gone of ['Coin Magnet', 'Air Control']) if (rows.some(r => r.includes(gone))) fail(`${gone} still listed`);
      if (!/7\/20/.test(find('Spin Speed'))) fail(`Spin Speed row: ${find('Spin Speed')}`);
      if (!/7\/20/.test(find('Flip Speed'))) fail(`Flip Speed row: ${find('Flip Speed')}`);
      if (!/3\/20/.test(find('Flake Bonus'))) fail(`Flake Bonus row: ${find('Flake Bonus')}`);
      await page.click('#upgrades-back');
      await page.waitForSelector('#downhill');
    });

    await step('upgrades screen: current → next and level pips (#18)', async () => {
      await page.click('#upgrades');
      await page.waitForSelector('.upgrade-row');
      const speed = await page.$eval('.upgrade-row', r => ({
        desc: r.querySelector('.upgrade-desc').textContent,
        pips: r.querySelectorAll('.pip').length,
        on: r.querySelectorAll('.pip.on').length,
        level: r.querySelector('.upgrade-level').textContent,
      }));
      const lvl = Number(speed.level.split('/')[0]);
      const cur = (22 + 0.5 * lvl).toFixed(1), next = (22 + 0.5 * (lvl + 1)).toFixed(1);
      if (speed.desc !== `${cur} m/s → ${next} m/s`) fail(`Top Speed read-out: ${speed.desc}`);
      if (speed.pips !== 20 || speed.on !== lvl) fail(`pips ${speed.on}/${speed.pips} for level ${lvl}`);
      if (!(await page.isVisible('#shop-balance'))) fail('balance header missing');
      // #20: the new upgrades are listed; Grace has 4 levels at 40 ❄.
      const names = await page.$$eval('.upgrade-name', els => els.map(e => e.textContent));
      for (const n of ['Ring Magnet', 'Combo Window', 'Grace']) {
        if (!names.some(t => t.includes(n))) fail(`${n} missing from the shop`);
      }
      const grace = await page.$$eval('.upgrade-row', rows => {
        const r = rows.find(x => x.querySelector('.upgrade-name').textContent.includes('Grace'));
        return { pips: r.querySelectorAll('.pip').length, price: r.querySelector('.upgrade-buy').textContent };
      });
      if (grace.pips !== 4 || !grace.price.includes('40')) fail(`Grace row: ${JSON.stringify(grace)}`);
      await page.click('#upgrades-back');
      await page.waitForSelector('#downhill');
    });
    await step('every panel scrolls, nothing clipped, portrait + landscape (#23)', async () => {
      // With the panel scrolled to the top nothing may sit above the
      // screen; scrolled to the bottom, nothing may hang below it.
      const probe = (label) => page.evaluate((label) => {
        const panel = [...document.querySelectorAll('.fullscreen-panel')]
          .filter(e => getComputedStyle(e).display !== 'none' && e.getClientRects().length).pop();
        if (!panel) return `${label}: no panel`;
        const kids = [...panel.children].filter(k => getComputedStyle(k).position !== 'absolute' && k.getBoundingClientRect().height > 0);
        panel.scrollTop = 0;
        const top = Math.min(...kids.map(k => k.getBoundingClientRect().top));
        panel.scrollTop = 1e6;
        const bottom = Math.max(...kids.map(k => k.getBoundingClientRect().bottom));
        panel.scrollTop = 0;
        const left = Math.min(...kids.map(k => k.getBoundingClientRect().left));
        const right = Math.max(...kids.map(k => k.getBoundingClientRect().right));
        if (left < 0 || right > innerWidth + 1) return `${label}: content is ${Math.round(left)}..${Math.round(right)} wide of ${innerWidth}`;
        return top >= 0 && bottom <= innerHeight + 1 ? null : `${label}: content spans ${Math.round(top)}..${Math.round(bottom)} of ${innerHeight}`;
      }, label);
      const problems = [];
      const check = async (label, open, close) => {
        for (const [name, vp] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]]) {
          await page.setViewportSize(PORTRAIT);
          for (const sel of open) { await page.click(sel); await page.waitForTimeout(200); }
          await page.setViewportSize(vp);
          await page.waitForTimeout(150);
          const p = await probe(`${label} (${name})`);
          if (p) problems.push(p);
          await page.setViewportSize(PORTRAIT);
          for (const sel of close) { await page.click(sel); await page.waitForTimeout(200); }
        }
      };
      await check('main menu', [], []);
      await check('upgrades', ['#upgrades'], ['#upgrades-back']);
      await check('stats', ['#stats'], ['#stats-back']);
      await check('settings', ['#menu-settings'], ['#settings-back']);
      await check('about', ['#menu-settings', '#settings-about'], ['#about-back', '#settings-back']);
      // In a run: the pause menu and the end-of-run summary.
      await page.click('#downhill');
      await page.waitForSelector('#hud');
      await page.click('#pause');
      for (const [name, vp] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]]) {
        await page.setViewportSize(vp); await page.waitForTimeout(150);
        const p = await probe(`pause (${name})`); if (p) problems.push(p);
      }
      await page.click('#quit');
      await page.waitForSelector('#fell-overlay', { state: 'visible' });
      for (const [name, vp] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]]) {
        await page.setViewportSize(vp); await page.waitForTimeout(150);
        const p = await probe(`run summary (${name})`); if (p) problems.push(p);
      }
      await page.setViewportSize(PORTRAIT);
      await page.click('#fell-ok');
      await page.waitForSelector('#downhill');
      if (problems.length) fail(problems.join('\n'));
    });

    await step('HUD chips: distance, altitude (downhill only), snowflakes, tricks (#24)', async () => {
      const read = () => page.evaluate(() => {
        const v = (id) => document.getElementById(id);
        const shown = (id) => getComputedStyle(v(id)).display !== 'none';
        const bar = document.querySelector('.hud-chips').getBoundingClientRect();
        const actions = document.querySelector('.top-actions').getBoundingClientRect();
        return {
          dist: Number(v('chip-dist').textContent), alt: shown('chip-alt-wrap'),
          flakes: v('chip-flakes').textContent, tricks: shown('chip-tricks-wrap'),
          overlap: bar.right > actions.left - 4,
        };
      });
      for (const mode of ['downhill', 'half-pipe']) {
        await page.click(`#${mode}`);
        await page.setViewportSize(LANDSCAPE);
        await page.waitForSelector('#hud');
        if (await page.isVisible('#halfpipe-intro')) await page.click('#halfpipe-intro-ok');
        const a = await read();
        await page.waitForFunction((d) => Number(document.getElementById('chip-dist').textContent) > d, a.dist, { timeout: 15000 }).catch(() => {});
        const b = await read();
        if (!(b.dist > a.dist)) fail(`${mode}: distance chip not advancing ${a.dist} -> ${b.dist}`);
        if (b.alt !== (mode === 'downhill')) fail(`${mode}: altitude chip shown=${b.alt}`);
        if (!/^\d[\d,]*$/.test(b.flakes)) fail(`${mode}: snowflake chip '${b.flakes}'`);
        if (b.tricks) fail(`${mode}: tricks chip shown before any trick`);
        if (b.overlap) fail(`${mode}: chips run into the pause/settings buttons at ${LANDSCAPE.width}x${LANDSCAPE.height}`);
        await page.click('#pause');
        await quitRun();
        await page.setViewportSize(PORTRAIT);
        await page.waitForSelector('#downhill');
      }
    });

    await step('trick callouts: name + payout, stacked, fade away (#25)', async () => {
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await page.evaluate(() => {
        const cb = window.__wtb.game.callbacks;
        cb.onTrick({ name: 'FLIP', payout: 1, comboMult: 1, outcome: 'clean', switch: false });
        cb.onTrick({ name: 'CORK 360', payout: 2.25, comboMult: 1.5, outcome: 'clean', switch: false });
      });
      const shown = await page.$$eval('#callouts .callout', els => els.map(e => ({ cls: e.className, text: e.textContent.replace(/\s+/g, ' ').trim() })));
      if (shown.length !== 2) fail(`expected 2 callouts, got ${JSON.stringify(shown)}`);
      if (!shown[0].cls.includes('callout-big') || shown[0].text !== 'CORK 360+2.3 · ×1.5 combo') fail(`newest callout: ${JSON.stringify(shown[0])}`);
      if (shown[1].text !== 'FLIP+1') fail(`older callout: ${JSON.stringify(shown[1])}`);
      await page.waitForFunction(() => document.querySelectorAll('#callouts .callout').length === 0, null, { timeout: 5000 })
        .catch(() => fail('callouts did not clear'));
      await page.click('#pause');
      await quitRun();
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
    });

    await step('SFX: slider persists and controls the synthesized sounds (#26)', async () => {
      await page.evaluate(() => {
        window.__sfxStarts = 0;
        // Oscillators and noise buffers (which override start()).
        for (const C of [OscillatorNode, AudioBufferSourceNode]) {
          const orig = C.prototype.start;
          C.prototype.start = function (...a) { window.__sfxStarts++; return orig.apply(this, a); };
        }
      });
      const setSfx = async (pct) => {
        await page.click('#menu-settings');
        await page.waitForSelector('#sfx-vol');
        await page.evaluate((pct) => {
          const el = document.getElementById('sfx-vol');
          el.value = String(pct);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, pct);
        const label = await page.textContent('#sfx-vol-val');
        if (label !== `${pct}%`) fail(`sfx label ${label}`);
        await page.click('#settings-back');
        await page.waitForSelector('#downhill');
      };
      const soundsDuringJumps = async () => {
        await page.click('#downhill');
        await page.setViewportSize(LANDSCAPE);
        await page.waitForSelector('#hud');
        // Keep the slope clear so a random rock can't end the run mid-test.
        await page.evaluate(() => {
          window.__clearRocks = setInterval(() => {
            for (const c of window.__wtb.game.streamer.chunks.values()) c.rocks.length = 0;
          }, 50);
        });
        await page.waitForTimeout(800);
        const before = await page.evaluate(() => window.__sfxStarts);
        const grounded = (on) => page.waitForFunction((on) => window.__wtb.game.grounded === on, on, { timeout: 20000 }).catch(async (e) => {
          const g = await page.evaluate(() => { const g = window.__wtb.game; return { grounded: g.grounded, charge: g.jumpCharge, rel: g.jumpReleaseRequired, state: g.state, paused: g.paused, speed: g.speed, crashed: g.crashed, hud: document.getElementById('hud')?.className, overlays: [...document.querySelectorAll('.fullscreen-panel')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className) }; });
          const box = await page.locator('#jump').boundingBox();
          const top = await page.evaluate(({x, y}) => { const el = document.elementFromPoint(x, y); return el ? (el.id || el.className) : null; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
          fail(`grounded=${on} timeout: ${JSON.stringify(g)} topAtJump=${top}`);
        });
        // One jump from the ground: the jump sound plays at launch.
        await grounded(true);
        await hold('#jump', 250);
        await grounded(false);
        await page.waitForTimeout(100);
        const n = await page.evaluate(() => window.__sfxStarts) - before;
        await page.evaluate(() => clearInterval(window.__clearRocks));
        await page.click('#pause');
        await quitRun();
        await page.setViewportSize(PORTRAIT);
        await page.waitForSelector('#downhill');
        return n;
      };
      await setSfx(0);
      const muted = await soundsDuringJumps();
      if (muted !== 0) fail(`SFX at 0% still started ${muted} sounds`);
      await setSfx(100);
      const loud = await soundsDuringJumps();
      if (loud < 2) fail(`expected the jump sound (2 voices) at 100%, got ${loud} sources`);
      // Persisted per profile.
      await setSfx(35);
      await page.reload();
      await page.click('#continue');
      await page.click('#menu-settings');
      const v = await page.$eval('#sfx-vol', el => el.value);
      if (v !== '35') fail(`SFX volume not persisted: ${v}`);
      await page.click('#settings-back');
      await page.waitForSelector('#downhill');
    });

    await step('vibration: game events buzz; the toggle turns it off and persists (#27)', async () => {
      const arm = () => page.evaluate(() => {
        window.__buzz = [];
        Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: (p) => { window.__buzz.push(p); return true; } });
      });
      const eventsBuzz = async () => {
        await page.click('#downhill');
        await page.setViewportSize(LANDSCAPE);
        await page.waitForSelector('#hud');
        await page.evaluate(() => {
          window.__buzz.length = 0;
          const cb = window.__wtb.game.callbacks;
          cb.onTrick({ name: 'CORK 360', payout: 2, comboMult: 1, outcome: 'clean', switch: false });
        });
        await page.waitForTimeout(100);
        await page.evaluate(() => window.__wtb.game.callbacks.onGrace(0));
        const got = await page.evaluate(() => window.__buzz.slice());
        await page.click('#pause');
        await quitRun();
        await page.setViewportSize(PORTRAIT);
        await page.waitForSelector('#downhill');
        return got;
      };
      const toggle = async (want) => {
        await page.click('#menu-settings');
        await page.waitForSelector('#haptics-toggle');
        if ((await page.textContent('#haptics-toggle')) !== want) await page.click('#haptics-toggle');
        if ((await page.textContent('#haptics-toggle')) !== want) fail('vibration toggle did not switch');
        await page.click('#settings-back');
        await page.waitForSelector('#downhill');
      };
      await arm();
      await toggle('On');
      const on = await eventsBuzz();
      if (JSON.stringify(on) !== JSON.stringify([[20, 40, 30], [30, 40, 30]])) fail(`expected big-trick + grace patterns, got ${JSON.stringify(on)}`);
      await toggle('Off');
      const off = await eventsBuzz();
      if (off.length) fail(`vibration off but got ${JSON.stringify(off)}`);
      await page.reload();
      await page.click('#continue');
      await page.click('#menu-settings');
      if ((await page.textContent('#haptics-toggle')) !== 'Off') fail('vibration setting not persisted');
      await page.click('#haptics-toggle');                // leave it on
      await page.click('#settings-back');
      await page.waitForSelector('#downhill');
    });

    await step('polish: pause icon, headings, purchase pulse + balance tick-down (#28)', async () => {
      await page.click('#downhill');
      await page.waitForSelector('#hud');
      const pause = await page.evaluate(() => {
        const b = document.getElementById('pause');
        return { svg: !!b.querySelector('svg.pause-icon'), label: b.getAttribute('aria-label'), text: b.textContent.trim() };
      });
      if (!pause.svg || pause.label !== 'Pause' || pause.text !== '') fail(`pause button: ${JSON.stringify(pause)}`);
      await page.click('#pause');
      await quitRun();
      await page.waitForSelector('#downhill');
      await page.click('#stats');
      const h1 = await page.$eval('.stats-panel h1', el => getComputedStyle(el).textTransform);
      if (h1 !== 'uppercase') fail(`heading style: ${h1}`);
      await page.click('#stats-back');
      await page.waitForSelector('#downhill');

      await patchProfile({ currency: 50 });
      await page.click('#upgrades');
      await page.waitForSelector('.upgrade-buy:not(.poor):not(.maxed)');
      await waitTapGuard();
      const seen = await page.evaluate(() => new Promise((resolve) => {
        const vals = [];
        const t0 = performance.now();
        const sample = () => {
          const b = document.getElementById('shop-balance-num');
          const v = b && Number(b.textContent.replace(/,/g, ''));
          if (b && vals[vals.length - 1] !== v) vals.push(v);
          if (performance.now() - t0 < 900) requestAnimationFrame(sample); else resolve(vals);
        };
        document.querySelector('.upgrade-buy').click();
        requestAnimationFrame(sample);
      }));
      const bought = await page.evaluate(() => ({
        row: !!document.querySelector('.upgrade-row.just-bought .pip.new'),
        spent: document.getElementById('shop-balance').classList.contains('spent'),
      }));
      const last = seen[seen.length - 1];
      if (seen.length < 3 || last >= seen[0] || last !== 40) fail(`balance should tick down to 40: ${JSON.stringify(seen)}`);
      if (!bought.row || !bought.spent) fail(`purchase feedback missing: ${JSON.stringify(bought)}`);
      await page.click('#upgrades-back');
      await page.waitForSelector('#downhill');
    });

    await step('Build / Update Info in Settings: runtime metadata, fallbacks, live update', async () => {
      const read = () => page.$$eval('#build-info .bi-row', rows => Object.fromEntries(rows.map(r => [r.dataset.id, r.querySelector('.bi-val').textContent])));
      await page.evaluate(() => { delete window.__OTA__; });
      await page.click('#menu-settings');
      await page.click('#settings-about');
      await page.waitForSelector('#about-back');
      // Players see the name and version; the details are one tap away.
      if (await page.isVisible('#build-info')) fail('build details should start collapsed');
      await page.click('details.build-details > summary');
      await page.waitForSelector('#build-info', { state: 'visible' });
      // No native shell (browser): honest fallbacks, never undefined/null.
      let v = await read();
      if (v.source !== 'Browser (no native app shell)' || v['app-version'] !== 'Unavailable') fail(`no-shell rows: ${JSON.stringify(v)}`);
      if (Object.values(v).some(x => /undefined|null|NaN/.test(x))) fail(`bad value: ${JSON.stringify(v)}`);
      if (!/^[0-9a-f]{8}…/.test(v.commit)) fail(`bundle commit not shown: ${v.commit}`);
      // The shell injects metadata after load (App.tsx onLoadEnd): the open panel updates.
      await page.evaluate(() => {
        window.__OTA__ = {
          updateId: '01a0e4f8-a3b7-7817-b044-39670636a47d', runtimeVersion: '0.0.1', channel: 'preview',
          createdAt: '2026-09-28T01:02:03.000Z', isEmbeddedLaunch: false, isEmergencyLaunch: false,
          nativeAppVersion: '0.0.1', nativeVersionCode: 5,
          otaMeta: { commit: 'abcdef1234567890abcdef1234567890abcdef12', label: 'OTA #99', message: 'Smoke canary (OTA #99)', run: '999', branch: 'b' },
        };
        window.dispatchEvent(new CustomEvent('ota-info', { detail: window.__OTA__ }));
      });
      v = await read();
      const want = { 'app-version': '0.0.1', 'native-build': '5', runtime: '0.0.1', channel: 'preview', source: 'OTA update (downloaded)',
        'ota-name': 'Smoke canary (OTA #99)', 'update-id': '01a0e4f8…', commit: 'abcdef12…', branch: 'b' };
      for (const [k, w] of Object.entries(want)) if (v[k] !== w) fail(`${k}: '${v[k]}' != '${w}'`);
      await page.click('#bi-full');
      v = await read();
      if (v['update-id'] !== '01a0e4f8-a3b7-7817-b044-39670636a47d') fail(`full id: ${v['update-id']}`);
      const shown = await page.textContent('.about-version');
      if (shown.trim() !== 'Version 0.0.1 (5)') fail(`About version line: ${shown}`);
      await page.click('#about-back');
      await page.waitForSelector('#sfx-vol');
      await page.click('#settings-back');
      await page.waitForSelector('#downhill');
      await page.evaluate(() => { delete window.__OTA__; });
    });

    await step('smallest phone (320x568): title, rows and touch targets (release audit)', async () => {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.waitForTimeout(200);
      const menu = await page.evaluate(() => {
        const t = document.querySelector('.title-bouncy'), g = document.querySelector('.gear-btn');
        const tr = t.getBoundingClientRect(), gr = g.getBoundingClientRect();
        const overlap = !(tr.right <= gr.left || tr.left >= gr.right || tr.bottom <= gr.top || tr.top >= gr.bottom);
        const wide = [...document.querySelectorAll('.fullscreen-panel button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.left < 0 || r.right > innerWidth); }).map(b => b.id || b.textContent.trim());
        return { left: tr.left, right: tr.right, overlap, color: getComputedStyle(t).color, transform: getComputedStyle(t).textTransform, wide };
      });
      if (menu.left < 0 || menu.right > 320) fail(`title outside the screen: ${menu.left}..${menu.right}`);
      if (menu.overlap) fail('title overlaps the settings gear');
      if (menu.color !== 'rgb(255, 209, 102)' || menu.transform === 'uppercase') fail(`title lost its own style: ${menu.color} ${menu.transform}`);
      if (menu.wide.length) fail(`buttons wider than the screen: ${menu.wide}`);
      await page.click('#menu-settings');
      await page.waitForSelector('#sfx-vol');
      await page.click('#settings-about');
      await page.click('details.build-details > summary');
      await page.waitForSelector('#bi-full', { state: 'visible' });
      const small = await page.evaluate(() => [...document.querySelectorAll('#bi-full, #bi-copy, #about-back')]
        .map(e => ({ id: e.id, h: e.getBoundingClientRect().height })).filter(x => x.h < 32));
      if (small.length) fail(`About touch targets under 32 px: ${JSON.stringify(small)}`);
      await page.click('#about-back');
      await page.waitForSelector('#sfx-vol');
      const small2 = await page.evaluate(() => [...document.querySelectorAll('#music-vol, #sfx-vol, #haptics-toggle')]
        .map(e => ({ id: e.id, h: e.getBoundingClientRect().height })).filter(x => x.h < 32));
      if (small2.length) fail(`touch targets under 32 px: ${JSON.stringify(small2)}`);
      await page.click('#settings-back');
      await page.waitForSelector('#downhill');
      await page.setViewportSize(PORTRAIT);
    });

    await step('damaged save loads, plays and banks without the error screen (release audit)', async () => {
      const day = await page.evaluate(() => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; });
      await patchProfile({ currency: null, stats: { downhill: null, halfPipe: 'x', lifetime: { runs: 'many' } }, daily: { day, ids: [] }, milestones: null });
      const menu = await page.textContent('.fullscreen-panel');
      if (/NaN|undefined|null/.test(menu)) fail(`menu shows junk: ${menu}`);
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await page.waitForTimeout(800);
      await page.click('#pause');
      await quitRun();
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
      if (await page.$('pre')) fail(`error screen: ${await page.textContent('pre')}`);
      await page.click('#stats');
      const stats = await page.textContent('.stats-panel');
      if (/NaN|undefined|null/.test(stats)) fail(`stats show junk: ${stats}`);
      await page.click('#stats-back');
      await page.waitForSelector('#downhill');
    });

    await step('a rejected background promise is logged, not fatal (release audit)', async () => {
      await page.evaluate(() => { Promise.reject(new Error('audit-probe: simulated failed save')); });
      await page.waitForTimeout(200);
      // The probe's own console.error is expected; anything else still fails the run.
      const logged = errors.some(e => e.includes('audit-probe'));
      for (let i = errors.length - 1; i >= 0; i--) if (errors[i].includes('audit-probe')) errors.splice(i, 1);
      if (!logged) fail('the rejection was not logged');
      await checkNoCrash('after an unhandled rejection');
      // Still playable: open Stats and come back.
      await page.click('#stats');
      await page.click('#stats-back');
      await page.waitForSelector('#downhill');
    });

    await step('Settings gear: the supplied artwork, whole and see-through, still opens Settings', async () => {
      // What the control draws, measured in the page (not the file name).
      const art = (sel) => page.evaluate(async (sel) => {
        const btn = document.querySelector(sel);
        const g = btn.querySelector('.settings-gear');
        const m = /url\("(.+)"\)/.exec(getComputedStyle(g).backgroundImage);
        const img = new Image();
        if (m) { img.src = m[1]; await img.decode(); }
        const r = g.getBoundingClientRect();
        return { glyph: btn.textContent.includes('⚙'), w: img.naturalWidth, h: img.naturalHeight, size: getComputedStyle(g).backgroundSize, box: [r.width, r.height] };
      }, sel);
      const expectArt = (where, a) => {
        if (a.glyph) fail(`${where}: still shows the old ⚙ glyph`);
        if (a.w !== 1262 || a.h !== 1246) fail(`${where}: not the supplied gear artwork (${a.w}x${a.h})`);
        if (a.size !== 'contain' || Math.abs(a.box[0] - a.box[1]) > 0.5) fail(`${where}: gear not drawn whole/in proportion (${a.size}, ${a.box})`);
      };
      // The centre hole and the corners show what's behind; the ring is drawn.
      const seeThrough = async (sel) => {
        const gear = page.locator(`${sel} .settings-gear`);
        // Element screenshots follow the element even if the page is scrolled.
        const grab = async () => PNG.sync.read(await gear.screenshot({ animations: 'disabled' }));
        const px = (img, fx, fy) => { const x = Math.round((img.width - 1) * fx), y = Math.round((img.height - 1) * fy), i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
        // The points compared below: hole centre, a corner, the ring above
        // the hole. (The bouncing title can graze the box's bottom edge,
        // so only these points must hold still between captures.)
        const POINTS = [[0.475, 0.509], [0.02, 0.02], [0.475, 0.23]];
        const sample = (img) => JSON.stringify(POINTS.map(([fx, fy]) => px(img, fx, fy)));
        // Wait for those points to hold still (panel fade-ins, a transition
        // from the previous tap); give up after ~2 s.
        let shown = await grab();
        for (let tries = 0; ; tries++) {
          await page.waitForTimeout(300);
          const next = await grab();
          if (sample(next) === sample(shown)) break;
          if (tries >= 5) fail(`${sel}: gear area still changing; can't compare`);
          shown = next;
        }
        await page.evaluate((sel) => { document.querySelector(`${sel} .settings-gear`).style.opacity = '0'; }, sel);
        const hidden = await grab();
        await page.evaluate((sel) => { document.querySelector(`${sel} .settings-gear`).style.opacity = ''; }, sel);
        const d = (fx, fy) => Math.max(...px(shown, fx, fy).map((v, i) => Math.abs(v - px(hidden, fx, fy)[i])));
        // Centre of the hole (the artwork's gear is centred at ~47.5% / 50.9%),
        // a corner, and the solid ring just above the hole.
        if (d(0.475, 0.509) > 2 || d(0.02, 0.02) > 2) fail(`${sel}: gear centre/background not transparent (centre ${d(0.475, 0.509)}, corner ${d(0.02, 0.02)})`);
        if (d(0.475, 0.23) < 20) fail(`${sel}: gear ring not drawn (${d(0.475, 0.23)})`);
      };
      expectArt('main menu', await art('#menu-settings'));
      await seeThrough('#menu-settings');
      await page.click('#menu-settings');
      await page.waitForSelector('#settings-back');
      await page.click('#settings-back');
      await page.waitForSelector('#downhill');
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      expectArt('in-run HUD', await art('#hud-settings'));
      await page.click('#hud-settings');
      await page.waitForSelector('#settings-back');
      await page.click('#settings-back');
      await page.click('#pause');
      expectArt('pause menu', await art('#pause-settings'));
      await quitRun();
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
    });

    await step('steering strip: progressive steering, outer-zone carve, two-thumb multi-touch', async () => {
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await page.waitForFunction(() => !(window.__tapsLocked && window.__tapsLocked()), null, { polling: 30 }).catch(() => {});
      const read = () => page.evaluate(() => {
        const i = window.__wtb.game.input;
        return { x: i.leftStick().x, carve: !!i.forwardHeld(), jump: i.jumpHeld(), flip: i.flipHeld() };
      });
      // Synthetic pointer events carry distinct pointer ids (two thumbs).
      const fire = (sel, type, id, frac) => page.evaluate(([sel, type, id, frac]) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true, clientX: r.left + r.width * (frac ?? 0.5), clientY: r.top + r.height / 2 }));
      }, [sel, type, id, frac]);
      const near = (v, lo, hi, what) => { if (!(v >= lo && v <= hi)) fail(`strip: ${what} was ${v}, wanted ${lo}..${hi}`); };
      let s = await read();
      near(s.x, 0, 0, 'idle x');
      await fire('#steer-strip', 'pointerdown', 11, 0.5);
      s = await read(); near(s.x, 0, 0, 'centre x'); if (s.carve) fail('strip: carve at centre');
      await fire('#steer-strip', 'pointermove', 11, 0.6);
      const light = (await read()).x; near(light, 0.01, 0.4, 'light right');
      await fire('#steer-strip', 'pointermove', 11, 0.78);
      const strong = (await read()).x; near(strong, light + 0.05, 1, 'stronger right');
      s = await read(); if (s.carve) fail('strip: carve before the outer zone');
      await fire('#steer-strip', 'pointermove', 11, 0.97);
      s = await read(); near(s.x, 1, 1, 'full right'); if (!s.carve) fail('strip: outer right did not carve');
      // Hysteresis: back to just inside the engage line keeps carve, further in lets go.
      await fire('#steer-strip', 'pointermove', 11, 0.5 + 0.5 * 0.72);
      s = await read(); if (!s.carve) fail('strip: carve dropped inside the hysteresis band');
      await fire('#steer-strip', 'pointermove', 11, 0.5 + 0.5 * 0.55);
      s = await read(); if (s.carve) fail('strip: carve stuck after moving inward');
      // Crossing the centre flips direction.
      await fire('#steer-strip', 'pointermove', 11, 0.2);
      s = await read(); if (!(s.x < 0)) fail('strip: left of centre did not steer left');
      // The right thumb: JUMP + FLIP together with steering/carve, independent pointers.
      await fire('#steer-strip', 'pointermove', 11, 0.02);
      await fire('#jump', 'pointerdown', 12);
      s = await read(); if (!(s.carve && s.x < 0 && s.jump)) fail(`strip: carve + jump ${JSON.stringify(s)}`);
      await fire('#flip', 'pointerdown', 13);
      s = await read(); if (!(s.carve && s.flip && s.jump)) fail(`strip: carve + jump + flip ${JSON.stringify(s)}`);
      await fire('#jump', 'pointerup', 12);
      await fire('#flip', 'pointerup', 13);
      s = await read(); if (!(s.carve && !s.jump && !s.flip)) fail(`strip: releasing the right thumb cancelled steering ${JSON.stringify(s)}`);
      await fire('#jump', 'pointerdown', 12);
      await fire('#steer-strip', 'pointerup', 11);
      s = await read(); if (!(s.x === 0 && !s.carve && s.jump)) fail(`strip: releasing steering cancelled jump or stuck ${JSON.stringify(s)}`);
      await fire('#jump', 'pointerup', 12);
      // Cancel returns to neutral too.
      await fire('#steer-strip', 'pointerdown', 14, 0.95);
      s = await read(); if (!s.carve) fail('strip: second touch did not carve');
      await fire('#steer-strip', 'pointercancel', 14);
      s = await read(); if (!(s.x === 0 && !s.carve)) fail(`strip: cancel left steering ${JSON.stringify(s)}`);
      await page.click('#pause');
      await quitRun();
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#downhill');
    });

    await step('applying-update modal, Copy diagnostics, studio card', async () => {
      await page.waitForSelector('#downhill');
      const modal = () => page.evaluate(() => {
        const m = document.getElementById('applying-update');
        return m ? { text: m.textContent.trim(), top: document.elementFromPoint(innerWidth / 2, innerHeight / 2) === m || m.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2)) } : null;
      });
      const status = (s) => page.evaluate((s) => { window.__UPDATE_STATUS__ = s; window.dispatchEvent(new CustomEvent('update-status', { detail: s })); }, s);
      // Only the real activation shows it.
      for (const s of ['checking', 'downloading', 'up-to-date', 'ready', 'deferred', 'offline', 'unavailable']) {
        await status(s);
        if (await modal()) fail(`applying modal shown for status '${s}'`);
      }
      await status('reloading');
      let m = await modal();
      if (!m) fail('applying modal not shown on activation');
      if (m.text !== 'Please wait, applying update') fail(`applying modal text: ${m.text}`);
      if (!m.top) fail('applying modal does not cover the screen');
      await status('reloading');
      if ((await page.$$('#applying-update')).length !== 1) fail('applying modal stacked');
      // Android Back does nothing while it is up.
      await page.evaluate(() => window.__wtbBack && window.__wtbBack());
      if (!(await modal())) fail('Back dismissed the applying modal');
      if (!(await page.isVisible('#downhill'))) fail('Back changed the screen under the applying modal');
      // A failed activation (the shell reports ready again) removes it.
      await status('ready');
      if (await modal()) fail('applying modal stayed after a failed activation');
      if (await page.evaluate(() => document.body.innerText.includes('applying update'))) fail('applying text left behind');

      // Copy diagnostics (About).
      await page.evaluate(() => {
        window.__copied = null;
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t; } }, configurable: true });
      });
      await page.click('#menu-settings');
      await page.click('#settings-about');
      await page.waitForSelector('#about-copy');
      await status('up-to-date');
      await page.waitForSelector('#about-copy');
      await page.click('#about-copy');
      await page.waitForFunction(() => window.__copied);
      const text = await page.evaluate(() => window.__copied);
      if (!text.startsWith('HOT ATTIC GAMES DIAGNOSTICS')) fail(`diagnostics header: ${text.slice(0, 60)}`);
      for (const want of ['Captured at: ', '\nAPPLICATION\n', '\nDEVICE\n', '\nINSTALL\n', '\nOTA\n', '\nUPDATE STATE\n', '\nGOOGLE PLAY / ANDROID\n',
        'Package ID: com.hotatticgames.snow', 'Update state: Up to date', 'Play API compliant: ', 'Signing: Debug keystore']) {
        if (!text.includes(want)) fail(`diagnostics missing ${JSON.stringify(want)}:\n${text}`);
      }
      if (/undefined|null|NaN/.test(text)) fail(`diagnostics has a bad value:\n${text}`);
      await page.click('#about-back');
      await page.waitForSelector('#sfx-vol');
      await page.click('#settings-back');
      await page.waitForSelector('#downhill');

      // Studio card mechanics with a stand-in 1x1 image (the real logo is checked in the cold-launch step below).
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const shown = await page.evaluate((png) => !!window.__hag.showStudioSplash({ logoUrl: png, durationMs: 200 }), png);
      if (!shown) fail('studio card not shown');
      const card = await page.evaluate(() => {
        const el = document.getElementById('studio-splash'); const img = el.querySelector('img');
        const r = img.getBoundingClientRect(), c = getComputedStyle(el);
        return { bg: c.backgroundColor, pos: c.position, fit: getComputedStyle(img).objectFit, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height,
          cx: r.left + r.width / 2, cy: r.top + r.height / 2, vw: innerWidth, vh: innerHeight };
      });
      if (card.bg !== 'rgb(11, 19, 32)' || card.pos !== 'fixed' || card.fit !== 'contain') fail(`studio card style: ${JSON.stringify(card)}`);
      if (Math.abs(card.w - card.vw) > 1 || Math.abs(card.h - card.vh) > 1) fail(`studio card not full screen: ${JSON.stringify(card)}`);
      if (Math.abs(card.cx - card.vw / 2) > 1.5 || Math.abs(card.cy - card.vh / 2) > 1.5) fail(`studio logo not centred: ${JSON.stringify(card)}`);
      await page.waitForSelector('#studio-splash', { state: 'detached', timeout: 6000 });
      const again = await page.evaluate((png) => !!window.__hag.showStudioSplash({ logoUrl: png, durationMs: 200 }), png);
      if (again) fail('studio card replayed within one page load');
    });

    await step('studio splash: cold launch shows the canonical logo first (~2.8 s, contained, transparent), then the game; resume never replays it', async () => {
      for (const [label, vp] of [['portrait', PORTRAIT], ['landscape', { width: 844, height: 390 }]]) {
        const p = await browser.newPage({ viewport: vp, hasTouch: true });
        try {
          const t0 = Date.now();
          await p.goto(`http://127.0.0.1:${port}/?e2e&studio`);
          await p.waitForSelector('#studio-splash img', { timeout: 5000 });
          await p.waitForFunction(() => { const i = document.querySelector('#studio-splash img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 });
          await p.waitForSelector('#studio-splash.ready', { timeout: 3000 });
          await p.waitForTimeout(400);                             // past the fade-in
          const m = await p.evaluate(() => {
            const el = document.getElementById('studio-splash'), img = el.querySelector('img');
            const r = img.getBoundingClientRect(), top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
            return { nw: img.naturalWidth, nh: img.naturalHeight, w: r.width, h: r.height, l: r.left, t: r.top, vw: innerWidth, vh: innerHeight,
              fit: getComputedStyle(img).objectFit, bg: getComputedStyle(el).backgroundColor, opacity: getComputedStyle(img).opacity, topIsCard: el.contains(top),
              menuBeneath: !!document.getElementById('downhill') };
          });
          if (m.nw !== 1536 || m.nh !== 1024) fail(`${label}: studio logo is not the canonical 1536x1024 artwork: ${JSON.stringify(m)}`);
          if (Math.abs(m.w / m.h - 1.5) > 0.01) fail(`${label}: studio logo aspect ratio distorted: ${JSON.stringify(m)}`);
          if (m.l < -0.5 || m.t < -0.5 || m.l + m.w > m.vw + 0.5 || m.t + m.h > m.vh + 0.5) fail(`${label}: studio logo is cropped / outside the screen: ${JSON.stringify(m)}`);
          if (!m.topIsCard || m.opacity !== '1' || m.bg !== 'rgb(11, 19, 32)') fail(`${label}: studio card is not on top / visible: ${JSON.stringify(m)}`);
          // The game keeps loading underneath; the card ends within about 2-3.4 s of the page load.
          await p.waitForSelector('#studio-splash', { state: 'detached', timeout: 5000 });
          const total = Date.now() - t0;
          if (total < 2000 || total > 4200) fail(`${label}: studio card lasted ${total} ms`);
          await p.waitForSelector('#downhill', { timeout: 15000 });
          // Background / resume must not bring it back.
          await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
          await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('focus')); });
          await p.waitForTimeout(600);
          if (await p.evaluate(() => !!document.getElementById('studio-splash'))) fail(`${label}: studio card replayed on resume`);
          if (await p.evaluate(() => document.body.firstElementChild?.tagName === 'PRE' || !!document.querySelector('.fatal-panel'))) fail(`${label}: bootstrap error after the studio card`);
        } finally { await p.close(); }
      }
    });

    await step('HUD controls never overlap each other (graphics/UI audit)', async () => {
      // Portrait had FLIP on top of the right steering button.
      await page.click('#downhill');
      await page.waitForSelector('#hud');
      for (const [width, height] of [[320, 568], [360, 740], [412, 915], [568, 320], [915, 412], [800, 1280], [1280, 800]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(150);
        const hits = await page.evaluate(() => {
          const ids = ['steer-strip', 'flip', 'jump', 'pause', 'hud-settings', 'jump-charge-bar'];
          const r = Object.fromEntries(ids.map(id => [id, document.getElementById(id).getBoundingClientRect()]));
          const out = [];
          for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
            const a = r[ids[i]], b = r[ids[j]];
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`${ids[i]}/${ids[j]}`);
          }
          for (const id of ids) { const a = r[id]; if (a.left < 0 || a.top < 0 || a.right > innerWidth || a.bottom > innerHeight) out.push(`${id} off screen`); }
          return out;
        });
        if (hits.length) fail(`HUD at ${width}x${height}: ${hits.join(', ')}`);
      }
      await page.setViewportSize(PORTRAIT);
      await page.click('#pause');
      await quitRun();
      await page.waitForSelector('#downhill');
    });

    await step('stray errors after start-up are logged, never fatal (pre-release review)', async () => {
      // Each of these used to replace the whole game with a stack trace
      // (the logger itself threw on undefined / circular values).
      await page.evaluate(() => {
        const circ = {}; circ.self = circ;
        Promise.reject();
        Promise.reject(circ);
        console.error('probe-undefined', undefined, circ, () => 0);
        setTimeout(() => { throw new Error('probe-thrown'); }, 0);
      });
      await page.waitForTimeout(300);
      for (let i = errors.length - 1; i >= 0; i--) if (/probe|unhandledrejection|undefined|Object/.test(errors[i])) errors.splice(i, 1);
      await checkNoCrash('after stray errors');
      await page.click('#stats');
      await page.click('#stats-back');
      await page.waitForSelector('#downhill');
    });

    await step('Android Back: every sub-screen goes back, roots exit (pre-release review)', async () => {
      await page.evaluate(() => {
        window.__posted = [];
        window.ReactNativeWebView = { postMessage: (m) => window.__posted.push(m) };
      });
      const back = async () => { await page.waitForTimeout(250); await page.evaluate(() => window.__wtbBack()); };
      const exited = () => page.evaluate(() => window.__posted.includes('back:exit'));
      for (const [open, sel] of [['#upgrades', '#upgrades-list'], ['#stats', '#stats-lifetime'], ['#menu-settings', '#sfx-vol'], ['#switch', '#profile-list']]) {
        await page.click(open);
        await page.waitForSelector(sel);
        await back();
        await page.waitForSelector('#downhill');
        if (await exited()) fail(`Back on ${open} left the app`);
      }
      // Settings → About → Back → Back.
      await page.click('#menu-settings');
      await page.click('#settings-about');
      await page.waitForSelector('#about-back');
      await back();
      await page.waitForSelector('#sfx-vol');
      await back();
      await page.waitForSelector('#downhill');
      // In a run: Back pauses, opens nothing else, Back resumes; in-run
      // Settings closes on Back (it used to swallow it).
      await page.click('#downhill');
      await page.waitForSelector('#hud');
      await back();
      if (!(await page.isVisible('#pause-menu'))) fail('Back did not pause');
      await page.click('#pause-settings');
      await page.waitForSelector('#settings-overlay #sfx-vol');
      await back();
      if (!(await page.isVisible('#pause-menu'))) fail('Back did not close in-run Settings');
      await back();
      if (await page.isVisible('#pause-menu')) fail('Back did not resume');
      await page.click('#pause');
      await quitRun();
      await page.waitForSelector('#downhill');
      if (await exited()) fail('Back left the app from a sub-screen');
      // The main menu is a root: Back exits.
      await back();
      if (!(await exited())) fail('Back on the main menu did not exit');
      await page.evaluate(() => { delete window.ReactNativeWebView; });
    });

    await step('a quick double tap never lands on the next screen (pre-release review)', async () => {
      await patchProfile({ currency: 500 });
      const levels = () => page.evaluate(() => new Promise((res) => {
        const r = indexedDB.open('boarder');
        r.onsuccess = () => { const g = r.result.transaction('profiles').objectStore('profiles').getAll(); g.onsuccess = () => { r.result.close(); res(JSON.stringify(g.result.map(p => p.upgrades))); }; };
      }));
      const levelsBefore = await levels();
      // Main menu → Upgrades with a second tap where a Buy button appears.
      await waitTapGuard();
      const box = await page.locator('#upgrades').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(60);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForSelector('#upgrades-list');
      await page.waitForTimeout(300);
      if ((await levels()) !== levelsBefore) fail(`double tap bought an upgrade: ${levelsBefore} -> ${await levels()}`);
      await page.click('#upgrades-back');
      await page.waitForSelector('#downhill');
    });

    await step('Quit keeps the menu alive (Android may only background the app)', async () => {
      await page.evaluate(() => {
        window.__posted = [];
        window.ReactNativeWebView = { postMessage: (m) => window.__posted.push(m) };
      });
      await page.click('#quit');
      await page.waitForTimeout(300);
      if (!(await page.evaluate(() => window.__posted.includes('quit:app')))) fail('quit:app not posted');
      await page.click('#downhill');
      await page.waitForSelector('#hud');
      if (!(await page.evaluate(() => window.__posted.includes('run:start')))) fail('menu dead after Quit');
      await page.click('#pause');
      await quitRun();
      await page.waitForSelector('#downhill');
      await page.evaluate(() => { delete window.ReactNativeWebView; });
    });

    await step('profiles: rename and delete (with a confirm) from the picker', async () => {
      await page.click('#switch');
      await page.waitForSelector('#profile-list');
      await page.click('#new-profile');
      await page.click('#confirm');
      await page.waitForSelector('#downhill');
      await page.click('#switch');
      await page.waitForSelector('#profile-list .profile-edit-btn');
      const before = await page.$$eval('#profile-list .profile-line', l => l.length);
      await waitTapGuard(); await page.locator('#profile-list .profile-edit-btn').last().click();
      await page.fill('#manage-name', '  Renamed\u200b Rider  ');
      await page.click('#manage-rename');
      await page.waitForSelector('#profile-list');
      const names = await page.$$eval('#profile-list .profile-line button:first-child', l => l.map(b => b.textContent));
      if (!names.includes('Renamed Rider')) fail(`rename not shown: ${names}`);
      await waitTapGuard(); await page.locator('#profile-list .profile-edit-btn').last().click();
      await page.click('#manage-delete');
      await page.click('#manage-delete-no');
      await page.click('#manage-delete');
      await page.click('#manage-delete-yes');
      await page.waitForSelector('#profile-list');
      const after = await page.$$eval('#profile-list .profile-line', l => l.length);
      if (after !== before - 1) fail(`delete: ${before} -> ${after}`);
      // The deleted profile was the active one: pick the remaining one.
      await page.click('#profile-list .profile-line button');
      await page.waitForSelector('#downhill');
    });

    await step('menu art (splash, picker, main menu, Upgrades): the supplied background, full-bleed, no top band', async () => {
      // The panel's own background, measured in the page: which image,
      // how it's scaled, and whether it covers the whole screen.
      const bg = () => page.evaluate(async () => {
        const panel = document.querySelector('.fullscreen-panel.splash-bg');
        if (!panel) return null;
        const cs = getComputedStyle(panel);
        const urls = [...cs.backgroundImage.matchAll(/url\("(.+?)"\)/g)].map(m => m[1]);
        const img = new Image();
        if (urls.length === 1) { img.src = urls[0]; await img.decode(); }
        const r = panel.getBoundingClientRect();
        // (A button scrolled under the sticky Back bar counts as reachable by scrolling.)
        const onTop = (el) => { const b = el.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el.contains(top) || !!top?.closest('.sticky-actions'); };
        const buttons = [...panel.querySelectorAll('button')];
        return {
          urls: urls.length, w: img.naturalWidth, h: img.naturalHeight,
          size: cs.backgroundSize, rect: [r.left, r.top, r.right, r.bottom],
          view: [innerWidth, innerHeight],
          title: !!panel.querySelector('.title-bouncy'),
          buttons: buttons.length,
          // Buttons scrolled below the fold aren't checked.
          blocked: buttons.filter(b => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 && !onTop(b); }).map(b => b.id || b.textContent),
        };
      });
      // Average colour of screenshot rows [y0, y1): tolerant of scaling
      // and small rendering differences.
      const rows = (img, y0, y1) => {
        const sum = [0, 0, 0]; let n = 0;
        for (let y = y0; y < y1; y++) for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4; sum[0] += img.data[i]; sum[1] += img.data[i + 1]; sum[2] += img.data[i + 2]; n++;
        }
        return sum.map(v => v / n);
      };
      const check = async (where, { title = true } = {}) => {
        await page.waitForTimeout(400); // resize + panel fade-in
        const b = await bg();
        if (!b) fail(`${where}: splash background panel missing`);
        if (b.urls !== 1 || b.w !== 941 || b.h !== 1672) fail(`${where}: not the supplied splash art (${b.urls} images, ${b.w}x${b.h})`);
        if (!/(^|, )cover$/.test(b.size)) fail(`${where}: art not scaled with cover, so not in proportion (${b.size})`);
        if (b.rect[0] !== 0 || b.rect[1] !== 0 || b.rect[2] !== b.view[0] || b.rect[3] !== b.view[1]) fail(`${where}: background doesn't reach the screen edges: ${b.rect} vs ${b.view}`);
        if ((title && !b.title) || b.buttons < 2 || b.blocked.length) fail(`${where}: live UI missing or covered (title ${b.title}, ${b.buttons} buttons, covered: ${b.blocked})`);
        // Top edge: no dark strip or separate band. The top rows must be
        // lit and match the art just below them (the old art had black,
        // then blue-grey rows baked into its top edge).
        // The live UI is hidden for this capture, so only the background counts.
        const hideUi = (on) => page.evaluate((on) => { for (const el of document.querySelectorAll('.splash-bg > *')) el.style.visibility = on ? 'hidden' : ''; }, on);
        await hideUi(true);
        const shot = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: b.view[0], height: 48 }, animations: 'disabled' }));
        await hideUi(false);
        const top = rows(shot, 0, 8), below = rows(shot, 28, 44);
        if (Math.max(...top) < 30) fail(`${where}: dark strip at the top (${top.map(Math.round)})`);
        const jump = Math.max(...top.map((v, i) => Math.abs(v - below[i])));
        if (jump > 30) fail(`${where}: band at the top edge (top ${top.map(Math.round)} vs below ${below.map(Math.round)})`);
      };
      // Supported sizes plus a 393x873 phone.
      const sizes = [[320, 568], [412, 915], [568, 320], [915, 412], [800, 1280], [1280, 800], [393, 873]];
      // Profile picker (from the main menu).
      await page.click('#switch');
      await page.waitForSelector('#profile-list');
      for (const [width, height] of sizes) { await page.setViewportSize({ width, height }); await check(`picker ${width}x${height}`); }
      // The picker's gear still opens Settings on this background.
      await page.setViewportSize(PORTRAIT);
      await page.click('#ps-settings');
      await page.waitForSelector('#settings-back');
      await page.click('#settings-back');
      await page.waitForSelector('#profile-list');
      // Continue prompt: the launch splash when a profile is saved.
      await page.reload();
      await page.waitForSelector('#continue');
      for (const [width, height] of sizes) { await page.setViewportSize({ width, height }); await check(`continue ${width}x${height}`); }
      await page.setViewportSize(PORTRAIT);
      await page.click('#continue');
      await page.waitForSelector('#downhill');
      // The main menu and Upgrades are on the same art (the old art's
      // top band must not come back there either).
      for (const [width, height] of [[412, 915], [915, 412], [320, 568]]) { await page.setViewportSize({ width, height }); await check(`main menu ${width}x${height}`); }
      await page.setViewportSize(PORTRAIT);
      await page.click('#upgrades');
      await page.waitForSelector('#upgrades-list');
      await check('upgrades 412x915', { title: false });
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
