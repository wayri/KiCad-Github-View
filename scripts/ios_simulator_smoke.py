"""Launch the unsigned app and retain a simulator startup screenshot on macOS."""
import argparse
import json
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


def command(*args, timeout=180):
    return subprocess.check_output(['xcrun', 'simctl', *args], timeout=timeout, text=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('dist/ios-simulator-startup.png'))
    args = parser.parse_args()
    runtimes = [r for r in json.loads(command('list', 'runtimes', '--json'))['runtimes']
                if r.get('isAvailable') and r['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-')]
    if not runtimes:
        raise SystemExit('No installed iOS simulator runtime; install one on the macOS builder.')
    runtime = max(runtimes, key=lambda r: tuple(int(p) for p in r['version'].split('.')))
    device = command('create', 'PocketKiViewPreview', 'com.apple.CoreSimulator.SimDeviceType.iPhone-16', runtime['identifier']).strip()
    try:
        command('boot', device)
        command('bootstatus', device, '-b', timeout=240)
        command('install', device, str(args.app.resolve()))
        print(command('launch', device, 'dev.kicadvizdiff.ios').strip(), flush=True)
        deadline = time.monotonic() + 30
        while True:
            try:
                with urlopen('http://127.0.0.1:49273/local-viewer.html', timeout=2) as response:
                    if response.status == 200 and b'Pocket KiView' in response.read():
                        break
            except (URLError, TimeoutError):
                if time.monotonic() >= deadline:
                    raise SystemExit('The native app did not start its loopback viewer.')
                time.sleep(.5)
        try:
            urlopen('http://127.0.0.1:49273/api/project', timeout=2)
            raise SystemExit('Project API unexpectedly allowed a request without a session.')
        except HTTPError as error:
            if error.code != 403:
                raise SystemExit(f'Unexpected unauthenticated API response: {error.code}')
        # Give WebKit its initial layout before retaining visual startup evidence.
        time.sleep(3)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        command('io', device, 'screenshot', str(args.output))
        print(f'Simulator loopback/API smoke passed; screenshot: {args.output}', flush=True)
    finally:
        subprocess.run(['xcrun', 'simctl', 'shutdown', device], check=False, timeout=30)
        subprocess.run(['xcrun', 'simctl', 'delete', device], check=False, timeout=30)


if __name__ == '__main__':
    main()
