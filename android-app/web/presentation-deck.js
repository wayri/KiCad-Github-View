/* Project-scoped, local slide decks. No publishing or remote dependencies. */
((root)=>{
'use strict';
const MAX_SLIDES=30,MAX_IMAGES=12*1024*1024;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function image(value){
 if(value==='')return value;
 if(typeof value!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Use a PNG, JPEG or WebP screenshot.');
 const payload=value.slice(value.indexOf(',')+1);if(payload.length%4!==0)throw Error('Screenshot encoding is invalid.');
 const bytes=atob(payload.slice(0,Math.min(payload.length,32)));
 if(value.startsWith('data:image/png;')&&!bytes.startsWith('\x89PNG\r\n\x1a\n')||value.startsWith('data:image/jpeg;')&&!bytes.startsWith('\xff\xd8\xff')||value.startsWith('data:image/webp;')&&!(bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP'))throw Error('Screenshot format does not match its image type.');
 return value;
}
function text(value,limit,label){if(typeof value!=='string'||value.length>limit)throw Error(`${label} is limited to ${limit} characters.`);return value;}
function validate(slides){
 if(!Array.isArray(slides)||slides.length>MAX_SLIDES)throw Error('A presentation can contain up to 30 slides.');
 const ids=new Set();let images=0;
 const result=slides.map(s=>{if(!s||typeof s.id!=='string'||!s.id||s.id.length>120||ids.has(s.id))throw Error('Presentation slide identity is invalid.');ids.add(s.id);
 const shot=image(s.image);images+=shot.length;return{id:s.id,title:text(s.title,180,'Title'),notes:text(s.notes,12000,'Notes'),image:shot};});
 if(images>MAX_IMAGES)throw Error('Presentation screenshots exceed 12 MiB. Remove a screenshot or use a smaller capture.');
 return result;
}
function create({storage,projectKey}){
 if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw Error('Presentation storage is unavailable.');
 if(typeof projectKey!=='string'||!projectKey||projectKey.length>4096)throw Error('Open a project before creating a presentation.');
 const key='pocket-kivi.presentation.v1:'+encodeURIComponent(projectKey);
 function load(){const raw=storage.getItem(key);if(raw===null)return[];let value;try{value=JSON.parse(raw);}catch(_){throw Error('The saved presentation is unreadable.');}if(value?.version!==1)throw Error('The saved presentation version is unsupported.');return validate(value.slides);}
 function save(slides){const next=validate(slides);try{storage.setItem(key,JSON.stringify({version:1,slides:next}));}catch(_){throw Error('Presentation could not be saved. Storage may be full; your previous slides are unchanged.');}return next;}
 function find(slides,id){const index=slides.findIndex(s=>s.id===id);if(index<0)throw Error('This slide no longer exists.');return index;}
 return{load,list:load,
  add({title='',notes='',image:shot='' }={}){const slides=load();let id;do{id=root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}while(slides.some(s=>s.id===id));return save([...slides,{id,title,notes,image:shot}]);},
  update(id,patch){if(!patch||Object.keys(patch).some(k=>!['title','notes','image'].includes(k)))throw Error('Only title, notes and screenshot can be edited.');const slides=load(),index=find(slides,id);slides[index]={...slides[index],...patch};return save(slides);},
  remove(id){const slides=load();slides.splice(find(slides,id),1);return save(slides);},
  move(id,newIndex){const slides=load(),index=find(slides,id);if(!Number.isInteger(newIndex)||newIndex<0||newIndex>=slides.length)throw Error('Slide position is invalid.');const [slide]=slides.splice(index,1);slides.splice(newIndex,0,slide);return save(slides);},
  exportHtml(){return exportHtml(load());}
 };
}
function exportHtml(slides){
 const checked=validate(slides);if(!checked.length)throw Error('Add a slide before exporting.');
 const pages=checked.map((s,i)=>`<section class="slide"${i?' hidden':''}><h1>${escape(s.title||'Slide '+(i+1))}</h1>${s.image?`<img alt="Project view for slide ${i+1}" src="${s.image}">`:''}<p>${escape(s.notes)}</p></section>`).join('');
 return`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pocket KiVi presentation</title><style>*{box-sizing:border-box}body{margin:0;background:#10202c;color:#edf5fa;font:16px system-ui}main{padding:24px;max-width:1400px;margin:auto}.slide{height:calc(100dvh - 100px);display:flex;flex-direction:column;gap:12px}.slide[hidden]{display:none}h1{margin:0;font-size:clamp(22px,4vw,40px)}img{min-height:0;flex:1;object-fit:contain;max-width:100%}p{white-space:pre-wrap;overflow:auto;max-height:25vh;line-height:1.5;margin:0}nav{display:flex;gap:12px;align-items:center;justify-content:center;padding:12px}button{padding:10px 18px;border:1px solid #687d8e;border-radius:8px;background:#233b4d;color:inherit;font:inherit}button:disabled{opacity:.4}</style><main>${pages}</main><nav aria-label="Slide navigation"><button id="previous">Previous</button><output id="position" aria-live="polite"></output><button id="next">Next</button></nav><script>(()=>{const slides=[...document.querySelectorAll('.slide')];let index=0;const previous=document.getElementById('previous'),next=document.getElementById('next');function show(value){index=Math.max(0,Math.min(slides.length-1,value));slides.forEach((s,i)=>s.hidden=i!==index);previous.disabled=index===0;next.disabled=index===slides.length-1;document.getElementById('position').textContent=(index+1)+' / '+slides.length;}previous.onclick=()=>show(index-1);next.onclick=()=>show(index+1);document.addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();show(index+1);}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();show(index-1);}if(e.key==='Home')show(0);if(e.key==='End')show(slides.length-1);});show(0);})();</script></html>`;
}
root.KiCadAndroidPresentationDeck={create,exportHtml,MAX_SLIDES,MAX_IMAGES};
if(typeof module==='object'&&module.exports)module.exports=root.KiCadAndroidPresentationDeck;
})(globalThis);
