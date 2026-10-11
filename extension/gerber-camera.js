/* CSS-pixel camera contract; backing resolution never changes source picking. */
((root)=>{'use strict';
 const clamp=value=>Math.max(.001,Math.min(10000,value));
 function world(c,p,s){return{x:(p.x-s.width/2)/c.scale+c.x,y:(p.y-s.height/2)/c.scale+c.y};}
 function screen(c,p,s){return{x:(p.x-c.x)*c.scale+s.width/2,y:(p.y-c.y)*c.scale+s.height/2};}
 function zoom(c,factor,anchor,size){if(!Number.isFinite(factor)||factor<=0)throw Error('Invalid zoom factor.');const before=world(c,anchor,size),next={...c,scale:clamp(c.scale*factor)},after=world(next,anchor,size);next.x+=before.x-after.x;next.y+=before.y-after.y;return next;}
 function fit(b,s){if(!b||s.width<=0||s.height<=0)return null;return{x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2,scale:clamp(Math.min(s.width/Math.max(.01,b.width),s.height/Math.max(.01,b.height))*.88)};}
 function pinch(c,start,current,size){const midpoint=p=>({x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2}),distance=p=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(distance(start)<4)return c;const before=world(c,midpoint(start),size),next={...c,scale:clamp(c.scale*distance(current)/distance(start))},after=world(next,midpoint(current),size);next.x+=before.x-after.x;next.y+=before.y-after.y;return next;}
 const api={world,screen,zoom,fit,pinch};root.KiCadGerberCamera=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
