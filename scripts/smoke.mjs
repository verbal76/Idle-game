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
    const ride = async (mode) => {
      await page.click(`#${mode}`);
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      const intro = page.locator('#halfpipe-intro');
      if (await intro.isVisible().catch(() => false)) await intro.click();
      // #15: the up button is labelled and drawn as Deep carve.
      const up = await page.evaluate(() => {
        const b = document.getElementById('dpad-up');
        return { label: b.getAttribute('aria-label'), svg: !!b.querySelector('svg'), text: b.textContent.trim() };
      });
      if (up.label !== 'Deep carve' || !up.svg || up.text !== 'CARVE') fail(`deep carve button: ${JSON.stringify(up)}`);
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
      await page.click('#halfpipe-intro');
      await page.waitForFunction((b) => document.getElementById('score').textContent !== b, before);
      // How to play is in the pause menu and returns to it.
      await page.click('#pause');
      await page.click('#pause-howto');
      await page.waitForSelector('#halfpipe-intro', { state: 'visible' });
      await page.click('#halfpipe-intro');
      await page.waitForSelector('#pause-menu', { state: 'visible' });
      await quitRun();
      await page.setViewportSize(PORTRAIT);
      await page.waitForSelector('#half-pipe');
      // Second ride: no intro.
      await page.click('#half-pipe');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await page.waitForTimeout(600);
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
      const runsAfter = await lifetimeRuns();
      if (runsAfter !== runsBefore + 2) fail(`expected ${runsBefore + 2} runs (one collect + one banked crash), got ${runsAfter}`);
    });

    await step('run summary: breakdown + records; banked once (#21)', async () => {
      const runsBefore = await lifetimeRuns();
      await page.click('#downhill');
      await page.setViewportSize(LANDSCAPE);
      await page.waitForSelector('#hud');
      await page.waitForTimeout(2500);
      await page.click('#pause');
      await page.click('#quit');
      await page.waitForSelector('#run-summary', { state: 'visible' });
      const title = await page.textContent('#fell-title');
      if (title !== 'Run over') fail(`summary title: ${title}`);
      const total = await page.textContent('#summary-total');
      if (!/^\+\d+ ❄$/.test(total)) fail(`summary total: ${total}`);
      const rows = await page.$$eval('.summary-record', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
      if (rows.length !== 2 || !rows[0].startsWith('Distance')) fail(`downhill records: ${JSON.stringify(rows)}`);
      // The pending mirror must not come back after banking.
      await page.waitForTimeout(2600);
      await page.setViewportSize(PORTRAIT);
      await page.reload();
      await page.click('#continue');
      await page.waitForSelector('#downhill');
      if (await page.isVisible('#interrupted-collect')) fail('a banked run was offered again');
      const runsAfter = await lifetimeRuns();
      if (runsAfter !== runsBefore + 1) fail(`runs ${runsBefore} -> ${runsAfter}`);
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
      await page.waitForTimeout(1500);
      await page.click('#pause');
      await page.click('#quit');
      await page.waitForSelector('#run-summary', { state: 'visible' });
      const summary = (await page.textContent('#run-summary')).replace(/\s+/g, ' ');
      if (!/Milestone: Finish your first run ?\+10 ❄/.test(summary)) fail(`summary lacks milestone: ${summary}`);
      if (!/Daily: Finish 3 runs today ?\+15 ❄/.test(summary)) fail(`summary lacks daily: ${summary}`);
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
      if (!/Finish 3 runs today ?✔/.test(a.daily)) fail(`daily not done: ${a.daily}`);
      const menu = await page.textContent('.fullscreen-panel');
      const bal = Number((menu.match(/— (\d+) ❄/) ?? [])[1]);
      if (!(bal >= 25)) fail(`expected >= 25 ❄ (10 first-run milestone + 15 daily), got ${bal}`);
      await page.reload();
      await page.click('#continue');
      await page.waitForSelector('#downhill');
      const b = await read();
      if (b.miles !== a.miles || b.daily !== a.daily) fail(`goals changed on reload: ${JSON.stringify([a, b])}`);
      const menu2 = await page.textContent('.fullscreen-panel');
      if (Number((menu2.match(/— (\d+) ❄/) ?? [])[1]) !== bal) fail('balance changed on reload');
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
      await quitRun();
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
      await page.waitForFunction(() => document.querySelector('.upgrade-level')?.textContent?.includes('1/20'));
      await page.waitForTimeout(300);
      const text = await page.textContent('.fullscreen-panel');
      if (!/\b0 ❄/.test(text)) fail(`expected 0 ❄ after one purchase, got: ${text}`);
      if (/2\/20/.test(text)) fail('double tap bought two levels');
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
        if (await page.isVisible('#halfpipe-intro')) await page.click('#halfpipe-intro');
        const a = await read();
        await page.waitForTimeout(1500);
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
