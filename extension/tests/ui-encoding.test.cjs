const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('product UI sources contain no corrupted UTF-8 punctuation literals',()=>{
 const root=path.resolve(__dirname,'../..'),bad=/\u00c3\u0192|\u00e2\u20ac|\u00e2\u2013|\u00c2\u00b7|\u00c3\u2014/;
 for(const folder of ['extension','android-app/web'])for(const name of fs.readdirSync(path.join(root,folder))){if(!/\.(js|css|html)$/.test(name))continue;assert.doesNotMatch(fs.readFileSync(path.join(root,folder,name),'utf8'),bad,folder+'/'+name);}
});
