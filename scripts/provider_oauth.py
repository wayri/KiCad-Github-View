"""Publisher-owned public OAuth configuration; never accepts a client secret."""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit


def payload(root: Path) -> bytes:
    source = root / 'extension/provider-oauth.json'
    raw = source.read_bytes()
    if len(raw) > 16384:
        raise ValueError('Publisher OAuth configuration exceeds 16 KiB.')
    value = json.loads(raw)
    if not isinstance(value, dict) or set(value) != {'version', 'gitlab'} or type(value['version']) is not int or value['version'] != 1 or not isinstance(value['gitlab'], dict) or len(value['gitlab']) > 32:
        raise ValueError('Invalid publisher OAuth configuration.')
    client = os.environ.get('POCKET_KIVI_GITLAB_CLIENT_ID', '').strip()
    if client:
        value['gitlab']['https://gitlab.com'] = {'clientId': client}
    for host, entry in value['gitlab'].items():
        url = urlsplit(host)
        if len(host) > 300 or url.scheme != 'https' or not url.hostname or url.hostname.endswith('.') or url.port in (0, 443) or url.username or url.password or url.path or url.query or url.fragment or host != 'https://' + url.netloc.lower():
            raise ValueError('Publisher OAuth configuration requires exact HTTPS origins.')
        if not isinstance(entry, dict) or set(entry) != {'clientId'} or not isinstance(entry['clientId'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{10,200}', entry['clientId']):
            raise ValueError('Only public OAuth application IDs belong in publisher configuration.')
    if not client:
        return raw
    result = (json.dumps(value, indent=2) + '\n').encode('utf-8')
    if len(result) > 16384:
        raise ValueError('Publisher OAuth configuration exceeds 16 KiB.')
    return result
