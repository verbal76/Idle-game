import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseInfo } from '../../scripts/release-info.mjs';

type Info = { title: string; tag: string; apk: string; exe: string; linux: string; version: string; publicVersion: number; buildNumber: number };

describe('release.json', () => {
  const i = releaseInfo() as Info;

  it('derives title, tag and the three standard file names from the one build number (studio standard v2.0)', () => {
    expect(i.title).toBe(`Where's the Bottom? Build ${i.buildNumber}`);
    expect(i.tag).toBe(`build-${i.buildNumber}`);
    expect(i.apk).toBe(`Wheres the Bottom Build ${i.buildNumber} APK.apk`);
    expect(i.exe).toBe(`Wheres the Bottom Build ${i.buildNumber} EXE.zip`);
    expect(i.linux).toBe(`Wheres the Bottom Build ${i.buildNumber} Linux.tar.gz`);
    for (const f of [i.apk, i.exe, i.linux]) expect(f).not.toMatch(/[?'"<>:*|\\/]/);   // valid on Windows, Linux and Android
  });

  it('is a plain sequential integer, never semver or a codename', () => {
    const raw = JSON.parse(readFileSync('release.json', 'utf8'));
    expect(Number.isInteger(raw.publicVersion)).toBe(true);
    expect(raw.publicVersion).toBeGreaterThanOrEqual(83);
  });

  it('the earlier "v<N>" convention is one switch away and keeps the number', () => {
    const d = mkdtempSync(join(tmpdir(), 'wtb-rel-'));
    const f = join(d, 'release.json');
    writeFileSync(f, JSON.stringify({ productName: "Where's the Bottom?", fileName: 'Wheres the Bottom', publicVersion: 12, namingStyle: 'v' }));
    const v = releaseInfo(f) as Info;
    expect(v.title).toBe("Where's the Bottom? v12");
    expect(v.tag).toBe('v12');
    expect(v.apk).toBe('Wheres-the-Bottom-v12.apk');
    writeFileSync(f, JSON.stringify({ productName: 'x', fileName: 'x', publicVersion: 12, namingStyle: 'semver' }));
    expect(() => releaseInfo(f)).toThrow(/namingStyle/);
    writeFileSync(f, JSON.stringify({ productName: 'x', fileName: 'bad/name', publicVersion: 12 }));
    expect(() => releaseInfo(f)).toThrow(/fileName/);
  });

  it('the workflow shell fragments that consume the names survive spaces', () => {
    // mirrors `sed -n 's/^apk=//p'` in eas-build.yml and the eval/sed in release-android.yml
    const out = ['title', 'tag', 'apk'].map(k => `${k}=${i[k as 'title']}`).join('\n');
    expect(/^apk=(.*)$/m.exec(out)![1]).toBe(i.apk);
    expect(/^title=(.*)$/m.exec(out)![1]).toBe(i.title);
  });
});
