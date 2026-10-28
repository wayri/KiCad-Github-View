import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLLoader } from "three/addons/loaders/VRMLLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import "../design-diff.js";
import "../repo-models.js";
import fzstd from "../vendor/fzstd/fzstd.js";
import "../embedded-models.js";
import "../step-decoder.js";
import { parseKicadBoard } from "@spike/boardParser";
import "../layer-colors.js";
const layerThreeColor = name => Number.parseInt(globalThis.KiCadLayerColors.hexFor(name).slice(1), 16);
import { trackCapsuleDimensions } from "@spike/trackGeometry";
import { viewportSceneIdentity } from "@spike/viewportScenePolicy";
import { populationMask, uniqueComponentIndexes } from "./componentState.mjs";
import { footprintProxies } from "./footprintProxies.mjs";
import {createAnchorProjector} from "./projectAnchor.mjs";
import {sourceCopperPlan} from "./copperStack.mjs";
import {createNetInspection} from "./netInspection.mjs";
import {createSelectionAppearance} from "./selectionAppearance.mjs";
import { selectionMatcher, selectableRecord, tapGesture, holdGesture } from "./selectionState.mjs";
import { sphereFitDistance,boxFitDistance } from "./fitPolicy.mjs";
import { qualityName, qualityViewport, graphicsProfile, boardOcclusion, boardClipRange, studioLights, studioMaterials, padHasMaskOpening, physicalColors } from "./renderQuality.mjs";
import { createResultOverlay } from "./result3d.js";
import { sourceZoneGeometry,drillLoopInsideBoard } from "./sourceGeometry.mjs";
import { nativePadOutline,padSourceDetails,nativeDrillOutline } from "./padGeometry.mjs";
import { MeasurementSession,distanceLabel,snapProjectedEdges } from "./measurement3d.mjs";
import { boardViewPresets,boardViewPreset } from "./viewPresets.mjs";
export { mountResultScene } from "./result3d.js";

const STYLE = `
  :host{display:block;width:100%;height:100%;font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;
    --ink:#e6e9ef;--surface:#151820;--bar:#1e2128;--border:#343944;--accent:#91b9ff;
    --muted:#9ca5b5;--button:#292d36;--button-border:#343944;--button-ink:#e6e9ef;
    --hint:#1e2128e8;--panel:#1e2128f2;--menu:#252a34;--notice:#1e2128;color:var(--ink)}
  :host([data-theme="light"]){--ink:#252c38;--surface:#e7ebf1;--bar:#fff;--border:#d9dee7;
    --accent:#336ac2;--muted:#616d80;--button:#edf0f5;--button-border:#d9dee7;--button-ink:#252c38;
    --hint:#ffffffed;--panel:#fffffff2;--menu:#fff;--notice:#fff}
  *{box-sizing:border-box}.shell{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:var(--surface)}
  .bar{display:flex;align-items:center;gap:6px;min-height:40px;padding:5px 10px;background:var(--bar);border-bottom:1px solid var(--border);flex-wrap:nowrap;flex-shrink:0;min-width:0}
  .title{font-size:10px;font-weight:650;letter-spacing:.07em;color:var(--muted);white-space:nowrap}.detail{font-size:11px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}.spacer{flex:1;min-width:0}
  button,select{background:var(--button);border:1px solid var(--button-border);color:var(--button-ink);padding:4px 8px;border-radius:5px;font:500 11px/1.4 system-ui;min-height:28px;cursor:pointer;flex-shrink:0}
  button:hover,select:hover{border-color:var(--accent)}button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .bar button{display:inline-flex;align-items:center;justify-content:center;gap:5px;background:transparent;border-color:transparent}.bar button:hover,.bar button[aria-expanded=true]{background:var(--button);border-color:var(--button-border)}.bar svg{width:15px;height:15px;flex-shrink:0}.view-select{max-width:105px;background:transparent}.bar .divider{width:1px;height:18px;background:var(--border);flex-shrink:0}
  label{display:flex;align-items:center;gap:7px;white-space:nowrap;color:var(--muted);font-size:11px}input{accent-color:var(--accent)}.visibility-options{position:absolute;right:10px;top:10px;z-index:6;width:min(260px,calc(100% - 20px));max-height:calc(100% - 20px);overflow:auto;padding:12px;background:var(--menu);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px #0004;display:grid;gap:12px}.visibility-options[hidden]{display:none}.visibility-options fieldset{min-width:0;margin:0;padding:0;border:0;display:grid;gap:9px}.visibility-options fieldset+fieldset{border-top:1px solid var(--border);padding-top:12px}.visibility-options legend{padding:0 0 8px;color:var(--muted);font-size:10px;font-weight:650;letter-spacing:.06em;text-transform:uppercase}.visibility-options select{min-width:0;width:130px;margin-left:auto}.visibility-options input{width:16px;height:16px;margin:0}.display-heading{display:flex;align-items:center;justify-content:space-between;font-weight:600}.display-heading button{min-height:24px;padding:1px 6px}.quality-help{margin:0;color:var(--muted);font-size:10px;line-height:1.5}
  .stage{position:relative;flex:1;min-height:0;overflow:hidden}.canvas{position:absolute;inset:0}.canvas canvas{display:block;width:100%;height:100%}
  .hint{padding:4px 10px;color:var(--muted);background:var(--bar);font-size:10px;border-top:1px solid var(--border);flex-shrink:0}
  .inspector{position:absolute;right:12px;bottom:12px;width:min(280px,45%);max-height:50%;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:7px;padding:10px;box-shadow:0 8px 28px #0005}
  .inspector[hidden],.menu[hidden]{display:none}.inspector h2{font-size:13px;margin:0 0 6px;color:var(--accent)}.inspector dl{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;margin:0}.inspector dt{color:var(--muted)}.inspector dd{margin:0;overflow-wrap:anywhere}
  .menu{position:absolute;z-index:4;display:grid;gap:3px;padding:5px;border:1px solid var(--border);border-radius:5px;background:var(--menu);box-shadow:0 7px 25px #0005}
  .notice{padding:3px 9px;background:var(--notice);color:var(--muted);font-size:10px;border-top:1px solid var(--border);flex-shrink:0}.notice details{display:inline;margin-left:8px}.notice summary{display:inline;cursor:pointer;color:var(--accent)}.notice details[open]{display:block;margin:6px 0 0}.notice ul{max-height:120px;overflow:auto;margin:6px 0;padding-left:16px;line-height:1.6}.quality-notice{position:absolute;left:12px;right:12px;top:10px;z-index:7;padding:10px 12px;border:1px solid #bf725c;border-radius:7px;background:var(--panel);color:var(--ink);font-size:12px;max-width:560px}.quality-notice[hidden]{display:none}.quality-notice button{margin:6px 0 0 8px}
  button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}.measurement-panel{position:absolute;bottom:10px;left:10px;z-index:5;width:min(350px,calc(100% - 20px));padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);box-shadow:0 4px 18px #0003;display:grid;gap:6px}.measurement-panel[hidden],.measurement-label[hidden]{display:none}.measurement-heading{display:flex;align-items:center;gap:6px}.measurement-heading strong{font-size:12px;margin-right:auto}.measurement-panel output{font:600 18px/1.3 system-ui;color:var(--ink);font-variant-numeric:tabular-nums}.measurement-panel small{color:var(--muted);font-size:10px}.measurement-panel .measurement-tools{display:flex;align-items:center;gap:6px}.measurement-panel .measurement-tools select{min-width:0;flex:1}.measurement-panel p{margin:0;color:var(--muted);font-size:11px}.measurement-label{position:absolute;z-index:4;pointer-events:none;padding:4px 7px;border:1px solid #c5a35f;border-radius:5px;background:var(--panel);color:var(--ink);font:600 12px/1.4 system-ui;white-space:nowrap;box-shadow:0 2px 8px #0004}:host([data-measuring=true]) .hint{display:none}
  @media(max-width:700px){.detail{display:none}.bar{gap:4px;padding-inline:6px}.hint{display:none}.inspector{width:min(260px,65%)}}@media(max-width:380px){.title{display:none}.bar{gap:2px}.bar button{padding-inline:5px}.view-select{max-width:90px}}
  @media(pointer:coarse){button,select{min-height:40px}.bar{min-height:50px}.visibility-options label{min-height:32px}}
`;

// The scene filter changes visibility only; saved geometry and cameras stay intact.
export function objectVisibilityPolicy(input = {}) {
  const supportedTypes = ['arcs','pads','vias','tracks','fills','polygons','bodies'];
  const hiddenTypes = [...new Set((Array.isArray(input.hiddenTypes)?input.hiddenTypes:[]).filter(type=>typeof type==='string'&&type.length<=40).slice(0,64))];
  const side = ['top','bottom'].includes(input.side)?input.side:'all';
  return {hiddenTypes,side,supportedTypes,unsupportedTypes:hiddenTypes.filter(type=>!supportedTypes.includes(type)),
    visible(type,layer){return !hiddenTypes.includes(type)&&!(side==='top'&&layer?.startsWith('B.'))&&!(side==='bottom'&&layer?.startsWith('F.'));}};
}

function pathFor(points, transform) {
  const path = new THREE.Path();
  points.forEach((point, index) => {
    const [x, y] = transform(point);
    if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
  });
  return path;
}

function boardShape(board, transform) {
  const loops = board.outlineLoops?.filter((loop) => loop.length >= 3) || [];
  const outer = loops[0] || [
    [board.bounds.minX, board.bounds.minY], [board.bounds.maxX, board.bounds.minY],
    [board.bounds.maxX, board.bounds.maxY], [board.bounds.minX, board.bounds.maxY]
  ];
  const shape = new THREE.Shape();
  pathFor(outer, transform).getPoints().forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y); else shape.lineTo(point.x, point.y);
  });
  for (const loop of loops.slice(1)) shape.holes.push(pathFor(loop, transform));
  return shape;
}

function makeInstanced(group, geometry, material, records, place, identity) {
  if (!records.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, records.length);
  const object = new THREE.Object3D();
  records.forEach((item, index) => {
    place(object, item);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.records = records;
  mesh.userData.identity = identity;
  group.add(mesh);
  return mesh;
}

export function mountBoard3D(container, source, options = {}) {
  options ||= {};
  const initialDark = options.dark !== false;
  const board = parseKicadBoard(source);
  const sourceAST=globalThis.KiCadDesignDiff.parse(source),savedZones=sourceZoneGeometry(sourceAST);
  const padDetails=padSourceDetails(sourceAST),nativePads=board.pads.map(pad=>({...pad,...padDetails.get(pad.id)}));
  const geometryDiagnostics=[];
  if (!board?.bounds || !Number.isFinite(board.width) || !Number.isFinite(board.height)) {
    throw new Error("SPIKE could not parse this PCB layout.");
  }
  const host = document.createElement("div");
  host.dataset.theme = initialDark ? "dark" : "light";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style"); style.textContent = STYLE;
  const shell = document.createElement("div"); shell.className = "shell";
  const bar = document.createElement("div"); bar.className = "bar";
  const stage = document.createElement("div"); stage.className = "stage";
  const canvasHost = document.createElement("div"); canvasHost.className = "canvas";
  const hint = document.createElement("div"); hint.className = "hint";
  hint.textContent = "Drag to orbit · right-drag to pan · wheel to zoom · click to inspect";
  const inspector = document.createElement("div"); inspector.className = "inspector"; inspector.hidden = true;
  const menu = document.createElement("div"); menu.className = "menu"; menu.hidden = true;
  const notice = document.createElement("div"); notice.className = "notice";
  notice.textContent = "Material preview · mask openings follow saved pad layer flags · footprint stand-ins where linked models are unavailable.";
  const qualityNotice=document.createElement('div');qualityNotice.className='quality-notice';qualityNotice.hidden=true;qualityNotice.setAttribute('role','status');stage.append(qualityNotice);
  stage.append(canvasHost, inspector, menu); shell.append(bar, stage, hint, notice); shadow.append(style, shell); container.append(host);

  const title = document.createElement("strong"); title.className = "title"; title.textContent = "3D VIEW";
  const detail = document.createElement("span"); detail.className = "detail";
  detail.textContent = `${board.width.toFixed(1)} × ${board.height.toFixed(1)} mm · ${board.components.length} parts · ${board.tracks.length} tracks`;
  const spacer = document.createElement("span"); spacer.className = "spacer";
  function action(label, handler, path, tooltip=label) {
    const button = document.createElement("button"); button.type = "button"; button.title=tooltip;button.setAttribute('aria-label',tooltip);
    if(path){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),shape=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');shape.setAttribute('d',path);svg.append(shape);button.append(svg);}
    const caption=document.createElement('span');caption.textContent=label;button.append(caption);
    button.addEventListener("click",()=>{handler();invalidate();}); bar.append(button); return button;
  }
  const visibilityOptions=document.createElement('section');visibilityOptions.className='visibility-options';visibilityOptions.id='display-options';visibilityOptions.hidden=true;visibilityOptions.setAttribute('aria-label','3D display settings');stage.append(visibilityOptions);
  const displayHeading=document.createElement('div');displayHeading.className='display-heading';displayHeading.append(document.createTextNode('Display'));
  const displayClose=document.createElement('button');displayClose.type='button';displayClose.textContent='×';displayClose.title='Close display settings';displayClose.setAttribute('aria-label','Close display settings');displayClose.onclick=()=>setDisplayOpen(false,true);displayHeading.append(displayClose);
  const renderingOptions=document.createElement('fieldset'),renderingLegend=document.createElement('legend');renderingLegend.textContent='Rendering';renderingOptions.append(renderingLegend);
  const layerOptions=document.createElement('fieldset'),layerLegend=document.createElement('legend');layerLegend.textContent='Visible geometry';layerOptions.append(layerLegend);visibilityOptions.append(displayHeading,renderingOptions,layerOptions);
  function setDisplayOpen(open,restoreFocus=false){visibilityOptions.hidden=!open;displayButton.setAttribute('aria-expanded',String(open));if(restoreFocus)displayButton.focus();}
  function toggle(label, initial, handler) {
    const wrapper = document.createElement("label"), input = document.createElement("input");
    input.type = "checkbox"; input.checked = initial; input.addEventListener("change", () => {handler(input.checked);invalidate();});
    wrapper.append(input, document.createTextNode(label)); layerOptions.append(wrapper); return input;
  }
  bar.append(title, detail, spacer);
  const qualityKey='pocket-kivi:3d-quality:v1';let initialQuality='balanced',savedQuality=false;
  try{const saved=localStorage.getItem(qualityKey);if(['low','balanced','high'].includes(saved)){initialQuality=saved;savedQuality=true;}}catch{}
  if(options.quality)initialQuality=qualityName(options.quality);
  const qualityLabel=document.createElement('label');qualityLabel.className='quality-label';const qualityCaption=document.createElement('span');qualityCaption.textContent='Quality';
  const qualitySelect=document.createElement('select');qualitySelect.setAttribute('aria-label','3D rendering quality');qualitySelect.title='High: ambient occlusion and enhanced antialiasing. Balanced: responsive studio lighting. Low: reduced memory.';
  for(const [value,label]of [['low','Low'],['balanced','Balanced'],['high','High']]){const option=document.createElement('option');option.value=value;option.textContent=label;qualitySelect.append(option);}qualitySelect.value=initialQuality;qualityLabel.append(qualityCaption,qualitySelect);

  const centerX = (board.bounds.minX + board.bounds.maxX) / 2;
  const centerY = (board.bounds.minY + board.bounds.maxY) / 2;
  const world = ([x, y]) => [x - centerX, centerY - y];
  const localPadPoint=([x,y])=>[x,-y];
  const padShape=outline=>{const shape=new THREE.Shape();pathFor(outline.outline,localPadPoint).getPoints().forEach((point,index)=>index?shape.lineTo(point.x,point.y):shape.moveTo(point.x,point.y));if(outline.drill)shape.holes.push(pathFor(outline.drill,localPadPoint));return shape;};
  const width = Math.max(1, board.width), height = Math.max(1, board.height), extent = Math.max(width, height);
  const thickness = board.stackup?.filter((layer) => Number.isFinite(layer.thickness))
    .reduce((sum, layer) => sum + layer.thickness, 0) || 1.6;
  const top = thickness / 2, bottom = -top;
  const copperPlan=sourceCopperPlan(board,sourceAST,thickness);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(initialDark ? 0x151820 : 0xe7ebf1);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, Math.max(3000, extent * 30));
  // OrbitControls captures its up basis at construction. Use the board's
  // thickness axis consistently for orbiting and all fitted camera presets.
  camera.up.set(0,0,1);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  const gl=renderer.getContext(),graphics=graphicsProfile({maxTextureSize:renderer.capabilities.maxTextureSize,maxRenderbufferSize:gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),deviceMemory:globalThis.navigator?.deviceMemory,hardwareConcurrency:globalThis.navigator?.hardwareConcurrency,floatTargets:renderer.extensions.has('EXT_color_buffer_float'),android:/Android/i.test(globalThis.navigator?.userAgent||'')});
  if(!savedQuality&&!options.quality)initialQuality=graphics.defaultQuality;
  let active=true,frame=0,contextLost=false,renderCount=0,pipeline=null,quality=initialQuality,shaderFailure=false;
  function invalidate(){if(!active||contextLost||frame)return;frame=requestAnimationFrame(drawFrame);}
  function graphicsNotice(message,retry=false){qualityNotice.replaceChildren(document.createTextNode(message));qualityNotice.hidden=false;
    const close=document.createElement('button');close.type='button';close.textContent='Dismiss';close.onclick=()=>{qualityNotice.hidden=true;};qualityNotice.append(close);
    if(retry){const button=document.createElement('button');button.type='button';button.textContent='Retry graphics';button.onclick=()=>renderer.forceContextRestore();qualityNotice.append(button);}
  }
  function disposePipeline(){if(!pipeline)return;for(const pass of pipeline.passes){pass.dispose?.();if(pass instanceof GTAOPass){pass.gtaoMaterial.dispose();pass.blendMaterial.dispose();pass.depthTexture?.dispose();}}pipeline.composer.dispose();pipeline=null;}
  function createPipeline(){
    disposePipeline();if(quality!=='high')return;
    if(!renderer.extensions.has('EXT_color_buffer_float'))throw Error('Floating-point render targets are unavailable.');
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false});
    const composer=new EffectComposer(renderer,target),passes=[];pipeline={composer,passes};
    const base=new RenderPass(scene,camera),ao=new GTAOPass(scene,camera,1,1,undefined,boardOcclusion(thickness));
    ao.blendIntensity=.65;ao.updatePdMaterial({radius:4,rings:2,samples:12});
    // Translucent solder zones, glass and result overlays must not become
    // opaque occluders when the normal/depth pass substitutes its material.
    const inheritedVisibility=ao.overrideVisibility.bind(ao);ao.overrideVisibility=()=>{inheritedVisibility();scene.traverse(object=>{const materials=Array.isArray(object.material)?object.material:[object.material];if(materials.some(material=>material&&(material.transparent||material.depthTest===false)))object.visible=false;});};
    const output=new OutputPass(),smaa=new SMAAPass(1,1);
    for(const texture of [smaa.areaTexture,smaa.searchTexture])texture.image?.addEventListener?.('load',invalidate,{once:true});
    passes.push(base,ao,output,smaa);for(const pass of passes)composer.addPass(pass);
  }
  function fallbackQuality(message){disposePipeline();quality='balanced';qualitySelect.value=quality;host.dataset.quality=quality;shaderFailure=false;renderer.setRenderTarget(null);graphicsNotice(message);sizeViewport();}
  function applyQuality(value,persist=true){quality=qualityName(value);qualitySelect.value=quality;host.dataset.quality=quality;qualityNotice.hidden=true;shaderFailure=false;
    if(persist)try{localStorage.setItem(qualityKey,quality);}catch{}
    renderer.shadowMap.enabled=quality!=='low';renderer.shadowMap.needsUpdate=true;
    try{createPipeline();}catch{fallbackQuality('High quality is unavailable on this graphics device. Balanced rendering is active.');}
    sizeViewport();invalidate();return quality;
  }
  qualitySelect.onchange=()=>applyQuality(qualitySelect.value);
  renderer.debug.onShaderError=()=>{shaderFailure=true;};
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  // Two bounded, cached maps add contact/depth cues without redrawing shadow
  // geometry every orbit frame. Geometry/visibility changes invalidate them.
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  // A small, generated neutral studio supplies reflections to metallic STEP /
  // glTF materials. No network environment map or model-material rewrite.
  function createEnvironment(){if(!renderer.extensions.has('EXT_color_buffer_float'))return null;let room,generator;try{room=new RoomEnvironment();generator=new THREE.PMREMGenerator(renderer);return generator.fromScene(room,.04,.1,100);}catch{graphicsNotice('Studio reflections are unavailable on this graphics device. Direct lighting remains active.');return null;}finally{room?.dispose();generator?.dispose();}}
  let environment=createEnvironment();
  scene.environment = environment?.texture||null; scene.environmentIntensity = .65;
  canvasHost.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  let userAdjustedCamera = false;
  const cameraInteraction = () => { userAdjustedCamera = true; };
  controls.addEventListener("start", cameraInteraction);
  controls.addEventListener('change',invalidate);
  controls.enableDamping = true; controls.dampingFactor = 0.1; controls.screenSpacePanning = true;
  controls.minDistance = Math.max(2, extent * .04); controls.maxDistance = extent * 8;
  // Oblique keys reveal chamfers and body shape on either face. Neutral fill
  // keeps dark packages readable without flattening all the surface normals.
  scene.add(new THREE.AmbientLight(0xffffff, .35));
  for (const light of studioLights) {
    const key = new THREE.DirectionalLight(light.color, light.intensity);
    if(Math.abs(light.z)===1){
      key.castShadow=true;key.shadow.mapSize.set(1024,1024);
      key.shadow.camera.left=key.shadow.camera.bottom=-extent;
      key.shadow.camera.right=key.shadow.camera.top=extent;
      key.shadow.camera.near=.1;key.shadow.camera.far=extent*5;
      key.shadow.normalBias=.02;key.shadow.bias=-.0001;
    }
    key.position.set(extent * light.x, extent * light.y, extent * light.z); scene.add(key);
  }
  const boardGroup = new THREE.Group(); scene.add(boardGroup);
  const copperGroups = new Map(), pickables = [];
  let objectVisibility=objectVisibilityPolicy();
  const visibilityRecords=[];
  const visibilityRecord=(mesh,type,layer)=>{visibilityRecords.push({mesh,type,layer});mesh.visible=objectVisibility.visible(type,layer);return mesh;};
  const arcIds=new Set(sourceAST.filter(node=>Array.isArray(node)&&node[0]==='arc').map(node=>{const id=node.find(value=>Array.isArray(value)&&['uuid','tstamp'].includes(value[0]))?.[1];return typeof id==='object'?id?.quoted:id;}).filter(Boolean));
  const isArc=track=>arcIds.has(track.id)||arcIds.has(track.id?.replace(/:\d+$/,''))||/^track-\d+:\d+$/.test(track.id||'');
  const appearanceRecords=[];let realistic=true,selectionAppearanceReady=false;
  const appearanceLabel=document.createElement('label');appearanceLabel.append(document.createTextNode('Appearance'));
  const appearanceSelect=document.createElement('select');appearanceSelect.setAttribute('aria-label','3D board appearance');
  for(const [value,label]of [['realistic','Realistic'],['layers','Layer colors']]){const option=document.createElement('option');option.value=value;option.textContent=label;appearanceSelect.append(option);}appearanceLabel.append(appearanceSelect);
  const qualityHelp=document.createElement('p');qualityHelp.className='quality-help';qualityHelp.textContent='High adds ambient occlusion and enhanced antialiasing. Linked model availability is shown below the viewport.';renderingOptions.append(appearanceLabel,qualityLabel,qualityHelp);
  function applyAppearance(){if(selectionAppearanceReady)selectionAppearance.restore();for(const record of appearanceRecords){const {mesh,role,layer}=record;
    if(role==='pads'){mesh.material.color.setHex(0xffffff);record.pads.forEach((pad,index)=>mesh.setColorAt(index,new THREE.Color(realistic?(padHasMaskOpening(pad,layer)?physicalColors.exposedCopper:physicalColors.coatedCopper):layerThreeColor(layer))));if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    else mesh.material.color.setHex(realistic?physicalColors.coatedCopper:layerThreeColor(layer));
    mesh.material.metalness=realistic&&role!=='pads'?.08:studioMaterials.copper.metalness;
    mesh.material.roughness=realistic&&role!=='pads'?.52:studioMaterials.copper.roughness;
  }if(selectionAppearanceReady)setSelection(externalSelection);invalidate();}
  appearanceSelect.onchange=()=>{realistic=appearanceSelect.value==='realistic';applyAppearance();};
  const groupFor = (layer) => {
    if (!copperGroups.has(layer)) { const group = new THREE.Group(); group.name = layer; boardGroup.add(group); copperGroups.set(layer, group); }
    return copperGroups.get(layer);
  };
  const shape = boardShape(board, world);
  // Saved pad/via drill loops cut the substrate itself; NPTH does not need a
  // copper annulus. Cap triangulation work and disclose omissions explicitly.
  const drilled=new Set();let drillCount=0,drillPoints=0,omittedDrills=0;
  const inside=(point,loop)=>{let result=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const [a,b]=[loop[i],loop[j]];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
  const outer=board.outlineLoops?.[0],outlineHoles=board.outlineLoops?.slice(1)||[];
  for(const item of [...nativePads,...board.vias.filter(via=>copperPlan.viaSpans.get(via.id)?.through).map(via=>({...via,shape:'circle',width:via.size,height:via.size,drillShape:'circle',rotation:0}))]){
    if(!(item.drill>0))continue;const loop=nativeDrillOutline(item);if(!loop){omittedDrills++;continue;}
    const angle=(item.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),[cx,cy]=world(item.at);
    if(outlineHoles.some(hole=>inside(item.at,hole)))continue;
    const points=loop.map(([x,y])=>[cx+x*c+y*s,cy+x*s-y*c]);
    const key=JSON.stringify(points.map(point=>point.map(value=>Math.round(value*10000)/10000)));if(drilled.has(key))continue;
    if(drillCount>=1024||drillPoints+points.length>100000||!outer||!drillLoopInsideBoard(points.map(([x,y])=>[x+centerX,centerY-y]),outer,outlineHoles)){omittedDrills++;continue;}
    drilled.add(key);drillCount++;drillPoints+=points.length;shape.holes.push(pathFor(points,point=>point));
  }
  if(omittedDrills)geometryDiagnostics.push(`${omittedDrills} drill loops could not be cut within the saved-geometry/triangulation budget.`);
  const substrate = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 8 }),
    [new THREE.MeshPhysicalMaterial(studioMaterials.solderMask),
      new THREE.MeshStandardMaterial(studioMaterials.substrateEdge)]);
  substrate.position.z = bottom;
  substrate.receiveShadow = true;
  substrate.userData.record = { type: "Board", name: "Substrate", layer: "Edge.Cuts", id: "board" };
  substrate.userData.identity = viewportSceneIdentity("substrate", "Edge.Cuts", "board");
  boardGroup.add(substrate); pickables.push(substrate);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(substrate.geometry, 20),
    new THREE.LineBasicMaterial({ color: 0x9bb7ac, transparent: true, opacity: .42 }));
  edges.position.z = bottom; boardGroup.add(edges);

  for (const [layer, color] of [["F.Cu", layerThreeColor("F.Cu")], ["B.Cu", layerThreeColor("B.Cu")]]) {
    const z = layer === "F.Cu" ? top + .025 : bottom - .025;
    for(const category of ['tracks','arcs']){
    const tracks = board.tracks.filter((item) => item.layer === layer&&(isArc(item)?'arcs':'tracks')===category);
    const trackMesh = makeInstanced(groupFor(layer), new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color, ...studioMaterials.copper, side: THREE.DoubleSide }), tracks,
      (object, track) => {
        const a = world(track.start), b = world(track.end);
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const capsule = trackCapsuleDimensions(length, track.width);
        object.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
        object.rotation.set(0, 0, Math.atan2(b[1] - a[1], b[0] - a[0]));
        object.scale.set(Math.max(.04, capsule.shapeLength), Math.max(.04, capsule.width), 1);
      }, viewportSceneIdentity("copper-track", layer, category));
    if (trackMesh) {visibilityRecord(trackMesh,category,layer);pickables.push(trackMesh);appearanceRecords.push({mesh:trackMesh,role:'tracks',layer});}
    }
    const pads = nativePads.filter((item) => item.layer === layer || item.layers?.includes(layer)||item.layers?.includes('*.Cu'));
    const batches=new Map();let omittedPads=0;
    for(const pad of pads){const outline=nativePadOutline(pad);if(!outline){omittedPads++;continue;}const key=JSON.stringify([pad.shape,pad.width,pad.height,pad.roundrectRatio,pad.drill,pad.drillShape,pad.drillWidth,pad.drillHeight,pad.drillOffset]);if(!batches.has(key)){if(batches.size>=256){omittedPads++;continue;}batches.set(key,{outline,pads:[]});}batches.get(key).pads.push(pad);}
    if(omittedPads)geometryDiagnostics.push(`${layer}: ${omittedPads} unsupported/ambiguous pad shapes omitted; no rectangular stand-ins were substituted.`);
    const padMaterial=new THREE.MeshStandardMaterial({color:0xffffff,...studioMaterials.copper});
    for(const [key,batch]of batches){const geometry=new THREE.ExtrudeGeometry(padShape(batch.outline),{depth:.04,bevelEnabled:false,curveSegments:8});
      const padMesh=makeInstanced(groupFor(layer),geometry,padMaterial,batch.pads,(object,pad)=>{const[x,y]=world(pad.at);object.position.set(x,y,z-.02);object.rotation.z=(pad.rotation||0)*Math.PI/180;},viewportSceneIdentity('copper-pad',layer,key));
      if(padMesh){visibilityRecord(padMesh,'pads',layer);pickables.push(padMesh);appearanceRecords.push({mesh:padMesh,role:'pads',layer,pads:batch.pads});}
    }
    for (const zone of savedZones.records.filter((item) => item.layer === layer)) {
      if (zone.points.length < 3) continue;
      if(!zone.filled){const geometry=new THREE.BufferGeometry().setFromPoints(zone.points.map(point=>{const [x,y]=world(point);return new THREE.Vector3(x,y,z);}));const boundary=new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color:layerThreeColor(layer),transparent:true,opacity:.6}));groupFor(layer).add(boundary);visibilityRecord(boundary,'polygons',layer);continue;}
      const zoneShape = new THREE.Shape();
      pathFor(zone.points, world).getPoints().forEach((point, index) => {
        if (index === 0) zoneShape.moveTo(point.x, point.y); else zoneShape.lineTo(point.x, point.y);
      });
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(zoneShape),
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: .34, side: THREE.DoubleSide, depthWrite: false }));
      mesh.position.z = z - (layer === "F.Cu" ? .005 : -.005); mesh.userData.record = { ...zone, type: "Zone" };
      groupFor(layer).add(mesh);visibilityRecord(mesh,'fills',layer); pickables.push(mesh);
      appearanceRecords.push({mesh,role:'zone',layer});
    }
  }
  const viaBatches=new Map();let omittedVias=0;
  for(const via of board.vias){const span=copperPlan.viaSpans.get(via.id),outline=nativePadOutline({shape:'circle',width:via.size,height:via.size,drill:via.drill,drillShape:'circle'});if(!outline||!span){omittedVias++;continue;}const key=JSON.stringify([via.size,via.drill,span.zMin,span.zMax]);if(!viaBatches.has(key)){if(viaBatches.size>=128){omittedVias++;continue;}viaBatches.set(key,{outline,span,vias:[]});}viaBatches.get(key).vias.push(via);}
  if(omittedVias)geometryDiagnostics.push(`${omittedVias} via bodies with unsupported annuli or unknown saved spans omitted.`);
  const viaMaterial=new THREE.MeshStandardMaterial({color:physicalColors.exposedCopper,...studioMaterials.copper});
  for(const[key,batch]of viaBatches){const geometry=new THREE.ExtrudeGeometry(padShape(batch.outline),{depth:batch.span.zMax-batch.span.zMin,bevelEnabled:false,curveSegments:8});const mesh=makeInstanced(boardGroup,geometry,viaMaterial,batch.vias,(object,via)=>{const[x,y]=world(via.at);object.position.set(x,y,batch.span.zMin);},viewportSceneIdentity('via-barrel',batch.span.from+'-'+batch.span.to,key));if(mesh){visibilityRecord(mesh,'vias',batch.span.through?'through':batch.span.from+'-'+batch.span.to);pickables.push(mesh);}}
  // Surface annuli remain on the ordinary outer copper planes; blind/buried
  // barrel endpoints still follow their saved internal spans.
  for(const layer of ['F.Cu','B.Cu'])for(const [key,batch]of viaBatches){
    if(batch.span.from!==layer&&batch.span.to!==layer)continue;
    const z=layer==='F.Cu'?top+.025:bottom-.025,geometry=new THREE.ExtrudeGeometry(padShape(batch.outline),{depth:.04,bevelEnabled:false,curveSegments:8});
    const cap=makeInstanced(groupFor(layer),geometry,viaMaterial,batch.vias,(object,via)=>{const[x,y]=world(via.at);object.position.set(x,y,z-.02);},viewportSceneIdentity('via-annulus',layer,key));
    if(cap){visibilityRecord(cap,'vias',layer);pickables.push(cap);}
  }
  const netInspection=createNetInspection(THREE,{board,plan:copperPlan,zones:savedZones.records,sourceLimited:savedZones.truncated,pads:nativePads,world,colorForLayer:layerThreeColor});scene.add(netInspection.group);
  let fullNet3D=true;
  const netInspectionHelp=document.createElement('p');netInspectionHelp.className='quality-help';netInspectionHelp.hidden=true;renderingOptions.append(netInspectionHelp);
  applyAppearance();
  const parts = new THREE.Group(); boardGroup.add(parts);
  const proxyPoses = footprintProxies(board);
  const componentMesh = makeInstanced(parts, new RoundedBoxGeometry(1, 1, 1, 2, .06),
    new THREE.MeshStandardMaterial(studioMaterials.proxy), board.components,
    (object, part) => { const pose = proxyPoses.get(part); const [x, y] = world(pose?.at || part.at); const below = part.layer?.startsWith("B.");
      object.position.set(x, y, below ? bottom - 1.1 : top + 1.1);
      object.rotation.set(0, 0, pose?.rotation || 0);
      object.scale.set(pose?.width || 0, pose?.height || 0, pose ? 2.1 : 0); },
    viewportSceneIdentity("component", "F.Fab", "proxies"));
  if (componentMesh) pickables.push(componentMesh);
  if (componentMesh) { componentMesh.castShadow = true; componentMesh.receiveShadow = true; }
  const componentIndexes = uniqueComponentIndexes(board.components);
  const componentMatrices = board.components.map((_, index) => {
    const matrix = new THREE.Matrix4();
    componentMesh?.getMatrixAt(index, matrix);
    return matrix;
  });
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const modelGroups = new Map(), loadedModelIndexes = new Set();
  let stepClient=null;
  let population = board.components.map(() => true);
  function updateComponentVisibility() {
    board.components.forEach((_, index) => componentMesh?.setMatrixAt(index,
      population[index] && objectVisibility.visible('bodies',board.components[index].layer) && !loadedModelIndexes.has(index) ? componentMatrices[index] : hiddenMatrix));
    if (componentMesh) { componentMesh.instanceMatrix.needsUpdate = true; componentMesh.computeBoundingSphere(); }
    for (const [index, group] of modelGroups) group.visible = population[index]&&objectVisibility.visible('bodies',board.components[index].layer);
    renderer.shadowMap.needsUpdate=true;
    invalidate();
  }
  const modelDiagnostics = Array.isArray(options.assetWarnings)
    ? options.assetWarnings.filter(item => typeof item === "string").slice(0, 48).map(item => item.slice(0, 500)) : [];
  if(savedZones.unfilled)modelDiagnostics.push(`${savedZones.unfilled} zones have no saved copper fill; only their boundaries are shown.`);
  if(savedZones.truncated)modelDiagnostics.push('Saved zone display reached its polygon/point budget; additional copper is omitted.');
  modelDiagnostics.push(...geometryDiagnostics);
  showModelDiagnostics();
  function showModelDiagnostics() {
    const resolved = loadedModelIndexes.size;
    const problems = modelDiagnostics.length;
    notice.replaceChildren(document.createTextNode(`Material preview · linked models ${resolved}/${board.components.length}`));
    const details=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');summary.textContent=problems?`${problems} rendering notes`:'Rendering details';
    for(const message of ['Mask openings follow saved pad layer flags; this is not a reconstructed solder-mask solid.',`${board.components.length-resolved} footprints have no linked model; bounded stand-ins are used only where usable saved footprint bounds exist.`,...modelDiagnostics]){const row=document.createElement('li');row.textContent=message;list.append(row);}details.append(summary,list);notice.append(details);
    notice.title = modelDiagnostics.join("\n");
  }
  function glbIsSelfContained(bytes) {
    if (bytes.byteLength < 20) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
        view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) return false;
    const length = view.getUint32(12, true);
    if (length > bytes.byteLength - 20) return false;
    let descriptor;
    try { descriptor = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))); }
    catch { return false; }
    return [...(descriptor.buffers || []), ...(descriptor.images || [])]
      .every(item => !item.uri || /^data:/i.test(item.uri));
  }
  async function sceneFromAsset(entry, asset, consumeBytes) {
    const base64 = asset?.base64;
    if (typeof base64 !== "string" || base64.length > 11_200_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new Error("invalid or oversized model asset response");
    }
    const bytes = entry.embeddedAsset ? await globalThis.KiCadEmbeddedModels.decode(asset, fzstd.decompress)
      : Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("model asset exceeds 8 MiB");
    consumeBytes(bytes.byteLength);
    if (["step","stp"].includes(entry.format)) {
      stepClient ||=new globalThis.KiCadStepDecoder.Client(new URL("step-worker.js",location.href).href);
      const meshes=await stepClient.decode(bytes), group=new THREE.Group();
      for(const mesh of meshes){
        const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(mesh.positions,3));geometry.setIndex(new THREE.BufferAttribute(mesh.index,1));
        if(mesh.normals)geometry.setAttribute("normal",new THREE.BufferAttribute(mesh.normals,3));else geometry.computeVertexNormals();
        const material=new THREE.MeshStandardMaterial({color:new THREE.Color(...mesh.color),roughness:.65,metalness:.1});
        group.add(new THREE.Mesh(geometry,material));
      }
      return group;
    }
    if (entry.format === "glb") {
      if (!glbIsSelfContained(bytes)) throw new Error("GLB has an external dependency or invalid header");
      return (await new GLTFLoader().parseAsync(bytes.buffer, "")).scene;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/\b(?:Inline|ImageTexture|MovieTexture|AudioClip)\b|\burl\s*(?:\[|\")/i.test(text)) {
      throw new Error("VRML has an external resource reference");
    }
    return new VRMLLoader().parse(text);
  }
  async function loadRepositoryModels() {
    if (!options.boardPath) return;
    let inventory;
    try { inventory = globalThis.KiCadRepoModels.collect(source, options.boardPath, undefined, options.assetPaths); }
    catch (error) { modelDiagnostics.push(`Cannot read model references: ${error.message}`); showModelDiagnostics(); return; }
    modelDiagnostics.push(...inventory.diagnostics);
    showModelDiagnostics();
    const cache = new Map();
    const componentIndexes=new Map(board.components.map((component,index)=>[component.id,index]));
    let totalBytes = 0, cursor = 0;
    async function one(entry) {
      const index = componentIndexes.get(entry.footprintId);
      if (index === undefined) { modelDiagnostics.push(`${entry.reference}: footprint identity not found`); return; }
      try {
        const key = entry.assetKey || entry.path;
        if (!cache.has(key)) cache.set(key, (async () => {
          const asset = entry.embeddedAsset || await options.loadAsset?.(entry.path);
          return sceneFromAsset(entry, asset, bytes => {
            totalBytes += bytes;
            if (totalBytes > 24 * 1024 * 1024) throw new Error("Decoded 3D model assets exceed 24 MiB in this viewer");
          });
        })());
        const template = await cache.get(key);
        if (!active) return;
        const clone = template.clone(true);
        let meshCount = 0;
        clone.traverse(object => {
          if (object.isMesh && object.geometry?.attributes?.position?.count) {
            meshCount++;
            object.castShadow = true; object.receiveShadow = true;
            object.userData.record = { ...board.components[index], type: "Component", modelPath: entry.path };
            pickables.push(object);
          }
        });
        if (!meshCount) throw new Error("asset has no drawable mesh");
        const pose = globalThis.KiCadRepoModels.modelPose(entry, centerX, centerY, thickness);
        const group = new THREE.Group();
        group.position.set(...pose.position);
        group.rotation.z = pose.footprintAngle;
        const local = new THREE.Group();
        // KiCad's VRML exporter composes X/Y/Z model rotations before footprint rotation.
        local.rotation.set(...pose.modelRotation, "ZYX");
        local.scale.set(...pose.scale);
        local.add(clone); group.add(local);
        if (!modelGroups.has(index)) {
          const footprintModels = new THREE.Group();
          modelGroups.set(index, footprintModels); parts.add(footprintModels);
        }
        modelGroups.get(index).add(group);
        loadedModelIndexes.add(index);
        if (entry.format === "glb") modelDiagnostics.push(`${entry.reference}: GLB geometry is interpreted in millimetres.`);
        updateComponentVisibility();
        setSelection(externalSelection);
      } catch (error) {
        modelDiagnostics.push(`${entry.reference}: ${entry.path}: ${error?.message || String(error)}`);
      }
      showModelDiagnostics();
    }
    await Promise.all(Array.from({ length: Math.min(3, inventory.models.length) }, async () => {
      while (cursor < inventory.models.length && active) await one(inventory.models[cursor++]);
    }));
    if(active) {
      showModelDiagnostics(); setSelection(externalSelection);
      // Fit real model height after asynchronous decoding, but never undo an
      // orbit/zoom the user has already started during loading.
      if (!userAdjustedCamera && loadedModelIndexes.size) fit();
    }
  }

  let fittedRadius = Math.hypot(width, height, thickness + 5) / 2;
  function updateClipping() {
    const range = boardClipRange(camera.position.distanceTo(controls.target), fittedRadius);
    camera.near = range.near; camera.far = range.far; camera.updateProjectionMatrix();
  }
  controls.addEventListener("change", updateClipping);
  function sizeViewport() {
    const viewportWidth = Math.max(1, canvasHost.clientWidth), viewportHeight = Math.max(1, canvasHost.clientHeight);
    const plan=qualityViewport(viewportWidth,viewportHeight,globalThis.devicePixelRatio,graphics.maxDimension,quality,graphics),ratio=plan.ratio;
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    renderer.setSize(viewportWidth, viewportHeight, false); camera.aspect = viewportWidth / viewportHeight;
    if(pipeline){pipeline.composer.setPixelRatio(ratio);pipeline.composer.setSize(viewportWidth,viewportHeight);}
    camera.updateProjectionMatrix();
    invalidate();
  }
  function fit(view = 'iso') {
    sizeViewport();
    boardGroup.updateWorldMatrix(true, true);
    const bounds=new THREE.Box3().setFromObject(boardGroup),sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : Math.hypot(width, height, thickness + 5) / 2;
    const center = sphere.radius > 0 ? sphere.center : new THREE.Vector3();
    const preset=boardViewPreset(view),direction = new THREE.Vector3(...preset.direction).normalize();
    const distance = boxFitDistance(bounds.getSize(new THREE.Vector3()).toArray(),direction.toArray(),camera.fov,camera.aspect,.85,preset.up)||sphereFitDistance(radius, camera.fov, camera.aspect) || extent * 3;
    fittedRadius = radius;
    controls.maxDistance = Math.max(extent * 8, distance * 4);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.up.fromArray(preset.up); controls.target.copy(center); controls.update(); updateClipping();
  }
  action("Fit", () => {userAdjustedCamera=true;fit();},'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8Z','Fit board to viewport');
  const viewSelect=document.createElement('select');viewSelect.className='view-select';viewSelect.title='Choose a board viewing side';viewSelect.setAttribute('aria-label','3D camera view');const viewPrompt=document.createElement('option');viewPrompt.value='';viewPrompt.disabled=true;viewPrompt.textContent='View';viewSelect.append(viewPrompt);
  for(const {id,label}of boardViewPresets){const item=document.createElement('option');item.value=id;item.textContent=label;viewSelect.append(item);}viewSelect.value='';viewSelect.onchange=()=>{userAdjustedCamera=true;fit(viewSelect.value);viewSelect.value='';};bar.append(viewSelect);
  const divider=document.createElement('span');divider.className='divider';divider.setAttribute('aria-hidden','true');bar.append(divider);
  const measureButton=action('Measure',()=>setMeasurementMode(!measuring),'M3 17 17 3l4 4L7 21ZM7 13l3 3M10 10l2 2M13 7l3 3','Measure distance between 3D surfaces');measureButton.setAttribute('aria-pressed','false');
  const displayButton=action('Display',()=>setDisplayOpen(visibilityOptions.hidden),'M3 6h18M3 12h18M3 18h18M7 3v6M17 9v6M10 15v6','3D display settings');displayButton.setAttribute('aria-expanded','false');displayButton.setAttribute('aria-controls',visibilityOptions.id);
  toggle("Front copper", true, (visible) => { groupFor("F.Cu").visible = visible; });
  toggle("Back copper", true, (visible) => { groupFor("B.Cu").visible = visible; });
  toggle("Parts", true, (visible) => { parts.visible = visible; renderer.shadowMap.needsUpdate=true; });
  toggle("Full net 3D", true, (enabled) => { fullNet3D=enabled;setSelection(externalSelection); });
  // A bounded, opt-in set of depth-tested terminal labels. The sprite material
  // preserves board/model occlusion; labels do not participate in picking or fit.
  let showTerminalLabels=false;
  const terminalLabels=new THREE.Group(),terminalLabelCache=new Map();scene.add(terminalLabels);
  const labelGeometry=new THREE.PlaneGeometry(1,1);
  const labelRecords=nativePads.filter(p=>p.name&&p.net&&p.name.length<=40&&p.net.length<=48).slice(0,10000);
  const labelPool=[],frameTextures=new Set();
  function labelTexture(pad){
    const key=JSON.stringify([pad.name,pad.net]);if(terminalLabelCache.has(key)){const texture=terminalLabelCache.get(key);terminalLabelCache.delete(key);terminalLabelCache.set(key,texture);frameTextures.add(texture);return texture;}
    if(terminalLabelCache.size>=150){const unused=[...terminalLabelCache].find(([,texture])=>!frameTextures.has(texture));if(!unused)return null;terminalLabelCache.delete(unused[0]);unused[1].dispose();}
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=48;
    const ctx=canvas.getContext('2d');ctx.font='600 14px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=5;ctx.strokeStyle='#101820';ctx.fillStyle='#f3f8fa';
    for(const [text,y] of [[pad.name,13],[pad.net,34]]){ctx.strokeText(text,256,y);ctx.fillText(text,256,y);}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;terminalLabelCache.set(key,texture);frameTextures.add(texture);return texture;
  }
  const projectedLabel=new THREE.Vector3();
  function updateTerminalLabels(){
    let count=0;frameTextures.clear();terminalLabels.visible=showTerminalLabels&&!measuring;
    if(!terminalLabels.visible)return;
    if(!objectVisibility.visible('pads'))return void labelPool.forEach(mesh=>mesh.visible=false);
    const canvasHeight=Math.max(1,canvasHost.clientHeight),canvasWidth=Math.max(1,canvasHost.clientWidth),boxes=[];
    // Label the facing saved copper surface only; no inferred internal geometry.
    const layer=camera.position.z>=controls.target.z?'F.Cu':'B.Cu';
    if(!groupFor(layer).visible||!objectVisibility.visible('pads',layer))return void labelPool.forEach(mesh=>mesh.visible=false);
    for(const pad of labelRecords){
      if(count>=150)break;
      if(!(pad.layers?.includes(layer)||pad.layers?.includes('*.Cu')||pad.layer===layer))continue;
      const [x,y]=world(pad.at),z=layer==='F.Cu'?top+.055:bottom-.055;
      const distance=camera.position.distanceTo(new THREE.Vector3(x,y,z));
      const pxPerMm=canvasHeight/(2*Math.tan(camera.fov*Math.PI/360)*distance),padPixels=Math.min(pad.width,pad.height)*pxPerMm;
      if(!Number.isFinite(padPixels)||padPixels<32)continue;
      projectedLabel.set(x,y,z).project(camera);if(projectedLabel.z< -1||projectedLabel.z>1)continue;
      const size=Math.min(16,Math.max(10,padPixels*.22)),w=(Math.max(pad.name.length,pad.net.length)*.63+1)*size,h=size*2.8;
      const sx=(projectedLabel.x+1)*canvasWidth/2,sy=(1-projectedLabel.y)*canvasHeight/2,box={x:sx-w/2,y:sy-h/2,w,h};
      if(box.x<0||box.y<0||box.x+w>canvasWidth||box.y+h>canvasHeight||boxes.some(b=>box.x<b.x+b.w&&box.x+w>b.x&&box.y<b.y+b.h&&box.y+h>b.y))continue;
      const texture=labelTexture(pad);if(!texture)continue;
      let mesh=labelPool[count];if(!mesh){mesh=new THREE.Mesh(labelGeometry,new THREE.MeshBasicMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide}));mesh.renderOrder=5;terminalLabels.add(mesh);labelPool.push(mesh);}
      if(mesh.material.map!==texture){mesh.material.map=texture;mesh.material.needsUpdate=true;}mesh.position.set(x,y,z);mesh.quaternion.copy(camera.quaternion);
      // Canvas glyphs occupy 14 px of a 512 px texture width.
      mesh.scale.set(512/14*size/pxPerMm,48/14*size/pxPerMm,1);mesh.visible=true;boxes.push(box);count++;
    }
    for(let i=count;i<labelPool.length;i++)labelPool[i].visible=false;
  }
  toggle('Pad and net names (close zoom)',false,visible=>{showTerminalLabels=visible;});

  fit();

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const measurementSession=new MeasurementSession();let measuring=false,measurementUnit='mm';
  const measurementPanel=document.createElement('section');measurementPanel.className='measurement-panel';measurementPanel.hidden=true;measurementPanel.setAttribute('aria-label','3D surface measurement');
  const measurementHeading=document.createElement('div');measurementHeading.className='measurement-heading';
  const measurementTitle=document.createElement('strong');measurementTitle.textContent='Surface distance';
  const measurementUnits=document.createElement('select');measurementUnits.setAttribute('aria-label','3D measurement units');for(const unit of ['mm','mil']){const option=document.createElement('option');option.value=unit;option.textContent=unit;measurementUnits.append(option);}
  const measurementExit=document.createElement('button');measurementExit.type='button';measurementExit.textContent='Done';measurementExit.title='Exit measurement mode';measurementExit.onclick=()=>setMeasurementMode(false);
  measurementHeading.append(measurementTitle,measurementUnits,measurementExit);
  const measurementSnap=document.createElement('select'),measurementFilter=document.createElement('select'),measurementSelection=document.createElement('div');measurementSelection.className='measurement-tools';measurementSnap.setAttribute('aria-label','3D measurement snap');measurementFilter.setAttribute('aria-label','3D measurement selection filter');
  for(const [value,label]of [['surface','Surface'],['edges','Snap to edges'],['corners','Snap to corners']]){const option=document.createElement('option');option.value=value;option.textContent=label;measurementSnap.append(option);}
  for(const [value,label]of [['all','All geometry'],['board','Board outline/body'],['models','Component models'],['pads','Pads'],['tracks','Tracks'],['vias','Vias']]){const option=document.createElement('option');option.value=value;option.textContent=label;measurementFilter.append(option);}measurementSelection.append(measurementSnap,measurementFilter);
  const measurementEdges=new WeakMap();let measurementTouch=null,measurementTouchDrag=null;const measurementPointers=new Set();
  const measurementLens=document.createElement('canvas');measurementLens.width=measurementLens.height=240;measurementLens.className='measurement-label';measurementLens.hidden=true;measurementLens.setAttribute('aria-label','3D measurement magnifier');measurementLens.style.cssText='width:120px;height:120px;position:absolute;right:12px;top:50px;left:auto;pointer-events:none;border-radius:50%;z-index:8;padding:0';stage.append(measurementLens);
  function drawMeasurementLens(){if(!measuring||!measurementTouch){measurementLens.hidden=true;return;}const rect=renderer.domElement.getBoundingClientRect(),x=measurementTouch.x-rect.left,y=measurementTouch.y-rect.top;measurementLens.hidden=false;const ctx=measurementLens.getContext('2d');if(!ctx)return;const ratioX=renderer.domElement.width/rect.width,ratioY=renderer.domElement.height/rect.height;ctx.clearRect(0,0,240,240);ctx.drawImage(renderer.domElement,(x-20)*ratioX,(y-20)*ratioY,40*ratioX,40*ratioY,0,0,240,240);ctx.strokeStyle='#ffcf66';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(110,120);ctx.lineTo(130,120);ctx.moveTo(120,110);ctx.lineTo(120,130);ctx.stroke();}

  const measurementOutput=document.createElement('output');measurementOutput.setAttribute('aria-live','polite');
  const measurementStatus=document.createElement('p');measurementStatus.setAttribute('role','status');
  const measurementDelta=document.createElement('small'),measurementDisclaimer=document.createElement('small');measurementDisclaimer.textContent='Model surfaces · footprint stand-ins are approximate.';
  const measurementTools=document.createElement('div');measurementTools.className='measurement-tools';
  const measurementHistory=document.createElement('select');measurementHistory.setAttribute('aria-label','Recent 3D measurements');
  const measurementClear=document.createElement('button');measurementClear.type='button';measurementClear.textContent='Clear';measurementClear.title='Clear all 3D measurements';measurementClear.onclick=clearMeasurements;
  measurementTools.append(measurementHistory,measurementClear);measurementPanel.append(measurementHeading,measurementSelection,measurementOutput,measurementStatus,measurementDelta,measurementTools,measurementDisclaimer);stage.append(measurementPanel);
  const measurementLabel=document.createElement('div');measurementLabel.className='measurement-label';measurementLabel.hidden=true;measurementLabel.setAttribute('aria-hidden','true');stage.append(measurementLabel);
  const measureGroup=new THREE.Group();measureGroup.visible=false;scene.add(measureGroup);
  const measureGeometry=new THREE.BufferGeometry();measureGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
  const measureMaterial=new THREE.LineBasicMaterial({color:0xffd37a,transparent:true,opacity:.95,depthTest:false,depthWrite:false,toneMapped:false});
  const measureLine=new THREE.Line(measureGeometry,measureMaterial);measureLine.frustumCulled=false;measureLine.renderOrder=201;measureGroup.add(measureLine);
  const markerGeometry=new THREE.SphereGeometry(1,12,8),markerMaterial=new THREE.MeshBasicMaterial({color:0xffd37a,transparent:true,opacity:.95,depthTest:false,depthWrite:false,toneMapped:false});
  const measureMarkers=[new THREE.Mesh(markerGeometry,markerMaterial),new THREE.Mesh(markerGeometry,markerMaterial)];for(const marker of measureMarkers){marker.renderOrder=202;measureGroup.add(marker);}
  const toWorld=point=>new THREE.Vector3(point.x-centerX,centerY-point.y,point.z);
  function updateMeasurementPanel(message){
    const current=measurementSession.selected,pending=measurementSession.pending;
    measurementOutput.textContent=current?(current.approximate?'≈ ':'')+distanceLabel(current.distance,measurementUnit):'—';
    measurementStatus.textContent=message||(pending?'Choose the second surface point.':current?'Choose a point to start another measurement.':'Choose the first surface point.');
    const signed=value=>(measurementUnit==='mil'?value/.0254:value).toFixed(measurementUnit==='mil'?2:3);
    measurementDelta.textContent=current?`ΔX ${signed(current.delta.x)} · ΔY ${signed(current.delta.y)} · ΔZ ${signed(current.delta.z)} ${measurementUnit}`:'';
    measurementHistory.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent=measurementSession.records.length?'Recent measurements':'No measurements yet';measurementHistory.append(prompt);
    for(const record of measurementSession.records){const option=document.createElement('option');option.value=String(record.id);option.textContent=`#${record.id} · ${record.approximate?'≈ ':''}${distanceLabel(record.distance,measurementUnit)}`;measurementHistory.append(option);}measurementHistory.value=current?String(current.id):'';measurementHistory.disabled=!measurementSession.records.length;
    measurementLabel.textContent=current?(current.approximate?'≈ ':'')+distanceLabel(current.distance,measurementUnit):'';
    updateMeasurementGraphics();invalidate();
  }
  function updateMeasurementGraphics(){
    const current=measurementSession.selected,pending=measurementSession.pending;measureGroup.visible=measuring&&Boolean(current||pending);measurementLabel.hidden=!measuring||!current;
    if(!measureGroup.visible)return;const from=toWorld(current?.from||pending),to=current?toWorld(current.to):null;measureMarkers[0].position.copy(from);measureMarkers[1].visible=Boolean(to);measureLine.visible=Boolean(to);
    if(to){measureMarkers[1].position.copy(to);const positions=measureGeometry.getAttribute('position');positions.setXYZ(0,from.x,from.y,from.z);positions.setXYZ(1,to.x,to.y,to.z);positions.needsUpdate=true;
      const center=from.clone().add(to).multiplyScalar(.5).project(camera);measurementLabel.hidden=center.z<-1||center.z>1;
      measurementLabel.style.left=Math.max(8,Math.min(canvasHost.clientWidth-measurementLabel.offsetWidth-8,(center.x+1)*canvasHost.clientWidth/2+8))+'px';measurementLabel.style.top=Math.max(8,Math.min(canvasHost.clientHeight-measurementLabel.offsetHeight-8,(1-center.y)*canvasHost.clientHeight/2-24))+'px';
    }
    for(const marker of measureMarkers){const radius=Math.max(.005,camera.position.distanceTo(marker.position)*2*Math.tan(camera.fov*Math.PI/360)/Math.max(1,canvasHost.clientHeight)*3.5);marker.scale.setScalar(radius);}
  }
  function setMeasurementMode(enabled){if(!active)return false;measuring=Boolean(enabled);host.dataset.measuring=String(measuring);measureButton.setAttribute('aria-pressed',String(measuring));measurementPanel.hidden=!measuring;if(!measuring){measurementSession.pending=null;measurementTouch=null;measurementTouchDrag=null;measurementPointers.clear();controls.enabled=true;measurementLens.hidden=true;}updateMeasurementPanel();options.onMeasurementMode?.(measuring);return measuring;}
  function clearMeasurements(){measurementSession.clear();updateMeasurementPanel();options.onMeasurement?.(null);}
  measurementUnits.onchange=()=>{measurementUnit=measurementUnits.value==='mil'?'mil':'mm';updateMeasurementPanel();};
  measurementHistory.onchange=()=>{const record=measurementSession.replay(measurementHistory.value);if(record){updateMeasurementPanel();options.onMeasurement?.(record);}};
  const escapeMeasurement=event=>{if(event.key==='Escape'&&measuring){event.preventDefault();event.stopPropagation();setMeasurementMode(false);measureButton.focus();}};
  shadow.addEventListener('keydown',escapeMeasurement);
  function measurementPoint(){
    const visible=item=>{for(let node=item;node;node=node.parent)if(!node.visible)return false;return true;};
    const hit=raycaster.intersectObjects(pickables.filter(visible),false)[0];if(!hit)return null;
    const rawCategory=hit.object===substrate?'board':visibilityRecords.find(record=>record.mesh===hit.object)?.type||'models',category=rawCategory==='arcs'?'tracks':rawCategory;
    if(measurementFilter.value!=='all'&&measurementFilter.value!==category)return null;
    if(measurementSnap.value==='surface')return{point:hit.point,approximate:hit.object===componentMesh,kind:'surface'};
    const geometry=hit.object.geometry,positions=geometry?.getAttribute('position');if(!positions||positions.count>200000)return null;
    let edges=measurementEdges.get(geometry);if(!edges){const wire=new THREE.EdgesGeometry(geometry,25),p=wire.getAttribute('position');edges=[];for(let i=0;i+1<p.count&&edges.length<10000;i+=2)edges.push([[p.getX(i),p.getY(i),p.getZ(i)],[p.getX(i+1),p.getY(i+1),p.getZ(i+1)]]);wire.dispose();measurementEdges.set(geometry,edges);}
    const matrix=hit.object.matrixWorld.clone();if(Number.isInteger(hit.instanceId)){const instance=new THREE.Matrix4();hit.object.getMatrixAt(hit.instanceId,instance);matrix.multiply(instance);}
    const transformed=edges.map(edge=>edge.map(p=>{const v=new THREE.Vector3(...p).applyMatrix4(matrix);return{x:v.x,y:v.y,z:v.z};})),rect=renderer.domElement.getBoundingClientRect();
    const project=p=>{const clip=new THREE.Vector4(p.x,p.y,p.z,1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);if(clip.w<=0)return null;return{x:(clip.x/clip.w+1)*rect.width/2,y:(1-clip.y/clip.w)*rect.height/2,z:clip.z/clip.w,w:clip.w};};
    const result=snapProjectedEdges({x:(pointer.x+1)*rect.width/2,y:(1-pointer.y)*rect.height/2},transformed,project,{mode:measurementSnap.value,tolerance:measurementTouch?18:12});if(!result)return null;
    const point=new THREE.Vector3(result.point.x,result.point.y,result.point.z),screen=point.clone().project(camera),checkRay=new THREE.Raycaster();checkRay.setFromCamera(new THREE.Vector2(screen.x,screen.y),camera);const first=checkRay.intersectObjects(pickables.filter(visible),false)[0];
    if(!first||first.object!==hit.object||first.instanceId!==hit.instanceId||first.point.distanceTo(point)>Math.max(.002,camera.position.distanceTo(point)*.00005))return null;
    return{point,approximate:hit.object===componentMesh,kind:result.kind};
  }
  function measureSurface(){
    const hit=measurementPoint();if(!hit){updateMeasurementPanel('No visible feature within snap range. Adjust snap/filter or zoom in.');return;}
    const result=measurementSession.add({x:hit.point.x+centerX,y:centerY-hit.point.y,z:hit.point.z,approximate:hit.approximate});
    updateMeasurementPanel(hit.kind+' selected. '+(measurementSession.pending?'Choose the second point.':'Measurement complete.'));if(result?.distance!==undefined)options.onMeasurement?.(result);
  }
  let selected = null;
  const gesture = tapGesture();
  let selectionDim=true;
  const selectionAppearance=createSelectionAppearance(THREE,()=>{const objects=[];boardGroup.traverse(object=>{if(object.material)objects.push(object);});return objects;});
  selectionAppearanceReady=true;
  const selectionLimit = 2000;
  // Draw only the twelve box edges, never the triangles of a solid cube.
  const outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const unitEdges = outlineGeometry.getAttribute('position');
  const groupGeometry = new THREE.BufferGeometry();
  const groupPositions = new THREE.BufferAttribute(new Float32Array(selectionLimit * unitEdges.count * 3), 3);
  groupPositions.setUsage(THREE.DynamicDrawUsage); groupGeometry.setAttribute('position', groupPositions);
  groupGeometry.setDrawRange(0, 0);
  const outlineMaterial = () => new THREE.LineBasicMaterial({ color: initialDark ? 0xffdf7d : 0x9b5500,
    depthTest: true, depthWrite: false, toneMapped: false });
  const groupHighlight = new THREE.LineSegments(groupGeometry, outlineMaterial());
  groupHighlight.frustumCulled = false; groupHighlight.renderOrder = 101;
  scene.add(groupHighlight);
  let externalSelection = {};
  const selectionNotice = document.createElement('div'); selectionNotice.className = 'hint'; selectionNotice.style.bottom = '42px'; selectionNotice.hidden = true; stage.append(selectionNotice);
  function setSelection(selection = {}) {
    invalidate();
    externalSelection = selection || {};
    const matches = selectionMatcher(externalSelection, board);
    const netState=netInspection.update(externalSelection,fullNet3D);
    netInspectionHelp.hidden=!netState.active;
    netInspectionHelp.textContent='Full net 3D reveals saved copper on all layers, including hidden layers, through translucent grey context. '+netState.warnings.slice(0,2).join(' ');
    netInspectionHelp.title=netState.warnings.join('\n');
    hint.textContent=netState.active?'Full net 3D · '+netState.nets.join(', ')+' · '+netState.tracks+' track segments · '+netState.vias+' vias'+(netState.omitted?' · '+netState.omitted+' omitted (see Display)':''):'Drag to orbit · right-drag to pan · wheel to zoom · click to inspect';
    if(netState.active){
      groupGeometry.setDrawRange(0,0);highlight.visible=false;
      selectionNotice.hidden=!netState.omitted;selectionNotice.style.display=netState.omitted?'block':'none';
      selectionNotice.textContent=netState.omitted+' selected primitives omitted; see Display for geometry notes.';
      selectionAppearance.update(matches,true,{translucent:true});
      const visible=netState.tracks+netState.pads+netState.vias+netState.platedPads+netState.fills+netState.boundaries;
      return {highlighted:visible,matched:visible,limited:netState.omitted>0||netState.sourceLimited,fullNet3D:true};
    }
    const matrix = new THREE.Matrix4(), local = new THREE.Matrix4(), box = new THREE.Box3();
    const center = new THREE.Vector3(), size = new THREE.Vector3();
    let count = 0, total = 0;
    const selectedBounds = new Map();
    const append = (object, instanceId, record) => {
      if (Number.isInteger(instanceId)) {
        object.getMatrixAt(instanceId, local);
        if (local.determinant() === 0) return;
      }

      object.updateWorldMatrix(true, false);
      if (Number.isInteger(instanceId)) {
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox(); box.copy(object.geometry.boundingBox);
        matrix.multiplyMatrices(object.matrixWorld, local); box.applyMatrix4(matrix);
      } else box.setFromObject(object);
      if (box.isEmpty()) return;
      const key = record?.ref ? 'part:' + record.ref : record?.uuid || record?.id || object.uuid + ':' + instanceId;
      if (selectedBounds.has(key)) selectedBounds.get(key).union(box);
      else if (selectedBounds.size < selectionLimit) selectedBounds.set(key, box.clone());
      else total++;

    };
    for (const object of pickables) {
      let visible = true; for (let node = object; node; node = node.parent) if (!node.visible) visible = false;
      if (!visible) continue;
      const records = object.userData.records;
      if (records) records.forEach((record, index) => { if (matches(record)) append(object, index, record); });
      else if (matches(object.userData.record)) append(object, undefined, object.userData.record);
    }
    for (const box of selectedBounds.values()) {
      box.expandByScalar(.035); box.getCenter(center); box.getSize(size);
      for (let i = 0; i < unitEdges.count; i++) groupPositions.setXYZ(count * unitEdges.count + i,
        center.x + unitEdges.getX(i) * size.x, center.y + unitEdges.getY(i) * size.y, center.z + unitEdges.getZ(i) * size.z);
      count++;
    }
    total += selectedBounds.size;
    groupGeometry.setDrawRange(0, count * unitEdges.count); groupPositions.needsUpdate = true;
    selectionNotice.hidden = total <= selectionLimit;
    selectionNotice.textContent = `Showing ${count} of ${total} selected 3D objects`;
    selectionNotice.style.display = total > selectionLimit ? 'block' : 'none';
    highlight.visible = false;
    selectionAppearance.update(matches,total>0&&selectionDim||netState.active,{translucent:netState.active});
    return { highlighted: count, matched: total, limited: total > selectionLimit };
  }
  const highlight = new THREE.LineSegments(outlineGeometry, outlineMaterial());
  highlight.matrixAutoUpdate = false;
  highlight.renderOrder = 100;
  highlight.visible = false;
  scene.add(highlight);
  const instanceMatrix = new THREE.Matrix4(), bounds = new THREE.Box3();
  const highlightCenter = new THREE.Vector3(), highlightSize = new THREE.Vector3();
  function showHighlight(object, instanceId) {
    invalidate();
    object.updateWorldMatrix(true, false);
    if (Number.isInteger(instanceId)) {
      object.getMatrixAt(instanceId, instanceMatrix);
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      bounds.copy(object.geometry.boundingBox).applyMatrix4(instanceMatrix).applyMatrix4(object.matrixWorld);
    } else bounds.setFromObject(object);
    if (bounds.isEmpty()) { highlight.visible = false; return; }
    bounds.expandByScalar(.035);
    bounds.getCenter(highlightCenter); bounds.getSize(highlightSize);
    highlight.matrix.compose(highlightCenter, new THREE.Quaternion(), highlightSize);
    highlight.matrixWorldNeedsUpdate = true;
    highlight.visible = true;
  }
  function clearSelection() {
    selected = null; inspector.hidden = true; menu.hidden = true; highlight.visible = false;
    setSelection({});
    options.onSelect?.(null);
  }
  function select(record, point, object, instanceId) {
    const mode=options.getSelectionMode?.()||selectionMode;
    setSelection(mode==='net'&&record.net?{netNames:[record.net]}:record.type==='Component'||typeof record.library==='string'?{references:[record.ref]}:{uuids:[record.uuid||record.id]});
    selected = { record, point: point.clone() };
    groupGeometry.setDrawRange(0, 0);
    if(netInspection.state().active)highlight.visible=false;else showHighlight(object, instanceId);
    options.onSelect?.(record);
    inspector.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = record.ref || record.name || record.type || "Board object";
    const list = document.createElement("dl");
    for (const [label, value] of Object.entries({ Type: record.type || (record.ref ? "Component" : "Copper"),
      Reference: record.ref, Value: record.value, Layer: record.layer || record.layers?.join(", "), Net: record.net,
      Model: record.modelPath || record.modelPaths?.join(", ") })) {
      if (value == null || value === "") continue;
      const term = document.createElement("dt"), desc = document.createElement("dd");
      term.textContent = label; desc.textContent = String(value); list.append(term, desc);
    }
    inspector.append(heading, list); inspector.hidden = Boolean(options.externalInspector);
  }
  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if(measuring){measureSurface();return;}
    if (analysisOverlay?.mesh.visible) {
      const result = analysisOverlay.sample(raycaster.intersectObject(analysisOverlay.mesh, false)[0]);
      if (result) { options.onAnalysisProbe?.(result); return; }
    }
    const visible = item => { for (let node = item; node; node = node.parent) if (!node.visible) return false; return true; };
    const hits = raycaster.intersectObjects([...pickables,...netInspection.group.children].filter(visible), false);
    const mode = options.getSelectionMode?.() || selectionMode;
    const hit = hits.find(hit=>selectableRecord(hit.object.userData.records?.[hit.instanceId] || hit.object.userData.record,mode));
    if (!hit) { clearSelection(); return; }
    const record = hit.object.userData.records?.[hit.instanceId] || hit.object.userData.record;
    if (!record) return;
    select(record, hit.point, hit.object, hit.instanceId);
  }
  let selectionMode = 'all';
  const hold = holdGesture(event => contextMenu(event));
  const measurementTouchCapture=event=>{if(measuring&&event.pointerType==='touch'&&measurementPointers.size)controls.enabled=true;};renderer.domElement.addEventListener('pointerdown',measurementTouchCapture,true);
  renderer.domElement.addEventListener("pointerdown", (event) => { gesture.down(event); hold.down(event); menu.hidden = true;if(measuring&&event.pointerType==='touch'){measurementPointers.add(event.pointerId);measurementTouchDrag=measurementPointers.size===1?event.pointerId:null;controls.enabled=measurementPointers.size!==1;measurementTouch={x:event.clientX,y:event.clientY};invalidate();} });
  renderer.domElement.addEventListener("pointermove", event => {
    gesture.move(event); hold.move(event);if(measuring&&event.pointerType==='touch'){measurementTouch={x:event.clientX,y:event.clientY};invalidate();}
    if (analysisOverlay && options.onAnalysisHover) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      options.onAnalysisHover(analysisOverlay.mesh.visible ? analysisOverlay.sample(raycaster.intersectObject(analysisOverlay.mesh, false)[0]) : null);
    }
  });
  renderer.domElement.addEventListener("pointercancel", event => { gesture.cancel(event); hold.up(event);measurementPointers.delete(event.pointerId);measurementTouchDrag=null;controls.enabled=true;measurementTouch=null;measurementLens.hidden=true; });
  renderer.domElement.addEventListener("pointerup", (event) => {
    const held = hold.up(event), tapped = gesture.up(event);
    if(measuring&&event.pointerType==='touch'){if(measurementTouchDrag===event.pointerId&&measurementPointers.size===1)pick(event);measurementPointers.delete(event.pointerId);measurementTouchDrag=null;controls.enabled=true;}else if(!held&&tapped&&event.button===0)pick(event);measurementTouch=null;measurementLens.hidden=true;
  });
  function contextMenu(event) {
    event.preventDefault?.();if(measuring)return;pick(event); if (!selected) return;
    menu.replaceChildren();
    const actions = [["Focus object", () => { controls.target.copy(selected.point); controls.update(); }],
      ["Copy reference", () => navigator.clipboard.writeText(selected.record.ref || selected.record.name || "")]];
    if (typeof options.onInspect === "function") actions.unshift(["Properties", () => options.onInspect(selected.record)]);
    if (typeof options.onComment === "function") actions.push(["Comment on object", () => options.onComment(selected.record)]);
    for (const [label, handler] of actions) {
      const button = document.createElement("button"); button.textContent = label; button.type = "button";
      button.addEventListener("click", () => { handler(); menu.hidden = true; }); menu.append(button);
    }
    const rect = stage.getBoundingClientRect();
    menu.hidden = false;
    menu.style.maxWidth = "calc(100% - 16px)"; menu.style.maxHeight = "calc(100% - 16px)"; menu.style.overflowY = "auto";
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(event.clientX - rect.left, rect.width - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY - rect.top, rect.height - bounds.height - 8))}px`;
  }
  renderer.domElement.addEventListener("contextmenu", event => {
    event.preventDefault(); if (!hold.isHeld()) contextMenu(event);
  });
  const resize = sizeViewport;
  const observer = new ResizeObserver(resize); observer.observe(canvasHost); resize();
  let analysisOverlay = null;
  const layoutFrame = requestAnimationFrame(() => { if (active) { resize(); fit(); } });
  const projectAnchor=createAnchorProjector(THREE,{objects:()=>pickables,camera,rect:()=>renderer.domElement.getBoundingClientRect(),positionToWorld:(position,side)=>{const [x,y]=world([position.x,position.y]);return new THREE.Vector3(x,y,side==='back'?bottom:top);}});
  let activeAnchor=null,anchorSignature='',viewSignature='';
  function notifyAnchor(){if(!activeAnchor)return;const point=projectAnchor(activeAnchor),signature=JSON.stringify(point);if(signature!==anchorSignature){anchorSignature=signature;options.onAnchor?.({anchor:activeAnchor,point});}}
  function notifyView(){const rect=renderer.domElement.getBoundingClientRect(),signature=JSON.stringify([camera.matrixWorld.elements,camera.projectionMatrix.elements,rect.left,rect.top,rect.width,rect.height]);if(signature!==viewSignature){viewSignature=signature;options.onViewChange?.();}notifyAnchor();}
  function drawFrame(){frame=0;if(!active||contextLost)return;controls.update();updateMeasurementGraphics();updateTerminalLabels();
    let rendered=false;try{
      if(pipeline){pipeline.composer.render();if(shaderFailure||renderer.getContext().getError()!==renderer.getContext().NO_ERROR)throw Error('Enhanced rendering failed.');}
      else renderer.render(scene,camera);
      renderCount++;rendered=true;
    }catch{
      if(pipeline){fallbackQuality('Enhanced rendering could not complete. Balanced rendering is active.');invalidate();}
      else graphicsNotice('The graphics device could not draw this view. Try Low quality or reopen 3D.');
    }
    if(rendered){drawMeasurementLens();notifyView();}
  }
  const onContextLost=event=>{event.preventDefault();contextLost=true;cancelAnimationFrame(frame);frame=0;qualitySelect.disabled=true;graphicsNotice('The graphics context was interrupted. The board and selection are retained while the browser recovers.',true);};
  const onContextRestored=()=>{if(!active)return;contextLost=false;qualitySelect.disabled=false;disposePipeline();environment?.dispose();environment=createEnvironment();scene.environment=environment?.texture||null;renderer.shadowMap.needsUpdate=true;quality='balanced';qualitySelect.value=quality;host.dataset.quality=quality;graphicsNotice('Graphics restored. Balanced rendering is active; High quality can be selected again.');sizeViewport();invalidate();};
  renderer.domElement.addEventListener('webglcontextlost',onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored',onContextRestored);
  const closeVisibility=event=>{const path=event.composedPath();if(!path.includes(displayButton)&&!path.includes(visibilityOptions))setDisplayOpen(false);};
  const escapeVisibility=event=>{if(event.key==='Escape'&&!visibilityOptions.hidden){setDisplayOpen(false,true);event.preventDefault();event.stopImmediatePropagation();}};
  document.addEventListener('pointerdown',closeVisibility);shadow.addEventListener('keydown',escapeVisibility,true);
  applyQuality(initialQuality,false);
  void loadRepositoryModels();
  return { host, board,
    objectVisibilityCapabilities(){return {supportedTypes:[...objectVisibility.supportedTypes],unsupportedTypes:['graphics','texts','regions','dimensions','rooms','footprints']};},
    setObjectVisibility(input={}) {
      const next=objectVisibilityPolicy(input||{});
      if(next.side!==objectVisibility.side||JSON.stringify(next.hiddenTypes)!==JSON.stringify(objectVisibility.hiddenTypes))userAdjustedCamera=true;
      objectVisibility=next;
      for(const {mesh,type,layer}of visibilityRecords)mesh.visible=objectVisibility.visible(type,layer);
      updateComponentVisibility();
      setSelection(externalSelection);
      return {hiddenTypes:[...objectVisibility.hiddenTypes],side:objectVisibility.side,supportedTypes:[...objectVisibility.supportedTypes],unsupportedTypes:[...objectVisibility.unsupportedTypes]};
    },
    setMeasurementMode,clearMeasurements,
    measurementState(){return{mode:measuring,unit:measurementUnit,...measurementSession.snapshot()};},
    setQuality(value){return applyQuality(value);},
    getRenderStats(){const plan=qualityViewport(canvasHost.clientWidth,canvasHost.clientHeight,globalThis.devicePixelRatio,graphics.maxDimension,quality,graphics);return{...plan,graphicsTier:graphics.tier,defaultQuality:graphics.defaultQuality,maxDimension:graphics.maxDimension,antialias:gl.getContextAttributes()?.antialias===true,floatTargets:graphics.premium||renderer.extensions.has('EXT_color_buffer_float'),environmentLighting:Boolean(scene.environment),ambientOcclusion:Boolean(pipeline),renderCount,contextLost,gpuTextures:renderer.info.memory.textures,drawCalls:renderer.info.render.calls,loadedModelCount:loadedModelIndexes.size,componentCount:board.components.length};},
    setAnalysisOverlay(surface) {
      if (!active) return { placed: false, reason: "3D viewer is closed." };
      if (!surface) { analysisOverlay?.dispose(); analysisOverlay = null; invalidate();return { placed: false, reason: "Overlay cleared." }; }
      const basis = surface.zBasis;
      const savedLayer = surface.layer;
      if ((surface.zKnown && !["front-depth", "board-center"].includes(basis)) || (!surface.zKnown && !["F.Cu", "B.Cu"].includes(savedLayer))) return { placed: false, reason: "Saved result elevation basis or board layer is unknown; use the standalone result scene." };
      const transform = ([x, y, z]) => [x - centerX, centerY - y, surface.zKnown ? (basis === "front-depth" ? thickness / 2 - z : z) : (savedLayer === "F.Cu" ? thickness / 2 : -thickness / 2)];
      const next = createResultOverlay(surface, transform);
      // Internal copper/thermal layers must remain inspectable on the opaque PCB.
      // The result UI identifies this as showing the selected field through the board.
      next.mesh.material.depthTest = false; next.mesh.renderOrder = 20;
      analysisOverlay?.dispose(); analysisOverlay = next; scene.add(next.group);
      invalidate();
      return { placed: true, basis: surface.zKnown ? basis : savedLayer, flat: !surface.zKnown };
    },
    setAnalysisProbes(probes) { analysisOverlay?.setProbes(probes);invalidate(); },
    setAnalysisOpacity(value) { analysisOverlay?.setOpacity(value);invalidate(); },
    setSelection,
    projectAnchor,
    setAnchor(anchor){activeAnchor=anchor&&typeof anchor==='object'?anchor:null;anchorSignature='';if(activeAnchor)notifyAnchor();else options.onAnchor?.({anchor:null,point:null});},
    setSelectionDim(enabled){selectionDim=Boolean(enabled);setSelection(externalSelection);return selectionDim;},
    selectionAppearanceCapabilities(){return {dim:true,instanceColors:true,desaturatesTextures:true,fullNet3d:true,internalCopper:true,viaSpans:true,translucentContext:true};},
    getNetInspectionState(){return netInspection.state();},
    setFullNet3D(enabled){fullNet3D=Boolean(enabled);setSelection(externalSelection);return fullNet3D;},
    setSelectionMode(mode){selectionMode=['all','part','net','pin'].includes(mode)?mode:'all';},
    focusPosition(position,{bounds,side='front'}={}){
      if(!active||![position?.x,position?.y].every(value=>Number.isFinite(value)&&Math.abs(value)<=1e6))return false;
      sizeViewport();const [x,y]=world([position.x,position.y]),target=new THREE.Vector3(x,y,side==='back'?bottom:top),direction=camera.position.clone().sub(controls.target);
      if(direction.lengthSq()<1e-10)direction.set(.45,-.38,1);direction.normalize();direction.z=(side==='back'?-1:1)*Math.abs(direction.z||.3);direction.normalize();
      const w=Number.isFinite(bounds?.w)?Math.max(8,Math.min(1e6,bounds.w*1.3)):8,h=Number.isFinite(bounds?.h)?Math.max(8,Math.min(1e6,bounds.h*1.3)):8;
      const distance=boxFitDistance([w,h,thickness+4],direction.toArray(),camera.fov,camera.aspect,.8,camera.up.toArray());if(!distance)return false;
      userAdjustedCamera=true;controls.maxDistance=Math.max(controls.maxDistance,distance*2);camera.position.copy(target).addScaledVector(direction,Math.max(controls.minDistance,distance));controls.target.copy(target);controls.update();updateClipping();invalidate();return true;
    },
    fit(topView=false){if(active)fit(topView);},
    setView(view){if(!active||!boardViewPresets.some(preset=>preset.id===view))return false;userAdjustedCamera=true;fit(view);return true;},
    zoom(factor){if(!active||!Number.isFinite(factor)||factor<=0)return;const offset=camera.position.clone().sub(controls.target);const distance=Math.max(controls.minDistance,Math.min(controls.maxDistance,offset.length()/factor));if(offset.length()>0)camera.position.copy(controls.target).add(offset.setLength(distance));controls.update();},
    setTheme(dark) {
      if (!active) return;
      host.dataset.theme = dark ? "dark" : "light";
      scene.background.setHex(dark ? 0x151820 : 0xe7ebf1);
      highlight.material.color.setHex(dark ? 0xffdf7d : 0x9b5500);
      groupHighlight.material.color.setHex(dark ? 0xffdf7d : 0x9b5500);
      resize();
      invalidate();
    },
    selectReference(reference) {
      const index = componentIndexes.get(reference);
      if (index == null || !componentMesh || !componentMatrices[index] || !active || !population[index]) return false;
      const model = modelGroups.get(index);
      if (model?.children.length) {
        const record = board.components[index];
        const [x, y] = world(record.at);
        select(record, new THREE.Vector3(x, y, record.layer?.startsWith("B.") ? bottom : top), model);
        return true;
      }
      const current = new THREE.Matrix4(); componentMesh.getMatrixAt(index, current);
      if (current.determinant() === 0) return false;
      const record = board.components[index];
      const [x, y] = world(record.at);
      const point = new THREE.Vector3(x, y, record.layer?.startsWith("B.") ? bottom - 1.1 : top + 1.1);
      componentMesh.localToWorld(point);
      select(record, point, componentMesh, index);
      return true;
    },
    setPopulation(entries) {
      if (!componentMesh || !active) return;
      population = populationMask(board.components, entries);
      updateComponentVisibility();
      setSelection(externalSelection);
      if (selected?.record?.ref) {
        const index = componentIndexes.get(selected.record.ref);
        if (index != null && !population[index]) clearSelection();
      }
    },
    dispose() { if(measuring)options.onMeasurementMode?.(false);active = false; analysisOverlay?.dispose(); stepClient?.dispose(); cancelAnimationFrame(frame); cancelAnimationFrame(layoutFrame); observer.disconnect();controls.removeEventListener('change',invalidate); controls.removeEventListener("change", updateClipping); controls.removeEventListener("start", cameraInteraction); controls.dispose();disposePipeline();environment?.dispose();renderer.domElement.removeEventListener('webglcontextlost',onContextLost);renderer.domElement.removeEventListener('webglcontextrestored',onContextRestored);document.removeEventListener('pointerdown',closeVisibility);shadow.removeEventListener('keydown',escapeVisibility,true);shadow.removeEventListener('keydown',escapeMeasurement);
    renderer.domElement.removeEventListener('pointerdown',measurementTouchCapture,true);netInspection.dispose();selectionAppearance.dispose();const resources = new Set(); scene.traverse((object) => {object.shadow?.dispose?.(); if (object.geometry) resources.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((item) => resources.add(item)); }); resources.forEach((item) => item.dispose());terminalLabelCache.forEach(texture=>texture.dispose()); labelGeometry.dispose(); hold.dispose(); renderer.dispose(); host.remove(); } };
}
