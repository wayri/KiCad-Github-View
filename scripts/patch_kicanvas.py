"""Apply reviewed fractional-scale canvas clearing and theme fixes to KiCanvas."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHES = (
    ('this.ctx2d.setTransform(),this.ctx2d.scale(window.devicePixelRatio,window.devicePixelRatio),'
     'this.ctx2d.fillStyle=this.background_color.to_css(),this.ctx2d.fillRect(0,0,this.canvas.width,this.canvas.height)',
     'this.ctx2d.setTransform(),this.ctx2d.fillStyle=this.background_color.to_css(),'
     'this.ctx2d.fillRect(0,0,this.canvas.width,this.canvas.height),'
     'this.ctx2d.scale(window.devicePixelRatio,window.devicePixelRatio)'),
    ('this.update_canvas_size(),this.gl.clear(this.gl.COLOR_BUFFER_BIT|this.gl.DEPTH_BUFFER_BIT)',
     'this.update_canvas_size(),this.gl.clearColor(...this.background_color.to_array()),'
     'this.gl.clear(this.gl.COLOR_BUFFER_BIT|this.gl.DEPTH_BUFFER_BIT)'),
)


def patch():
    path = ROOT/'extension/vendor/kicanvas.js'
    source = path.read_text(encoding='utf-8')
    for old, new in PATCHES:
        if source.count(new) == 1:
            continue
        if source.count(old) != 1:
            raise SystemExit('KiCanvas changed: review the renderer patch against the new bundle before applying.')
        source = source.replace(old, new, 1)
    path.write_text(source, encoding='utf-8')
    print('KiCanvas renderer fixes applied: full-buffer clear and current WebGL background')


if __name__ == '__main__':
    patch()
