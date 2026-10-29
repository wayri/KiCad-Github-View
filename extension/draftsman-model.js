/* Revision-bound drawing-sheet data and safe SVG composition. No CAD edits or network. */
((root)=>{'use strict';
 const SCHEMA='pocket-kivi-draftsman/v1',MAX_BYTES=4*1024*1024,MAX_SVG=32*1024*1024;
 const papers=Object.freeze({A4:[210,297],A3:[297,420],Letter:[215.9,279.4]});
 const fail=message=>{throw Error('Draftsman: '+message);};
 const bytes=value=>new TextEncoder().encode(value).length;
 const fields=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail('Unsupported or unexpected document field.');};
 const text=(value,max=200,empty=true)=>{if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))fail('Invalid text field.');return value;};
 const number=(value,min,max)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('Invalid measurement or page coordinate.');return value;};
 const id=value=>{if(typeof value!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(value))fail('Invalid item identifier.');return value;};
 const file=value=>{text(value,500,false);if(value.startsWith('/')||/[\\\x00-\x1f\x7f?#%:]/.test(value)||value.split('/').some(v=>!v||v==='.'||v==='..')||! /\.kicad_(pcb|sch)$/i.test(value))fail('Invalid source drawing path.');return value;};
 const point=value=>{fields(value,['x','y']);return{x:number(value.x,-1e6,1e6),y:number(value.y,-1e6,1e6)};};
 function source(value){
  fields(value,['provider','host','repository','ref','hashes']);
  if(!['github','gitlab','local'].includes(value.provider))fail('Invalid source provider.');
  const repository=text(value.repository,300,false),ref=text(value.ref,200,false);if(/[\s\\?#%]/.test(repository)||repository.split('/').some(v=>!v||v==='.'||v==='..')||/[\x00-\x20\\?#%]/.test(ref)||ref.includes('..'))fail('Invalid source repository or revision.');
  const result={provider:value.provider,repository,ref};
  if(value.host!==undefined){let host;try{host=new URL(value.host);}catch{fail('Invalid source host.');}if(host.protocol!=='https:'||host.username||host.password||host.search||host.hash||host.pathname!=='/'||host.origin!==value.host)fail('Invalid source host.');result.host=host.origin;}
  if(value.hashes!==undefined){fields(value.hashes,Object.keys(value.hashes));const keys=Object.keys(value.hashes);if(keys.length>128)fail('Too many source fingerprints.');result.hashes={};for(const name of keys){file(name);if(!/^[a-f0-9]{64}$/.test(value.hashes[name]))fail('Invalid source fingerprint.');Object.defineProperty(result.hashes,name,{value:value.hashes[name],enumerable:true,writable:true,configurable:true});}}
  return result;
 }
 function pageSize(doc){if(!papers[doc.paper]||!['landscape','portrait'].includes(doc.orientation))fail('Invalid paper size or orientation.');const [short,long]=papers[doc.paper];return doc.orientation==='landscape'?{width:long,height:short}:{width:short,height:long};}
 function sameSource(a,b){const left=source(a),right=source(b);for(const key of ['provider','host','repository','ref'])if((left[key]||'')!==(right[key]||''))fail('Document belongs to a different source revision.');if(right.hashes){const names=new Set([...Object.keys(left.hashes||{}),...Object.keys(right.hashes)]);for(const name of names)if(left.hashes?.[name]!==right.hashes[name])fail('Source drawing fingerprint changed: '+name);}}
 function validate(input,expectedSource){
  let raw;try{raw=typeof input==='string'?input:JSON.stringify(input);}catch{fail('Document is not JSON.');}if(typeof raw!=='string'||bytes(raw)>MAX_BYTES)fail('Document exceeds 4 MiB.');let doc;try{doc=JSON.parse(raw);}catch{fail('Invalid document JSON.');}
  fields(doc,['schema','source','template','title','revision','company','units','precision','paper','orientation','accent','fontSize','lineWidth','pages']);if(doc.schema!==SCHEMA)fail('Unsupported document version.');if(doc.template===undefined)doc.template='modern';if(!['modern','kicad'].includes(doc.template))fail('Unsupported worksheet template.');doc.source=source(doc.source);if(expectedSource)sameSource(doc.source,expectedSource);
  text(doc.title,200);text(doc.revision,80);text(doc.company,200);if(!['mm','in'].includes(doc.units)||!Number.isInteger(doc.precision)||doc.precision<0||doc.precision>4)fail('Invalid units or precision.');if(!/^#[0-9a-fA-F]{6}$/.test(doc.accent))fail('Invalid drawing accent.');number(doc.fontSize,2,5);number(doc.lineWidth,.1,1);const size=pageSize(doc);
  if(!Array.isArray(doc.pages)||!doc.pages.length||doc.pages.length>20)fail('Document must have 1–20 sheets.');const pageIds=new Set(),viewIds=new Set();
  for(const page of doc.pages){fields(page,['id','title','items']);id(page.id);if(pageIds.has(page.id))fail('Duplicate sheet identifier.');pageIds.add(page.id);text(page.title,160);if(!Array.isArray(page.items)||page.items.length>200)fail('A sheet supports at most 200 drawing items.');const itemIds=new Set(),views=new Map();
   for(const item of page.items){id(item?.id);if(itemIds.has(item.id))fail('Duplicate drawing item identifier.');itemIds.add(item.id);
    if(item.type==='view'){if(viewIds.has(item.id))fail('Drawing view identifiers must be unique across sheets.');viewIds.add(item.id);fields(item,['id','type','file','side','layers','x','y','width','height','rotation','scale','caption']);file(item.file);if(!['top','bottom'].includes(item.side)||![0,90,180,270].includes(item.rotation)||item.scale!=='fit'&&!(typeof item.scale==='number'&&Number.isFinite(item.scale)&&item.scale>=.01&&item.scale<=100))fail('Invalid drawing view.');if(!Array.isArray(item.layers)||item.layers.length>128||new Set(item.layers).size!==item.layers.length)fail('Invalid view layer selection.');for(const layer of item.layers)text(layer,80,false);text(item.caption,200);number(item.x,8,size.width-8);number(item.y,12,size.height-36);number(item.width,5,size.width-16);number(item.height,5,size.height-48);if(item.x+item.width>size.width-8||item.y+item.height>size.height-36)fail('Drawing view is outside the sheet drawing area.');views.set(item.id,item);}
    else if(item.type==='dimension'){fields(item,['id','type','viewId','kind','a','b','offset']);id(item.viewId);if(!['horizontal','vertical','aligned'].includes(item.kind))fail('Unsupported dimension kind.');point(item.a);point(item.b);number(item.offset,-100,100);const span=item.kind==='horizontal'?Math.abs(item.b.x-item.a.x):item.kind==='vertical'?Math.abs(item.b.y-item.a.y):Math.hypot(item.b.x-item.a.x,item.b.y-item.a.y);if(span<1e-8)fail('A dimension requires two distinct measurement points.');}
    else if(item.type==='note'){fields(item,['id','type','x','y','width','text']);number(item.x,8,size.width-8);number(item.y,12,size.height-36);number(item.width,10,size.width-16);text(item.text,4000);if(item.x+item.width>size.width-8)fail('Note is outside the sheet.');}
    else if(item.type==='bom'){fields(item,['id','type','x','y','width','rows']);number(item.x,8,size.width-8);number(item.y,12,size.height-36);number(item.width,40,size.width-16);if(item.x+item.width>size.width-8)fail('BoM is outside the sheet.');if(!Array.isArray(item.rows)||item.rows.length>1000)fail('BoM supports at most 1,000 rows.');for(const row of item.rows){fields(row,['reference','value','footprint','quantity']);text(row.reference,1000);text(row.value,500);text(row.footprint,500);if(!Number.isSafeInteger(row.quantity)||row.quantity<1||row.quantity>1000000)fail('Invalid BoM quantity.');}}
    else fail('Unsupported drawing item type.');
   }
   for(const item of page.items)if(item.type==='dimension'&&!views.has(item.viewId))fail('Dimension refers to a missing view.');
  }
  return doc;
 }
 function create(scope,title='Draftsman drawing'){return validate({schema:SCHEMA,source:source(scope),template:'modern',title,revision:'',company:'',units:'mm',precision:2,paper:'A4',orientation:'landscape',accent:'#245b78',fontSize:2.5,lineWidth:.25,pages:[{id:'sheet-1',title:'Drawing sheet',items:[]}]});}
 function serialize(doc){return JSON.stringify(validate(doc),null,2)+'\n';}
 function viewTransform(view,bounds){
  fields(bounds,['x','y','width','height']);number(bounds.x,-1e6,1e6);number(bounds.y,-1e6,1e6);number(bounds.width,1e-8,2e6);number(bounds.height,1e-8,2e6);
  if(![0,90,180,270].includes(view.rotation)||!['top','bottom'].includes(view.side))fail('Invalid view transform.');number(view.x,-2000,2000);number(view.y,-2000,2000);number(view.width,.001,2000);number(view.height,.001,2000);
  const rotated=view.rotation===90||view.rotation===270,scale=view.scale==='fit'?Math.min(view.width/(rotated?bounds.height:bounds.width),view.height/(rotated?bounds.width:bounds.height)):number(view.scale,.01,100),angle=view.rotation*Math.PI/180,c=Math.round(Math.cos(angle)),s=Math.round(Math.sin(angle)),mirror=view.side==='bottom'?-1:1,cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2,px=view.x+view.width/2,py=view.y+view.height/2;
  const a=scale*c*mirror,b=scale*s*mirror,cc=-scale*s,d=scale*c,e=px-a*cx-cc*cy,f=py-b*cx-d*cy,det=a*d-b*cc;
  const toPage=p=>({x:a*p.x+cc*p.y+e,y:b*p.x+d*p.y+f});const toWorld=p=>({x:(d*(p.x-e)-cc*(p.y-f))/det,y:(-b*(p.x-e)+a*(p.y-f))/det});
  return{toPage,toWorld,scale,matrix:[a,b,cc,d,e,f]};
 }
 function autoDimensions(view,bounds,options={}){const {x,y,width,height}=bounds;viewTransform(view,bounds);const offset=(options.offset===undefined?8:number(options.offset,-100,100))*(view.side==='bottom'?-1:1);return[{id:view.id+'-auto-width',type:'dimension',viewId:view.id,kind:'horizontal',a:{x,y:y+height},b:{x:x+width,y:y+height},offset},{id:view.id+'-auto-height',type:'dimension',viewId:view.id,kind:'vertical',a:{x:x+width,y},b:{x:x+width,y:y+height},offset:-offset}];}
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const n=value=>Number(value.toFixed(5));
 function svg(input,pageIndex=0,assets={}){
  const doc=validate(input),size=pageSize(doc);if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.pages.length)fail('Invalid sheet number.');const page=doc.pages[pageIndex],views=new Map(page.items.filter(v=>v.type==='view').map(v=>[v.id,v])),warnings=[],chunks=[];let totalImage=0;
  const textNode=(x,y,value,extra='')=>`<text x="${n(x)}" y="${n(y)}" ${extra}>${escape(value)}</text>`;
  const lines=(value,width)=>{const limit=Math.max(4,Math.floor(width/(doc.fontSize*.53))),result=[];for(const paragraph of String(value).split('\n')){if(!paragraph){result.push('');continue;}let line='';for(const word of paragraph.split(/\s+/)){if(line&&line.length+word.length+1>limit){result.push(line);line='';}if(word.length>limit){if(line){result.push(line);line='';}for(let i=0;i<word.length;i+=limit)result.push(word.slice(i,i+limit));}else line+=(line?' ':'')+word;}if(line)result.push(line);}return result;};
  const checkPage=p=>{if(p.x<6||p.y<6||p.x>size.width-6||p.y>size.height-30)fail('A dimension or note extends outside the sheet drawing area.');};
  const path=(a,b,extra='')=>`<path d="M ${n(a.x)} ${n(a.y)} L ${n(b.x)} ${n(b.y)}" ${extra}/>`;
  for(const item of page.items){
   if(item.type==='view'){
    const asset=assets[item.id],bounds=asset?.bounds;let drawing='';
    if(asset?.image!==undefined){if(typeof asset.image!=='string'||asset.image.length>12*1024*1024||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(asset.image))fail('View images must be bounded PNG data, never remote URLs.');totalImage+=asset.image.length;if(totalImage>24*1024*1024)fail('Sheet images exceed 24 MiB.');if(!bounds)fail('View image is missing its source bounds.');const transform=viewTransform(item,bounds);drawing=`<image x="${n(bounds.x)}" y="${n(bounds.y)}" width="${n(bounds.width)}" height="${n(bounds.height)}" preserveAspectRatio="none" transform="matrix(${transform.matrix.map(n).join(' ')})" href="${asset.image}"/>`;}
    else{drawing=`<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" fill="#f5f7f9" stroke="#c0c8d0" stroke-dasharray="2 2"/>`+textNode(item.x+3,item.y+7,'Source preview unavailable');warnings.push('Missing source preview: '+item.file);}
    if(asset?.warnings!==undefined){if(!Array.isArray(asset.warnings)||asset.warnings.length>100)fail('Invalid source rendering notes.');for(const warning of asset.warnings){text(warning,1000);warnings.push(warning);}}
    chunks.push(`<g data-item="${item.id}"><defs><clipPath id="clip-${page.id}-${item.id}"><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}"/></clipPath></defs><g clip-path="url(#clip-${page.id}-${item.id})">${drawing}</g>`+textNode(item.x+item.width/2,item.y+item.height+4,item.caption||`${item.file} · ${item.side}`,`text-anchor="middle"`)+`</g>`);
   }else if(item.type==='dimension'){
    const view=views.get(item.viewId),bounds=assets[item.viewId]?.bounds;if(!bounds)fail('Cannot dimension without verified source bounds.');const t=viewTransform(view,bounds),start=t.toPage(item.a),end=t.toPage(item.b),kind=item.kind;
    let a=start,b=end,value=Math.hypot(item.b.x-item.a.x,item.b.y-item.a.y);
    if(kind==='horizontal'){b=t.toPage({x:item.b.x,y:item.a.y});value=Math.abs(item.b.x-item.a.x);}else if(kind==='vertical'){b=t.toPage({x:item.a.x,y:item.b.y});value=Math.abs(item.b.y-item.a.y);}
    const length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,nx=-uy,ny=ux,da={x:a.x+nx*item.offset,y:a.y+ny*item.offset},db={x:b.x+nx*item.offset,y:b.y+ny*item.offset},middle={x:(da.x+db.x)/2,y:(da.y+db.y)/2};checkPage(da);checkPage(db);checkPage(middle);
    const arrow=(tip,direction)=>`<path d="M ${n(tip.x+ux*direction*2+nx*.7)} ${n(tip.y+uy*direction*2+ny*.7)} L ${n(tip.x)} ${n(tip.y)} L ${n(tip.x+ux*direction*2-nx*.7)} ${n(tip.y+uy*direction*2-ny*.7)}"/>`,label=`${(value/(doc.units==='in'?25.4:1)).toFixed(doc.precision)} ${doc.units}`,labelWidth=Math.max(10,label.length*doc.fontSize*.58),labelHeight=doc.fontSize*1.65;
    chunks.push(`<g data-item="${item.id}" fill="none" stroke="${doc.accent}" stroke-width="${doc.lineWidth}">`+path(start,{x:da.x+nx*2,y:da.y+ny*2})+path(end,{x:db.x+nx*2,y:db.y+ny*2})+path(da,db)+arrow(da,1)+arrow(db,-1)+`<rect x="${n(middle.x-labelWidth/2)}" y="${n(middle.y-labelHeight/2)}" width="${n(labelWidth)}" height="${n(labelHeight)}" fill="white" stroke="none"/>`+textNode(middle.x,middle.y+doc.fontSize*.35,label,`text-anchor="middle" fill="${doc.accent}" stroke="none"`)+`</g>`);
   }else if(item.type==='note'){
    const wrapped=lines(item.text,item.width);for(let i=0;i<wrapped.length;i++){const at={x:item.x,y:item.y+i*doc.fontSize*1.45};checkPage(at);chunks.push(textNode(at.x,at.y,wrapped[i],`data-item="${item.id}"`));}
   }else if(item.type==='bom'){
    const rowHeight=doc.fontSize*2.25,max=Math.max(0,Math.floor((size.height-37-item.y)/rowHeight)-1),rows=item.rows.slice(0,max),widths=[.25,.28,.37,.1].map(v=>item.width*v),labels=['Reference','Value','Footprint','Qty'];let x=item.x;
    chunks.push(`<g data-item="${item.id}"><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${n(rowHeight*(rows.length+1))}" fill="white" stroke="${doc.accent}" stroke-width="${doc.lineWidth}"/>`);
    for(let i=0;i<labels.length;i++){chunks.push(textNode(x+1,item.y+rowHeight*.7,labels[i],`font-weight="bold"`));x+=widths[i];}
    rows.forEach((row,index)=>{const y=item.y+rowHeight*(index+1);chunks.push(path({x:item.x,y},{x:item.x+item.width,y},`stroke="#b6c1ca" stroke-width=".15"`));let left=item.x;for(const [i,key]of ['reference','value','footprint','quantity'].entries()){const value=String(row[key]),cap=Math.max(2,Math.floor((widths[i]-2)/(doc.fontSize*.53))),label=value.length>cap?value.slice(0,cap-1)+'…':value;chunks.push(textNode(left+1,y+rowHeight*.7,label));left+=widths[i];}});chunks.push('</g>');if(rows.length<item.rows.length){const message=`${item.rows.length-rows.length} BoM rows not shown; add another BoM sheet.`;warnings.push(message);chunks.push(textNode(item.x,item.y+rowHeight*(rows.length+1)+3,message,`fill="#965b00" font-size="${doc.fontSize*.8}"`));}
   }
  }
  const sourceLabel=`${doc.source.provider} · ${doc.source.repository} @ ${doc.source.ref}`,hashes=Object.values(doc.source.hashes||{}),metadata=escape(JSON.stringify(doc.template==='kicad'?{schema:doc.schema,template:doc.template,source:doc.source,title:doc.title,company:doc.company,revision:doc.revision,sheet:page.title,files:page.items.filter(item=>item.type==='view').map(item=>item.file)}:{schema:doc.schema,source:doc.source}));
  function kicadWorksheet(){
   // Engineering-sheet styling only: source coordinates and the existing 8 mm drawing margin stay unchanged.
   const ink='#000000',right=size.width-8,bottom=size.height-8,left=right-150,top=size.height-28,small=Math.min(doc.fontSize,2.2),body=Math.min(doc.fontSize,2.4),titleSize=Math.min(doc.fontSize*1.15,2.7),zoneFont=Math.max(1.1,Math.min(1.6,doc.fontSize*.52));
   const fit=(value,width,font)=>{const normalized=String(value).replace(/\s+/g,' ').trim(),limit=Math.max(2,Math.floor(width/(font*.58)));return normalized.length>limit?normalized.slice(0,limit-1)+'…':normalized;};
   const label=(x,y,value,width,font=body,extra='')=>textNode(x,y,fit(value,width,font),`font-size="${n(font)}" ${extra}`);
   const stroke=`stroke="${ink}" stroke-width="${doc.lineWidth}"`,frame=[`<g data-worksheet="kicad" fill="none" ${stroke}><rect x="6" y="6" width="${size.width-12}" height="${size.height-12}"/><rect x="8" y="8" width="${size.width-16}" height="${size.height-16}"/>`],zones=[];
   const columns=Math.ceil((size.width-16)/50),rows=Math.ceil((size.height-16)/50),dx=(size.width-16)/columns,dy=(size.height-16)/rows;
   for(let i=1;i<columns;i++){const x=8+i*dx;frame.push(path({x,y:6},{x,y:8}),path({x,y:size.height-8},{x,y:size.height-6}));}
   for(let i=1;i<rows;i++){const y=8+i*dy;frame.push(path({x:6,y},{x:8,y}),path({x:size.width-8,y},{x:size.width-6,y}));}
   for(let i=0;i<columns;i++){const x=8+(i+.5)*dx;zones.push(textNode(x,7+zoneFont*.35,i+1,'text-anchor="middle"'),textNode(x,size.height-7+zoneFont*.35,i+1,'text-anchor="middle"'));}
   for(let i=0;i<rows;i++){const y=8+(i+.5)*dy+zoneFont*.35;zones.push(textNode(7,y,String.fromCharCode(65+i),'text-anchor="middle"'),textNode(size.width-7,y,String.fromCharCode(65+i),'text-anchor="middle"'));}
   frame.push('</g>',`<g data-worksheet-zones="true" fill="${ink}" font-size="${n(zoneFont)}">${zones.join('')}</g>`);
   const block=[`<g data-title-block="kicad"><rect x="${left}" y="${top}" width="150" height="20" fill="white" ${stroke}/>`];
   for(const y of [top+5,top+11,top+16])block.push(path({x:left,y},{x:right,y},stroke));
   block.push(path({x:left+84,y:top},{x:left+84,y:top+5},stroke),path({x:left+95,y:top+11},{x:left+95,y:top+16},stroke));
   for(const x of [left+25,left+50,left+110])block.push(path({x,y:top+16},{x,y:bottom},stroke));
   const files=page.items.filter(item=>item.type==='view').map(item=>item.file),fileName=files.length?(files[0].split('/').at(-1)+(files.length>1?` (+${files.length-1})`:'')):'—';
   block.push(`<g fill="${ink}" stroke="none">`,label(left+2,top+3.5,'Company: '+(doc.company||'—'),80,small),label(left+86,top+3.5,'File: '+fileName,62,small),label(left+2,top+9,'Title: '+(doc.title||'—'),146,titleSize,'font-weight="bold"'),label(left+2,top+14.5,'Sheet: '+(page.title||'—'),91,small),label(left+97,top+14.5,'Ref: '+doc.source.ref,51,small),label(left+2,top+18.8,'Size: '+doc.paper,21,small),label(left+27,top+18.8,'Units: '+doc.units,21,small),label(left+52,top+18.8,'Rev: '+(doc.revision||'—'),56,small),label(left+112,top+18.8,`Sheet ${pageIndex+1}/${doc.pages.length}`,36,small),'</g></g>');
   const traceWidth=left-12,traceFont=Math.min(doc.fontSize*.8,1.8),trace=`<g data-source-trace="kicad" fill="${ink}">${label(10,top+3,'Pocket KiVi · KiCad-style worksheet',traceWidth,traceFont)}${label(10,top+8,doc.source.provider+' · '+doc.source.repository,traceWidth,traceFont)}${label(10,top+13,'Source ref: '+doc.source.ref,traceWidth,traceFont)}${label(10,top+18,hashes.length?`${hashes.length} SHA-256 fingerprints · Raster views / vector dimensions`:'Source fingerprints unavailable · Raster views / vector dimensions',traceWidth,traceFont)}</g>`;
   return{frame:frame.join(''),footer:block.join('')+trace};
  }

  const footer=`<g fill="#263b49" stroke="none">${textNode(10,size.height-22,doc.title,`font-size="${doc.fontSize*1.35}" font-weight="bold"`)}${textNode(10,size.height-16,`${doc.company}${doc.company?' · ':''}${page.title}`)}${textNode(10,size.height-10,sourceLabel,`font-size="${doc.fontSize*.8}"`)}${textNode(size.width-10,size.height-22,`Rev ${doc.revision||'—'} · ${pageIndex+1}/${doc.pages.length}`,`text-anchor="end"`)}${textNode(size.width-10,size.height-16,`${doc.paper} · ${doc.units} · Raster views / vector dimensions`, `text-anchor="end" font-size="${doc.fontSize*.8}"`)}${textNode(size.width-10,size.height-10,hashes.length?`${hashes.length} source SHA-256 fingerprints retained`:'Source fingerprints unavailable',`text-anchor="end" font-size="${doc.fontSize*.8}"`)}</g>`;
  const notes=[...new Set(warnings)];let warningText='';if(notes.length)warningText=textNode(10,doc.template==='kicad'?11:8,`Rendering notes (${notes.length}): ${notes[0].slice(0,130)}${notes.length>1?' · See source rendering notes':''}`,`fill="#965b00" font-size="${doc.template==='kicad'?Math.min(doc.fontSize*.8,2):doc.fontSize*.8}"`);
  const worksheet=doc.template==='kicad'?kicadWorksheet():null,frame=worksheet?.frame||`<rect x="6" y="6" width="${size.width-12}" height="${size.height-12}" fill="none" stroke="${doc.accent}" stroke-width="${doc.lineWidth}"/><path d="M 6 ${size.height-28} H ${size.width-6}" stroke="${doc.accent}" stroke-width="${doc.lineWidth}"/>`;
  const description=doc.template==='kicad'?'KiCad-style worksheet template; custom .kicad_wks files are not interpreted. Raster views / vector dimensions. '+notes.join(' | '):notes.join(' | ');
  const result=`<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}mm" height="${size.height}mm" viewBox="0 0 ${size.width} ${size.height}"><metadata>${metadata}</metadata><desc>${escape(description)}</desc><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" font-size="${doc.fontSize}" fill="#263b49">${frame}${chunks.join('')}${warningText}${worksheet?.footer||footer}</g></svg>`;
  if(bytes(result)>MAX_SVG)fail('Rendered sheet exceeds 32 MiB.');return result;
 }
 const api={SCHEMA,MAX_BYTES,papers,create,validate,serialize,pageSize,viewTransform,autoDimensions,svg};root.KiCadDraftsmanModel=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
