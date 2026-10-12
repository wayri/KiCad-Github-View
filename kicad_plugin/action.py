"""Open a saved PCB's project in a separate read-only browser process."""
from pathlib import Path
import os
import subprocess
import sys

import pcbnew


def python_executable(explicit=None):
    if explicit:
        return str(explicit)
    candidate = Path(sys.executable)
    name = candidate.name.lower()
    if name.startswith(('python', 'pypy')) and candidate.is_file():
        return str(candidate)
    # Embedded Python sometimes reports the PCB editor executable. KiCad's
    # Windows distribution supplies a separate interpreter beside that host.
    if os.name == 'nt':
        sibling = candidate.parent / 'python.exe'
        if sibling.is_file():
            return str(sibling)
    raise ValueError('A standalone Python interpreter could not be located. Launch Pocket KiView using the documented Python browser command.')


def launch_saved_board(board, executable=None):
    filename = board.GetFileName() if board is not None else ''
    if not filename:
        raise ValueError('Save the PCB first. Pocket KiView reads saved sources; unsaved editor changes are not included.')
    source = Path(filename).expanduser().resolve(strict=True)
    if source.suffix.lower() != '.kicad_pcb' or not source.is_file():
        raise ValueError('Open a saved .kicad_pcb board before launching Pocket KiView.')
    bundle = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    # The deterministic plugin bundle includes the Python module at its root.
    env['PYTHONPATH'] = str(bundle) + (os.pathsep + env['PYTHONPATH'] if env.get('PYTHONPATH') else '')
    command = [python_executable(executable), '-m', 'kicad_vizdiff.local_viewer', '--project', str(source)]
    packaged_assets = bundle / 'web'
    if (packaged_assets / 'local-assets.json').is_file():
        command += ['--assets', str(packaged_assets)]
    kwargs = {'cwd': str(bundle), 'env': env, 'stdin': subprocess.DEVNULL, 'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
    if os.name == 'nt':
        kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
    return subprocess.Popen(command, **kwargs)


class PocketKiViewAction(pcbnew.ActionPlugin):
    def defaults(self):
        self.name = 'Pocket KiView browser workspace'
        self.category = 'Read-only inspection'
        self.description = 'Open saved schematics, PCB and project assets in the browser alongside KiCad.'
        self.show_toolbar_button = False

    def Run(self):
        try:
            launch_saved_board(pcbnew.GetBoard())
        except (OSError, ValueError) as error:
            import wx
            wx.MessageBox(str(error), 'Pocket KiView', wx.OK | wx.ICON_INFORMATION)
