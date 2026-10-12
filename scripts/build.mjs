// The one coordinated build interface (studio standard v2.0 section 5):
//
//   node scripts/build.mjs --platform android|windows|linux|all [--release] [--build-number N]
//                          [--source-sha SHA] [--out DIR] [--android-apk FILE] [--skip-tests] [--allow-dirty]
//
// windows / linux: builds the web bundle, hosts it in the Electron shell (desktop/), packages
//   "<Title> Build NN EXE.zip" / "<Title> Build NN Linux.tar.gz", then writes build-manifest.json
//   and checksums.sha256 and verifies them against the files.
// android: an APK needs the Android SDK and Gradle, which run on the hosted workflow
//   (eas-build.yml, explicitly authorized). Locally, pass --android-apk to package an APK that
//   the hosted build already produced; otherwise android is reported as NOT BUILT.
// all: refuses to report success unless all three platforms are present (never a partial release).
//
// Two kinds of build, never confusable:
//   RELEASE      (--release) the only kind that gets the standard file names. Fails closed unless the
//                owner-approved full 40-character --source-sha IS the checked-out HEAD, the working tree
//                is clean, --build-number equals release.json, tests ran (no --skip-tests / --allow-dirty),
//                the commit contains the authoritative baseline and is on the authoritative line
//                (scripts/verify-approved-source.mjs). Its manifest says qualification "release".
//   DEVELOPMENT  (default) for local checks and hardware trials. Any state is allowed, but the file names
//                carry "DEV", the manifest says qualification "development" with the dirty flag, and the
//                packaged app's build-info.json says the same. A development artifact is never a release
//                candidate for publication, even when built from a clean commit.
// Nothing here publishes anything.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseInfo } from './release-info.mjs';
import { verifyApprovedSource } from './verify-approved-source.mjs';
import { buildManifest, checksumLines, mergeManifests } from './make-release-manifest.mjs';

export const PAGE_BUDGET = 7_500_000;
const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
};
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

export function parseArgs(argv) {
  const o = { platform: undefined, buildNumber: undefined, sourceSha: undefined, out: 'build-out', androidApk: undefined, skipTests: false, allowDirty: false, release: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--platform') o.platform = argv[++i];
    else if (a === '--build-number') o.buildNumber = Number(argv[++i]);
    else if (a === '--source-sha') o.sourceSha = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--android-apk') o.androidApk = argv[++i];
    else if (a === '--skip-tests') o.skipTests = true;
    else if (a === '--allow-dirty') o.allowDirty = true;
    else if (a === '--release') o.release = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!['android', 'windows', 'linux', 'all'].includes(o.platform)) throw new Error('--platform must be android, windows, linux or all');
  return o;
}

/** Platforms a request expands to. */
export const expand = (p) => (p === 'all' ? ['android', 'windows', 'linux'] : [p]);

/** The standard artifact name for a release; a development artifact is marked DEV so it can't pass for one. */
export function artifactName(standard, qualification) {
  if (qualification === 'release') return standard;
  const m = standard.match(/^(.*?)([ -])(APK|EXE|Linux)(\.\w+(?:\.\w+)?)$/);
  return m ? `${m[1]}${m[2]}DEV${m[2]}${m[3]}${m[4]}` : standard.replace(/(\.[\w.]+)$/, ' DEV$1');
}

/**
 * Decides what kind of build this is and refuses anything the kind forbids. Pure apart from the
 * injected `deps` (git, release.json, the authoritative-line check), so every refusal is unit tested.
 */
export function verifySource(o, deps = {}) {
  const gitFn = deps.git ?? git;
  const rel = (deps.releaseInfo ?? releaseInfo)();
  const head = gitFn('rev-parse', 'HEAD');
  const dirty = gitFn('status', '--porcelain') !== '';
  if (o.sourceSha && o.sourceSha !== head) throw new Error(`HEAD ${head.slice(0, 7)} is not the approved source ${o.sourceSha.slice(0, 7)}`);
  if (o.buildNumber !== undefined && o.buildNumber !== rel.buildNumber) throw new Error(`--build-number ${o.buildNumber} does not match release.json (${rel.buildNumber}); edit release.json first`);
  if (!o.release) {
    if (dirty && !o.allowDirty) throw new Error('the working tree has uncommitted changes: commit them, or use --allow-dirty for a development build');
    return { head, dirty, rel, qualification: 'development', ontoAuthoritativeLine: null };
  }
  // ---- release: every gate, no exceptions ----
  if (o.allowDirty) throw new Error('--release refuses --allow-dirty: a release is built from a clean, committed tree');
  if (o.skipTests) throw new Error('--release refuses --skip-tests: the tests run on the exact release source');
  if (!/^[0-9a-f]{40}$/.test(o.sourceSha ?? '')) throw new Error('--release needs --source-sha: the owner-approved full 40-character commit SHA');
  if (o.buildNumber === undefined || Number.isNaN(o.buildNumber)) throw new Error('--release needs --build-number (it must equal release.json)');
  if (dirty) throw new Error('the working tree has uncommitted changes: a release is built from a clean, committed tree');
  const auth = (deps.authoritative ?? (() => JSON.parse(readFileSync('authoritative.json', 'utf8'))))();
  const v = (deps.verifyApprovedSource ?? verifyApprovedSource)({ approvedSha: o.sourceSha, baselineSha: auth.baselineSha, authoritativeLine: auth.authoritativeLine });
  if (!v.ok) throw new Error(`release source refused: ${v.reason}`);
  return { head, dirty: false, rel, qualification: 'release', ontoAuthoritativeLine: true };
}

function buildDesktop(platform, ctx, o) {
  const { rel, head } = ctx;
  const out = resolve(o.out);
  const stage = join(out, `stage-${platform}`);
  const pkgDir = join(out, 'pkg');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, 'game', 'music'), { recursive: true });
  const dpkg = JSON.parse(readFileSync('desktop/package.json', 'utf8'));
  const electronVersion = dpkg.devDependencies.electron;
  const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  copyFileSync('desktop/main.js', join(stage, 'main.js'));
  copyFileSync('desktop/paths.js', join(stage, 'paths.js'));
  copyFileSync('desktop/preload.js', join(stage, 'preload.js'));
  writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: 'wheres-the-bottom', productName: rel.fileName, version: app.version, main: 'main.js' }, null, 2));
  copyFileSync('dist/index.html', join(stage, 'game', 'index.html'));
  for (const f of readdirSync('src/assets/music')) if (f.endsWith('.mp3')) copyFileSync(join('src/assets/music', f), join(stage, 'game', 'music', f));
  writeFileSync(join(stage, 'build-info.json'), JSON.stringify({ title: rel.title, buildNumber: rel.buildNumber, platform, sourceSha: head, dirty: ctx.dirty, qualification: ctx.qualification }, null, 2));
  const target = platform === 'windows' ? 'win32' : 'linux';
  sh('node', ['desktop/node_modules/@electron/packager/bin/electron-packager.mjs', stage, rel.fileName, `--platform=${target}`, '--arch=x64', `--electron-version=${electronVersion}`, `--out=${pkgDir}`, '--overwrite', '--no-prune']);
  const folder = `${rel.fileName}-${target}-x64`;
  const name = artifactName(platform === 'windows' ? rel.exe : rel.linux, ctx.qualification);
  const file = join(out, name);
  rmSync(file, { force: true });
  if (platform === 'windows') sh('zip', ['-q', '-r', file, folder], { cwd: pkgDir });
  else sh('tar', ['-czf', file, '--owner=0', '--group=0', '-C', pkgDir, folder]);
  if (platform === 'linux') {
    const listing = execFileSync('tar', ['-tvzf', file], { encoding: 'utf8' });
    if (!new RegExp(`^-rwx\\S+.*${folder}/${rel.fileName}$`, 'm').test(listing)) throw new Error('the Linux executable is missing its execute permission in the archive');
  }
  return { platform, file, electronVersion };
}

function packageAndroid(ctx, o) {
  const { rel } = ctx;
  if (!o.androidApk) return null;
  if (!existsSync(o.androidApk)) throw new Error(`--android-apk not found: ${o.androidApk}`);
  const file = join(resolve(o.out), artifactName(rel.apk, ctx.qualification));
  copyFileSync(o.androidApk, file);
  return { platform: 'android', file };
}

export function run(o) {
  const ctx = verifySource(o);
  const platforms = expand(o.platform);
  const out = resolve(o.out);
  mkdirSync(out, { recursive: true });
  console.log(`build: ${ctx.rel.title} from ${ctx.head.slice(0, 7)} -> ${platforms.join(', ')}\n  qualification: ${ctx.qualification.toUpperCase()}${ctx.qualification === 'development' ? `${ctx.dirty ? ', DIRTY tree' : ', clean tree'}: NOT a release artifact (file names carry DEV)` : ': approved source, authoritative line, clean tree'}`);
  const desktop = platforms.filter(p => p !== 'android');
  const built = [];
  if (desktop.length) {
    if (!existsSync('desktop/node_modules/@electron/packager')) throw new Error('desktop dependencies are missing: run `npm ci --prefix desktop`');
    if (!o.skipTests) sh('npm', ['test']);
    sh('npm', ['run', 'web:build']);
    const size = statSync('dist/index.html').size;
    if (size > PAGE_BUDGET) throw new Error(`dist/index.html is ${size} bytes: over the ${PAGE_BUDGET} byte page budget`);
    // Tests and the web build must not have changed the source the artifact claims to come from.
    if (o.release && (git('status', '--porcelain') !== '' || git('rev-parse', 'HEAD') !== ctx.head)) throw new Error('the tree changed during the build: a release is built from exactly the approved commit');
    for (const p of desktop) built.push(buildDesktop(p, ctx, o));
  }
  if (platforms.includes('android')) {
    const a = packageAndroid(ctx, o);
    if (a) built.push(a);
    else if (o.platform === 'android' || o.platform === 'all') console.error('android: NOT BUILT. An APK needs the hosted workflow (eas-build.yml, owner-authorized); pass --android-apk <file> to package one.');
  }
  const missing = platforms.filter(p => !built.some(b => b.platform === p));
  if (missing.length) { console.error(`INCOMPLETE: missing ${missing.join(', ')}. Not a complete ${o.platform} build.`); return { ok: false, missing, built }; }
  // provenance: one manifest, one checksum file, verified against the packaged files
  const env = { ...process.env, SOURCE_SHA: ctx.head };
  const manifests = built.map(b => buildManifest({
    platform: b.platform, signing: b.platform === 'android' ? 'debug' : 'unsigned', artifacts: [b.file], env,
    ...(b.platform === 'android' ? {} : { runtime: `electron-${b.electronVersion}`, toolchain: { electron: b.electronVersion } }),
  }));
  const merged = mergeManifests(manifests);
  merged.dirty = ctx.dirty;
  merged.qualification = ctx.qualification;
  merged.releaseQualified = ctx.qualification === 'release';
  merged.onAuthoritativeLine = ctx.ontoAuthoritativeLine;
  writeFileSync(join(out, 'build-manifest.json'), JSON.stringify(merged, null, 2) + '\n');
  writeFileSync(join(out, 'checksums.sha256'), checksumLines(merged));
  for (const p of merged.platforms) for (const a of p.artifacts) {
    if (sha256(join(out, a.name)) !== a.sha256 || statSync(join(out, a.name)).size !== a.bytes) throw new Error(`manifest does not match ${a.name}`);
  }
  console.log(`build OK: ${merged.title}\n${merged.platforms.flatMap(p => p.artifacts.map(a => `  ${a.name}  ${a.sha256.slice(0, 12)}  ${a.bytes} B`)).join('\n')}`);
  return { ok: true, built, manifest: merged };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const r = run(parseArgs(process.argv.slice(2)));
    process.exit(r.ok ? 0 : 2);
  } catch (e) { console.error(`build: ${e.message}`); process.exit(1); }
}
