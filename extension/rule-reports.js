/* Import saved KiCad check results; this module does not execute ERC or DRC. */
((root)=>{
 'use strict';
 const MAX_BYTES=5*1024*1024,MAX_FINDINGS=10000,MAX_ITEMS=50000;
 const UUID='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
 const uuidRE=new RegExp('^'+UUID+'$'),sheetRE=new RegExp('^/(?:'+UUID+'/)*'+UUID+'/?$');
 const scales={mm:1,mils:0.0254,in:25.4};
 const fail=message=>{throw new Error('KiCad check report: '+message);};
 function object(value,label){if(!value||typeof value!=='object'||Array.isArray(value))fail(label+' must be an object.');return value;}
 function keys(value,allowed,label){object(value,label);if(Object.keys(value).some(key=>!allowed.includes(key)))fail(label+' contains unsupported fields.');}
 function string(value,label,max=10000,empty=false){if(typeof value!=='string'||value.length>max||(!empty&&!value.length)||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))fail(label+' is invalid.');return value;}
 function array(value,label,max){if(!Array.isArray(value)||value.length>max)fail(label+' must be an array of at most '+max+' entries.');return value;}
 function validFile(file,kind){return typeof file==='string'&&file.length>0&&file.length<=1000&&!/[\x00-\x1f\x7f\\:]/.test(file)&&!file.startsWith('/')&&!file.split('/').some(p=>!p||p==='.'||p==='..')&&new RegExp('\\.kicad_'+(kind==='erc'?'sch':'pcb')+'$','i').test(file);}
 function parse(text,options={}){
  if(typeof text!=='string'||text.length>MAX_BYTES||new TextEncoder().encode(text).length>MAX_BYTES)fail('JSON input must be text no larger than 5 MiB.');
  object(options,'Import options');
  let data;try{data=JSON.parse(text);}catch{fail('Invalid JSON.');}
  object(data,'Report');
  const schemas={erc:'https://schemas.kicad.org/erc.v1.json',drc:'https://schemas.kicad.org/drc.v1.json'};
  let kind=Object.keys(schemas).find(key=>data.$schema===schemas[key]);
  if(data.$schema!==undefined&&!kind)fail('Unsupported schema; only official ERC/DRC v1 reports are supported.');
  if(!kind){if(Array.isArray(data.sheets)&&data.violations===undefined)kind='erc';else if(Array.isArray(data.violations)&&data.sheets===undefined)kind='drc';else fail('Cannot identify an ERC or DRC report.');}
  if(options.kind!==undefined&&options.kind!==kind)fail('Report kind does not match the selected drawing.');
  const common=['$schema','source','date','kicad_version','coordinate_units','included_severities','ignored_checks'];
  keys(data,[...common,...(kind==='erc'?['sheets']:['violations','unconnected_items','schematic_parity'])],'Report');
  const source=string(data.source,'Source',4096),date=string(data.date,'Generation date',100),kicadVersion=string(data.kicad_version,'KiCad version',100);
  if(!/^\d{4}-\d\d-\d\dT/.test(date)||!Number.isFinite(Date.parse(date)))fail('Generation date is not a valid ISO date-time.');
  if(!Object.hasOwn(scales,data.coordinate_units))fail('Coordinates need explicit mm, mils or in units.');
  const scale=scales[data.coordinate_units],file=options.file??null;
  if(file!==null&&!validFile(file,kind))fail('Explicit drawing association must be a safe repository-relative KiCad path of the correct kind.');
  const mappings=options.sheetFiles??{};object(mappings,'Sheet associations');
  if(Object.keys(mappings).length>1000)fail('Too many sheet associations.');
  for(const [key,value] of Object.entries(mappings))if((key!=='/'&&!sheetRE.test(key))||!validFile(value,'erc'))fail('Invalid explicit sheet association.');
  const warnings=['Imported check results are saved evidence, not a live check. Their match to the loaded design revision is unverified.'];
  if(data.$schema===undefined)warnings.push('Report has no schema declaration; recognized v1 structure was used.');
  if(!file)warnings.push('No drawing file is associated. Resolve an exact item identity or explicitly associate a drawing before navigating.');
  if(file&&source.replace(/\\/g,'/').split('/').at(-1)!==file.split('/').at(-1))warnings.push('Report source filename differs from the associated drawing; coordinates may be stale or unrelated.');
  const includedSeverities=data.included_severities===undefined?null:array(data.included_severities,'Included severities',3).map(value=>{if(!['error','warning','exclusion'].includes(value))fail('Unsupported included severity.');return value;});
  const ignoredChecks=data.ignored_checks===undefined?[]:array(data.ignored_checks,'Ignored checks',1000).map(value=>{keys(value,['key','description'],'Ignored check');return {key:string(value.key,'Ignored check key',200),description:string(value.description,'Ignored check description')};});
  const findings=[],sheets=[];let totalItems=0,missingPositions=0,unmappedSheets=0;
  function add(violations,category,association,sheet){
   array(violations,category,MAX_FINDINGS);
   for(const [index,value] of violations.entries()){
    if(findings.length>=MAX_FINDINGS)fail('More than 10000 findings.');
    keys(value,['type','description','severity','items','excluded','comment'],'Finding');
    if(!['error','warning','exclusion'].includes(value.severity))fail('Unsupported finding severity.');
    if(value.excluded!==undefined&&typeof value.excluded!=='boolean')fail('Excluded flag must be boolean.');
    const finding={id:kind+':'+category+':'+(sheet?.uuidPath??'board')+':'+index,kind,category,type:string(value.type,'Finding type',200),description:string(value.description,'Finding description'),severity:value.severity,excluded:value.excluded===true||value.severity==='exclusion',file:association,items:[]};
    if(sheet){finding.sheetPath=sheet.path;finding.sheetUuidPath=sheet.uuidPath;}
    if(value.comment!==undefined)finding.comment=string(value.comment,'Exclusion comment',10000,true);
    for(const item of array(value.items,'Affected items',100)){
     if(++totalItems>MAX_ITEMS)fail('More than 50000 affected items.');
     keys(item,['uuid','description','pos'],'Affected item');
     const result={description:string(item.description,'Item description'),file:association,position:null};
     if(sheet){result.sheetPath=sheet.path;result.sheetUuidPath=sheet.uuidPath;}
     if(item.uuid!==undefined){if(typeof item.uuid!=='string'||!uuidRE.test(item.uuid))fail('Invalid affected item UUID.');result.uuid=item.uuid;}
     if(item.pos===undefined||item.pos===null)missingPositions++;
     else{
      keys(item.pos,['x','y'],'Position');
      if(!['x','y'].every(key=>typeof item.pos[key]==='number'&&Number.isFinite(item.pos[key])&&Math.abs(item.pos[key]*scale)<=1e6))fail('Position must contain finite x/y coordinates within 1000000 mm.');
      result.position={x:item.pos.x*scale,y:item.pos.y*scale};
     }
     finding.items.push(result);
    }
    findings.push(finding);
   }
  }
  if(kind==='drc'){
   for(const category of ['violations','unconnected_items','schematic_parity'])add(data[category]??(category==='violations'?undefined:[]),category,file);
  }else{
   const seen=new Set();
   for(const value of array(data.sheets,'Sheets',1000)){
    keys(value,['uuid_path','path','violations'],'Sheet');
    const path=string(value.path,'Sheet display path',2000),uuidPath=string(value.uuid_path,'Sheet UUID path',2000);
    if(uuidPath!=='/'&&!sheetRE.test(uuidPath))fail('Invalid sheet UUID path.');
    if(seen.has(uuidPath))fail('Duplicate sheet UUID path.');seen.add(uuidPath);
    const association=Object.hasOwn(mappings,uuidPath)?mappings[uuidPath]:(path==='/'?file:null);
    const sheet={path,uuidPath,file:association};sheets.push(sheet);
    if(!association)unmappedSheets++;
    add(value.violations,'violations',association,sheet);
   }
  }
  if(missingPositions)warnings.push(missingPositions+' affected item(s) have no position; no marker coordinates were invented.');
  if(unmappedSheets)warnings.push(unmappedSheets+' ERC sheet(s) have no file association. Use unique item UUIDs or explicit sheet-to-file associations; display names are not filenames.');
  const reportPath=options.reportPath===undefined?null:string(options.reportPath,'Report provenance path',2000);
  const revision=options.revision===undefined?null:string(options.revision,'Report provenance revision',200);
  return {kind,metadata:{schema:data.$schema??null,source,date,kicadVersion,coordinateUnits:data.coordinate_units,reportPath,revision,associatedFile:file,associationVerified:false,includedSeverities,ignoredChecks},sheets,findings,warnings};
 }
 root.KiCadRuleReports={parse,validFile,MAX_BYTES,MAX_FINDINGS};
 if(typeof module==='object'&&module.exports)module.exports=root.KiCadRuleReports;
})(globalThis);
