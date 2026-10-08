"""Exact public asset inventory; configuration and secrets are never served."""

VIEWER_PAGES = ('index.html', 'styles.css', 'app.js', 'public-data.js',
                'revision.html', 'revision.js', 'setup.html', 'setup.css',
                'setup.js', 'README.md')
RENDERER_ASSETS = ('BRAND-ASSETS.md', 'ui-icons.js', 'file-compatibility.js', 'design-diff.js', 'owned-canvas.js', 'worksheet.js',
                   'schematic-renderer.js', 'pcb-renderer.js', 'step-decoder.js', 'step-worker.js')
VENDOR_ASSETS = ('spike-board3d.bundle.js', 'SPIKE-ENGINE-NOTICE.md',
                 'THREE-LICENSE', 'occt/occt-import-js.js', 'occt/occt-import-js.wasm',
                 'occt/license.occt-import-js.txt', 'occt/license.occt.txt', 'occt/NOTICE.md',
                 'occt/OCCT_LGPL_EXCEPTION.txt', 'occt/EMSCRIPTEN-LICENSE.txt')
PUBLIC_ASSETS = (frozenset(VIEWER_PAGES) | frozenset(RENDERER_ASSETS) |
                 frozenset('vendor/'+name for name in VENDOR_ASSETS))
