// Single source of the public release name. Reads release.json (the ONE place
// the public version number is edited) and prints the derived names, so the
// release title, tag, APK filename and in-game diagnostics can never disagree.
//
//   node scripts/release-info.mjs            human-readable summary
//   node scripts/release-info.mjs --github   KEY=value lines for $GITHUB_OUTPUT
//
// Convention: "<Product Name> v<number>", sequential integers. See docs/release-naming.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function releaseInfo(path = 'release.json') {
  const r = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof r.productName !== 'string' || !r.productName.trim()) throw new Error('release.json: productName missing');
  if (typeof r.fileName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(r.fileName)) throw new Error('release.json: fileName must be letters, digits, spaces and hyphens');
  if (!Number.isInteger(r.publicVersion) || r.publicVersion < 1) throw new Error('release.json: publicVersion must be a positive integer');
  const style = r.namingStyle ?? 'build';
  if (!['build', 'v'].includes(style)) throw new Error('release.json: namingStyle must be "build" or "v"');
  const n = r.publicVersion;
  // Studio standard v2.0: "<Game Title> Build NN", files "<Title> Build NN APK.apk / EXE.zip / Linux.tar.gz",
  // tag build-NN. namingStyle "v" keeps the earlier "<Title> vNN" convention (one switch, same number).
  const version = style === 'build' ? `Build ${n}` : `v${n}`;
  const stem = style === 'build' ? `${r.fileName} Build ${n}` : `${r.fileName.replace(/ /g, '-')}-v${n}`;
  const sep = style === 'build' ? ' ' : '-';
  return {
    productName: r.productName,
    fileName: r.fileName,
    publicVersion: n,
    buildNumber: n,
    namingStyle: style,
    version,
    title: `${r.productName} ${version}`,
    tag: style === 'build' ? `build-${n}` : `v${n}`,
    apk: `${stem}${style === 'build' ? ' APK.apk' : '.apk'}`,
    exe: `${stem}${style === 'build' ? ' EXE.zip' : '-EXE.zip'}`,
    linux: `${stem}${style === 'build' ? ' Linux.tar.gz' : '-Linux.tar.gz'}`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = releaseInfo();
  if (process.argv.includes('--github')) {
    for (const k of ['title', 'tag', 'apk', 'exe', 'linux', 'version']) console.log(`${k}=${i[k]}`);
  } else {
    console.log(JSON.stringify(i, null, 2));
  }
}
