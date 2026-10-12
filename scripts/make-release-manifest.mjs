// Release manifest: which exact source revision every artifact of a release came from.
//
//   node scripts/make-release-manifest.mjs --platform android --signing debug --out X.manifest.json <artifact>...
//   node scripts/make-release-manifest.mjs --check-parity a.manifest.json b.manifest.json
//
// A coordinated multiplatform release uses ONE source SHA for every target: --check-parity fails
// when manifests disagree on source SHA or public version (never "fix" it by substituting a
// different revision). Provenance recorded: source SHA + ref, public version, platform, build
// configuration, runtime, versionCode, build time, toolchain/dependency versions, artifact SHA-256s.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseInfo } from './release-info.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const depVersion = (name) => {
  try { return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version; } catch { return null; }
};

export function buildManifest({ platform, signing, artifacts, env = process.env, now = new Date() }) {
  if (!platform) throw new Error('platform is required');
  if (!['debug', 'production'].includes(signing)) throw new Error('signing must be debug or production');
  if (!artifacts.length) throw new Error('at least one artifact is required');
  const rel = releaseInfo();
  const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  const sha = env.GITHUB_SHA || git('rev-parse', 'HEAD');
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('could not determine the source SHA');
  const runtime = typeof app.runtimeVersion === 'string' ? app.runtimeVersion : app.version;   // policy appVersion => app version
  return {
    product: rel.productName,
    publicVersion: rel.version,
    title: rel.title,
    sourceSha: sha,
    sourceRef: env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD'),
    platform,
    packageId: app.android?.package ?? null,
    appVersion: app.version,
    runtimeVersion: runtime,
    versionCode: Number(env.VERSION_CODE || env.GITHUB_RUN_NUMBER || app.android?.versionCode || 0) || null,
    buildConfiguration: { variant: 'release', signing },
    ci: env.GITHUB_RUN_ID ? { runId: env.GITHUB_RUN_ID, runNumber: env.GITHUB_RUN_NUMBER ?? null } : null,
    builtAt: now.toISOString(),
    toolchain: {
      node: process.version,
      expo: depVersion('expo'), reactNative: depVersion('react-native'), expoUpdates: depVersion('expo-updates'),
      webview: depVersion('react-native-webview'), typescript: depVersion('typescript'),
    },
    artifacts: artifacts.map((p) => ({ name: basename(p), bytes: readFileSync(p).length, sha256: createHash('sha256').update(readFileSync(p)).digest('hex') })),
  };
}

/** Failure strings: every manifest of one release must share the source SHA and public version. */
export function checkParity(manifests) {
  const fails = [];
  if (manifests.length < 1) return ['no manifests given'];
  const first = manifests[0];
  for (const m of manifests) {
    if (m.sourceSha !== first.sourceSha) fails.push(`${m.platform}: source ${String(m.sourceSha).slice(0, 7)} != ${first.platform} ${String(first.sourceSha).slice(0, 7)}`);
    if (m.publicVersion !== first.publicVersion) fails.push(`${m.platform}: public version ${m.publicVersion} != ${first.publicVersion}`);
    if (!Array.isArray(m.artifacts) || !m.artifacts.length) fails.push(`${m.platform}: no artifacts`);
  }
  return fails;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--check-parity') {
      const fails = checkParity(args.slice(1).map(f => JSON.parse(readFileSync(f, 'utf8'))));
      for (const f of fails) console.error(`::error::parity: ${f}`);
      if (fails.length) process.exit(1);
      console.log('parity OK: one source SHA for every platform');
    } else {
      const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
      const out = opt('--out');
      const consumed = new Set(['--platform', '--signing', '--out']);
      const files = args.filter((a, i) => !a.startsWith('--') && !consumed.has(args[i - 1]));
      for (const f of files) if (!existsSync(f)) throw new Error(`artifact not found: ${f}`);
      const m = buildManifest({ platform: opt('--platform'), signing: opt('--signing'), artifacts: files });
      writeFileSync(out, JSON.stringify(m, null, 2) + '\n');
      console.log(`release manifest ${out}: ${m.title} ${m.platform} @ ${m.sourceSha.slice(0, 7)} (${m.artifacts.length} artifact(s))`);
    }
  } catch (e) { console.error(`::error::${e.message}`); process.exit(1); }
}
