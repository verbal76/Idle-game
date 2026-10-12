// A scriptable standard-mapping gamepad for headless tests. SIMULATION ONLY: it exercises the software path,
// it is not a physical controller. Install with page.addInitScript(FAKE_PAD); drive with window.__pad.
export const BTN = { south: 0, east: 1, west: 2, north: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };

export const FAKE_PAD = () => {
  const ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
  const s = { connected: false, id: ID, axes: [0, 0, 0, 0], buttons: Array(17).fill(false) };
  window.__pad = {
    connect(id) { s.connected = true; if (id) s.id = id; },
    disconnect() { s.connected = false; s.buttons.fill(false); s.axes = [0, 0, 0, 0]; },
    set(down, axes) { s.buttons.fill(false); for (const i of down) s.buttons[i] = true; if (axes) s.axes = axes; },
    state: s,
  };
  navigator.getGamepads = () => (s.connected
    ? [{ id: s.id, index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: [...s.axes], buttons: s.buttons.map((p) => ({ pressed: p, touched: p, value: p ? 1 : 0 })) }, null, null, null]
    : [null, null, null, null]);
};

