"""KiCad legacy PCB action registration; no board mutation."""
from .action import PocketKiViewAction

# SWIG registration requires the editor's wx application singleton. Importing
# this package from a native CLI worker must not register an editor action.
try:
    import wx
except ImportError:
    wx = None
if wx is not None and wx.GetApp() is not None:
    PocketKiViewAction().register()
