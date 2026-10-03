"""Generate the extension's circuit-trace K icons, without external dependencies."""
from pathlib import Path
import math
import struct
import zlib


ROOT = Path(__file__).resolve().parents[1] / 'extension/icons'


def chunk(kind, data):
    return struct.pack('>I', len(data))+kind+data+struct.pack('>I', zlib.crc32(kind+data))


def distance(x, y, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    t = max(0, min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
    return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy)


def icon(size):
    paths = [((.29,.24),(.29,.76)), ((.70,.24),(.29,.50)), ((.29,.50),(.70,.76))]
    pads = [(.29,.24),(.29,.76),(.70,.24),(.70,.76)]
    raw = bytearray()
    for row in range(size):
        raw.append(0)
        for col in range(size):
            samples = []
            for sy in range(4):
                for sx in range(4):
                    x, y = (col+(sx+.5)/4)/size, (row+(sy+.5)/4)/size
                    corner = math.hypot(max(.14-x,0,x-.86), max(.14-y,0,y-.86))
                    if corner > .12:
                        samples.append((0,0,0,0))
                    elif any(math.hypot(x-a,y-b) < .060 for a,b in pads) or min(distance(x,y,a,b) for a,b in paths) < .025:
                        samples.append((138,231,185,255))
                    else:
                        samples.append((16,36,45,255))
            raw.extend(round(sum(pixel[i] for pixel in samples)/16) for i in range(4))
    return (b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('>IIBBBBB',size,size,8,6,0,0,0))
            +chunk(b'IDAT',zlib.compress(bytes(raw)))+chunk(b'IEND',b''))


if __name__ == '__main__':
    ROOT.mkdir(parents=True, exist_ok=True)
    for size in (16,32,48,128):
        (ROOT/f'icon{size}.png').write_bytes(icon(size))
    print('Built extension icons: 16, 32, 48, 128 px')
