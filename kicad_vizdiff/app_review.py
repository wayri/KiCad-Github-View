"""Public repository metadata and check links for the GitHub-installed App."""
import re
from urllib.parse import quote, urlencode, urlsplit

from .github import api, public_commit, repository_name
from .git import VizError


def design_path(value):
    return (isinstance(value, str) and value.endswith(('.kicad_sch', '.kicad_pcb'))
            and not value.startswith('/') and not any(c in value for c in '\\\0\r\n')
            and all(p and p not in ('.', '..') for p in value.split('/')))


def public_repository(repo, token=None):
    repo = repository_name(repo)
    if api(f'/repos/{repo}', token).get('private', True):
        raise VizError('This App viewer currently supports public repositories only.')
    return repo


def pull_number(value):
    if not re.fullmatch(r'[1-9][0-9]{0,9}', str(value)):
        raise VizError('A positive pull request number is required.')
    return int(value)


def changed_designs(repo, number, token=None):
    files = []
    for page in range(1, 31):
        batch = api(f'/repos/{repo}/pulls/{number}/files?per_page=100&page={page}', token)
        if not isinstance(batch, list):
            raise VizError('Unexpected GitHub pull request file list.')
        for item in batch:
            path = item.get('filename')
            old = item.get('previous_filename', path)
            if design_path(path) and design_path(old) and path.rsplit('.', 1)[-1] == old.rsplit('.', 1)[-1]:
                files.append({'file': path, 'oldFile': old, 'status': item.get('status', 'modified')})
            else:
                if design_path(old):
                    files.append({'file': old, 'oldFile': old, 'status': 'removed'})
                if design_path(path):
                    files.append({'file': path, 'oldFile': path, 'status': 'added'})
        if len(batch) < 100:
            return files
    raise VizError('Pull request exceeds the 3,000-file API listing limit.')


def public_review(repo, number):
    repo = public_repository(repo)
    number = pull_number(number)
    pull = api(f'/repos/{repo}/pulls/{number}')
    head_repo = pull['head'].get('repo')
    if head_repo and head_repo.get('private', True):
        raise VizError('Private source branches are not supported.')
    # Use the merge base, matching GitHub's pull-request comparison semantics.
    comparison = api(f'/repos/{repo}/compare/{quote(pull["base"]["sha"], safe="")}...'
                     f'{quote(f"refs/pull/{number}/head", safe="")}')
    return {'repository': repo,
            'headRepository': repository_name(head_repo['full_name']) if head_repo else repo,
            'base': comparison['merge_base_commit']['sha'], 'head': pull['head']['sha'],
            'files': changed_designs(repo, number)}


def public_designs(repo, ref):
    repo = repository_name(repo)
    sha = public_commit(repo, ref)
    tree = api(f'/repos/{repo}/git/trees/{sha}?recursive=1')
    if tree.get('truncated'):
        raise VizError('Repository tree is too large to list completely. Open a specific file link.')
    files = sorted(item['path'] for item in tree.get('tree', [])
                   if item.get('type') == 'blob' and design_path(item.get('path')))
    return {'repository': repo, 'ref': sha, 'files': files}


def service_origin(value, local=False):
    if not isinstance(value, str) or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value):
        raise VizError('VIZDIFF_PUBLIC_URL must be an origin without whitespace or control characters.')
    parsed = urlsplit(value)
    if (parsed.scheme != 'https' and not (local and parsed.scheme == 'http'
            and parsed.hostname in ('127.0.0.1', 'localhost', '::1'))):
        raise VizError('VIZDIFF_PUBLIC_URL must be an HTTPS origin.')
    if not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise VizError('VIZDIFF_PUBLIC_URL must be an origin without credentials, path, or query.')
    return value.rstrip('/')


def check_payload(origin, repo, number, head_sha, designs):
    repo = repository_name(repo)
    number = pull_number(number)
    if not re.fullmatch(r'[0-9a-f]{40}', head_sha):
        raise VizError('A resolved head commit SHA is required.')
    review = origin + '/app/?' + urlencode({'repository': repo, 'pull': number})
    summary = (f'{len(designs)} KiCad design file(s) changed. '
               f'[Open interactive visual review]({review}). '
               'Schematic, PCB and SPIKE 3D rendering run in your browser. '
               'No browser extension or local KiCad installation is required.\n\n'
               'Inspect saved component properties, follow schematic sheets, and compare base/head revisions.')
    return {'name': 'KiCad visual review', 'head_sha': head_sha,
            'external_id': f'kicad-review:{repo}:{number}:{head_sha}',
            'status': 'completed', 'conclusion': 'neutral', 'details_url': review,
            'output': {'title': f'{len(designs)} KiCad designs ready to review', 'summary': summary}}
