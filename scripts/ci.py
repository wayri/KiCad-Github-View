"""Compatibility runner; repository-wide review is supplied by the installed tool."""
import os

from kicad_vizdiff.actions import changed, review
from kicad_vizdiff.git import VizError


if __name__ == '__main__':
    try:
        raise SystemExit(review(os.environ.get('BASE_SHA') or 'HEAD~1',
                               os.environ.get('HEAD_SHA') or 'HEAD',
                               merge_base=os.environ.get('REVIEW_MERGE_BASE') == 'true'))
    except (VizError, OSError, ValueError) as exc:
        raise SystemExit(f'KiCad visual review: {exc}') from exc
