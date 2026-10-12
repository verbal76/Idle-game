import { handleBack } from '../util/backButton';
import { InputHub, type HubEvent } from './hub';
import { KeyboardSource } from './keyboard';
import { MenuNav } from './menuNav';
import { PromptBar } from './promptBar';
import { PromptState, loadPref, type PromptContext } from './prompts';
import { createGameInput, type TouchControls } from './mux';
import type { GameInput } from '../scene/Game';

/** What the desktop shell (Electron preload) exposes; absent on Android and in a browser. */
export interface DesktopShell {
  platform: string;
  steamDeck: boolean;
  quit(): void;
}
declare global {
  interface Window { wtbDesktop?: DesktopShell }
}

/** What a run tells the input system. */
export interface RunHooks {
  /** Riding with no overlay: gameplay keys/buttons are live, directions don't move focus. */
  inPlay(): boolean;
  /** Start / Menu / P: pause when riding, resume from the pause menu. */
  menu(): void;
  /** The pad that was in use disconnected while riding. */
  padLost(): void;
}

/**
 * The single owner of non-touch input: gamepad hub, keyboard, focus
 * navigation, button prompts. Created once at boot. Touch keeps working
 * exactly as before whether or not any of this is active.
 */
export class InputSystem {
  readonly hub = new InputHub();
  readonly keyboard: KeyboardSource;
  readonly prompts: PromptState;
  readonly nav: MenuNav;
  private readonly bar: PromptBar;
  private run: RunHooks | null = null;
  private readonly shell: DesktopShell | undefined;

  constructor(private readonly doc: Document = document, win: Window = window) {
    this.shell = win.wtbDesktop;
    // A desktop build starts on the keyboard prompts, a Steam Deck on the pad; a phone on touch.
    this.prompts = new PromptState(() => performance.now(), this.shell?.steamDeck ? 'gamepad' : this.shell ? 'keyboard' : 'touch');
    if (this.shell?.steamDeck) this.prompts.setFamily('steamdeck');
    this.prompts.pref = loadPref();
    this.keyboard = new KeyboardSource(win);
    this.keyboard.playing = () => this.inPlay();
    this.nav = new MenuNav({
      doc,
      inPlay: () => this.inPlay(),
      // Same Back as the Android button, but never "exit the app": a pad Back at a root screen does nothing.
      back: () => handleBack(),
      menu: () => { this.run?.menu(); return true; },
    });
    this.bar = new PromptBar(doc);

    const route = (e: HubEvent) => this.onEvent(e);
    this.hub.on(route);
    this.keyboard.on(route);
    doc.addEventListener('pointerdown', () => {
      this.prompts.noteActivity('touch');
      this.nav.showRing(false);
    }, true);
    win.addEventListener('focus', () => { this.hub.poll(); this.nav.repair(); });
    this.nav.attach();
    this.hub.start();
    setInterval(() => this.refreshBar(), 250);
    this.refreshBar();
  }

  private inPlay(): boolean { return !!this.run && this.run.inPlay(); }

  setRun(hooks: RunHooks | null): void {
    this.run = hooks;
    this.refreshBar();
  }

  private onEvent(e: HubEvent): void {
    switch (e.type) {
      case 'connect':
        this.prompts.setFamily(e.family);
        break;
      case 'disconnect': {
        const wasPad = this.prompts.source === 'gamepad';
        this.prompts.padLost(this.shell ? 'keyboard' : 'touch');
        if (wasPad && this.inPlay()) this.run?.padLost();
        break;
      }
      case 'activity':
        // The focus ring appears with the first navigation press (MenuNav), not on mere activity.
        this.prompts.noteActivity(e.source);
        break;
      case 'nav':
        this.nav.handle(e.action);
        break;
    }
    this.refreshBar();
  }

  private context(): PromptContext {
    if (this.doc.querySelector('#studio-splash:not(.out), .applying-update')) return 'none';
    if (this.inPlay()) return 'play';
    const a = this.doc.activeElement;
    if (a && a.tagName === 'INPUT' && (a as HTMLInputElement).type === 'range') return 'adjust';
    return 'menu';
  }

  refreshBar(): void { this.bar.update(this.prompts.style, this.context()); }

  /** The GameInput for a run: touch exactly as before, plus keyboard and pad. */
  gameInput(touch: TouchControls): GameInput & { releaseAll(): void } {
    return createGameInput(touch, this.hub, this.keyboard);
  }

  /** Called by Settings after the player picks a prompt style. */
  setPref(p: ReturnType<typeof loadPref>): void { this.prompts.pref = p; this.refreshBar(); }
}

let system: InputSystem | null = null;
export function installInput(): InputSystem {
  system ??= new InputSystem();
  return system;
}
export function inputSystem(): InputSystem | null { return system; }
