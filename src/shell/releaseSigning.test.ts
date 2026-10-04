import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEBUG_CERT_SHA256, MIN_VALID_UNTIL, judgeCertificate, missingInputs, parseKeytool, patchGradle } from '../../scripts/release-signing.mjs';

const hasKeytool = spawnSync('keytool', ['-help'], { stdio: 'ignore' }).error === undefined;
const template = readFileSync('scripts/tests/fixtures/app-build.gradle.sdk54', 'utf8');

describe('release signing (fixtures only, never production keys)', () => {
  it('reports exactly which secrets are missing, never their values', () => {
    expect(missingInputs({})).toEqual(['RELEASE_KEYSTORE_B64', 'RELEASE_KEYSTORE_PASSWORD', 'RELEASE_KEY_ALIAS', 'RELEASE_KEYSTORE_FILE']);
    expect(missingInputs({ RELEASE_KEYSTORE_B64: 'x', RELEASE_KEYSTORE_PASSWORD: ' ', RELEASE_KEY_ALIAS: 'a', RELEASE_KEYSTORE_FILE: '/t/k' })).toEqual(['RELEASE_KEYSTORE_PASSWORD']);
  });

  it('refuses the public debug certificate and short-lived certificates', () => {
    const future = MIN_VALID_UNTIL + 1e10;
    expect(judgeCertificate({ sha256: 'ab'.repeat(32), validUntil: future })).toEqual([]);
    expect(judgeCertificate({ sha256: DEBUG_CERT_SHA256, validUntil: future }).join()).toMatch(/debug certificate/);
    expect(judgeCertificate({ sha256: 'ab'.repeat(32), validUntil: MIN_VALID_UNTIL - 1 }).join()).toMatch(/2033/);
    expect(judgeCertificate({ sha256: null, validUntil: null }).length).toBe(2);
  });

  it('patches the real SDK 54 template: release signs with the env keystore, debug is untouched', () => {
    const out = patchGradle(template);
    expect(out).toContain("storeFile file(System.getenv('RELEASE_KEYSTORE_FILE'))");
    expect(out).toMatch(/release \{\s*\/\/ Caution[^]*?signingConfig signingConfigs\.release/);
    expect(out).toMatch(/debug \{\s*signingConfig signingConfigs\.debug/);
    expect(() => patchGradle(out)).toThrow(/already/);
    expect(() => patchGradle('android { }')).toThrow(/not found/);
  });

  it.runIf(hasKeytool)('check refuses missing secrets, a short-lived key and a wrong password; accepts a long-lived throwaway key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtb-sign-'));
    const mk = (name: string, days: string) => {
      const f = join(dir, name);
      execFileSync('keytool', ['-genkeypair', '-keystore', f, '-storepass', 'fixture-pass', '-keypass', 'fixture-pass', '-alias', 'k', '-dname', 'CN=Fixture', '-keyalg', 'RSA', '-keysize', '2048', '-validity', days], { stdio: 'ignore' });
      return readFileSync(f).toString('base64');
    };
    const run = (env: Record<string, string>) => spawnSync('node', ['scripts/release-signing.mjs', 'check'], { env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv, encoding: 'utf8' });
    const base = { RELEASE_KEYSTORE_PASSWORD: 'fixture-pass', RELEASE_KEY_ALIAS: 'k', RELEASE_KEYSTORE_FILE: join(dir, 'out.jks') };

    const none = run({});
    expect(none.status).toBe(1);
    expect(none.stderr).toMatch(/missing signing secrets/);

    expect(run({ ...base, RELEASE_KEYSTORE_B64: mk('short.jks', '30') }).stderr).toMatch(/2033/);
    expect(run({ ...base, RELEASE_KEYSTORE_B64: mk('long.jks', '9000'), RELEASE_KEYSTORE_PASSWORD: 'wrong' }).stderr).toMatch(/could not open/);

    const ok = run({ ...base, RELEASE_KEYSTORE_B64: mk('ok.jks', '9000') });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/certificate SHA-256 [0-9a-f]{64}/);
    expect(ok.stdout + ok.stderr).not.toContain('fixture-pass');
  });

  it('parses keytool output', () => {
    const p = parseKeytool('Valid from: Mon Jan 01 00:00:00 UTC 2024 until: Tue Jan 01 00:00:00 UTC 2058\nSHA256: ' + Array(32).fill('AB').join(':'));
    expect(p.sha256).toBe('ab'.repeat(32));
    expect(p.validUntil).toBeGreaterThan(MIN_VALID_UNTIL);
  });
});
