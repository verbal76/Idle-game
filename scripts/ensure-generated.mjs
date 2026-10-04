// src/__generated__ is build output (git-ignored): build-info.ts comes from
// scripts/write-build-info.mjs and html-bundle.ts from scripts/embed-html.mjs
// (both run by `npm run web:build`). On a fresh clone neither exists yet, but
// tsc, vitest and vite all import them, so this writes harmless PLACEHOLDERS
// for whichever is missing. A placeholder bundle is never publishable: the
// OTA workflow refuses a build that still contains the __PLACEHOLDER__ marker.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const DIR = 'src/__generated__';
mkdirSync(DIR, { recursive: true });

const files = {
  'build-info.ts':
    `// PLACEHOLDER written by scripts/ensure-generated.mjs; replaced by \`npm run web:build\`.\n` +
    `export interface BuildInfo {\n  productName: string;\n  publicVersion: number;\n  branch: string;\n  commit: string;\n  commitShort: string;\n  dirty: boolean;\n  builtAt: string;\n  appVersion: string;\n  androidVersionCode: number | null;\n  appName: string;\n  packageId: string;\n  minSdk: number | null;\n  compileSdk: number | null;\n  targetSdk: number | null;\n}\n` +
    `export const BUILD_INFO: BuildInfo = {\n  productName: 'unknown', publicVersion: 0,\n  branch: 'unknown', commit: 'unknown', commitShort: 'unknown', dirty: false,\n  builtAt: '1970-01-01T00:00:00.000Z', appVersion: 'unknown', androidVersionCode: null,\n  appName: 'unknown', packageId: 'unknown', minSdk: null, compileSdk: null, targetSdk: null,\n};\n`,
  'html-bundle.ts':
    `// PLACEHOLDER written by scripts/ensure-generated.mjs; replaced by \`npm run web:build\`.\n` +
    `export const HTML_BUNDLE = '__PLACEHOLDER__';\n`,
};
for (const [name, body] of Object.entries(files)) {
  const path = `${DIR}/${name}`;
  if (!existsSync(path)) { writeFileSync(path, body); console.log(`ensure-generated: wrote placeholder ${path}`); }
}
