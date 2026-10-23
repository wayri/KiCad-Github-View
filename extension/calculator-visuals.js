/* Original circuit illustrations and bounded analytical plots; no simulator. */
((root)=>{'use strict';
 const fmt=n=>!Number.isFinite(Number(n))?'—':Number(Number(n).toPrecision(4)).toString();
 function plot(key,p,r,mode='response'){
  const n=k=>Number(p[k]),calc=root.KiCadCalculatorTools;let title,xLabel,yLabel,log=false,lo=0,hi=1,sample;
  if(key==='rc'&&mode==='time'){title='Ideal step response';xLabel='Time (s)';yLabel='Output (V)';hi=5*r.tau;sample=x=>calc.rc({...p,time:x}).stepOutput;}
  else if(key==='rc'){title=mode==='phase'?'Phase response':'Frequency response';xLabel='Frequency (Hz)';yLabel=mode==='phase'?'Phase (°)':'Gain (dB)';log=true;lo=r.cutoff/100;hi=r.cutoff*100;sample=x=>calc.rc({...p,frequency:x})[mode==='phase'?'phase':'gainDb'];}
  else if(key==='rlc'){title='Series resonance';xLabel='Frequency (Hz)';yLabel='Current per volt (A/V)';log=true;lo=r.resonance/10;hi=r.resonance*10;sample=x=>calc.rlc({...p,frequency:x}).currentPerVolt;}
  else if(key==='timer555'){title='Ideal timing waveform';xLabel='Time (s)';yLabel='Normalized output';hi=3*r.period;sample=x=>x%r.period<r.highTime?1:0;}
  else if(key==='buck'||key==='boost'){title='Ideal inductor ripple · CCM';xLabel='Time (s)';yLabel='Inductor current (A)';hi=3/n('frequency');sample=x=>{const phase=(x*n('frequency'))%1;return phase<r.duty?r.minCurrent+r.rippleCurrent*phase/r.duty:r.maxCurrent-r.rippleCurrent*(phase-r.duty)/(1-r.duty);};}
  else if(key==='opamp'){title='Ideal transfer · no rail clipping';xLabel='Input (V)';yLabel='Output (V)';lo=-Math.max(1,Math.abs(n('input'))*2);hi=-lo;sample=x=>r.gain*x;}
  else if(key==='reactance'){title='Reactance magnitude';xLabel='Frequency (Hz)';yLabel='Magnitude (Ω)';log=true;lo=n('frequency')/100;hi=n('frequency')*100;sample=x=>calc.reactance({...p,frequency:x}).impedance;}
  else if(key==='noise'){title='Integrated thermal noise';xLabel='Bandwidth (Hz)';yLabel='Noise (V RMS)';hi=n('bandwidth')*2;sample=x=>calc.noise({...p,bandwidth:x}).voltage;}
  else if(key==='ohm'){title='Resistor transfer';xLabel='Voltage (V)';yLabel='Current (A)';hi=Math.max(r.voltage*2,1);sample=x=>x/n('resistance');}
  else if(key==='divider'){title='Resistive load sweep';xLabel='Load (Ω)';yLabel='Output (V)';log=true;lo=n('bottom')/100;hi=n('bottom')*100;sample=x=>calc.divider({...p,load:x}).output;}
  else if(key==='led'){title='Fixed-Vf resistor requirement';xLabel='Supply (V)';yLabel='Resistance (Ω)';lo=n('forward')+.01;hi=Math.max(n('supply')*2,lo*2);sample=x=>calc.led({...p,supply:x}).resistance;}
  else if(key==='regulator'){title='Feedback resistor sweep';xLabel='R2 (Ω)';yLabel='Output (V)';hi=n('r2')*2;sample=x=>calc.regulator({...p,r2:Math.max(x,1e-12)}).output;}
  else if(key==='track'){title='Legacy IPC-2221 width estimate';xLabel='Current (A)';yLabel='Width (mm)';hi=n('current')*2;sample=x=>calc.track({...p,current:Math.max(x,1e-9)}).width;}
  else if(key==='via'){title='Barrel DC loss';xLabel='Current (A)';yLabel='Loss (W)';hi=Math.max(n('current')*2,1);sample=x=>calc.via({...p,current:x}).power;}
  else if(key==='wavelength'){title='Homogeneous-medium wavelength';xLabel='Frequency (Hz)';yLabel='Wavelength (m)';log=true;lo=n('frequency')/10;hi=n('frequency')*10;sample=x=>calc.wavelength({...p,frequency:x}).wavelength;}
  else if(key==='length'){title='Unit conversion';xLabel=p.from;yLabel=p.to;hi=Math.max(n('value')*2,1);sample=x=>calc.length({...p,value:x}).length;}
  else return null;
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<=lo)return null;
  const points=[];for(let i=0;i<=240;i++){const f=i/240,x=log?lo*Math.pow(hi/lo,f):lo+(hi-lo)*f;const y=sample(x);if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Plot exceeds the numerical range.');points.push({x,y});}
  return{title,xLabel,yLabel,log,points};
 }
 function circuit(container,key,p,r,onEdit=()=>{}){
  const d=container.ownerDocument,ns='http://www.w3.org/2000/svg',svg=d.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 520 310');svg.setAttribute('role','group');svg.setAttribute('aria-label','Circuit illustration. Select a labeled component to edit its value.');
  const add=(tag,attrs={},text,parent=svg)=>{const el=d.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;parent.append(el);return el;};
  const wire=path=>add('path',{d:path,class:'circuit-wire'}),label=(x,y,text)=>add('text',{x,y,class:'circuit-label'},text),ground=(x,y)=>wire(`M${x} ${y}v10m-14 0h28m-23 6h18m-13 6h8`);
  const value=(field,unit)=>{const v=Number(p[field]);if(!['Ω','V','A','F','H','Hz','s','W','m'].includes(unit))return fmt(v)+' '+unit;const prefixes=[['G',1e9],['M',1e6],['k',1e3],['',1],['m',1e-3],['µ',1e-6],['n',1e-9],['p',1e-12]],prefix=prefixes.find(([,scale])=>Math.abs(v)>=scale)||['',1];return fmt(v/prefix[1])+' '+prefix[0]+unit;};
  function part(x,y,field,text,type='resistor',vertical=false){const g=add('g',{transform:`translate(${x} ${y})${vertical?' rotate(90)':''}`,class:'circuit-component',role:'button',tabindex:'0','aria-label':'Edit '+text});
   const paths={resistor:'M0 0h12l6-10 12 20 12-20 12 20 12-20 6 10h18',capacitor:'M0 0h36m0-20v40m12-40v40m0-20h42',inductor:'M0 0h9c0-24 24-24 24 0c0-24 24-24 24 0c0-24 24-24 24 0h9',diode:'M0 0h30m0-16 28 16-28 16z M58-18v36M58 0h32',reversedDiode:'M0 0h30M30-18v36M58-16 30 0l28 16zM58 0h32',switch:'M0 0h20m0 0 45-20M65 0h25'};
   add('path',{d:paths[type],class:'circuit-part'},undefined,g);add('rect',{x:0,y:-24,width:90,height:48,class:'circuit-hit'},undefined,g);label(vertical?x+18:x,vertical?y+45:y-25,text);
   const edit=()=>onEdit(field);g.addEventListener('click',edit);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();edit();}});return g;}
  function source(text='Vin'){wire('M60 65v45m0 70v80h400V65');add('circle',{cx:60,cy:145,r:35,class:'circuit-part'});label(50,135,'+');label(53,165,'−');label(10,205,text);ground(260,260);}
  if(['ohm','led','rlc','reactance'].includes(key)){
   source(key==='noise'?'Thermal noise':key==='ohm'?fmt(r.voltage)+' V':'Source');wire('M60 65h90');
   if(key==='rlc'){part(150,65,'resistance',value('resistance','Ω'));part(250,65,'inductance',value('inductance','H'),'inductor');part(350,65,'capacitance',value('capacitance','F'),'capacitor');wire('M240 65h10M340 65h10M440 65h20');}
   else if(key==='led'){part(150,65,'current',fmt(r.resistance)+' Ω');wire('M240 65h50');part(290,65,'forward',value('forward','V'),'diode');wire('M380 65h80M332 35l20-20m-5 0h5v5M350 47l20-20m-5 0h5v5');}
   else{const f=key==='reactance'?(p.mode==='capacitor'?'capacitance':'inductance'):'resistance';part(220,65,f,value(f,key==='reactance'?(p.mode==='capacitor'?'F':'H'):'Ω'),key==='reactance'?(p.mode==='capacitor'?'capacitor':'inductor'):'resistor');wire('M150 65h70M310 65h150');}
  }else if(key==='noise'){
   wire('M100 150h100M290 150h130');part(200,150,'resistance',value('resistance','Ω'));for(const x of [100,420])add('circle',{cx:x,cy:150,r:5,class:'circuit-part'});label(110,85,'Open-circuit measurement terminals');label(130,220,'Thermal noise '+fmt(r.voltage)+' V RMS');label(145,250,'Bandwidth '+value('bandwidth','Hz'));
  }else if(['divider','regulator','rc'].includes(key)){
   label(20,70,key==='regulator'?'Vout':'Vin');wire('M55 80h105M250 80h90M340 80h115M340 80v35M340 205v55H55');ground(200,260);
   const top=key==='rc'?(p.mode==='highpass'?'capacitance':'resistance'):key==='divider'?'top':'r1',bottom=key==='rc'?(p.mode==='highpass'?'resistance':'capacitance'):key==='divider'?'bottom':'r2';
   part(160,80,top,value(top,top==='capacitance'?'F':'Ω'),top==='capacitance'?'capacitor':'resistor');part(340,115,bottom,value(bottom,bottom==='capacitance'?'F':'Ω'),bottom==='capacitance'?'capacitor':'resistor',true);label(390,70,key==='regulator'?'ADJ':'Vout');
   if(key==='divider'&&p.load!==''){wire('M455 80v35M455 205v55h-115');part(455,115,'load',value('load','Ω'),'resistor',true);}
   if(key==='regulator')label(25,220,'Vref across R1');
  }else if(key==='opamp'){
   wire(p.mode==='inverting'?'M40 95h25M155 95h45M60 200h140M340 145h120':'M40 95h160M160 200h40M340 145h120');add('path',{d:'M200 60v170l140-85z',class:'circuit-part'});label(211,102,p.mode==='inverting'?'−':'+');label(211,208,p.mode==='inverting'?'+':'−');label(40,78,'Vin '+value('input','V'));label(350,130,'Vout '+fmt(r.output)+' V');
   if(p.mode==='inverting'){part(65,95,'r1',value('r1','Ω'));wire('M200 95V30h90M380 30h40v115');part(290,30,'r2',value('r2','Ω'));ground(60,200);}
   else{wire('M160 200v60M150 260h110M420 145v115h-70');part(260,260,'r2',value('r2','Ω'));part(60,260,'r1',value('r1','Ω'));ground(60,260);}
  }else if(key==='buck'||key==='boost'){
   label(15,65,'Vin '+value('input','V'));wire('M35 80h100M225 80h45M360 80h80M440 80v40M440 210v50H35');ground(260,260);
   part(135,80,key==='buck'?'frequency':'inductance',key==='buck'?'Switch':value('inductance','H'),key==='buck'?'switch':'inductor');part(270,80,key==='buck'?'inductance':'output',key==='buck'?value('inductance','H'):'Diode',key==='buck'?'inductor':'diode');
   wire('M245 80v40M245 210v50');part(245,120,'frequency',key==='buck'?'Freewheel diode':'Switch',key==='buck'?'reversedDiode':'switch',true);part(440,120,'capacitance',value('capacitance','F'),'capacitor',true);label(360,60,'Vout '+value('output','V'));label(35,295,'Ideal CCM topology · load and decoupling omitted');
  }else if(key==='timer555'){
   svg.setAttribute('viewBox','0 0 520 420');add('rect',{x:120,y:100,width:175,height:210,rx:6,class:'circuit-part'});label(175,195,'555');label(270,148,'7');label(250,253,'6 / 2');wire('M50 40h350v25M400 155v15M200 310v70h270M200 100V40M230 100V40M295 155h105M295 260h105M120 200H40');part(400,65,'r1','RA '+value('r1','Ω'),'resistor',true);part(400,170,'r2','RB '+value('r2','Ω'),'resistor',true);part(470,275,'capacitance',value('capacitance','F'),'capacitor',true);wire('M400 260h70v15M470 365v15');ground(200,380);label(35,190,'OUT');label(55,35,'Vcc · pins 8 and 4');label(45,410,'Timing network · bypass parts omitted');
  }else if(key==='track'||key==='via'){
   add('rect',{x:100,y:110,width:300,height:70,rx:key==='via'?35:2,class:'circuit-copper'});label(130,90,key==='track'?'Copper track':'Plated barrel illustration');label(125,215,key==='track'?value('length','mm')+' length':value('length','mm')+' barrel length');label(125,240,key==='track'?fmt(r.width)+' mm width':value('hole','mm')+' finished hole');label(125,265,key==='track'?value('thickness','µm')+' copper':value('plating','µm')+' plating');
  }else if(key==='color'){
   add('rect',{x:90,y:110,width:340,height:90,rx:35,class:'resistor-body'});wire('M20 155h70M430 155h70');const colors={gold:'#b99421',silver:'#a6a6a6',brown:'#805231',violet:'#7b3ca2',gray:'#777',none:'transparent'},bands=String(p.bands).split(/[ ,]+/);
   bands.forEach((c,i)=>add('rect',{x:145+i*45,y:111,width:20,height:88,fill:colors[c]||c}));label(150,250,fmt(r.resistance)+' Ω ± '+fmt(r.tolerance)+'%');
  }else{wire('M40 160h440');if(key==='wavelength'){const pts=Array.from({length:121},(_,i)=>[40+i*3.6,150-55*Math.sin(i/120*4*Math.PI)].join(',')).join(' ');add('polyline',{points:pts,class:'circuit-part'});label(120,65,'λ = '+fmt(r.wavelength)+' m');}else{label(100,115,fmt(p.value)+' '+p.from+' = '+fmt(r.length)+' '+p.to);label(150,220,'Dimension conversion');}}
  container.replaceChildren(svg);return svg;
 }
 const api={plot,circuit};root.KiCadCalculatorVisuals=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
