"""Unit tests for the APK release gate (scripts/inspect-apk.py). No SDK tools needed.

  python3 -m unittest discover -s scripts/tests
"""
import importlib.util
import os
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, '..', 'inspect-apk.py')
spec = importlib.util.spec_from_file_location('inspect_apk', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def elf64(p_align, loads=2, bits=2):
    """Minimal little-endian ELF with `loads` PT_LOAD program headers."""
    ehdr = bytearray(64)
    ehdr[:4] = b'\x7fELF'
    ehdr[4] = bits
    ehdr[5] = 1
    struct.pack_into('<Q', ehdr, 0x20, 64)           # e_phoff
    struct.pack_into('<HH', ehdr, 0x36, 56, loads)   # e_phentsize, e_phnum
    ph = b''
    for _ in range(loads):
        h = bytearray(56)
        struct.pack_into('<I', h, 0, 1)              # PT_LOAD
        struct.pack_into('<Q', h, 48, p_align)
        ph += bytes(h)
    return bytes(ehdr) + ph


def make_apk(libs):
    f = tempfile.NamedTemporaryFile(suffix='.apk', delete=False)
    f.close()
    with zipfile.ZipFile(f.name, 'w') as z:
        for name, data in libs.items():
            z.writestr(name, data)
    return f.name


def run(apk):
    return subprocess.run([sys.executable, SCRIPT, apk, '--selftest-skip-tools'], capture_output=True, text=True)


class ElfAlign(unittest.TestCase):
    def test_reads_p_align(self):
        self.assertEqual(mod.elf_load_aligns(elf64(16384)), [16384, 16384])
        self.assertEqual(mod.elf_load_aligns(elf64(4096)), [4096, 4096])

    def test_32_bit_and_garbage_are_exempt(self):
        self.assertIsNone(mod.elf_load_aligns(elf64(4096, bits=1)))
        self.assertIsNone(mod.elf_load_aligns(b'not an elf'))


class Cli(unittest.TestCase):
    def test_aligned_apk_passes(self):
        apk = make_apk({'lib/arm64-v8a/libok.so': elf64(16384), 'lib/armeabi-v7a/libold.so': elf64(4096, bits=1)})
        r = run(apk)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn('RESULT 16KB-ELF: COMPLIANT', r.stdout)

    def test_4k_library_fails_the_gate(self):
        apk = make_apk({'lib/arm64-v8a/libok.so': elf64(16384), 'lib/x86_64/libbad.so': elf64(4096)})
        r = run(apk)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn('NOT ALIGNED: lib/x86_64/libbad.so', r.stdout)
        self.assertIn('RESULT GATE: FAIL', r.stdout)


class Gate(unittest.TestCase):
    good = dict(misaligned=[], zipalign_ok=True, target_sdk=36, package='com.hotatticgames.snow',
                permissions={'android.permission.INTERNET'}, cert_sha256='ab' * 32, tools_missing=False)

    def f(self, **kw):
        return mod.evaluate({**self.good, **kw})

    def test_good(self):
        self.assertEqual(self.f(), [])

    def test_old_target_sdk(self):
        self.assertTrue(any('targetSdkVersion 35' in x for x in self.f(target_sdk=35)))

    def test_wrong_package(self):
        self.assertTrue(any('package id' in x for x in self.f(package='com.example.other')))

    def test_forbidden_permission(self):
        self.assertTrue(any('forbidden' in x for x in self.f(permissions={'android.permission.SYSTEM_ALERT_WINDOW'})))

    def test_zipalign_rejection(self):
        self.assertTrue(any('zipalign' in x for x in self.f(zipalign_ok=False)))

    def test_missing_tools_fail_closed(self):
        self.assertTrue(self.f(tools_missing=True, target_sdk=None, package=None, zipalign_ok=None))

    def test_debug_cert_allowed_only_when_asked(self):
        d = dict(cert_sha256=mod.DEBUG_CERT_SHA256)
        self.assertEqual(mod.evaluate({**self.good, **d}), [])
        self.assertTrue(any('debug certificate' in x for x in mod.evaluate({**self.good, **d}, allow_debug=False)))


if __name__ == '__main__':
    unittest.main()
