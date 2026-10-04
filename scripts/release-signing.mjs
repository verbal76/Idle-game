// Production signing helpers, FAIL CLOSED. Never prints secrets, never writes key
// material anywhere but the path it is told to (the runner's temp dir).
//
//   node scripts/release-signing.mjs check   validate the signing secrets + keystore
//   node scripts/release-signing.mjs patch   point android/app/build.gradle's release
//                                            build type at that keystore
//
// Inputs (environment; the production workflow maps them from GitHub secrets):
//   RELEASE_KEYSTORE_B64       base64 of the upload keystore (.jks / .p12)
//   RELEASE_KEYSTORE_PASSWORD  store password
//   RELEASE_KEY_ALIAS          key alias
//   RELEASE_KEY_PASSWORD       key password (defaults to the store password)
//   RELEASE_KEYSTORE_FILE      where `check` writes the decoded keystore (and `patch` reads it)
//
// Refuses: any missing secret, a keystore keytool cannot open, a missing alias, the
// public Android/Expo debug certificate, and a certificate that expires before
// 2033-10-23 (Google Play's minimum validity).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEBUG_CERT_SHA256 = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';
export const MIN_VALID_UNTIL = Date.UTC(2033, 9, 23);

const REQUIRED = ['RELEASE_KEYSTORE_B64', 'RELEASE_KEYSTORE_PASSWORD', 'RELEASE_KEY_ALIAS', 'RELEASE_KEYSTORE_FILE'];

/** Names of missing/blank required inputs (values are never returned). */
export function missingInputs(env) {
  return REQUIRED.filter(k => typeof env[k] !== 'string' || env[k].trim() === '');
}

/** Parse `keytool -list -v` output for one alias: { sha256 (lowercase hex, no colons), validUntil (ms) }. */
export function parseKeytool(text) {
  const sha = /SHA-?256:\s*([0-9A-Fa-f:]{95})/.exec(text);
  const until = /Valid from:.*until:\s*(.+)/.exec(text);
  const t = until ? Date.parse(until[1].trim().replace(/\s+[A-Z]{2,5}\s+(\d{4})$/, ' $1 UTC')) : NaN;
  return { sha256: sha ? sha[1].replace(/:/g, '').toLowerCase() : null, validUntil: Number.isNaN(t) ? null : t };
}

/** Failure strings for a parsed certificate (empty = acceptable). */
export function judgeCertificate({ sha256, validUntil }) {
  const fails = [];
  if (!sha256) fails.push('could not read the certificate fingerprint');
  else if (sha256 === DEBUG_CERT_SHA256) fails.push('this is the public debug certificate, not a production upload key');
  if (validUntil === null) fails.push('could not read the certificate expiry');
  else if (validUntil < MIN_VALID_UNTIL) fails.push('certificate expires before 2033-10-23 (Google Play minimum)');
  return fails;
}

/** Point the generated release build type at an env-driven keystore. Throws if the template is not what we expect. */
export function patchGradle(text) {
  if (text.includes('signingConfigs.release')) throw new Error('build.gradle already has a release signing config');
  const debugBlock = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\}\s*)\}/.exec(text);
  if (!debugBlock) throw new Error('build.gradle: signingConfigs.debug block not found (template changed?)');
  const release = `
        release {
            storeFile file(System.getenv('RELEASE_KEYSTORE_FILE'))
            storePassword System.getenv('RELEASE_KEYSTORE_PASSWORD')
            keyAlias System.getenv('RELEASE_KEY_ALIAS')
            keyPassword System.getenv('RELEASE_KEY_PASSWORD') ?: System.getenv('RELEASE_KEYSTORE_PASSWORD')
        }
    `;
  let out = text.replace(debugBlock[0], debugBlock[1] + release + '}');
  const relType = /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[^]*?)signingConfig signingConfigs\.debug/.exec(out);
  if (!relType) throw new Error('build.gradle: release build type signingConfig not found (template changed?)');
  out = out.replace(relType[0], relType[1] + 'signingConfig signingConfigs.release');
  if ((out.match(/signingConfig signingConfigs\.release/g) ?? []).length !== 1) throw new Error('build.gradle: unexpected signing configuration after patch');
  return out;
}

function keytoolList(file, alias, storepass) {
  return execFileSync('keytool', ['-list', '-v', '-keystore', file, '-alias', alias, '-storepass', storepass], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function check(env) {
  const missing = missingInputs(env);
  if (missing.length) throw new Error(`missing signing secrets: ${missing.join(', ')} (configure them as repository secrets; nothing was built)`);
  const file = env.RELEASE_KEYSTORE_FILE;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(env.RELEASE_KEYSTORE_B64, 'base64'), { mode: 0o600 });
  let listing;
  try { listing = keytoolList(file, env.RELEASE_KEY_ALIAS, env.RELEASE_KEYSTORE_PASSWORD); }
  catch { throw new Error('keytool could not open the keystore with that alias and password'); }
  const fails = judgeCertificate(parseKeytool(listing));
  if (fails.length) throw new Error(fails.join('; '));
  const { sha256 } = parseKeytool(listing);
  return sha256;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const cmd = process.argv[2];
    if (cmd === 'check') {
      const sha = check(process.env);
      console.log(`release-signing: keystore OK, certificate SHA-256 ${sha}`);
      if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `cert_sha256=${sha}\n`, { flag: 'a' });
    } else if (cmd === 'patch') {
      const f = 'android/app/build.gradle';
      if (!existsSync(f)) throw new Error(`${f} not found (run expo prebuild first)`);
      writeFileSync(f, patchGradle(readFileSync(f, 'utf8')));
      console.log('release-signing: android/app/build.gradle release build type now signs with the production keystore');
    } else {
      throw new Error('usage: release-signing.mjs check|patch');
    }
  } catch (e) {
    console.error(`::error::release-signing: ${e.message}`);
    process.exit(1);
  }
}
