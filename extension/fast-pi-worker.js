/* Dedicated bounded experimental DC solve; no network or design writes. */
'use strict';
importScripts('fast-pi.js');
self.onmessage=event=>{try{self.postMessage({ok:true,result:self.KiCadFastPI.solveBoard(event.data.ast,event.data.options)});}catch(error){self.postMessage({ok:false,error:error.message});}};
