import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Guards the facts a native-stack migration must never change silently:
// the app's identity, where saves live, and what Google Play / OTA depend on.
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const shell = readFileSync('App.tsx', 'utf8');

describe('app identity and migration invariants', () => {
  it('keeps the package id (a different id is a different app: no update, no saves)', () => {
    expect(app.android.package).toBe('com.hotatticgames.snow');
  });

  it('keeps the WebView storage origin https://localhost (IndexedDB saves live there)', () => {
    expect(shell).toMatch(/baseUrl: `https:\/\/localhost\//);
  });

  it('targets API 36 and compiles against it (Google Play)', () => {
    const bp = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties')[1].android;
    expect(bp.targetSdkVersion).toBeGreaterThanOrEqual(36);
    expect(bp.compileSdkVersion).toBeGreaterThanOrEqual(36);
  });

  it('blocks the legacy storage / overlay permissions the template would otherwise merge in', () => {
    expect(app.android.blockedPermissions).toEqual(expect.arrayContaining([
      'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.SYSTEM_ALERT_WINDOW',
    ]));
  });

  it('pins the OTA channel and ties the runtime version to the app version', () => {
    expect(app.updates.requestHeaders['expo-channel-name']).toBe('preview');
    expect(app.runtimeVersion).toEqual({ policy: 'appVersion' });
  });

  it('is on a migration runtime (>= 0.1.0) so it can never receive a runtime-0.0.1 OTA', () => {
    const [maj, min] = String(app.version).split('.').map(Number);
    expect(maj > 0 || min >= 1).toBe(true);
  });
});
