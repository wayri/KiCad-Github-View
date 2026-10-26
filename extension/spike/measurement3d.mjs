const finitePoint=point=>point&&['x','y','z'].every(axis=>typeof point[axis]==='number'&&Number.isFinite(point[axis]));
const copy=point=>({x:point.x,y:point.y,z:point.z,approximate:Boolean(point.approximate)});
export function surfaceDistance(from,to){
 if(!finitePoint(from)||!finitePoint(to))return null;
 const delta={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z},distance=Math.hypot(delta.x,delta.y,delta.z);
 if(!Number.isFinite(distance))return null;
 return{from:copy(from),to:copy(to),delta,distance,approximate:Boolean(from.approximate||to.approximate)};
}
export function distanceLabel(distance,unit='mm'){
 if(typeof distance!=='number'||!Number.isFinite(distance)||distance<0)return'—';
 return unit==='mil'?(distance/.0254).toFixed(2)+' mil':distance.toFixed(3)+' mm';
}
/** A bounded, in-memory measurement history; project source is never changed. */
export class MeasurementSession{
 constructor(){this.pending=null;this.records=[];this.selected=null;this.nextId=1;}
 add(point){if(!finitePoint(point))return null;if(!this.pending){this.pending=copy(point);this.selected=null;return{pending:this.pending};}
  const record=surfaceDistance(this.pending,point);if(!record)return null;record.id=this.nextId++;this.pending=null;this.records.unshift(record);if(this.records.length>5)this.records.length=5;this.selected=record;return record;
 }
 replay(id){const record=this.records.find(item=>item.id===Number(id));if(!record)return null;this.pending=null;this.selected=record;return record;}
 clear(){this.pending=null;this.records=[];this.selected=null;}
 snapshot(){return{pending:this.pending?copy(this.pending):null,records:this.records.map(record=>({...record,from:copy(record.from),to:copy(record.to),delta:{...record.delta}})),selected:this.selected?.id??null};}
}
