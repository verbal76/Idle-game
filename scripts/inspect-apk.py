#!/usr/bin/env python3
"""Evidence about a built APK, printed for the workflow log and a report file.

  python3 scripts/inspect-apk.py <apk> [merged-manifest.xml]

Prints: SHA-256, package / versionName / versionCode / SDK levels (aapt2),
every requested permission, the signing certificate subject and SHA-256
(public data only), the native ABIs, and the Google Play 16 KB page-size
checks: every PT_LOAD segment of every 64-bit .so must be aligned to at least
16384 bytes, and (build-tools 35+) `zipalign -P 16` must accept the APK.

It is also the release GATE (exit 1 on any failure, so CI blocks the artifact):
  - a 64-bit library is not 16 KB aligned, or zipalign -P 16 rejects the APK;
  - targetSdkVersion is below REQUIRED_TARGET_SDK (default 36, Google Play);
  - the package id is not EXPECTED_PACKAGE (default com.hotatticgames.snow);
  - a forbidden permission is present (blocked in app.json);
  - the SDK tools needed to prove the above are missing (fail closed).
Set ALLOW_DEBUG_SIGNING=0 to also fail when the APK carries the public Expo /
Android debug certificate (used by the production workflow).
`--selftest-skip-tools` is for unit tests only (no aapt2/zipalign on the box).
"""
import glob
import hashlib
import os
import re
import struct
import subprocess
import sys
import zipfile

PAGE_16K = 16384
DEBUG_CERT_SHA256 = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'
FORBIDDEN_PERMISSIONS = (
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.SYSTEM_ALERT_WINDOW',
)


def evaluate(facts, required_target=36, expected_package='com.hotatticgames.snow', allow_debug=True):
    """Pure gate: facts -> list of failure strings (empty = pass).

    facts keys: misaligned (list), zipalign_ok (True/False/None), target_sdk (int|None),
    package (str|None), permissions (set), cert_sha256 (str|None), tools_missing (bool).
    """
    fails = []
    if facts.get('misaligned'):
        fails.append(f"{len(facts['misaligned'])} 64-bit native libraries are not 16 KB aligned (first: {facts['misaligned'][0]})")
    if facts.get('zipalign_ok') is False:
        fails.append('zipalign -P 16 rejects the APK')
    if facts.get('skip_tools'):
        pass                                  # unit tests only
    elif facts.get('tools_missing'):
        fails.append('aapt2/zipalign not found: cannot prove target SDK, package id or 16 KB zip alignment')
    else:
        t = facts.get('target_sdk')
        if t is None:
            fails.append('target SDK could not be read')
        elif t < required_target:
            fails.append(f'targetSdkVersion {t} < required {required_target}')
        if facts.get('package') != expected_package:
            fails.append(f"package id {facts.get('package')!r} != {expected_package!r}")
        if facts.get('zipalign_ok') is None:
            fails.append('zipalign result unavailable')
    bad_perms = sorted(set(facts.get('permissions') or ()) & set(FORBIDDEN_PERMISSIONS))
    if bad_perms:
        fails.append('forbidden permissions present: ' + ', '.join(bad_perms))
    if not allow_debug and facts.get('cert_sha256') == DEBUG_CERT_SHA256:
        fails.append('APK is signed with the public debug certificate (production build required)')
    return fails


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()


def build_tools():
    root = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or '/usr/local/lib/android/sdk'
    dirs = sorted(glob.glob(os.path.join(root, 'build-tools', '*')), key=lambda d: [int(x) if x.isdigit() else 0 for x in re.split(r'[.-]', os.path.basename(d))])
    return dirs[-1] if dirs else None


def elf_load_aligns(data):
    """p_align of every PT_LOAD in an ELF (64-bit little-endian only), or None."""
    if data[:4] != b'\x7fELF' or data[4] != 2 or data[5] != 1:
        return None
    e_phoff, = struct.unpack_from('<Q', data, 0x20)
    e_phentsize, e_phnum = struct.unpack_from('<HH', data, 0x36)
    out = []
    for i in range(e_phnum):
        off = e_phoff + i * e_phentsize
        p_type, = struct.unpack_from('<I', data, off)
        if p_type == 1:
            p_align, = struct.unpack_from('<Q', data, off + 48)
            out.append(p_align)
    return out


def main():
    skip_tools = '--selftest-skip-tools' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    apk = args[0]
    manifest = args[1] if len(args) > 1 else None
    bt = None if skip_tools else build_tools()
    facts = {'misaligned': [], 'zipalign_ok': None, 'target_sdk': None, 'package': None,
             'permissions': set(), 'cert_sha256': None, 'tools_missing': bt is None and not skip_tools, 'skip_tools': skip_tools}
    print('== APK')
    print('file:', os.path.basename(apk), os.path.getsize(apk), 'bytes')
    print('sha256:', hashlib.sha256(open(apk, 'rb').read()).hexdigest())
    print('build-tools:', bt)
    if bt:
        badging = sh([os.path.join(bt, 'aapt2'), 'dump', 'badging', apk])
        for line in badging.splitlines():
            m = re.match(r"^package: name='([^']+)'", line)
            if m: facts['package'] = m.group(1)
            m = re.match(r"^targetSdkVersion:'(\d+)'", line)
            if m: facts['target_sdk'] = int(m.group(1))
            if re.match(r"^(package:|sdkVersion|minSdkVersion|targetSdkVersion|compileSdkVersion|native-code|application-label:|uses-permission)", line):
                print(line)
        print('== effective permissions (aapt2)')
        perms = sh([os.path.join(bt, 'aapt2'), 'dump', 'permissions', apk])
        print(perms)
        facts['permissions'] |= set(re.findall(r"uses-permission(?:-sdk-23)?: name='([^']+)'", perms))
        print('== signing (public data only)')
        signer = sh([os.path.join(bt, 'apksigner'), 'verify', '--print-certs', '-v', apk]).splitlines()
        shown = [l for l in signer if re.search(r'Signer|^Verifies|scheme', l)]
        for l in signer:
            m = re.search(r'certificate SHA-256 digest: ([0-9a-f]{64})', l)
            if m and facts['cert_sha256'] is None: facts['cert_sha256'] = m.group(1)
        print('\n'.join(shown) if shown else '(apksigner gave no certificate lines) ' + ' | '.join(signer[:3]))
    if manifest and os.path.exists(manifest):
        print('== merged manifest permissions / flags')
        text = open(manifest, encoding='utf-8').read()
        for m in sorted(set(re.findall(r'<uses-permission[^>]*android:name="([^"]+)"', text))):
            print('permission:', m)
            facts['permissions'].add(m)
        for k in ('allowBackup', 'usesCleartextTraffic', 'extractNativeLibs', 'largeHeap', 'requestLegacyExternalStorage', 'screenOrientation', 'resizeableActivity'):
            for m in re.finditer(r'android:%s="([^"]+)"' % k, text):
                print(f'{k}:', m.group(1))
    print('== native libraries / 16 KB page size')
    bad = []
    with zipfile.ZipFile(apk) as z:
        libs = [i for i in z.infolist() if re.match(r'lib/[^/]+/.+\.so$', i.filename)]
        abis = sorted({i.filename.split('/')[1] for i in libs})
        print('abis:', ', '.join(abis) or '(none)')
        for i in libs:
            abi = i.filename.split('/')[1]
            aligns = elf_load_aligns(z.read(i))
            if aligns is None:
                continue                      # 32-bit ABIs are exempt from the 16 KB rule
            worst = min(aligns) if aligns else 0
            ok = worst >= PAGE_16K
            if not ok:
                bad.append(f'{i.filename} p_align={worst}')
                facts['misaligned'].append(f'{i.filename} p_align={worst}')
        n64 = sum(1 for i in libs if elf_load_aligns(z.read(i)) is not None)
        print(f'64-bit libraries checked: {n64}; not 16 KB aligned: {len(bad)}')
        for b in bad[:40]:
            print('  NOT ALIGNED:', b)
    if bt:
        za = os.path.join(bt, 'zipalign')
        r = subprocess.run([za, '-c', '-P', '16', '4', apk], capture_output=True, text=True)
        facts['zipalign_ok'] = r.returncode == 0
        print('zipalign -P 16 check:', 'PASS' if facts['zipalign_ok'] else 'FAIL ' + (r.stdout + r.stderr).strip()[-200:])
    print('RESULT 16KB-ELF:', 'COMPLIANT' if not bad else 'NONCOMPLIANT')
    fails = evaluate(facts,
                     required_target=int(os.environ.get('REQUIRED_TARGET_SDK', '36')),
                     expected_package=os.environ.get('EXPECTED_PACKAGE', 'com.hotatticgames.snow'),
                     allow_debug=os.environ.get('ALLOW_DEBUG_SIGNING', '1') != '0')
    print('== GATE')
    for f in fails:
        print('GATE FAIL:', f)
    print('RESULT GATE:', 'PASS' if not fails else 'FAIL')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
