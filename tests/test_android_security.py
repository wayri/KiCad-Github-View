"""Run production Android boundary policy adversarial tests without a device."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AndroidBoundaryPolicyTests(unittest.TestCase):
    def test_production_origin_picker_admission_and_enterprise_guards(self):
        suffix = '.exe' if os.name == 'nt' else ''
        home = Path(os.environ.get('JAVA_HOME', '')) / 'bin'
        javac = str(home / ('javac' + suffix)) if (home / ('javac' + suffix)).is_file() else shutil.which('javac')
        java = str(home / ('java' + suffix)) if (home / ('java' + suffix)).is_file() else shutil.which('java')
        if not javac or not java:
            self.skipTest('Java 17+ is required for Android boundary policy regressions.')
        source = ROOT / 'android-app/app/src/main/java/dev/kicadvizdiff/android'
        with tempfile.TemporaryDirectory() as folder:
            subprocess.run([javac, '-d', folder, str(source / 'NativeBridgePolicy.java'),
                            str(source / 'NativeRequestGuard.java'),
                            str(source / 'EnterprisePolicy.java'),
                            str(ROOT / 'android-app/tests/NativeBoundarySecurityTest.java'),
                            str(ROOT / 'android-app/tests/EnterprisePolicyTest.java')],
                           check=True, capture_output=True, timeout=30)
            result = subprocess.run([java, '-cp', folder, 'dev.kicadvizdiff.android.NativeBoundarySecurityTest'],
                                    check=True, capture_output=True, text=True, timeout=30)
            self.assertRegex(result.stdout, r'Native bridge origin/path/admission: \d+ checks passed')
            subprocess.run([java, '-cp', folder, 'dev.kicadvizdiff.android.EnterprisePolicyTest'],
                           check=True, capture_output=True, text=True, timeout=30)
