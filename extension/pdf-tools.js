/* Bounded, binary PDF intake; no PDF actions or remote URLs are executed. */
((root)=>{'use strict';
 const LIMITS=Object.freeze({bytes:32*1024*1024,pages:5000,searchPages:500,textCharacters:4000000,canvasPixels:16000000});
 function bytes(input){let data;if(input instanceof Uint8Array)data=input;else if(input instanceof ArrayBuffer)data=new Uint8Array(input);else if(input&&typeof input.base64==='string'){const raw=input.base64.replace(/[\r\n]/g,'');if(raw.length>Math.ceil(LIMITS.bytes/3)*4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw))throw Error('Invalid or oversized PDF binary payload.');const decoded=root.atob(raw);data=Uint8Array.from(decoded,c=>c.charCodeAt(0));}else throw Error('PDF requires binary data.');
  if(!data.length||data.length>LIMITS.bytes)throw Error('PDF must be between 1 byte and 32 MiB.');
  const header=String.fromCharCode(...data.subarray(0,1024));if(!/%PDF-\d\.\d/.test(header))throw Error('This file does not have a PDF header.');return data;
 }
 function canvasScale(width,height,requested,dpr=1){if(![width,height,requested,dpr].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid PDF page dimensions.');return Math.min(requested*dpr,Math.sqrt(LIMITS.canvasPixels/(width*height)),8192/Math.max(width,height));}
 function pageNumber(value,total){if(!Number.isInteger(total)||total<1||total>LIMITS.pages)throw Error('PDF exceeds the 5,000-page limit.');const n=Number(value);if(!Number.isInteger(n)||n<1||n>total)throw Error('Choose a page from 1 to '+total+'.');return n;}
 const api={LIMITS,bytes,canvasScale,pageNumber};root.KiCadPDFTools=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
