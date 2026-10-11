/* Manual planar photo registration. No image recognition or camera pose estimation. */
(function(root){
  'use strict';
  const LIMITS=Object.freeze({objects:50000,coordinate:1e7,imageDimension:32768,calibrationBytes:16384});
  function point(p){
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.max(Math.abs(p.x),Math.abs(p.y))>LIMITS.coordinate)throw Error('Invalid or out-of-range calibration point');
    return {x:p.x,y:p.y};
  }
  function quad(points,image){
    if(!Array.isArray(points)||points.length!==4)throw Error('Calibration requires exactly four points');
    const p=points.map(point);
    if(image&&p.some(q=>q.x<0||q.x>1||q.y<0||q.y>1))throw Error('Photo points must be normalized to 0–1');
    const scale=Math.max(...p.map(a=>a.x))-Math.min(...p.map(a=>a.x))+Math.max(...p.map(a=>a.y))-Math.min(...p.map(a=>a.y));
    if(scale===0)throw Error('Degenerate calibration quadrilateral');
    let sign=0;
    for(let i=0;i<4;i++){
      const a=p[i],b=p[(i+1)%4],c=p[(i+2)%4],cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if(Math.abs(cross)<scale*scale*1e-10)throw Error('Degenerate calibration quadrilateral');
      if(sign&&Math.sign(cross)!==sign)throw Error('Calibration points must follow a convex, non-crossing perimeter');
      sign=Math.sign(cross);
    }
    return p;
  }
  function solve(a){
    for(let c=0;c<8;c++){
      let pivot=c;for(let r=c+1;r<8;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;
      if(Math.abs(a[pivot][c])<1e-12)throw Error('Degenerate calibration transform');
      [a[c],a[pivot]]=[a[pivot],a[c]];
      const d=a[c][c];for(let j=c;j<9;j++)a[c][j]/=d;
      for(let r=0;r<8;r++)if(r!==c){const k=a[r][c];for(let j=c;j<9;j++)a[r][j]-=k*a[c][j];}
    }
    return a.map(row=>row[8]);
  }
  function invert(m){
    const [a,b,c,d,e,f,g,h,i]=m;
    const q=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
    const det=a*q[0]+b*q[3]+c*q[6];
    if(!Number.isFinite(det)||det===0)throw Error('Singular calibration transform');
    const result=q.map(x=>x/det);if(result.some(x=>!Number.isFinite(x)))throw Error('Invalid inverse transform');return result;
  }
  function apply(m,p){
    point(p);
    if(!Array.isArray(m)||m.length!==9||m.some(x=>!Number.isFinite(x)))throw Error('Invalid calibration transform');
    const den=m[6]*p.x+m[7]*p.y+m[8],scale=Math.abs(m[6]*p.x)+Math.abs(m[7]*p.y)+Math.abs(m[8]);
    if(Math.abs(den)<=1e-12*scale)return null;
    const x=(m[0]*p.x+m[1]*p.y+m[2])/den,y=(m[3]*p.x+m[4]*p.y+m[5])/den;
    return Number.isFinite(x)&&Number.isFinite(y)&&Math.max(Math.abs(x),Math.abs(y))<=LIMITS.coordinate?{x,y}:null;
  }
  function project(t,p){return apply(t.matrix,p);}
  function inverse(t,p){return apply(t.inverseMatrix,p);}
  function fit(boardPoints,imagePoints){
    const board=quad(boardPoints,false),image=quad(imagePoints,true);
    // Center/scale board coordinates before solving to retain accuracy on large global offsets.
    const ox=board.reduce((s,p)=>s+p.x,0)/4,oy=board.reduce((s,p)=>s+p.y,0)/4;
    const scale=Math.max(...board.map(p=>Math.hypot(p.x-ox,p.y-oy)));
    const rows=[];
    board.forEach((p,n)=>{const x=(p.x-ox)/scale,y=(p.y-oy)/scale,u=image[n].x,v=image[n].y;rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});
    const h=solve(rows),matrix=[h[0]/scale,h[1]/scale,h[2]-(h[0]*ox+h[1]*oy)/scale,h[3]/scale,h[4]/scale,h[5]-(h[3]*ox+h[4]*oy)/scale,h[6]/scale,h[7]/scale,1-(h[6]*ox+h[7]*oy)/scale];
    const t={matrix,inverseMatrix:invert(matrix),boardPoints:board,imagePoints:image};
    board.forEach((p,n)=>{const q=project(t,p);if(!q||Math.hypot(q.x-image[n].x,q.y-image[n].y)>1e-7)throw Error('Calibration reprojection failed');});
    // A horizon crossing the calibration polygon cannot describe a continuous photo of this plane.
    const signs=board.map(p=>Math.sign(matrix[6]*p.x+matrix[7]*p.y+matrix[8]));
    if(signs.some(s=>!s||s!==signs[0]))throw Error('Calibration horizon crosses board');
    return t;
  }
  function sideName(side){return side==='F.Cu'||side==='front'||side==='top'?'front':side==='B.Cu'||side==='back'||side==='bottom'?'back':null;}
  function dimension(value){if(!Number.isInteger(value)||value<1||value>LIMITS.imageDimension)throw Error('Invalid photo dimensions');return value;}
  function pick(t,objects,imagePoint,options){
    point(imagePoint);const {width,height,radiusPixels=24,side}=options||{};dimension(width);dimension(height);
    if(!Number.isFinite(radiusPixels)||radiusPixels<=0||radiusPixels>512)throw Error('Invalid picking radius');
    if(!Array.isArray(objects)||objects.length>LIMITS.objects)throw Error('Too many component candidates');
    const requested=sideName(side);if(side&&!requested)throw Error('Invalid board side');
    const candidates=[];
    for(const object of objects){
      if(!object||object.kind&&object.kind!=='footprint')continue;
      const objectSide=sideName(object.side||object.layer||object.saved?.layer);
      if(requested&&objectSide!==requested)continue;
      const p=object.position;if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
      let q;try{q=project(t,p);}catch{continue;}if(!q||q.x<0||q.x>1||q.y<0||q.y>1)continue;
      const distancePixels=Math.hypot((q.x-imagePoint.x)*width,(q.y-imagePoint.y)*height);
      if(distancePixels<=radiusPixels)candidates.push({object,imagePoint:q,distancePixels,id:object.id||null,path:object.path||null,uuid:object.uuid||null});
    }
    candidates.sort((a,b)=>a.distancePixels-b.distancePixels||String(a.path).localeCompare(String(b.path))||String(a.id).localeCompare(String(b.id)));
    const ambiguous=candidates.length>1&&candidates[1].distancePixels-candidates[0].distancePixels<=2;
    return {candidates,selected:candidates.length&&!ambiguous?candidates[0]:null,ambiguous};
  }
  function metadata(value){
    if(!value||typeof value!=='object')throw Error('Missing calibration source metadata');
    const result={};for(const key of ['sourceRevision','sourcePath','sourceFingerprint']){if(typeof value[key]!=='string'||!value[key].trim()||value[key].length>2048)throw Error('Missing or invalid '+key);result[key]=value[key];}
    if(typeof value.imageFingerprint!=='string'||!/^sha256:[0-9a-f]{64}$/i.test(value.imageFingerprint))throw Error('Missing or invalid imageFingerprint SHA-256');
    result.imageFingerprint=value.imageFingerprint.toLowerCase();
    result.side=sideName(value.side);if(!result.side)throw Error('Invalid board side');
    result.width=dimension(value.width);result.height=dimension(value.height);return result;
  }
  function exportCalibration(t,source){
    const checked=fit(t.boardPoints,t.imagePoints);
    return JSON.stringify({format:'pocket-kiview-photo-alignment',version:1,...metadata(source),boardPoints:checked.boardPoints,imagePoints:checked.imagePoints});
  }
  function importCalibration(input,expected){
    if(typeof input!=='string'||input.length>LIMITS.calibrationBytes)throw Error('Calibration file is too large or invalid');
    let data;try{data=JSON.parse(input);}catch{throw Error('Invalid calibration JSON');}
    if(!data||data.format!=='pocket-kiview-photo-alignment'||data.version!==1)throw Error('Unsupported photo calibration');
    const source=metadata(data),scope=metadata(expected);
    for(const key of Object.keys(scope))if(source[key]!==scope[key])throw Error('Calibration '+key+' does not match the current photo/board');
    return {...fit(data.boardPoints,data.imagePoints),...source};
  }
  const api={fit,project,inverse,pick,exportCalibration,importCalibration,LIMITS};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KiCadPhotoAlignment=api;
})(typeof globalThis!=='undefined'?globalThis:this);
