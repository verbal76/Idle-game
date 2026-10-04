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
  if (typeof r.fileName !== 'string' || !/^[A-Za-z0-9-]+$/.test(r.fileName)) throw new Error('release.json: fileName must be [A-Za-z0-9-]+');
  if (!Number.isInteger(r.publicVersion) || r.publicVersion < 1) throw new Error('release.json: publicVersion must be a positive integer');
  const v = r.publicVersion;
  return {
    productName: r.productName,
    publicVersion: v,
    version: `v${v}`,
    title: `${r.productName} v${v}`,
    tag: `v${v}`,
    apk: `${r.fileName}-v${v}.apk`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = releaseInfo();
  if (process.argv.includes('--github')) {
    for (const k of ['title', 'tag', 'apk', 'version']) console.log(`${k}=${i[k]}`);
  } else {
    console.log(JSON.stringify(i, null, 2));
  }
}
