'use strict';
// Preload for the desktop shell: exposes the three things the game needs from its host and nothing else.
// (contextIsolation + sandbox stay on; the page never sees Node or Electron.)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wtbDesktop', {
  platform: process.platform,
  // Steam sets SteamDeck=1 for games on a Steam Deck; the main process forwards it as an argument.
  steamDeck: process.argv.includes('--wtb-steamdeck=1'),
  // "Quit game" in the menu: the Android shell's quit:app message, desktop edition.
  quit: () => { ipcRenderer.send('wtb:quit'); },
});
