"""Exact public asset inventory; configuration and secrets are never served."""

VIEWER_PAGES = ('index.html', 'styles.css', 'app.js', 'public-data.js',
                'revision.html', 'revision.js', 'setup.html', 'setup.css',
                'setup.js', 'README.md')
RENDERER_ASSETS = ('file-compatibility.js', 'design-diff.js', 'owned-canvas.js', 'worksheet.js',
                   'schematic-renderer.js', 'pcb-renderer.js')
VENDOR_ASSETS = ('spike-board3d.bundle.js', 'SPIKE-ENGINE-NOTICE.md',
                 'THREE-LICENSE')
PUBLIC_ASSETS = (frozenset(VIEWER_PAGES) | frozenset(RENDERER_ASSETS) |
                 frozenset('vendor/'+name for name in VENDOR_ASSETS))
