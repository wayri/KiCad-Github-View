// Keep fine pad/model edges sharp on high-density phones without allocating an
// unbounded full-resolution framebuffer on large monitors or foldables.
export function viewportPixelRatio(width, height, deviceRatio = 1, maxDimension = 4096) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const dpr = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  const dimension = Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : 4096;
  return Math.min(dpr, 3, Math.sqrt(4_000_000 / w / h), dimension / w, dimension / h);
}

export function qualityName(value){return ['low','balanced','high'].includes(value)?value:'balanced';}
// Includes HDR ping-pong buffers, G-buffer/depth, AO/denoise, SMAA buffers,
// canvas and the cached shadow maps. This is a conservative allocation bound,
// not a claim about a particular driver's private memory accounting.
export function qualityViewport(width,height,deviceRatio=1,maxDimension=4096,quality='balanced',constrained=false){
 const mode=qualityName(quality),w=Number.isFinite(width)&&width>0?width:1,h=Number.isFinite(height)&&height>0?height:1;
 const maxPixels=mode==='high'?(constrained?1_000_000:2_000_000):mode==='low'?1_000_000:constrained?3_000_000:4_000_000;
 const ratio=Math.min(viewportPixelRatio(w,h,deviceRatio,maxDimension),Math.sqrt(maxPixels/w/h));
 const pixels=Math.floor(w*ratio)*Math.floor(h*ratio),bytesPerPixel=mode==='high'?96:mode==='low'?12:24;
 return {quality:mode,ratio,width:Math.max(1,Math.floor(w*ratio)),height:Math.max(1,Math.floor(h*ratio)),pixels,maxPixels,estimatedBytes:pixels*bytesPerPixel+(mode==='low'?0:2*1024*1024*4)};
}
export function boardOcclusion(thickness=1.6){
 const t=Number.isFinite(thickness)&&thickness>0?thickness:1.6;
 return {radius:Math.max(.35,Math.min(3,t*.85)),thickness:Math.max(.12,Math.min(1,t*.3)),distanceExponent:2,distanceFallOff:1,scale:1,samples:12,screenSpaceRadius:false};
}
export function padHasMaskOpening(pad,layer){const mask=layer==='B.Cu'?'B.Mask':'F.Mask';return Array.isArray(pad?.layers)&&(pad.layers.includes(mask)||pad.layers.includes('*.Mask'));}
export const physicalColors=Object.freeze({coatedCopper:0x164631,exposedCopper:0xc5aa6c});

// Avoid a kilometre-scale far plane for millimetre-scale boards. Updating this
// on orbit/zoom preserves thin copper depth precision and close inspection.
export function boardClipRange(distance, radius) {
  const d = Number.isFinite(distance) && distance > 0 ? distance : 1;
  const r = Number.isFinite(radius) && radius > 0 ? radius : 1;
  return { near: Math.max(.005, Math.min(.1, d / 1000)), far: Math.max(10, d + r * 4) };
}

// Neutral studio lighting is paired about the board plane, so turning a PCB
// over does not leave the back in darkness. Intensities are intentionally
// modest: environment reflections reveal metal without bleaching fine traces.
export const studioLights=Object.freeze([
  {x:.65,y:-.45,z:1,intensity:1.25,color:0xfff5e8},
  {x:.65,y:-.45,z:-1,intensity:1.25,color:0xfff5e8},
  {x:-.8,y:.35,z:.6,intensity:.65,color:0xe5efff},
  {x:-.8,y:.35,z:-.6,intensity:.65,color:0xe5efff}
].map(Object.freeze));
export const studioMaterials=Object.freeze({
  solderMask:Object.freeze({color:0x0d4935,roughness:.46,metalness:.04,clearcoat:.3,clearcoatRoughness:.5}),
  substrateEdge:Object.freeze({color:0xa8986e,roughness:.92,metalness:0}),
  copper:Object.freeze({metalness:.62,roughness:.38}),
  proxy:Object.freeze({color:0x353d49,metalness:.06,roughness:.66})
});
