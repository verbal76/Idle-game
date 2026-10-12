// Compares Android signing-certificate SHA-256 fingerprints WITHOUT any key material.
//
//   node scripts/compare-fingerprints.mjs <installed-app-fingerprint> <candidate-apk-fingerprint> [<eas-keystore-fingerprint>]
//
// Accepts any common spelling ("SHA256: AB:CD:...", "ab cd ...", lowercase hex). Prints which values match
// and what that does and does not prove. It never reads a keystore, a password or a token; the owner
// pastes fingerprints (public values), which are safe to share. See docs/signing-continuity.md.
import { fileURLToPath } from 'node:url';

export const DEBUG_CERT_SHA256 = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';

/** Lower-case 64-hex SHA-256 from a pasted fingerprint, or null if it is not one. */
export function normalize(input) {
  const hex = String(input ?? '').replace(/^\s*sha-?256\s*[:=]?\s*/i, '').replace(/[\s:.-]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

/**
 * @returns {{ok: boolean, lines: string[]}} ok is true only when the installed app and the candidate share a
 * certificate. Never claims more than the fingerprints show.
 */
export function compare(installed, candidate, eas) {
  const a = normalize(installed), b = normalize(candidate), c = eas === undefined ? undefined : normalize(eas);
  const lines = [];
  const bad = [['installed app', installed, a], ['candidate APK', candidate, b], ...(eas === undefined ? [] : [['EAS keystore', eas, c]])].filter(([, , n]) => !n);
  if (bad.length) return { ok: false, lines: bad.map(([n]) => `${n}: not a SHA-256 fingerprint (expected 64 hex digits, colons optional)`) };
  const label = (h) => (h === DEBUG_CERT_SHA256 ? ' (the public Android/Expo DEBUG certificate)' : '');
  lines.push(`installed app : ${a}${label(a)}`, `candidate APK : ${b}${label(b)}`);
  if (c) lines.push(`EAS keystore  : ${c}${label(c)}`);
  const same = a === b;
  lines.push(same
    ? 'RESULT: installed app and candidate APK are signed by the SAME certificate. Android will accept the candidate as an in-place update (given the same package id and a higher versionCode). This does not prove the versionCode or runtime are right.'
    : 'RESULT: DIFFERENT certificates. Android will REFUSE the candidate as an update; nothing is changed or deleted. Do NOT uninstall without a verified backup (Settings > Back up & restore).');
  if (c) lines.push(a === c ? 'The installed app is signed with the EAS keystore.' : 'The installed app is NOT signed with that EAS keystore.');
  return { ok: same, lines };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [i, cnd, e] = process.argv.slice(2);
  if (!i || !cnd) { console.error('usage: compare-fingerprints.mjs <installed> <candidate> [<eas-keystore>]'); process.exit(2); }
  const r = compare(i, cnd, e);
  console.log(r.lines.join('\n'));
  process.exit(r.ok ? 0 : 1);
}
