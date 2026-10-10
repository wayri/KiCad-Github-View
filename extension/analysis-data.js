/* Inert saved analysis readers. Never execute reports or run a simulation. */
((root)=>{
 'use strict';
 const MAX_BYTES=64*1024*1024,MAX_ROWS=200000,MAX_FIELDS=4000;
 const candidate=path=>/\.(wbk|raw|csv|tsv|html?|json|txt)$/i.test(path);
 const numeric=value=>typeof value==='number'?Number.isFinite(value)?value:null:typeof value==='string'&&/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())?(Number.isFinite(Number(value))?Number(value):null):null;
 function delimited(text,separator){
  const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<text.length;i++){
   const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
   else if(c===separator&&!quoted){row.push(value);value='';}
   else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';if(rows.length>MAX_ROWS)throw Error('Too many data rows; split this export into smaller files.');}
   else value+=c;
  }
  if(quoted)throw Error('Incomplete quoted CSV field.');if(value||row.length){row.push(value);if(row.some(v=>v.trim()))rows.push(row);}return rows;
 }
 function tablePlot(table){
  const numericColumns=table.columns.map((_,i)=>i).filter(i=>table.rows.some(row=>numeric(row[i])!==null));
  if(numericColumns.length<2)return null;const xIndex=numericColumns[0];
  const series=numericColumns.slice(1,65).map(i=>({name:table.columns[i],points:table.rows.map(row=>({x:numeric(row[xIndex]),y:numeric(row[i])})).filter(p=>p.x!==null).map(p=>({...p,y:p.y===null?NaN:p.y}))})).filter(s=>s.points.length);
  return series.length?{title:table.title,xLabel:table.columns[xIndex],series}:null;
 }
 function csv(text,path){
  const head=text.split(/\r?\n/,1)[0],separator=/\.tsv$/i.test(path)?'\t':head.includes(';')?';':head.includes('\t')?'\t':',';
  const rows=delimited(text,separator);if(!rows.length)throw Error('The data file is empty.');
  // KiCad writes a trailing semicolon; remove only that entirely empty column.
  while(rows[0].length>1&&rows.every(row=>row.at(-1)===''))for(const row of rows)row.pop();
  const header=rows.shift().map((s,i)=>s.trim()||'Column '+(i+1));if(header.length>256)throw Error('Too many data columns.');
  if(rows.some(row=>row.length!==header.length))throw Error('CSV rows have different column counts.');if(rows.length*header.length>4000000)throw Error('Too many CSV cells; split the exported data.');
  const table={title:path.split('/').at(-1),columns:header,rows},plot=tablePlot(table);
  return {kind:'Simulation / tabular data',tables:[table],plots:plot?[plot]:[],fields:[],warnings:plot?[]:['No pair of numeric columns was found for a graph.']};
 }
 function savedPlots(value){
  const plots=[];let visited=0;
  const waveform=(title,axis,rows,xLabel)=>{if(!Array.isArray(axis)||axis.length>MAX_ROWS||!axis.length)return;const series=rows.filter(row=>Array.isArray(row.values)&&row.values.length===axis.length).map(row=>({name:row.name,points:axis.map((x,i)=>({x:numeric(x),y:numeric(row.values[i])})).filter(p=>p.x!==null).map(p=>({...p,y:p.y===null?NaN:p.y}))}));if(series.length)plots.push({title,xLabel,series});};
  const walk=(item,key,depth)=>{
   if(!item||typeof item!=='object'||depth>18||++visited>12000||plots.length>=64)return;
   if(Array.isArray(item)){for(const child of item.slice(0,100))if(child&&typeof child==='object'&&!Array.isArray(child))walk(child,key,depth+1);return;}
   if(Array.isArray(item.times_s)){
    waveform(key||'Transient',item.times_s,Object.entries(item).filter(([name,v])=>Array.isArray(v)&&/_V$|_A$/.test(name)).map(([name,values])=>({name,values})),'Time (s)');
    for(const child of [...(Array.isArray(item.loads)?item.loads:[]),...(Array.isArray(item.components)?item.components:[])])if(child&&typeof child==='object')waveform((key||'Transient')+' · '+(child.reference||child.name||child.id||'component'),item.times_s,Object.entries(child).filter(([name,v])=>Array.isArray(v)&&/_V$|_A$|temperature_c|power_W/.test(name)).map(([name,values])=>({name,values})),'Time (s)');
   }
   if(Array.isArray(item.time_ui)&&Array.isArray(item.traces_v))waveform('Illustrative eye diagram',item.time_ui,item.traces_v.slice(0,512).map((values,i)=>({name:'Trace '+(i+1)+' (V)',values})),'Time (UI)');
   if(Array.isArray(item.time_ns)&&Array.isArray(item.voltage_v))waveform('Saved step response',item.time_ns,[{name:'Voltage (V)',values:item.voltage_v}],'Time (ns)');
   if(Array.isArray(item.segments)&&key.endsWith('path')){
    let distance=0;const extracted=[],screening=[];for(const section of item.segments){const length=numeric(section?.length_mm);if(length===null||length<0){extracted.push({x:distance,y:NaN});screening.push({x:distance,y:NaN});continue;}const x=distance+length/2;extracted.push({x,y:numeric(section.impedance_ohm)??NaN});screening.push({x,y:numeric(section.screening_z0_ohm)??NaN});distance+=length;}
    if(extracted.length)plots.push({title:'Saved route impedance',xLabel:'Distance along path (mm)',series:[{name:'Reference-covered impedance (Ω)',points:extracted},{name:'Ideal continuous-plane screening (Ω)',points:screening}]});
   }
   if(Array.isArray(item.x_centers_mm)&&Array.isArray(item.y_centers_mm)&&Array.isArray(item.values_c)){
    const x=item.x_centers_mm.map(numeric),y=item.y_centers_mm.map(numeric),values=item.values_c.map(row=>Array.isArray(row)?row.map(numeric):row);
    if(x.length&&y.length&&x.length*y.length<=1000000&&x.every(v=>numeric(v)!==null)&&y.every(v=>numeric(v)!==null)&&values.length===y.length&&values.every(row=>Array.isArray(row)&&row.length===x.length))plots.push({type:'heatmap',title:key.includes('board_thermal_view')?'Illustrative junction interpolation'+(key.endsWith('.top')?' · top':key.endsWith('.bottom')?' · bottom':''):'Saved board temperature field',x,y,values,unit:'°C',label:key});
   }
   for(const name of ['rows','samples'])if(Array.isArray(item[name])&&item[name].length){const rows=item[name].filter(row=>row&&typeof row==='object'&&!Array.isArray(row)),axis=['frequency_mhz','frequency_Hz','time_s'].find(k=>rows.some(row=>numeric(row?.[k])!==null));if(axis){const names=[...new Set(rows.flatMap(row=>Object.keys(row)))].filter(k=>k!==axis&&rows.some(row=>numeric(row?.[k])!==null));waveform(key,rows.map(row=>row[axis]),names.slice(0,32).map(name=>({name,values:rows.map(row=>row[name])})),axis);}}
   for(const [name,child]of Object.entries(item))if(!['values_c','points_mm','triangles','vertices','faces','traces_v'].includes(name))walk(child,key?key+'.'+name:name,depth+1);
  };walk(value,'',0);
  const mesh=value?.mesh,result=value?.result;
  if(Array.isArray(mesh?.points_mm)&&Array.isArray(mesh?.triangles)&&mesh.points_mm.length<=200000&&mesh.triangles.length<=200000&&mesh.points_mm.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(v=>numeric(v)!==null))&&mesh.triangles.every(t=>Array.isArray(t)&&t.length===3&&t.every(i=>Number.isSafeInteger(i)&&i>=0&&i<mesh.points_mm.length))){
   const add=(title,values,nodal,unit)=>{
     if(!Array.isArray(values)||values.length!==(nodal?mesh.points_mm.length:mesh.triangles.length))return;
     const layers=Array.isArray(mesh.triangle_layer)&&mesh.triangle_layer.length===mesh.triangles.length?[...new Set(mesh.triangle_layer.map(String))].slice(0,64):[null];
     for(const layer of layers){if(plots.length>=64)break;const indices=mesh.triangles.map((_,i)=>i).filter(i=>layer===null||String(mesh.triangle_layer[i])===layer);
      const label=(Array.isArray(value.geometry?.layers)?value.geometry.layers:[]).find(l=>String(l?.id)===layer)?.name||layer;
      plots.push({type:'mesh-field',title:title+(label?' · '+label:''),points:mesh.points_mm.map(p=>p.map(numeric)),triangles:indices.map(i=>mesh.triangles[i]),values:nodal?values:indices.map(i=>values[i]),nodal,unit});}
    };
   add('Saved nodal potential',result?.potential_V,true,'V');add('Saved cell power',result?.cell_power_W,false,'W');
   if(Array.isArray(result?.cell_J_A_mm2))add('Saved current density magnitude',result.cell_J_A_mm2.map(v=>Array.isArray(v)&&v.every(n=>numeric(n)!==null)?Math.hypot(...v):null),false,'A/mm²');
  }
  const bodies=value?.bodies;if(Array.isArray(bodies)){const valid=bodies.filter(b=>Array.isArray(b?.mesh?.vertices)&&Array.isArray(b.mesh?.faces)&&b.mesh.vertices.length<=200000&&b.mesh.faces.length<=100000&&b.mesh.vertices.every(v=>Array.isArray(v)&&v.length===3&&v.every(n=>numeric(n)!==null))&&b.mesh.faces.every(f=>Array.isArray(f)&&f.length===3&&f.every(i=>Number.isSafeInteger(i)&&i>=0&&i<b.mesh.vertices.length)));if(valid.length)plots.push({type:'mechanical',title:'Saved mechanical meshes',bodies:valid.slice(0,100).map(b=>({...b,mesh:{...b.mesh,vertices:b.mesh.vertices.map(v=>v.map(numeric))}})),unit:'mm'});}
  return plots;
 }
 function json(value,path){
  const result={kind:/\.wbk$/i.test(path)?'KiCad simulation workbook':'Saved analysis report',tables:[],plots:[],fields:[],warnings:[]};let nodes=0;
  const visit=(item,key,depth)=>{
   if(++nodes>MAX_FIELDS||depth>32)return;
   if(item===null||typeof item!=='object'){result.fields.push({path:key,value:item});return;}
   if(Array.isArray(item)){
    if(item.length>MAX_ROWS)throw Error('Too many analysis rows.');
    if(item.length&&item.every(row=>row&&typeof row==='object'&&!Array.isArray(row))){
     const columns=[...new Set(item.slice(0,100).flatMap(row=>Object.keys(row).filter(k=>row[k]===null||typeof row[k]!=='object')))].slice(0,128);
     if(columns.length){const table={title:key,columns,rows:item.map(row=>columns.map(k=>row[k]??''))};result.tables.push(table);}
    }
    for(let i=0;i<Math.min(item.length,100);i++)visit(item[i],key+'['+i+']',depth+1);return;
   }
   // Plot only explicit axes or point coordinates; don't invent physical axes.
    const x=item.x||item.frequency_hz||item.time_s,y=item.y||item.values;
   if(Array.isArray(x)&&Array.isArray(y)&&x.length===y.length&&x.length&&x.every(v=>numeric(v)!==null)&&y.every(v=>numeric(v)!==null)){
    result.plots.push({title:key,xLabel:item.x_label||item.xLabel||(item.frequency_hz?'Frequency (Hz)':item.time_s?'Time (s)':'x'),series:[{name:item.name||item.y_label||item.yLabel||key,points:x.map((v,i)=>({x:numeric(v),y:numeric(y[i])}))}]});
   }
   for(const [name,child]of Object.entries(item).sort(([a],[b])=>(/schema|sha|source|status|coverage|findings|checks|assumptions|limit|warning/.test(a)?-1:/mesh|values|samples|points|traces|bodies|field/.test(a)?1:0)-(/schema|sha|source|status|coverage|findings|checks|assumptions|limit|warning/.test(b)?-1:/mesh|values|samples|points|traces|bodies|field/.test(b)?1:0)))visit(child,key?key+'.'+name:name,depth+1);
  };result.plots=savedPlots(value);visit(value,'',0);
  if(nodes>MAX_FIELDS)result.warnings.push('Property preview limited to '+MAX_FIELDS+' fields; full source remains available.');
  if(/\.wbk$/i.test(path))result.warnings.push('This workbook stores simulation commands, signals and display settings, not waveform samples. Add a KiCad CSV export or saved SPICE raw data to view graphs.');
  return result;
 }
 function raw(text){
  if(/(?:^|\n)Binary:/i.test(text))throw Error('Binary SPICE raw data is not supported. Export ASCII raw data or KiCad CSV.');
  const variableStart=text.search(/(?:^|\n)Variables:\s*\r?\n/i),valuesStart=text.search(/(?:^|\n)Values:\s*\r?\n/i);
  if(variableStart<0||valuesStart<0)throw Error('Expected an ASCII SPICE raw file with Variables and Values sections.');
  const variables=text.slice(variableStart,valuesStart).split(/\r?\n/).slice(2).filter(v=>v.trim()).map(line=>{const m=line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);if(!m)throw Error('Invalid SPICE variable declaration.');return{name:m[2],unit:m[3]};});
  const count=Number(text.match(/No\. Variables:\s*(\d+)/i)?.[1]),points=Number(text.match(/No\. Points:\s*(\d+)/i)?.[1]);
  if(!count||count!==variables.length||count>256||!Number.isSafeInteger(points)||points<1||points>MAX_ROWS||points*count>4000000)throw Error('Invalid or excessive SPICE dimensions.');
  const complex=/Flags:.*\bcomplex\b/i.test(text),lines=text.slice(valuesStart).split(/\r?\n/).slice(2).filter(line=>line.trim());
  if(lines.length!==count*points)throw Error('Incomplete SPICE raw samples.');
  const rows=[];for(let p=0;p<points;p++){const row=[];for(let v=0;v<count;v++){
   let value=lines[p*count+v].trim();if(v===0){const m=value.match(/^(\d+)\s+(.*)$/);if(!m||Number(m[1])!==p)throw Error('Invalid SPICE sample index.');value=m[2];}
   const pair=value.split(',').map(numeric);if(pair.some(n=>n===null)||pair.length!==(complex?2:1))throw Error('Invalid SPICE sample value.');if(v===0)row.push(pair[0]);else row.push(...pair);
  }rows.push(row);}
  const columns=[variables[0].name+' ('+variables[0].unit+')',...variables.slice(1).flatMap(v=>complex?[v.name+' real',v.name+' imaginary']:[v.name+' ('+v.unit+')'])];
  const table={title:'SPICE waveform samples',columns,rows};return{kind:'ASCII SPICE simulation',tables:[table],plots:[tablePlot(table)].filter(Boolean),fields:[],warnings:complex?['Complex traces are displayed as real and imaginary components.']:[]};
 }
 function uncomment(text){let output='',quoted=false,escaped=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){output+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;output+=c;}else if(c==='/'&&text[i+1]==='/'){while(i<text.length&&text[i]!=='\n')i++;output+='\n';}else if(c==='/'&&text[i+1]==='*'){const end=text.indexOf('*/',i+2);if(end<0)throw Error('Incomplete workbook comment.');i=end+1;output+=' ';}else output+=c;}return output;}
 function workbook(text){
  if(text.trimStart().startsWith('{'))return JSON.parse(uncomment(text));
  const lines=text.replace(/\r/g,'').split('\n');let cursor=0;const line=()=>{if(cursor>=lines.length)throw Error('Incomplete legacy KiCad workbook.');return lines[cursor++];},count=()=>{const n=Number(line());if(!Number.isInteger(n)||n<0||n>10000)throw Error('Invalid legacy workbook count.');return n;};
  let version=1;if(/^version\s+\d+$/i.test(lines[0]))version=Number(line().split(/\s+/)[1]);if(version<1||version>5)throw Error('Unsupported legacy workbook version.');
  const tabs=[];for(let i=0,n=count();i<n;i++){const tab={simulation_type:count(),command:line(),traces:[],measurements:[]};for(let t=0,n=count();t<n;t++)tab.traces.push({trace_type:count(),signal:line(),parameters:line()});if(version>4)for(let m=0,n=count();m<n;m++)tab.measurements.push({expression:line(),format:line()});tabs.push(tab);}
  const user_defined_signals=[];if(cursor<lines.length&&lines[cursor].trim())for(let i=0,n=count();i<n;i++)user_defined_signals.push(line());const last_sch_text_sim_command=version>=5&&cursor<lines.length?line():'';return{version,tabs,user_defined_signals,last_sch_text_sim_command};
 }
 function parse(path,content){
  if(typeof content!=='string'||new TextEncoder().encode(content).length>MAX_BYTES)throw Error('Analysis file exceeds the 64 MiB viewer budget.');
  content=content.replace(/^\uFEFF/,'');let result;
  if(/\.(csv|tsv)$/i.test(path))result=csv(content,path);
  else if(/\.raw$/i.test(path))result=raw(content);
  else if(/\.(json|wbk)$/i.test(path)){try{result=json(/\.wbk$/i.test(path)?workbook(content):JSON.parse(content),path);}catch(e){if(e instanceof SyntaxError)throw Error('Unsupported or incomplete JSON workbook/report.');throw e;}}
  else if(/\.html?$/i.test(path))result={kind:'Saved HTML report',fields:[],tables:[],plots:[],warnings:['Report scripts and external resources are never executed.'],html:content};
  else if(/\.txt$/i.test(path))result={kind:'Saved text report',fields:[{path:'Report text',value:content.slice(0,512000)}],tables:[],plots:[],warnings:[]};
  else throw Error('Open a JSON report, KiCad .wbk, CSV/TSV export, HTML report or ASCII SPICE .raw file.');
  return {...result,path,title:path.split('/').at(-1)};
 }
 const API={parse,candidate,numeric,delimited,tablePlot,MAX_BYTES};root.KiCadAnalysisData=API;if(typeof module==='object'&&module.exports)module.exports=API;
})(globalThis);
