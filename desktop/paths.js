'use strict';
const path = require('node:path');

/** Absolute path inside gameDir for a request path, or null when it would escape gameDir. */
function resolveGameFile(gameDir, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath || '/'); } catch { return null; }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel.includes('\0')) return null;
  const file = path.normalize(path.join(gameDir, rel));
  return file.startsWith(gameDir + path.sep) ? file : null;
}

module.exports = { resolveGameFile };
