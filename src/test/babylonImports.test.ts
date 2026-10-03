import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The '@babylonjs/core' barrel is marked sideEffects:true, so importing it
// pulls the whole engine into the page (about 3.6 MB more). Game code goes
// through src/scene/babylon.ts, which uses deep module paths.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('Babylon imports', () => {
  it('nothing imports the @babylonjs/core barrel', () => {
    const offenders = sources('src')
      .filter((p) => !p.endsWith('babylonImports.test.ts'))
      .filter((p) => /from\s+'@babylonjs\/core'|import\(\s*'@babylonjs\/core'\s*\)/.test(readFileSync(p, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
