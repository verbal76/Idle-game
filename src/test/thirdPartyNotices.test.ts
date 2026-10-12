import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('third-party notices', () => {
  const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  it('lists every dependency compiled into the app and the libraries inlined into the page, each with a license id', () => {
    for (const name of [...Object.keys(pkg.dependencies), '@babylonjs/core', 'idb']) {
      expect(notices, name).toMatch(new RegExp(`\\| ${name.replace(/[/.]/g, '\\$&')} \\| [\\d.]+ \\| [A-Za-z0-9.-]+ \\|`));
    }
    expect(notices).not.toMatch(/UNKNOWN/);
  });

  it('includes the license texts and states the unverified asset licenses honestly', () => {
    expect(notices).toMatch(/Apache License/);
    expect(notices).toMatch(/needs owner confirmation/);
    expect(notices).toMatch(/Hot_Attic_Games_Master_Logo_ALPHA_FINAL\.png/);
  });
});
