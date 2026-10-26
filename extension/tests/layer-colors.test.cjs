const test=require('node:test'),assert=require('node:assert/strict');
const palette=require('../layer-colors.js'),pcb=require('../pcb-renderer.js'),gerber=require('../gerber-analysis.js');
test('PCB layer hues and alpha match KiCad Default values',()=>{
 for(const [layer,color]of Object.entries({'F.Cu':'#c83434','B.Cu':'#4d7fc4','In1.Cu':'#7fc87f','In2.Cu':'#ce7d2c','In9.Cu':'#8dcb81','In30.Cu':'#f2eda1','F.SilkS':'#f2eda1','B.SilkS':'#e8b2a7','F.Fab':'#afafaf','B.Fab':'#585d84','F.CrtYd':'#ff26e2','B.CrtYd':'#26e9ff','Edge.Cuts':'#d0d2cd','User.2':'#5994dc'}))assert.equal(palette.hexFor(layer),color,layer);
 assert.equal(pcb.colorFor('F.Cu'),'#c83434');assert.equal(pcb.colorFor('F.Mask'),'rgba(216,100,255,0.4)');assert.equal(pcb.colorFor('B.Paste'),'rgba(0,194,194,0.9)');
 assert.equal(palette.hexFor('unknown-layer'),'#c2c2c2');
});
test('Gerber saved X2 and explicit filename roles share the same PCB layer identity',()=>{
 for(const [path,attrs,expected]of [['board.gbl',{},'B.Cu'],['board.gts',{},'F.Mask'],['board-In2_Cu.gbr',{},'In2.Cu'],['layer.gbr',{FileFunction:'Copper,L2,Inr'},'In1.Cu'],['layer.gbr',{FileFunction:'Copper,L8,Bot'},'B.Cu'],['layer.gbr',{FileFunction:'Legend,Top'},'F.SilkS'],['layer.gbr',{FileFunction:'Profile,NP'},'Edge.Cuts']])assert.equal(palette.fabricationLayer(gerber.role(path,{attributes:attrs}).name),expected);
 assert.equal(palette.fabricationLayer('Unknown layer'),null);assert.equal(palette.fabricationLayer('Copper,L1,Inr'),null);
});
