"""Exercise the real deploy script with fake Git/Docker; never touch a server."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parent
OLD = 'a' * 40
NEW = 'b' * 40


@unittest.skipUnless(shutil.which('bash') and os.name != 'nt', 'requires a POSIX shell (runs in CI)')
class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        project = self.root / 'project'
        (project / 'scripts').mkdir(parents=True)
        (project / '.env').write_text('not-a-real-secret')
        (project / 'version.js').write_text("self.IPMAX_VERSION = '15.5.0';\n")
        self.env = dict(os.environ, TEST_ROOT=str(self.root), TEST_MODE='success')
        script = (SOURCE / 'deploy-production.sh').read_text()
        script = script.replace('project=/home/ipmax/interview-prep-max', 'project="$TEST_ROOT/project"')
        script = script.replace('backup_root=/home/ipmax/backups', 'backup_root="$TEST_ROOT/backups"')
        script = script.replace('export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'export PATH="$TEST_ROOT/bin:/usr/bin:/bin"')
        script = script.replace('/home/ipmax/bin/', str(self.root / 'bin') + '/')
        self.script = self.root / 'deploy.sh'
        self.script.write_text(script)
        (project / 'scripts/deploy-production.sh').write_text(script)
        self.mock('git', '''
echo "git $*" >> "$TEST_ROOT/log"
case "$1 $2" in
  'status --porcelain') [ "$TEST_MODE" != dirty ] || echo M-file ;;
  'rev-parse origin/main') if [ "$TEST_MODE" = stale ]; then printf '%040d\\n' 0; else echo bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; fi ;;
  'rev-parse HEAD') echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
esac
''')
        self.mock('docker', '''
echo "docker $*" >> "$TEST_ROOT/log"
case "$1" in
  inspect) echo sha256:old-image ;;
  image) echo sha256:old-task ;;
  cp) mkdir -p "${@: -1}"; echo '{}' > "${@: -1}/snapshot.json" ;;
  build) [ "$TEST_MODE" != build-failure ] || exit 23 ;;
  exec) [ "$TEST_MODE" != smoke-failure ] || exit 24 ;;
  compose)
    if [ "$TEST_MODE" = health-failure ] && [ ! -f "$TEST_ROOT/failed" ]; then touch "$TEST_ROOT/failed"; exit 25; fi ;;
esac
''')
        self.mock('sleep', 'exit 0')

    def mock(self, name, body):
        file = self.bin / name
        file.write_text('#!/usr/bin/env bash\nset -e\n' + body + '\nexit 0\n')
        file.chmod(0o700)

    def run_deploy(self, mode='success', sha=NEW):
        self.env['TEST_MODE'] = mode
        result = subprocess.run(['bash', str(self.script), sha], env=self.env, text=True, capture_output=True)
        log = self.root / 'log'
        return result, log.read_text() if log.exists() else ''

    def test_success_backups_before_switch_and_installs_next_script(self):
        result, log = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(log.index('docker cp'), log.index('git checkout'))
        self.assertLess(log.index('docker build'), log.index('docker compose up'))
        self.assertTrue((self.root / 'backups/last-deployment').exists())
        self.assertTrue((self.bin / 'deploy-production.sh').exists())
        self.assertNotIn('rollback health check failed', result.stderr)

    def test_rejects_shell_input_and_stale_or_dirty_targets(self):
        for mode, sha in [('success', NEW+';id'), ('stale', NEW), ('dirty', NEW)]:
            with self.subTest(mode=mode):
                result, log = self.run_deploy(mode, sha)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('docker compose up', log)
                self.assertNotIn('git checkout', log)

    def test_accepts_version_file_with_windows_line_endings(self):
        (self.root / 'project/version.js').write_bytes(b"self.IPMAX_VERSION = '15.5.0';\r\n")
        result, _ = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_build_failure_restores_checkout_without_restarting_live_containers(self):
        result, log = self.run_deploy('build-failure')
        self.assertEqual(result.returncode, 23, result.stderr)
        self.assertIn('git checkout --detach '+OLD, log)
        self.assertNotIn('docker compose up', log)

    def test_failed_health_or_public_smoke_rolls_back_without_overwriting_data(self):
        for mode in ['health-failure', 'smoke-failure']:
            with self.subTest(mode=mode):
                result, log = self.run_deploy(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('git checkout --detach '+OLD, log)
                self.assertGreaterEqual(log.count('docker compose up'), 2)
                self.assertNotIn(' down ', log)
                self.assertNotIn('volume rm', log)
                # The only copy is from the live container to the backup.
                self.assertTrue(all(':/data/.' in line for line in log.splitlines() if line.startswith('docker cp ')))

    def test_forced_command_rejects_interactive_shell_and_extra_commands(self):
        for command in ['', 'id', 'deploy '+NEW+'; id', 'deploy '+NEW+' extra', 'deploy '+NEW+'\nwhoami']:
            result = subprocess.run(['bash', str(SOURCE / 'deploy-from-ci.sh')], env=dict(self.env, SSH_ORIGINAL_COMMAND=command), capture_output=True)
            self.assertEqual(result.returncode, 2, command)


if __name__ == '__main__':
    unittest.main()
