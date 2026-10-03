/* Owned, bounded read-only Gerber geometry parser. World units: mm, Y down. */
((root)=>{
 'use strict';
 const LIMITS=Object.freeze({bytes:8*1024*1024,commands:200000,primitives:100000,apertures:4096,coordinate:100000});
 function build(text,path='layer.gbr'){
  if(typeof text!=='string'||text.length>LIMITS.bytes||new TextEncoder().encode(text).length>LIMITS.bytes)throw Error('Gerber input exceeds 8 MiB.');
  if(/\.(drl|xln)$/i.test(path))return drills(text,path);
  const warnings=[],primitives=[],apertures=new Map(),attributes={};
  const warn=s=>{if(!warnings.includes(s)&&warnings.length<100)warnings.push(s);};
  let format=null,unit=null,at={x:0,y:0},selected=null,operation=null,mode=1,quadrant=75,polarity='dark',region=null,ended=false,count=0;
  const emit=p=>{if(primitives.length>=LIMITS.primitives)throw Error('Gerber primitive limit exceeded.');primitives.push({...p,gerber:true,polarity,layer:path,uuid:path+':'+primitives.length,kind:'gerber',stroke:p.fill?false:true});};
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
    else if((m=/^ADD(\d+)([A-Za-z_$][\w.$-]*)(?:,(.*))?$/.exec(c))){if(!unit)throw Error('Apertures require declared units.');if(apertures.size>=LIMITS.apertures)throw Error('Aperture limit exceeded.');const id=+m[1],shape=m[2],s=(m[3]||'').split('X').map(Number);if(!['C','R','O','P'].includes(shape)){apertures.set(id,null);warn('Aperture macros are unsupported; affected geometry omitted.');continue;}if(id<10||!s.length||s.some(n=>!Number.isFinite(n))||s[0]<=0||s[0]*unit>LIMITS.coordinate||(['R','O'].includes(shape)&&(!(s[1]>0)||s[1]*unit>LIMITS.coordinate)))throw Error('Invalid aperture dimensions.');const min=shape==='C'?1:shape==='P'?2:2,max=shape==='P'?4:min+1;if(s.length<min||s.length>max)throw Error('Unsupported aperture parameters.');if(shape==='P'&&(!Number.isInteger(s[1])||s[1]<3||s[1]>12))throw Error('Polygon aperture requires 3–12 vertices.');apertures.set(id,{shape,size:shape==='P'?[s[0]*unit]:s.slice(0,min).map(n=>n*unit),vertices:s[1],rotation:shape==='P'?(s[2]||0):0,hole:shape==='P'?(s[3]||0):(s[min]||0)});}
    else if(c==='LPD'||c==='LPC'){if(region)throw Error('Polarity change inside region.');polarity=c==='LPD'?'dark':'clear';}
    else if(/^AM/.test(c))warn('Aperture macros are unsupported; affected geometry omitted.');
    else if(/^(TF|TA|TO|TD)/.test(c)){if(c.startsWith('TF.')){const comma=c.indexOf(',');if(comma>0)attributes[c.slice(3,comma)]=c.slice(comma+1).slice(0,2048);}}
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
  if(text.slice(cursor).trim())throw Error('Unterminated Gerber command.');if(region)throw Error('Unterminated Gerber region.');if(!format||!unit)throw Error('Missing Gerber coordinate format or units.');if(!ended)warn('Missing M02 end command.');return {kind:'gerber',path,primitives,layers:[path],warnings,attributes,units:'mm',readOnly:true};
 }
 function drills(text,path){
  const primitives=[],warnings=[],tools=new Map();let unit=null,format=null,zero='L',tool=null,header=false,body=false,at={x:0,y:0},count=0,ended=false;
  const warn=s=>{if(!warnings.includes(s))warnings.push(s);};
  const coordinate=s=>{if(!unit)throw Error('Drill coordinates require declared units.');let n;if(s.includes('.'))n=Number(s)*unit;else{if(!format)throw Error('Integer drill coordinates require an explicit FILE_FORMAT or declared format.');const sign=s.startsWith('-')?-1:1,t=s.replace(/^[+-]/,'');if(t.length>format[0]+format[1])throw Error('Invalid drill coordinate length.');n=sign*Number(zero==='T'?t.padEnd(format[0]+format[1],'0'):t)/10**format[1]*unit;}if(!Number.isFinite(n)||Math.abs(n)>LIMITS.coordinate)throw Error('Drill coordinate exceeds bounds.');return n;};
  for(const line of text.split(/\r?\n/)){if(++count>LIMITS.commands)throw Error('Drill command limit exceeded.');const c=line.trim();if(!c)continue;let m;if((m=/^;FILE_FORMAT=(\d):(\d)$/.exec(c))){format=[+m[1],+m[2]];if(format[0]>6||format[1]>7||!format[1])throw Error('Invalid drill coordinate format.');continue;}if(c.startsWith(';'))continue;if(ended)continue;
   if(c==='M48'){header=true;continue;}if(c==='%'||c==='M95'){body=true;continue;}if(c==='M30'){ended=true;continue;}if((m=/^(METRIC|INCH)(?:,([LT])Z)?(?:,(0+\.0+))?$/.exec(c))){unit=m[1]==='METRIC'?1:25.4;/* Excellon LZ means zeros INCLUDED; TZ means trailing included. */zero=m[2]==='L'?'T':'L';if(m[3]){const p=m[3].split('.');format=p.map(s=>s.length);}continue;}if((m=/^T(\d+)C([\d.]+)(?:F[\d.]+)?(?:S[\d.]+)?$/.exec(c))){if(!unit)throw Error('Drill tool requires declared units.');const diameter=Number(m[2])*unit;if(!(diameter>0)||diameter>LIMITS.coordinate)throw Error('Invalid drill tool diameter.');if(tools.size>=LIMITS.apertures)throw Error('Drill tool limit exceeded.');tools.set(+m[1],diameter);continue;}
   if((m=/^T(\d+)$/.exec(c))){tool=+m[1];continue;}if(['G90','G05','M71','M72'].includes(c)){if(c==='M71')unit=1;if(c==='M72')unit=25.4;continue;}
   if(/^(G00|G01|G02|G03|G85|G91|R|M15|M16)/.test(c)||c.includes('G85'))throw Error('Routed slots, repeat, or incremental drill commands unsupported; file not rendered.');
   const fields=[...c.matchAll(/([XY])([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g)];if(fields.length&&fields.map(m=>m[0]).join('')===c){if(!body)throw Error('Drill hit before header ends.');for(const m of fields)at[m[1].toLowerCase()]=(m[1]==='Y'?-1:1)*coordinate(m[2]);const diameter=tools.get(tool);if(!diameter)throw Error('Undefined drill tool.');if(primitives.length>=LIMITS.primitives)throw Error('Drill primitive limit exceeded.');primitives.push({type:'circle',...at,r:diameter/2,width:0,fill:true,stroke:false,gerber:true,polarity:'dark',layer:path,kind:'drill',uuid:path+':'+primitives.length,reference:'T'+tool});continue;}
   if(header&&!body&&/^(FMAT,2|VER,1)$/.test(c))continue;throw Error('Unsupported drill command '+c.slice(0,24));
  }if(!header||!body||!unit)throw Error('Missing drill header, body, or units.');if(!ended)warn('Missing M30 drill end command.');return {kind:'gerber',format:'excellon',path,primitives,layers:[path],warnings,attributes:{},units:'mm',readOnly:true};
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
 const api={build,parse:build,paint,LIMITS};root.KiCadGerberRenderer=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
