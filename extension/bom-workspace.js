/* Source-scoped assembly progress and screen-space selection for imported BoMs. */
((root)=>{'use strict';
 const M=root.KiCadBomManager||(typeof require==='function'?require('./bom-manager.js'):null);
 const key=scope=>'kicad-bom-manager:v1:'+M.scopeKey(scope);
 function read(objects,scope,storage){const saved=storage?.getItem(key(scope));return saved?M.validateMetadata(saved,scope,new Set(M.model(objects,'footprint').map(p=>p.id))):Object.create(null);}
 function saveState(objects,scope,storage,id,state){if(!storage?.setItem)throw Error('Local storage is unavailable. Progress was not saved.');if(!M.ASSEMBLY.includes(state))throw Error('Invalid assembly state.');const part=M.model(objects,'footprint').find(p=>p.id===id);if(!part)throw Error('Part does not belong to this source.');if(!M.assemblyWorkItem(part))throw Error('DNP and excluded parts are not assembly work items.');const metadata=read(objects,scope,storage),next={...metadata,[id]:{...(metadata[id]||{}),Assembly:state}},text=M.metadataJSON(scope,next);M.validateMetadata(text,scope,new Set(M.model(objects,'footprint').map(p=>p.id)));storage.setItem(key(scope),text);return next;}
 function summary(parts){return M.assemblySummary(parts);}
 function nearest(parts,point,project,radius=18){const candidates=parts.filter(p=>p.object.position).map(part=>({part,point:project(part.object.position)})).filter(p=>p.point&&Number.isFinite(p.point.x)&&Number.isFinite(p.point.y)).map(p=>({...p,distance:Math.hypot(p.point.x-point.x,p.point.y-point.y)})).filter(p=>p.distance<=radius).sort((a,b)=>a.distance-b.distance);return{selected:candidates.length&&(candidates.length===1||candidates[1].distance-candidates[0].distance>=2)?candidates[0].part:null,candidates};}
 const api={read,saveState,summary,nearest};root.KiCadBomWorkspace=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
