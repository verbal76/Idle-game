import { describe, expect, it } from 'vitest';
import { DEBUG_CERT_SHA256, compare, normalize } from '../../scripts/compare-fingerprints.mjs';
import { DEBUG_CERT_SHA256 as RELEASE_DEBUG } from '../../scripts/release-signing.mjs';

const A = 'a1'.repeat(32);
const colon = (h: string) => h.toUpperCase().match(/../g)!.join(':');

describe('signing fingerprint comparison (no key material involved)', () => {
  it('normalises the spellings keytool, apksigner and the EAS dashboard print', () => {
    expect(normalize(A)).toBe(A);
    expect(normalize(colon(A))).toBe(A);
    expect(normalize(`SHA256: ${colon(A)}`)).toBe(A);
    expect(normalize(`SHA-256 = ${A.match(/../g)!.join(' ')}`)).toBe(A);
    expect(normalize('nope')).toBeNull();
    expect(normalize('ab:cd')).toBeNull();
    expect(normalize('')).toBeNull();
  });
  it('the same certificate: in-place update expected; different: refused, nothing changes', () => {
    expect(compare(colon(A), A).ok).toBe(true);
    const diff = compare(A, 'b2'.repeat(32));
    expect(diff.ok).toBe(false);
    expect(diff.lines.join('\n')).toMatch(/REFUSE/);
    expect(diff.lines.join('\n')).toMatch(/Do NOT uninstall/);
  });
  it('flags the public debug certificate and the EAS keystore relationship', () => {
    const r = compare(DEBUG_CERT_SHA256, DEBUG_CERT_SHA256, 'c3'.repeat(32));
    expect(r.lines.join('\n')).toMatch(/DEBUG certificate/);
    expect(r.lines.join('\n')).toMatch(/NOT signed with that EAS keystore/);
  });
  it('refuses to guess from malformed input', () => {
    expect(compare('xyz', A).ok).toBe(false);
    expect(compare(A, '12:34').lines[0]).toMatch(/not a SHA-256 fingerprint/);
  });
  it('uses the same debug fingerprint the release gate refuses', () => {
    expect(DEBUG_CERT_SHA256).toBe(RELEASE_DEBUG);
  });
});
