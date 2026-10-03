// Dynamic layer over app.json (which stays the source of truth).
//
// When the OTA workflow publishes, it sets OTA_* env vars; they are
// stamped into this update's manifest as extra.ota so the in-game
// Build / Update Info can show which commit and OTA is running
// (Updates.manifest.extra.expoClient.extra.ota). Without those vars
// (local runs, APK builds) the config is exactly app.json.
//
// Only `extra` changes: version, runtimeVersion, channel and native
// settings are untouched, so this never affects OTA compatibility.

module.exports = ({ config }) => {
  const env = process.env;
  const pick = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  const commit = pick(env.OTA_COMMIT);
  if (!commit) return config;
  const ota = { commit };
  for (const [key, name] of [['label', 'OTA_LABEL'], ['message', 'OTA_MESSAGE'], ['run', 'OTA_RUN'], ['branch', 'OTA_BRANCH']]) {
    const v = pick(env[name]);
    if (v) ota[key] = v;
  }
  return { ...config, extra: { ...(config.extra ?? {}), ota } };
};
