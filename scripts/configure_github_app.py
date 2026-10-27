"""Generate owner registration settings after an HTTPS service origin is chosen."""
import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from kicad_vizdiff.app_review import service_origin
from kicad_vizdiff.git import VizError


def generate(origin, owner, name, output):
    origin = service_origin(origin)
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}', owner):
        raise ValueError('Use a valid GitHub owner name.')
    if not name.strip() or len(name) > 100:
        raise ValueError('Use an App name between 1 and 100 characters.')
    template = json.loads((ROOT / '.github/app-manifest.example.json').read_text())
    template.update(name=name, url=origin, setup_url=origin+'/setup')
    template['hook_attributes']['url'] = origin+'/api/github/webhook'
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'app-manifest.json').write_text(json.dumps(template, indent=2)+'\n', encoding='utf-8')
    (output / 'deployment.env.example').write_text(
        f'# GitHub App owner: {owner}\nVIZDIFF_PUBLIC_URL={origin}\n'
        'GITHUB_APP_ID=REPLACE_WITH_REGISTERED_APP_ID\n'
        'GITHUB_APP_INSTALL_URL=https://github.com/apps/REPLACE_WITH_APP_SLUG/installations/new\n'
        'GITHUB_WEBHOOK_SECRET_FILE=REPLACE_WITH_WEBHOOK_SECRET_FILE_ON_DEPLOYMENT_HOST\n'
        'GITHUB_PRIVATE_KEY_FILE=REPLACE_WITH_PRIVATE_KEY_FILE_ON_DEPLOYMENT_HOST\n', encoding='utf-8')
    print(f'Register the App while signed in as {owner}: https://github.com/settings/apps/new')
    print(output / 'app-manifest.json')
    print(output / 'deployment.env.example')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--owner', default='wayri')
    parser.add_argument('--name', default='KiCad Visual Review')
    parser.add_argument('--output', default=str(ROOT / '.vizdiff/github-app-registration'))
    args = parser.parse_args()
    try:
        generate(args.origin, args.owner, args.name, args.output)
    except (ValueError, VizError) as exc:
        parser.error(str(exc))


if __name__ == '__main__':
    main()
