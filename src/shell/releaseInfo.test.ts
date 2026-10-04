import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { releaseInfo } from '../../scripts/release-info.mjs';

describe('release.json', () => {
  const i = releaseInfo() as { title: string; tag: string; apk: string; version: string; publicVersion: number };

  it('derives title, tag and filename from the one public version', () => {
    expect(i.title).toBe(`Where's the Bottom? v${i.publicVersion}`);
    expect(i.tag).toBe(`v${i.publicVersion}`);
    expect(i.apk).toBe(`Wheres-the-Bottom-v${i.publicVersion}.apk`);
    expect(i.apk).toMatch(/^[A-Za-z0-9-]+\.apk$/);
  });

  it('is a plain sequential integer, never semver or a codename', () => {
    const raw = JSON.parse(readFileSync('release.json', 'utf8'));
    expect(Number.isInteger(raw.publicVersion)).toBe(true);
    expect(raw.publicVersion).toBeGreaterThanOrEqual(83);
  });
});
