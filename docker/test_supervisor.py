"""Process lifecycle regressions; no Docker or real services are changed."""
import importlib.util
from pathlib import Path
import signal
import subprocess
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('bundled_web', Path(__file__).with_name('supervisor.py'))
web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(web)


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        web.stopping = False

    def child(self):
        child = Mock()
        child.poll.return_value = None
        return child

    def test_gateway_crash_stops_nginx_and_returns_failure(self):
        gateway, nginx = self.child(), self.child()
        gateway.poll.return_value = 2
        with patch.object(web.signal, 'signal'), patch.object(web.subprocess, 'Popen', side_effect=[gateway, nginx]):
            self.assertEqual(web.main(['-insecure']), 1)
        nginx.send_signal.assert_called_once_with(signal.SIGQUIT)
        nginx.wait.assert_called_once()

    def test_nginx_start_failure_stops_started_gateway(self):
        gateway = self.child()
        with patch.object(web.signal, 'signal'), patch.object(web.subprocess, 'Popen', side_effect=[gateway, OSError('nginx failed')]):
            with self.assertRaises(OSError):
                web.main(['-insecure'])
        gateway.send_signal.assert_called_once_with(signal.SIGTERM)

    def test_termination_drains_both_processes(self):
        gateway, nginx = self.child(), self.child()
        def stop(_delay):
            web.stop_signal(signal.SIGTERM, None)
        with patch.object(web.signal, 'signal'), patch.object(web.subprocess, 'Popen', side_effect=[gateway, nginx]), patch.object(web, 'healthy', return_value=True), patch.object(web.time, 'sleep', side_effect=stop):
            self.assertEqual(web.main(['-insecure']), 0)
        nginx.send_signal.assert_called_once_with(signal.SIGQUIT)
        gateway.send_signal.assert_called_once_with(signal.SIGTERM)

    def test_stuck_child_is_killed_after_timeout(self):
        child = self.child()
        child.wait.side_effect = [subprocess.TimeoutExpired('child', 12), 0]
        web.shutdown(child)
        child.kill.assert_called_once()

    def test_healthcheck_does_not_spawn_services(self):
        with patch.object(web.subprocess, 'Popen') as spawn, patch.object(web, 'healthy', return_value=False):
            self.assertEqual(web.main(['--healthcheck']), 1)
        spawn.assert_not_called()

    def test_reject_upstream_address_overrides_before_start(self):
        for option in ('-listen', '--listen=:99', '-tls-cert=x', '--tls-key'):
            with self.subTest(option=option), patch.object(web.subprocess, 'Popen') as spawn:
                with self.assertRaises(ValueError):
                    web.main([option])
                spawn.assert_not_called()


if __name__ == '__main__':
    unittest.main()
