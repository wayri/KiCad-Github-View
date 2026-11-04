/* Owned, bounded read-only Gerber geometry parser. World units: mm, Y down. */
((root)=>{
 'use strict';
 const LIMITS=Object.freeze({bytes:8*1024*1024,commands:200000,primitives:100000,apertures:4096,coordinate:100000});
 function build(text,path='layer.gbr'){
  if(typeof text!=='string'||text.length>LIMITS.bytes||new TextEncoder().encode(text).length>LIMITS.bytes)throw Error('Gerber input exceeds 8 MiB.');
  if(isJobPath(path))return parseJob(text,path);
  if(/\.(drl|xln|exc|nc|xnc)$/i.test(path)||/^\s*M48(?:\r?\n|$)/.test(text))return drills(text,path);
  const warnings=[],primitives=[],apertures=new Map(),attributes=Object.create(null);let apertureAttributes=Object.freeze({}),objectAttributes=Object.freeze({}),x2=false;
  const warn=s=>{if(!warnings.includes(s)&&warnings.length<100)warnings.push(s);};
  let format=null,unit=null,at={x:0,y:0},selected=null,operation=null,mode=1,quadrant=75,polarity='dark',region=null,ended=false,count=0;
  const emit=p=>{if(primitives.length>=LIMITS.primitives)throw Error('Gerber primitive limit exceeded.');primitives.push({...p,gerber:true,polarity,layer:path,uuid:path+':'+primitives.length,kind:'gerber',stroke:p.fill?false:true,apertureAttributes:apertures.get(selected)?.attributes||Object.freeze({}),objectAttributes});};
  const value=(s,axis)=>{if(!format||!unit)throw Error('Coordinates require declared FS format and MO units.');let sign=1;if(s[0]==='-'||s[0]==='+'){sign=s[0]==='-'?-1:1;s=s.slice(1);}const f=format[axis],total=f[0]+f[1];if(!/^\d+$/.test(s)||s.length>total)throw Error('Invalid Gerber coordinate.');s=format.zero==='T'?s.padEnd(total,'0'):s.padStart(total,'0');const n=sign*Number(s)/10**f[1]*unit;if(!Number.isFinite(n)||Math.abs(n)>LIMITS.coordinate)throw Error('Gerber coordinate exceeds bounds.');return n;};
  const rect=(x,y,w,h)=>({type:'polygon',points:[{x:x-w/2,y:y-h/2},{x:x+w/2,y:y-h/2},{x:x+w/2,y:y+h/2},{x:x-w/2,y:y+h/2}],fill:true,width:0});
  const flash=(p,a)=>{
   if(!a){warn('Undefined or unsupported aperture: geometry omitted.');return;}
   let shape;if(a.shape==='C')shape={type:'circle',...p,r:a.size[0]/2,fill:true,width:0};
   else if(a.shape==='R')shape=rect(p.x,p.y,a.size[0],a.size[1]);
   else if(a.shape==='O'){const [w,h]=a.size;shape=w===h?{type:'circle',...p,r:w/2,fill:true,width:0}:{type:'line',points:w>=h?[{x:p.x-(w-h)/2,y:p.y},{x:p.x+(w-h)/2,y:p.y}]:[{x:p.x,y:p.y-(h-w)/2},{x:p.x,y:p.y+(h-w)/2}],width:Math.min(w,h)};}
   else{const n=a.vertices,r=a.size[0]/2,angle=-a.rotation*Math.PI/180;shape={type:'polygon',points:Array.from({length:n},(_,i)=>({x:p.x+r*Math.cos(angle-i*2*Math.PI/n),y:p.y+r*Math.sin(angle-i*2*Math.PI/n)})),fill:true,width:0};}
   if(a.hole){warn('Aperture holes are unsupported; affected flashes omitted.');return;}emit({...shape,aperture:selected,reference:'D'+selected});
  };
  // Tokenize percent blocks as one command; aperture macros may contain internal stars.
  const token=/%[^%]*%|[^%*]+\*/g;let match,cursor=0;
  while((match=token.exec(text))){if(text.slice(cursor,match.index).trim())throw Error('Malformed Gerber command delimiters.');cursor=token.lastIndex;if(++count>LIMITS.commands)throw Error('Gerber command limit exceeded.');let command=match[0].trim();if(ended){warn('Commands after M02 ignored.');continue;}
   if(command[0]==='%'){
    const body=command.slice(1,-1).trim();if(!body.endsWith('*'))throw Error('Malformed Gerber parameter.');const c=body.slice(0,-1).trim();let m;
    if((m=/^FS([LT])([AI])X([0-6])([1-7])Y([0-6])([1-7])$/.exec(c))){if(primitives.length)throw Error('Mid-file coordinate format changes unsupported.');format={zero:m[1],notation:m[2],X:[+m[3],+m[4]],Y:[+m[5],+m[6]]};}
    else if((m=/^MO(MM|IN)$/.exec(c))){if(primitives.length)throw Error('Mid-file unit changes unsupported.');unit=m[1]==='MM'?1:25.4;}
    else if((m=/^ADD(\d+)([A-Za-z_$][\w.$-]*)(?:,(.*))?$/.exec(c))){if(!unit)throw Error('Apertures require declared units.');if(apertures.size>=LIMITS.apertures)throw Error('Aperture limit exceeded.');const id=+m[1],shape=m[2],s=(m[3]||'').split('X').map(Number);if(!['C','R','O','P'].includes(shape)){apertures.set(id,null);warn('Aperture macros are unsupported; affected geometry omitted.');continue;}if(id<10||!s.length||s.some(n=>!Number.isFinite(n))||s[0]<=0||s[0]*unit>LIMITS.coordinate||(['R','O'].includes(shape)&&(!(s[1]>0)||s[1]*unit>LIMITS.coordinate)))throw Error('Invalid aperture dimensions.');const min=shape==='C'?1:shape==='P'?2:2,max=shape==='P'?4:min+1;if(s.length<min||s.length>max)throw Error('Unsupported aperture parameters.');if(shape==='P'&&(!Number.isInteger(s[1])||s[1]<3||s[1]>12))throw Error('Polygon aperture requires 3–12 vertices.');apertures.set(id,{attributes:apertureAttributes,shape,size:shape==='P'?[s[0]*unit]:s.slice(0,min).map(n=>n*unit),vertices:s[1],rotation:shape==='P'?(s[2]||0):0,hole:shape==='P'?(s[3]||0):(s[min]||0)});}
    else if(c==='LPD'||c==='LPC'){if(region)throw Error('Polarity change inside region.');polarity=c==='LPD'?'dark':'clear';}
    else if(/^AM/.test(c))warn('Aperture macros are unsupported; affected geometry omitted.');
    else if(/^(TF|TA|TO|TD)/.test(c)){
     x2=true;if(c==='TD'){apertureAttributes=Object.freeze({});objectAttributes=Object.freeze({});}
     else if(c.startsWith('TD.')){const key=c.slice(3),a={...apertureAttributes},o={...objectAttributes};delete a[key];delete o[key];apertureAttributes=Object.freeze(a);objectAttributes=Object.freeze(o);}
     else{const m=/^(TF|TA|TO)\.([^,]{1,128})(?:,(.*))?$/.exec(c);if(!m||m[3]?.length>2048)throw Error('Invalid or oversized Gerber X2 attribute.');const target=m[1]==='TF'?attributes:m[1]==='TA'?apertureAttributes:objectAttributes;if(Object.keys(target).length>=128&&!Object.hasOwn(target,m[2]))throw Error('Gerber X2 attribute limit exceeded.');if(m[1]==='TF')attributes[m[2]]=m[3]||'';else if(m[1]==='TA')apertureAttributes=Object.freeze({...target,[m[2]]:m[3]||''});else objectAttributes=Object.freeze({...target,[m[2]]:m[3]||''});}
    }
    else if(c==='IPPOS'||c==='SR'||/^SRX1Y1I0(?:\.0+)?J0(?:\.0+)?$/.test(c)||c==='LMN'||c==='LR0'||c==='LS1'){}
    else throw Error('Unsupported Gerber parameter '+c.slice(0,24)+'; layer not rendered.');
    continue;
   }
   command=command.slice(0,-1).replace(/\s+/g,'');if(/^G04/.test(command))continue;if(command==='M02'){ended=true;continue;}
   if(command==='G36'){if(region)throw Error('Nested Gerber region.');region={contours:[],current:null,unsupported:false};continue;}
   if(command==='G37'){if(!region)throw Error('Region end without start.');const contours=region.contours.filter(c=>c.length>=3);if(region.unsupported)warn('Curved regions are unsupported; affected region omitted.');else if(contours.length){if(contours.some(c=>c[0].x!==c.at(-1).x||c[0].y!==c.at(-1).y))throw Error('Unclosed Gerber region contour.');emit({type:'polygon',points:contours.flat(),contours,fill:true,width:0,reference:'Region'});}region=null;continue;}
   command=command.replace(/G(0?[123]|7[45]|9[01]|54)/g,(_,s)=>{const n=+s;if(n<=3)mode=n;else if(n===74||n===75)quadrant=n;else if(n===90||n===91){if(!format)throw Error('Missing FS coordinate format.');format.notation=n===90?'A':'I';}return '';});
   if(!command)continue;
   const parts=[...command.matchAll(/([XYIJ])([+-]?\d+)|D(\d+)/g)];if(parts.map(m=>m[0]).join('')!==command)throw Error('Unsupported or malformed Gerber command '+command.slice(0,32));const fields={};let d=null;for(const m of parts){if(m[3]!==undefined){if(d!==null)throw Error('Repeated operation code.');d=+m[3];}else{if(fields[m[1]]!==undefined)throw Error('Repeated coordinate field.');fields[m[1]]=m[2];}}
   if(d>=10){if(Object.keys(fields).length)throw Error('Aperture selection with coordinates.');selected=d;continue;}if(d!==null){if(![1,2,3].includes(d))throw Error('Invalid operation code.');operation=d;}
   if(!Object.keys(fields).length&&d===null)continue;if(!operation)throw Error('Missing Gerber operation.');
   const next={...at};for(const axis of ['X','Y'])if(fields[axis]!==undefined){const n=value(fields[axis],axis);next[axis.toLowerCase()]=(format.notation==='I'?at[axis.toLowerCase()]:0)+(axis==='Y'?-n:n);if(Math.abs(next[axis.toLowerCase()])>LIMITS.coordinate)throw Error('Accumulated Gerber coordinate exceeds bounds.');}
   const a=apertures.get(selected);
   if(operation===2){if(region){region.current=[next];region.contours.push(region.current);}at=next;continue;}
   if(operation===3){if(region)throw Error('Flash inside region.');flash(next,a);at=next;continue;}
   let arc=null;if(mode!==1){if(quadrant!==75){warn('Single-quadrant arcs unsupported; affected geometry omitted.');if(region)region.unsupported=true;at=next;continue;}if(fields.I===undefined||fields.J===undefined)throw Error('Arc requires I and J offsets.');const center={x:at.x+value(fields.I,'X'),y:at.y-value(fields.J,'Y')},r=Math.hypot(at.x-center.x,at.y-center.y),r2=Math.hypot(next.x-center.x,next.y-center.y);if(!r||Math.abs(r-r2)>Math.max(.002,r*.0001))throw Error('Invalid Gerber arc radius.');let start=Math.atan2(at.y-center.y,at.x-center.x),end=Math.atan2(next.y-center.y,next.x-center.x),delta=end-start;if(mode===2){while(delta<=0)delta+=Math.PI*2;}else{while(delta>=0)delta-=Math.PI*2;}arc={center,r,start,delta};}
   if(region){if(!region.current){region.current=[at];region.contours.push(region.current);}if(arc)region.unsupported=true;region.current.push(next);}
   else if(!a)warn('Undefined or unsupported aperture: geometry omitted.');
   else if(a.shape!=='C'||a.hole)warn('Non-circular or holed aperture strokes unsupported; affected geometry omitted.');
   else if(arc){if(at.x===next.x&&at.y===next.y)emit({type:'circle',...arc.center,r:arc.r,width:a.size[0],reference:'D'+selected});else emit({type:'arc',start:at,mid:{x:arc.center.x+arc.r*Math.cos(arc.start+arc.delta/2),y:arc.center.y+arc.r*Math.sin(arc.start+arc.delta/2)},end:next,width:a.size[0],reference:'D'+selected});}
   else emit({type:'line',points:[at,next],width:a.size[0],reference:'D'+selected});at=next;
  }
  if(text.slice(cursor).trim())throw Error('Unterminated Gerber command.');if(region)throw Error('Unterminated Gerber region.');if(!format||!unit)throw Error('Missing Gerber coordinate format or units.');if(!ended)warn('Missing M02 end command.');return {kind:'gerber',format:x2?'gerber-x2':'rs274x',path,primitives,layers:[path],warnings,attributes,units:'mm',readOnly:true};
 }
 function isJobPath(path){return /\.gbrjob$/i.test(String(path));}
 function isFabricationPath(path){return /\.(gbrjob|gbr|ger|gerber|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gko|gm\d+|g\d+|drl|xln|exc|nc|xnc)$/i.test(String(path));}
 function parseJob(text,path='job.gbrjob'){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>LIMITS.bytes)throw Error('Gerber job input exceeds 8 MiB.');
  let job;try{job=JSON.parse(text);}catch{throw Error('Invalid Gerber job JSON.');}
  if(!job||typeof job!=='object'||Array.isArray(job)||!Array.isArray(job.FilesAttributes)||job.FilesAttributes.length>64)throw Error('Gerber job requires at most 64 FilesAttributes entries.');
  const safe=p=>typeof p==='string'&&p.length>0&&p.length<=2048&&!/[:\\?#%\x00-\x1f\x7f]/.test(p)&&!p.startsWith('/')&&p.split('/').every(v=>v&&v!=='.'&&v!=='..');
  if(!safe(path))throw Error('Unsafe Gerber job source path.');
  const folder=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'',seen=new Set(),files=[],warnings=[];
  const scalar=(v,label)=>{if(v===undefined)return '';if(typeof v!=='string'||v.length>2048)throw Error('Invalid Gerber job '+label+'.');return v;};
  for(const item of job.FilesAttributes){
   if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Invalid Gerber job file entry.');
   const name=typeof item.Path==='string'?item.Path.replace(/^\.\//,''):item.Path;
   if(!safe(name)||isJobPath(name))throw Error('Unsafe or recursive Gerber job file path.');
   const full=folder+name;if(seen.has(full))throw Error('Duplicate Gerber job file path.');seen.add(full);
   const filePolarity=scalar(item.FilePolarity,'FilePolarity');if(filePolarity&&!['Positive','Negative'].includes(filePolarity))throw Error('Invalid Gerber job FilePolarity.');files.push({path:full,fileFunction:scalar(item.FileFunction,'FileFunction'),filePolarity});
  }
  if(!files.length)warnings.push('Gerber job declares no fabrication files.');
  const metadata={};for(const key of ['Header','GeneralSpecs','MaterialStackup','DesignRules'])if(job[key]!==undefined){const value=JSON.stringify(job[key]);if(value.length>65536)throw Error('Gerber job metadata exceeds bounds.');metadata[key]=JSON.parse(value);}
  return {kind:'gerber-job',path,files,metadata,warnings,readOnly:true};
 }
 function drills(text,path){
  const primitives=[],warnings=[],tools=new Map(),attributes={};let unit=null,format=null,zero='L',tool=null,header=false,body=false,at={x:0,y:0},known=false,count=0,ended=false,routing=false,down=false,interpolation=0;
  const decimalOnly=/\.xnc$/i.test(path),number='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)',fieldsPattern=new RegExp('([XYIJA])('+number+')','g');
  const warn=s=>{if(!warnings.includes(s)&&warnings.length<100)warnings.push(s);};
  const coordinate=s=>{if(!unit)throw Error('Drill coordinates require declared units.');let n;if(s.includes('.')||decimalOnly)n=Number(s)*unit;else{if(!format)throw Error('Integer drill coordinates require an explicit FILE_FORMAT or declared format.');const sign=s.startsWith('-')?-1:1,t=s.replace(/^[+-]/,'');if(t.length>format[0]+format[1])throw Error('Invalid drill coordinate length.');n=sign*Number(zero==='T'?t.padEnd(format[0]+format[1],'0'):t)/10**format[1]*unit;}if(!Number.isFinite(n)||Math.abs(n)>LIMITS.coordinate)throw Error('Drill coordinate exceeds bounds.');return n;};
  const fields=c=>{const matches=[...c.matchAll(fieldsPattern)],values={};if(!matches.length||matches.map(m=>m[0]).join('')!==c)throw Error('Malformed drill coordinates.');for(const m of matches){if(values[m[1]]!==undefined)throw Error('Repeated drill coordinate.');values[m[1]]=coordinate(m[2]);}return values;};
  const next=f=>({x:f.X??at.x,y:f.Y===undefined?at.y:-f.Y});
  const emit=p=>{for(const q of p.points||[p.start,p.mid,p.end,p.x===undefined?null:p].filter(Boolean))if(!Number.isFinite(q.x)||!Number.isFinite(q.y)||Math.abs(q.x)>LIMITS.coordinate||Math.abs(q.y)>LIMITS.coordinate)throw Error('Derived drill geometry exceeds coordinate bounds.');if(p.r!==undefined&&(!(p.r>0)||p.r>LIMITS.coordinate))throw Error('Drill radius exceeds bounds.');const diameter=tools.get(tool);if(!body)throw Error('Drill geometry before header ends.');if(!diameter)throw Error('Undefined drill tool.');if(primitives.length>=LIMITS.primitives)throw Error('Drill primitive limit exceeded.');primitives.push({...p,...(p.type==='circle'&&!p.routeCircle?{r:diameter/2,width:0,fill:true,stroke:false}:{width:diameter,fill:false,stroke:true}),gerber:true,polarity:'dark',layer:path,kind:'drill',uuid:path+':'+primitives.length,reference:'T'+tool,sourceLine:count});};
  for(const line of text.split(/\r?\n/)){
   if(++count>LIMITS.commands)throw Error('Drill command limit exceeded.');let c=line.trim();if(!c)continue;let m;
   if((m=/^;FILE_FORMAT=(\d):(\d)$/.exec(c))){format=[+m[1],+m[2]];if(format[0]>6||format[1]>7||!format[1])throw Error('Invalid drill coordinate format.');continue;}
   if(c.startsWith(';')){if(c.startsWith('; #@! TF.')){const comma=c.indexOf(',');if(comma>0&&Object.keys(attributes).length<128)attributes[c.slice(9,comma)]=c.slice(comma+1).slice(0,2048);}continue;}if(ended)continue;
   if(c==='M48'){if(header||body)throw Error('Repeated drill header.');header=true;continue;}if(c==='%'||c==='M95'){if(!header||body)throw Error('Invalid drill header end.');body=true;continue;}if(c==='M30'){if(down)throw Error('Drill file ends with route tool down.');ended=true;continue;}
   if((m=/^(METRIC|INCH)(?:,([LT])Z)?(?:,(0+\.0+))?$/.exec(c))){if(primitives.length)throw Error('Mid-file drill units change unsupported.');unit=m[1]==='METRIC'?1:25.4;/* Excellon LZ means leading zeros included. */zero=m[2]==='L'?'T':'L';if(m[3]){format=m[3].split('.').map(v=>v.length);if(format[0]>6||format[1]>7)throw Error('Invalid drill coordinate format.');}continue;}
   if((m=/^T(\d+)C([\d.]+)(?:F[\d.]+)?(?:S[\d.]+)?$/.exec(c))){if(!unit)throw Error('Drill tool requires declared units.');if(body)throw Error('Drill tool declared outside header.');const diameter=Number(m[2])*unit;if(!(diameter>0)||diameter>LIMITS.coordinate)throw Error('Invalid drill tool diameter.');if(tools.size>=LIMITS.apertures||tools.has(+m[1]))throw Error('Duplicate or excessive drill tools.');tools.set(+m[1],diameter);continue;}
   if((m=/^T(\d+)$/.exec(c))){if(down)throw Error('Tool change during drill route.');tool=+m[1];continue;}
   if(c==='M15'){if(!routing||!known||down||!body||!tools.has(tool))throw Error('Route tool down requires a selected tool and start point.');down=true;continue;}if(c==='M16'){if(!routing||!down)throw Error('Route tool up without tool down.');down=false;continue;}
   if(['G90','G05','M71','M72'].includes(c)){if(down)throw Error('Mode change during drill route.');if(c==='G05')routing=false;if(c==='M71'||c==='M72'){if(primitives.length)throw Error('Mid-file drill units change unsupported.');unit=c==='M71'?1:25.4;}continue;}
   if(/^(G91|R)/.test(c))throw Error('Repeat or incremental drill commands unsupported; file not rendered.');
   if(c.includes('G85')){
    if(routing||down)throw Error('G85 slot inside routed path.');const pieces=c.split('G85');if(pieces.length!==2)throw Error('Malformed drill slot.');let start={...at};if(pieces[0]){const f=fields(pieces[0]);if(Object.keys(f).some(k=>!['X','Y'].includes(k)))throw Error('Invalid drill slot start.');start=next(f);}else if(!known)throw Error('Drill slot requires a known start point.');
    const endFields=fields(pieces[1]);if(Object.keys(endFields).some(k=>!['X','Y'].includes(k)))throw Error('Invalid drill slot end.');const end={x:endFields.X??start.x,y:endFields.Y===undefined?start.y:-endFields.Y};emit({type:'line',points:[start,end]});at=end;known=true;continue;
   }
   if(routing&&/^[XY]/.test(c))c='G0'+interpolation+c;
   if((m=/^G(00|01|02|03)(.*)$/.exec(c))){
    const op=+m[1],f=fields(m[2]);interpolation=op;if(f.X===undefined&&f.Y===undefined)throw Error('Drill route requires destination coordinates.');const dest=next(f);
    if(op===0){if(down)throw Error('Rapid move with drill route tool down.');if(f.I!==undefined||f.J!==undefined||f.A!==undefined)throw Error('Rapid drill move has arc fields.');routing=true;at=dest;known=true;continue;}
    if(!routing||!down||!known)throw Error('Drill route requires G00 start and M15 tool down.');
    if(op===1){if(f.I!==undefined||f.J!==undefined||f.A!==undefined)throw Error('Linear drill route has arc fields.');emit({type:'line',points:[{...at},dest]});}
    else{
     let center,radius;
     if(f.A!==undefined){if(f.I!==undefined||f.J!==undefined)throw Error('Mixed drill arc radius and offsets.');radius=f.A;const dx=dest.x-at.x,dy=dest.y-at.y,chord=Math.hypot(dx,dy);if(!(radius>0)||!chord||chord>2*radius+1e-9)throw Error('Invalid drill arc radius.');const h=Math.sqrt(Math.max(0,radius*radius-chord*chord/4)),side=op===2?1:-1;center={x:(at.x+dest.x)/2-side*dy/chord*h,y:(at.y+dest.y)/2+side*dx/chord*h};}
     else{if(f.I===undefined||f.J===undefined)throw Error('Drill arc requires radius A or I/J offsets.');center={x:at.x+f.I,y:at.y-f.J};radius=Math.hypot(f.I,f.J);if(!radius||Math.abs(Math.hypot(dest.x-center.x,dest.y-center.y)-radius)>Math.max(.002,radius*.0001))throw Error('Invalid drill arc radius.');}
     let a=Math.atan2(at.y-center.y,at.x-center.x),delta=Math.atan2(dest.y-center.y,dest.x-center.x)-a;if(op===2){while(delta<=0)delta+=2*Math.PI;}else while(delta>=0)delta-=2*Math.PI;
     if(at.x===dest.x&&at.y===dest.y)emit({type:'circle',...center,r:radius,width:tools.get(tool),fill:false,stroke:true,routeCircle:true});
     else emit({type:'arc',start:{...at},mid:{x:center.x+radius*Math.cos(a+delta/2),y:center.y+radius*Math.sin(a+delta/2)},end:dest});
    }at=dest;known=true;continue;
   }
   if(/^[XY]/.test(c)){if(routing)throw Error('Routed coordinates require an explicit interpolation mode.');const f=fields(c);if(Object.keys(f).some(k=>!['X','Y'].includes(k)))throw Error('Invalid drill hit fields.');at=next(f);known=true;emit({type:'circle',...at});continue;}
   if(header&&!body&&/^(FMAT,2|VER,1)$/.test(c))continue;throw Error('Unsupported drill command '+c.slice(0,24));
  }
  if(!header||!body||!unit)throw Error('Missing drill header, body, or units.');if(down)throw Error('Unterminated drill route.');if(!ended)warn('Missing M30 drill end command.');return {kind:'gerber',format:'excellon',path,primitives,layers:[path],warnings,attributes,units:'mm',readOnly:true};
 }
 // Paint into a TRANSPARENT canvas for one layer, then composite it over other layers.
 // Clear polarity subtracts only from this layer. Contours use Gerber even-odd region fill.
 function paint(ctx,camera,primitives,color='#df7d63'){
  const screen=p=>camera.world_to_screen(p);for(const p of primitives){ctx.save();ctx.globalCompositeOperation=p.polarity==='clear'?'destination-out':'source-over';ctx.fillStyle=ctx.strokeStyle=color;ctx.lineWidth=p.width*camera.zoom;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
   if(p.type==='circle'){const q=screen(p);ctx.arc(q.x,q.y,p.r*camera.zoom,0,2*Math.PI);}
   else if(p.type==='arc'){const a=p.start,b=p.mid,c=p.end,d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y)),aa=a.x*a.x+a.y*a.y,bb=b.x*b.x+b.y*b.y,cc=c.x*c.x+c.y*c.y,center={x:(aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/d,y:(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/d};const start=Math.atan2(a.y-center.y,a.x-center.x),end=Math.atan2(c.y-center.y,c.x-center.x),mid=Math.atan2(b.y-center.y,b.x-center.x),turn=n=>(n+Math.PI*4)%(Math.PI*2),ccw=turn(mid-start)>turn(end-start),q=screen(center);ctx.arc(q.x,q.y,Math.hypot(a.x-center.x,a.y-center.y)*camera.zoom,camera.flipped?Math.PI-start:start,camera.flipped?Math.PI-end:end,camera.flipped?!ccw:ccw);}
   else for(const points of p.contours||[p.points]){const q=screen(points[0]);ctx.moveTo(q.x,q.y);for(const pt of points.slice(1)){const s=screen(pt);ctx.lineTo(s.x,s.y);}if(p.fill)ctx.closePath();}
   if(p.fill)ctx.fill('evenodd');else ctx.stroke();ctx.restore();
  }
 }
 const api={build,parse:build,parseJob,isJobPath,isFabricationPath,paint,LIMITS};root.KiCadGerberRenderer=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
