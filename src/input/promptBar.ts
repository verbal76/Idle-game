import { PROMPT_PREF_LABEL, SPRITE, promptEntries, promptKey, type Glyph, type PromptContext, type PromptStyle } from './prompts';

export const GLYPH_PX = 28;

function glyphHtml(gl: Glyph): string {
  if (gl.kind === 'img') return `<img class="glyph" data-slot="${gl.slot}" src="${gl.url}" alt="" draggable="false">`;
  if (gl.kind === 'sprite') {
    const s = GLYPH_PX / SPRITE.cell;
    return `<span class="glyph glyph-sprite" data-slot="${gl.slot}" style="background-image:url(${gl.url});background-size:${(SPRITE.w * s).toFixed(2)}px ${(SPRITE.h * s).toFixed(2)}px;background-position:-${(SPRITE.menuX * s).toFixed(2)}px -${(SPRITE.menuY * s).toFixed(2)}px"></span>`;
  }
  return `<span class="glyph glyph-text" data-slot="${gl.slot}">${gl.text}</span>`;
}

export function promptBarHtml(style: PromptStyle, ctx: PromptContext): string {
  return promptEntries(style, ctx)
    .map((e) => `<span class="prompt">${e.glyphs.map(glyphHtml).join('')}<span class="prompt-label">${e.label}</span></span>`)
    .join('');
}

/** A thin strip along the bottom that shows the active device's buttons. Re-renders only when its content would change. */
export class PromptBar {
  private readonly el: HTMLElement;
  private lastKey = '';

  constructor(doc: Document = document) {
    this.el = doc.createElement('div');
    this.el.id = 'prompt-bar';
    this.el.className = 'prompt-bar';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.setProperty('--glyph', `${GLYPH_PX}px`);
    doc.body.appendChild(this.el);
  }

  update(style: PromptStyle, ctx: PromptContext): void {
    const key = promptKey(style, ctx);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const html = promptBarHtml(style, ctx);
    this.el.innerHTML = html;
    this.el.dataset.style = style;
    this.el.dataset.context = ctx;
    this.el.classList.toggle('on', html !== '');
  }

  get element(): HTMLElement { return this.el; }
}

export { PROMPT_PREF_LABEL };
