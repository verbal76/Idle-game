'use strict';
// Desktop shell for Where's the Bottom? (Windows x86-64 / Linux x86-64).
// The game is the SAME single-file bundle Android runs (game/index.html, built by `npm run web:build`);
// this file is only the platform adapter: window, fullscreen, audio URLs and navigation lockdown.
// Saves live in the page's IndexedDB under the stable origin app://game (Electron's userData folder).
const { app, BrowserWindow, Menu, net, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolveGameFile } = require('./paths');

const GAME_DIR = path.join(__dirname, 'game');
const SMOKE = process.env.WTB_SMOKE === '1';
const TRACKS = [
  { file: 'Powder_Parade.mp3', title: 'Powder Parade' },
  { file: 'Trail_Snack_Parade.mp3', title: 'Trail Snack Parade' },
  { file: 'Fresh_Powder_Run.mp3', title: 'Fresh Powder Run' },
];

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 360,
    backgroundColor: '#0b1320',                    // the app's own start-up colour: no white flash
    autoHideMenuBar: true,
    show: !SMOKE,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://game/')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('dom-ready', () => {
    const tracks = TRACKS.filter(t => fs.existsSync(path.join(GAME_DIR, 'music', t.file)))
      .map(t => ({ url: `app://game/music/${t.file}`, title: t.title }));
    win.webContents.executeJavaScript(
      `(function(){var u=${JSON.stringify(tracks)};window.__MUSIC_URLS__=u;try{window.dispatchEvent(new CustomEvent('music-urls',{detail:u}));}catch(e){}})();true;`,
    ).catch(() => {});
  });
  win.loadURL('app://game/index.html');
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const file = resolveGameFile(GAME_DIR, new URL(req.url).pathname);
    if (!file || !fs.existsSync(file)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  const win = createWindow();
  if (SMOKE) runSmoke(win);
  app.on('window-all-closed', () => app.quit());
});

/** Packaged-executable smoke (WTB_SMOKE=1): prints one JSON line and exits 0 only if the game booted. */
async function runSmoke(win) {
  const fail = (why) => { console.log('WTB_SMOKE ' + JSON.stringify({ ok: false, why })); app.exit(1); };
  const timer = setTimeout(() => fail('timeout waiting for the game'), 60000);
  const probe = () => win.webContents.executeJavaScript(`(function(){
    var s=document.getElementById('screen');
    return JSON.stringify({ title: document.title, origin: location.origin, screenChildren: s ? s.children.length : -1,
      fatal: !!document.querySelector('.fatal-panel') || (document.body.firstElementChild||{}).tagName==='PRE',
      canvas: !!document.getElementById('renderCanvas'), splash: !!document.getElementById('studio-splash'),
      music: (window.__MUSIC_URLS__||[]).length });
  })()`);
  const tick = async () => {
    try {
      const r = JSON.parse(await probe());
      if (r.fatal) { clearTimeout(timer); return fail('fatal error screen'); }
      if (r.screenChildren > 0 && r.canvas && !r.splash) {
        clearTimeout(timer);
        console.log('WTB_SMOKE ' + JSON.stringify({ ok: true, ...r }));
        return app.quit();
      }
    } catch { /* page still loading */ }
    setTimeout(tick, 500);
  };
  win.webContents.once('did-finish-load', () => setTimeout(tick, 500));
}
