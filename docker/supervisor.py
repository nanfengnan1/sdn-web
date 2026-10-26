#!/usr/bin/env python3
"""Run the UI server and API Gateway as separate, jointly supervised processes."""
import signal
import subprocess
import sys
import time
import urllib.request

stopping = False


def stop_signal(_signal, _frame):
    global stopping
    stopping = True


def healthy():
    for port in (8080, 18080):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/healthz', timeout=1.5) as response:
                if response.status != 200:
                    return False
        except (OSError, ValueError):
            return False
    return True


def shutdown(child, sig=signal.SIGTERM, seconds=12):
    if child is None or child.poll() is not None:
        return
    child.send_signal(sig)
    try:
        child.wait(timeout=seconds)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=3)


def main(args):
    if args == ['--healthcheck']:
        return 0 if healthy() else 1
    # The bundle has a private, fixed HTTP upstream; other launch options pass
    # through without constructing shell commands or printing credentials.
    if any(arg.split('=', 1)[0] in ('-listen', '--listen', '-tls-cert', '--tls-cert', '-tls-key', '--tls-key') for arg in args):
        raise ValueError('bundled Gateway listens on local HTTP port 18080; configure external TLS in Nginx')
    if any(arg in ('-h', '--help', '-help') for arg in args):
        return subprocess.run(['/usr/local/bin/sdn-web-gateway', *args], check=False).returncode
    signal.signal(signal.SIGTERM, stop_signal)
    signal.signal(signal.SIGINT, stop_signal)
    nginx = gateway = None
    try:
        gateway = subprocess.Popen(['/usr/local/bin/sdn-web-gateway', '-listen', '127.0.0.1:18080', *args])
        nginx = subprocess.Popen(['nginx', '-g', 'daemon off;'])
        deadline = time.monotonic()+30
        while not stopping:
            for child, name in ((gateway, 'Gateway'), (nginx, 'Nginx')):
                if child.poll() is not None:
                    print(name+' exited; stopping bundled Web', file=sys.stderr, flush=True)
                    return 1
            if healthy():
                break
            if time.monotonic() >= deadline:
                print('bundled Web readiness timed out', file=sys.stderr, flush=True)
                return 1
            time.sleep(0.2)
        while not stopping:
            if gateway.poll() is not None or nginx.poll() is not None:
                print('bundled Web child exited', file=sys.stderr, flush=True)
                return 1
            time.sleep(0.2)
        return 0
    finally:
        # Let Nginx stop accepting connections; Gateway then drains existing RPCs.
        shutdown(nginx, signal.SIGQUIT, 12)
        shutdown(gateway, signal.SIGTERM, 12)


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print('bundled Web startup failed: '+type(error).__name__, file=sys.stderr)
        sys.exit(1)
