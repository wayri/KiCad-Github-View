/** Bounded static VRML adapter. No evaluation, imports, URLs or dynamic events. */
export const VRML_SOURCE_LIMITS=Object.freeze({bytes:8*1024*1024,tokens:250000,nodes:50000,depth:96,outputBytes:8*1024*1024,dependencies:250000,expandedNodes:100000,expandedTokens:1000000});
const supported=new Set('Anchor Group Transform Collision Background Shape Appearance Material PixelTexture TextureTransform IndexedFaceSet IndexedLineSet PointSet Box Cone Cylinder Sphere ElevationGrid Extrusion Color Coordinate Normal TextureCoordinate WorldInfo Switch'.split(' '));
const denied=new Set('Inline ImageTexture MovieTexture AudioClip Script ROUTE PROTO EXTERNPROTO IMPORT EXPORT IS'.split(' '));
const number=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
function lex(source,limits){
 const tokens=[];let i=0;while(i<source.length){const c=source[i];if(/\s|,/.test(c)){i++;continue;}if(c==='#'){while(i<source.length&&source[i]!=='\n')i++;continue;}
  const start=i;if(c==='"'){i++;let closed=false;while(i<source.length){const n=source[i++];if(n==='\\'){if(i>=source.length)break;i++;}else if(n==='"'){closed=true;break;}else if(n==='\n'||n==='\r')throw Error('Unescaped newline in VRML string.');}if(!closed)throw Error('Unterminated VRML string.');tokens.push({kind:'string',value:source.slice(start,i),start,end:i});}
  else if('{}[]'.includes(c)){i++;tokens.push({kind:'punct',value:c,start,end:i});}
  else{while(i<source.length&&!/[\s,{}[\]"#]/.test(source[i]))i++;if(i===start)throw Error('Invalid VRML token.');const value=source.slice(start,i);if(denied.has(value)||value==='url')throw Error('VRML external resources, scripts and dynamic constructs are not supported: '+value);if(number.test(value)&&!Number.isFinite(Number(value)))throw Error('Invalid nonfinite VRML number.');tokens.push({kind:'word',value,start,end:i});}
  if(tokens.length>limits.tokens)throw Error('VRML token limit exceeded.');
 }
 return tokens;
}
export function prepareVRMLSource(source,overrides={}){
 const limits={...VRML_SOURCE_LIMITS,...overrides};for(const key of Object.keys(VRML_SOURCE_LIMITS))if(!Number.isInteger(limits[key])||limits[key]<1||limits[key]>VRML_SOURCE_LIMITS[key])throw Error('Invalid VRML source budget.');
 if(typeof source!=='string'||source.length>limits.bytes||new TextEncoder().encode(source).length>limits.bytes)throw Error('VRML model exceeds its input byte limit.');if(!/^#VRML V2\.0 utf8(?:\r?\n|$)/.test(source))throw Error('Only saved VRML V2.0 utf8 models are supported.');
 const tokens=lex(source,limits),definitions=new Map(),at=new Map(),roots=[];let cursor=0,nodes=0,switches=0;
 const startsNode=index=>tokens[index]?.value==='DEF'||tokens[index]?.value==='USE'||tokens[index]?.value==='NULL'||tokens[index]?.kind==='word'&&tokens[index+1]?.value==='{';
 function scan(close,children,depth){if(depth>limits.depth)throw Error('VRML nesting limit exceeded.');while(cursor<tokens.length&&tokens[cursor].value!==close){if(startsNode(cursor))children.push(parseNode(depth+1));else if(tokens[cursor].value==='['){cursor++;scan(']',children,depth+1);}else if(['}',']','{'].includes(tokens[cursor].value))throw Error('Unbalanced VRML node or array.');else cursor++;}if(tokens[cursor]?.value!==close)throw Error('Incomplete VRML node or array.');cursor++;}
 function parseNode(depth){
  if(depth>limits.depth||++nodes>limits.nodes)throw Error('VRML node/nesting limit exceeded.');const index=cursor,start=tokens[cursor]?.start,node={index,start,children:[]};at.set(index,node);
  if(tokens[cursor]?.value==='DEF'){cursor++;const name=tokens[cursor++];if(name?.kind!=='word')throw Error('Invalid VRML DEF identifier.');node.def=name.value;node.defToken=name;if(definitions.has(node.def))throw Error('Duplicate VRML DEF identity is unsupported: '+node.def);definitions.set(node.def,node);}
  const token=tokens[cursor++];if(!token)throw Error('Incomplete VRML node.');node.type=token.value;node.typeToken=token;
  if(node.type==='USE'){if(node.def)throw Error('DEF USE is not a supported VRML node.');const ref=tokens[cursor++];if(ref?.kind!=='word')throw Error('Invalid VRML USE identifier.');node.reference=ref.value;node.refToken=ref;}
  else if(node.type!=='NULL'){if(!supported.has(node.type))throw Error('Unsupported static VRML node: '+node.type);if(tokens[cursor++]?.value!=='{')throw Error('Expected a VRML node body.');node.body=cursor;scan('}',node.children,depth);node.close=cursor-1;}
  node.endIndex=cursor;node.end=tokens[cursor-1].end;return node;
 }
 while(cursor<tokens.length){if(!startsNode(cursor))throw Error('Unsupported VRML statement: '+tokens[cursor].value);roots.push(parseNode(1));}
 // Three's grouping-node builder ignores these VRML transform fields. Accept only
 // their effective defaults rather than silently moving a saved model incorrectly.
 for(const node of at.values())if(node.type==='Transform'){
  const seen=new Set();for(let i=node.body;i<node.close;){const child=at.get(i);if(child){i=child.endIndex;continue;}const field=tokens[i++];if(field.kind!=='word'||!['center','scaleOrientation'].includes(field.value))continue;
   if(seen.has(field.value))throw Error('Duplicate VRML Transform field: '+field.value);seen.add(field.value);const count=field.value==='center'?3:4,values=[];
   for(let j=0;j<count;j++){const token=tokens[i++];if(!token||!number.test(token.value))throw Error('Invalid VRML Transform '+field.value+'.');values.push(Number(token.value));}
   if(field.value==='center'?values.some(value=>value!==0):values[3]!==0)throw Error('VRML Transform.'+field.value+' is not supported with nondefault values. Bake the transform into model coordinates or export a self-contained GLB/STEP model.');
  }
 }
 for(const node of at.values())if(node.type==='Switch'){
  switches++;let i=node.body,choice=-1,choices=[],seen=new Set();while(i<node.close){const field=tokens[i++].value;if(seen.has(field))throw Error('Duplicate VRML Switch field: '+field);seen.add(field);
   if(field==='whichChoice'){const value=tokens[i++];if(value?.kind!=='word'||!/^[-+]?\d+$/.test(value.value)||!Number.isSafeInteger(Number(value.value)))throw Error('VRML Switch requires a static integer whichChoice.');choice=Number(value.value);}
   else if(field==='choice'){if(tokens[i]?.value==='['){i++;while(tokens[i]?.value!==']'){const child=at.get(i);if(!child||child.endIndex>node.close)throw Error('Unsupported VRML Switch choice list.');choices.push(child);i=child.endIndex;}i++;}else{const child=at.get(i);if(!child)throw Error('Unsupported VRML Switch choice value.');choices=[child];i=child.endIndex;}}
   else if(field==='bboxCenter'||field==='bboxSize'){for(let j=0;j<3;j++)if(!number.test(tokens[i++]?.value||''))throw Error('Invalid VRML Switch bounds.');}
   else throw Error('Unsupported dynamic or unknown VRML Switch field: '+field);
  }
  // VRML97: negative or out-of-range choice displays no children.
  node.selected=choice>=0&&choice<choices.length&&choices[choice].type!=='NULL'?choices[choice]:null;
 }
 let edges=0;const dependencies=new Map();function uses(node,result){if(node.type==='USE'){if(!definitions.has(node.reference))throw Error('Undefined VRML USE identity: '+node.reference);if(!result.has(node.reference)&&++edges>limits.dependencies)throw Error('VRML dependency limit exceeded.');result.add(node.reference);}for(const child of node.children)uses(child,result);}
 for(const [name,node]of definitions){const set=new Set();uses(node,set);dependencies.set(name,set);}for(const node of roots)uses(node,new Set());
 const colors=new Map();function check(name,depth){if(depth>limits.depth)throw Error('VRML reference depth limit exceeded.');if(colors.get(name)===1)throw Error('Cyclic VRML DEF/USE identity.');if(colors.get(name)===2)return;colors.set(name,1);for(const next of dependencies.get(name)||[])check(next,depth+1);colors.set(name,2);}for(const name of definitions.keys())check(name,1);
 // Three clones Object3D USE subtrees. Bound the fully expanded DAG before invoking it,
 // independently of the much smaller serialized DEF/USE text.
 const costs=new Map();function cost(node,depth){
  if(depth>limits.depth)throw Error('VRML expanded reference depth limit exceeded.');if(costs.has(node))return costs.get(node);
  let count=1,weight=node.endIndex-node.index,height=1;
  if(node.type==='USE'){const value=cost(definitions.get(node.reference),depth+1);count+=value.nodes;weight+=value.tokens;height=Math.max(height,value.depth+1);}
  else if(node.type==='Switch'){weight=8;if(node.selected){const value=cost(node.selected,depth+1);count+=value.nodes;weight+=value.tokens;height=Math.max(height,value.depth+1);}}
  else for(const child of node.children){const value=cost(child,depth+1);count+=value.nodes;weight+=value.tokens-(child.endIndex-child.index);height=Math.max(height,value.depth+1);}
  if(height>limits.depth)throw Error('VRML expanded reference depth limit exceeded.');if(count>limits.expandedNodes||weight>limits.expandedTokens)throw Error('Expanded VRML DEF/USE graph exceeds its budget.');const value={nodes:count,tokens:weight,depth:height};costs.set(node,value);return value;
 }
 let expandedNodes=0,expandedTokens=0;for(const root of roots){const value=cost(root,1);expandedNodes+=value.nodes;expandedTokens+=value.tokens;if(expandedNodes>limits.expandedNodes||expandedTokens>limits.expandedTokens)throw Error('Expanded VRML DEF/USE graph exceeds its budget.');}
 const aliases=new Map(),identifiers=new Map(),words=new Set(tokens.filter(t=>t.kind==='word').map(t=>t.value));let aliasNumber=0;
 for(const name of definitions.keys()){let alias;do{alias='KiViewStaticDef'+aliasNumber++;}while(words.has(alias));aliases.set(name,alias);identifiers.set(alias,name);}
 const visibleDefs=new Set();function visible(node){if(node.def)visibleDefs.add(node.def);if(node.type==='Switch'){if(node.selected)visible(node.selected);}else for(const child of node.children)visible(child);}roots.forEach(visible);
 const chunks=[],emitted=new Set();let outputBytes=0,emissions=0;const encoder=new TextEncoder();function write(text){outputBytes+=encoder.encode(text).length;if(outputBytes>limits.outputBytes)throw Error('Expanded VRML output exceeds its byte limit.');chunks.push(text);}
 function emit(node,depth){if(depth>limits.depth||++emissions>limits.nodes*4)throw Error('Expanded VRML node/reference budget exceeded.');
  if(node.type==='USE'){if(!visibleDefs.has(node.reference)&&!emitted.has(node.reference))return emit(definitions.get(node.reference),depth+1);write(source.slice(node.start,node.refToken.start));write(aliases.get(node.reference));return;}
  if(node.def&&emitted.has(node.def)){write('USE '+aliases.get(node.def));return;}if(node.def)emitted.add(node.def);
  if(node.type==='Switch'){if(node.def){write(source.slice(node.start,node.defToken.start));write(aliases.get(node.def));write(source.slice(node.defToken.end,node.typeToken.start));}write('Group { children [ ');if(node.selected)emit(node.selected,depth+1);write(' ] }');return;}
  let from=node.start;if(node.def){write(source.slice(from,node.defToken.start));write(aliases.get(node.def));from=node.defToken.end;}
  for(const child of node.children){write(source.slice(from,child.start));emit(child,depth+1);from=child.end;}write(source.slice(from,node.end));
 }
 let from=0;for(const node of roots){write(source.slice(from,node.start));emit(node,1);from=node.end;}write(source.slice(from));return {source:chunks.join(''),identifiers,staticSwitches:switches,inputBytes:encoder.encode(source).length,outputBytes,expandedNodes,expandedTokens};
}
export function restoreVRMLNames(scene,identifiers){
 const seen=new Set(),restore=object=>{if(object&&!seen.has(object)){seen.add(object);if(identifiers.has(object.name))object.name=identifiers.get(object.name);}};
 scene.traverse(object=>{restore(object);restore(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])restore(material);});return scene;
}
