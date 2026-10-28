# Pocket KiView local browser workspace

Open saved schematics and PCBs in a browser alongside KiCad, or independently.
The viewer requires no KiCad installation and no internet connection. Its parsers,
2D/3D engines, model converters and supporting viewer assets are bundled. The
optional loopback launcher requires Python 3.10+ (standard library only); the
extension file/folder picker requires neither Python nor KiCad. The interface is
read-only for design sources, with file/folder picking, drag-and-drop, independent
parallel panes and component/net cross-probing between panes. The same source
renderers, measurements, board analytics, BoM/assembly, testpoint, model and
portable-review tools are used by the app and extension.

## Browser extension

Open extension Options → **Open local KiCad workspace**. Choose **Open files**,
**Open folder**, or drop files/a folder onto the workspace or a drawing pane.
Folder selection preserves relative paths and includes subsheets/models. Browser
directory-drop support varies; use Open folder if dropping a directory is not
supported. Files are read into memory and are not uploaded to a Git host.

The left file browser preserves physical folders, including nested documentation
and other filenames. Use **Expand**, **Collapse**, or each folder's disclosure arrow;
search temporarily expands matching paths without changing your collapsed folders.
Large lists offer **Show more** rather than hiding files after the first 200.
Unsupported files are listed with a “no preview available” tooltip. Their contents
are not read or executed. Models remain listed as assets for the board's 3D viewer.
The loopback launcher keeps its existing hidden-directory and link exclusions and
caps filename inventory at 10,000 entries; browser selection retains its 2,000-file
import limit. Only explicitly selected folders/files enter the browser workspace.

Use **Parallel views** and the two selectors to show a schematic beside its PCB
or another saved drawing. Selection cross-probing follows the existing saved
identity/net matching rules; ambiguous matches require review. Pane cameras are
independent. **Project** opens the shared project tree and setup interface.

## KiCad legacy PCB action

Build or download `pocket-kiview-local-preview-<version>.zip`. Extract its
`pocket_kiview` directory, intact, into the scripting/plugins directory used by
your KiCad installation. Reload plugins/restart the PCB editor. In PCB Editor,
choose Tools → External Plugins → **Pocket KiView browser workspace**.

The action reads the filename of the saved PCB and opens that file's parent
project folder in the default browser. It does not save the board, change the
layout or read unsaved edits. This is a legacy Python PCB ActionPlugin; schematic
editor menu integration and the newer IPC plugin interface are not included.
Open a schematic directly with the command below or the browser's file picker.
Legacy-plugin availability depends on your KiCad build. Native plugin menu launch
still needs an interactive installed-KiCad check.

## Standalone command

From a source checkout:

```powershell
python -m kicad_vizdiff.local_viewer --project "C:/designs/my-project"
```

From the extracted bundle, run in its `pocket_kiview` directory:

```powershell
python -m kicad_vizdiff.local_viewer --project "C:/designs/board.kicad_sch" --assets web
```

Installed source users can also run `kicad-vizdiff browser <file-or-folder>` or
`pocket-kiview --project <file-or-folder> --assets <web-directory>`.

The process binds only to 127.0.0.1 on an available port and remains running while
the browser reads the project. Stop it with Ctrl+C when launched from a terminal;
a plugin-launched background server ends when its process is stopped. Closing a
browser tab alone does not stop that server. Every project read needs the random
session capability in the launch URL; other origins/hosts and source-write HTTP
methods are rejected. Only allowlisted viewer assets and files under the selected
project root are served. Hidden directories, build caches and linked paths are
excluded. Select a dedicated project folder; supported JSON/text/report files
inside that root are included.

**Reload saved project** rereads files after saving in KiCad. Browser-picked
files are snapshots: pick/drop them again after an external edit. Imported
project identity changes when its contents change, keeping review metadata
source-bound. Local notes remain in browser storage; they are never written to
CAD sources. Loopback ports have separate browser storage, so export a portable
review before ending the session if you need to retain/move the notes.

Limits: 32 MiB/file and 96 MiB/project; host snapshot 512 files; browser selection
2000 files, directory drop 4000 entries. Browser renderer hierarchy/source limits
also apply. Missing models, external library paths and unsupported constructs
retain the existing viewer diagnostics. This interface does not synchronize
unsaved KiCad state or edit the design.

The commenting pane shares the extension composer: visible Issue/Discussion, severity and state selectors, a compact text box and attachment menu. Local mode has a direct **Save comment** action. Five colour-coded review levels are available: Info, Level 1, Minor, Major and Critical. Local notes are not remotely published; export them through the review workflow when needed.
