#!/usr/bin/env python3
"""Evidence about a built APK, printed for the workflow log and a report file.

  python3 scripts/inspect-apk.py <apk> [merged-manifest.xml]

Prints: SHA-256, package / versionName / versionCode / SDK levels (aapt2),
every requested permission, the signing certificate subject and SHA-256
(public data only), the native ABIs, and the Google Play 16 KB page-size
checks: every PT_LOAD segment of every 64-bit .so must be aligned to at least
16384 bytes, and (build-tools 35+) `zipalign -P 16` must accept the APK.
Exits 1 when a 64-bit library is not 16 KB aligned, so a regression fails CI.
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
    apk = sys.argv[1]
    manifest = sys.argv[2] if len(sys.argv) > 2 else None
    bt = build_tools()
    print('== APK')
    print('file:', os.path.basename(apk), os.path.getsize(apk), 'bytes')
    print('sha256:', hashlib.sha256(open(apk, 'rb').read()).hexdigest())
    print('build-tools:', bt)
    if bt:
        badging = sh([os.path.join(bt, 'aapt2'), 'dump', 'badging', apk])
        for line in badging.splitlines():
            if re.match(r"^(package:|sdkVersion|minSdkVersion|targetSdkVersion|compileSdkVersion|native-code|application-label:|uses-permission)", line):
                print(line)
        print('== effective permissions (aapt2)')
        print(sh([os.path.join(bt, 'aapt2'), 'dump', 'permissions', apk]))
        print('== signing (public data only)')
        signer = sh([os.path.join(bt, 'apksigner'), 'verify', '--print-certs', '-v', apk]).splitlines()
        shown = [l for l in signer if re.search(r'Signer #1 certificate (DN|SHA-256 digest)|^Verifies|v[0-9.]+ scheme', l)]
        print('\n'.join(shown) if shown else '(apksigner gave no certificate lines) ' + ' | '.join(signer[:3]))
    if manifest and os.path.exists(manifest):
        print('== merged manifest permissions / flags')
        text = open(manifest, encoding='utf-8').read()
        for m in sorted(set(re.findall(r'<uses-permission[^>]*android:name="([^"]+)"', text))):
            print('permission:', m)
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
        n64 = sum(1 for i in libs if elf_load_aligns(z.read(i)) is not None)
        print(f'64-bit libraries checked: {n64}; not 16 KB aligned: {len(bad)}')
        for b in bad[:40]:
            print('  NOT ALIGNED:', b)
    if bt:
        za = os.path.join(bt, 'zipalign')
        out = sh([za, '-c', '-P', '16', '4', apk])
        print('zipalign -P 16 check:', 'PASS' if 'Verification successful' in out or out == '' else out.splitlines()[-1] if out else 'n/a')
    print('RESULT 16KB-ELF:', 'COMPLIANT' if not bad else 'NONCOMPLIANT')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
