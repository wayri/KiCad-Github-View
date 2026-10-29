/* Shared screen-space layout for saved pad identities in the 2D and 3D viewers. */
((root)=>{'use strict';
 const safe=value=>typeof value==='string'&&value.length<=160&&!/[\x00-\x1f\x7f-\x9f\u2028-\u202e\u2066-\u2069]/.test(value)?value.trim():'';
 // Both viewers use monospace text. Reserve a full em for wide Unicode glyphs.
 const units=text=>Array.from(text).reduce((sum,char)=>sum+(char.codePointAt(0)>255?1:.63),0);
 function middleEllipsis(text,limit){
  if(units(text)<=limit)return text;
  const chars=Array.from(text),prefix=[0];
  for(const char of chars)prefix.push(prefix[prefix.length-1]+units(char));
  for(let keep=chars.length-1;keep>=2;keep--){
   const left=Math.ceil(keep/2),right=Math.floor(keep/2),width=prefix[left]+1+prefix[chars.length]-prefix[chars.length-right];
   if(width<=limit)return chars.slice(0,left).join('')+'…'+chars.slice(chars.length-right).join('');
  }
  return '';
 }
 function layout({number,pinName='',net='',widthPx,heightPx,maxSize=18,minPadPx=13}={}){
  number=safe(number);pinName=safe(pinName);net=safe(net);
  if(!number||!Number.isFinite(widthPx)||!Number.isFinite(heightPx)||!Number.isFinite(minPadPx)||Math.min(widthPx,heightPx)<Math.max(0,minPadPx))return null;
  const max=Number.isFinite(maxSize)?Math.max(9,Math.min(18,maxSize)):18,usableWidth=Math.floor(widthPx)-4,usableHeight=Math.floor(heightPx)-2;
  const fitSize=lines=>Math.floor(Math.min(max,usableWidth/units(number),usableHeight/(lines*1.2)));
  let size=net?fitSize(2):fitSize(1),hasNet=Boolean(net&&size>=9);
  if(!hasNet)size=fitSize(1);
  if(size<9)return null;
  const limit=usableWidth/size,title=pinName&&units(number+' '+pinName)<=limit?number+' '+pinName:number;
  const fittedNet=hasNet?middleEllipsis(net,limit):'',lines=fittedNet?[title,fittedNet]:[title];
  const width=Math.ceil(Math.max(...lines.map(units))*size+4),height=Math.ceil(lines.length*size*1.2+2);
  return {text:lines.join('\n'),lines,size,width,height};
 }
 const api=Object.freeze({layout});root.KiCadPadLabels=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
