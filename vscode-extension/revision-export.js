'use strict';
// Export immutable Git blobs, without checkout, filters, hooks or text decoding.
const fs=require('node:fs/promises'),path=require('node:path');
const MAX_FILES=2000,MAX_BYTES=128*1024*1024,MAX_FILE=32*1024*1024;
function portablePath(value){return typeof value==='string'&&value.length<=1000&&value.length>0&&!value.startsWith('/')&&value.split('/').length<=64&&value.split('/').every(p=>p&&p!=='.'&&p!=='..'&&p.toLowerCase()!=='.git'&&!/[\\:<>"|?*\x00-\x1f\x7f]/.test(p)&&!/[. ]$/.test(p)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));}
function inside(candidate,root){const relative=path.relative(root,candidate);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
async function collect(history,check){
 check();const inventory=await history.reader.inventory({sha:history.sha,directory:history.prefix});check();
 if(inventory.truncated||inventory.warnings?.length)throw Error('Saved project contains unsupported or unsafe entries; export was cancelled.');
 const files=[],seen=new Set();let total=0;
 for(const entry of inventory.entries){
  check();const name=history.prefix?entry.path.slice(history.prefix.length+1):entry.path;
  if(history.prefix&&!entry.path.startsWith(history.prefix+'/')||!portablePath(name)||!(entry.type==='tree'&&entry.mode==='040000'||entry.type==='blob'&&['100644','100755'].includes(entry.mode)))throw Error('Saved project contains an unsafe path or unsupported object.');
  const key=name.toLowerCase();if(seen.has(key))throw Error('Saved project has colliding portable file names.');seen.add(key);
  if(entry.type==='tree')continue;
  if(files.length>=MAX_FILES||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>MAX_FILE||(total+=entry.size)>MAX_BYTES)throw Error('Project export exceeds 2,000 files, 32 MiB per file or 128 MiB total.');
  files.push({name,path:entry.path,size:entry.size});
 }
 if(!files.length)throw Error('The selected commit contains no regular project files.');
 for(const file of files){const result=await history.reader.read({sha:history.sha,path:file.path,maxBytes:MAX_FILE});check();file.bytes=Buffer.from(result.bytes);if(file.bytes.length!==file.size)throw Error('Saved file size does not match its inventory.');}
 return files;
}
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc32(bytes){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;}
function zip(files){
 const local=[],central=[];let offset=0,centralSize=0;
 for(const file of files){const name=Buffer.from(file.name,'utf8'),crc=crc32(file.bytes),header=Buffer.alloc(30),index=Buffer.alloc(46);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(file.bytes.length,18);header.writeUInt32LE(file.bytes.length,22);header.writeUInt16LE(name.length,26);
  index.writeUInt32LE(0x02014b50);index.writeUInt16LE(20,4);index.writeUInt16LE(20,6);index.writeUInt16LE(0x800,8);index.writeUInt16LE(33,14);index.writeUInt32LE(crc,16);index.writeUInt32LE(file.bytes.length,20);index.writeUInt32LE(file.bytes.length,24);index.writeUInt16LE(name.length,28);index.writeUInt32LE(offset,42);
  local.push(header,name,file.bytes);central.push(index,name);offset+=header.length+name.length+file.bytes.length;centralSize+=index.length+name.length;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,...central,end]);
}
async function destinationPath(destination,sourceRoots){
 if(!path.isAbsolute(destination))throw Error('Select an absolute local export destination.');
 const parent=await fs.realpath(path.dirname(destination)),target=path.join(parent,path.basename(destination));
 for(const source of sourceRoots){const root=await fs.realpath(source);if(inside(target,root)||inside(root,target))throw Error('Export must be outside the source checkout.');}
 try{await fs.lstat(target);throw Error('Export destination already exists; choose a new name.');}catch(error){if(error.code!=='ENOENT')throw error;}
 return target;
}
async function writeExport({history,destination,copy,sourceRoots,check=()=>{}}){
 check();const target=await destinationPath(destination,sourceRoots),files=await collect(history,check);check();
 // Recheck after object reads/dialog latency. Exclusive creation prevents replacement.
 if(await destinationPath(destination,sourceRoots)!==target)throw Error('Export destination changed; choose it again.');check();
 if(!copy){const archive=zip(files);check();const handle=await fs.open(target,'wx');try{check();await handle.writeFile(archive);}catch(error){await handle.close();await fs.unlink(target).catch(()=>{});throw error;}await handle.close();return{path:target,files:files.length,bytes:archive.length};}
 const written=[],directories=[];
 try{
  await fs.mkdir(target);directories.push(target);
  for(const file of files){check();const parts=file.name.split('/');for(let i=1;i<parts.length;i++){const directory=path.join(target,...parts.slice(0,i));if(directories.includes(directory))continue;await fs.mkdir(directory);directories.push(directory);}const output=path.join(target,...parts),handle=await fs.open(output,'wx');written.push(output);try{check();await handle.writeFile(file.bytes);}finally{await handle.close();}}
  check();return{path:target,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes.length,0)};
 }catch(error){for(const file of written.reverse())await fs.unlink(file).catch(()=>{});for(const directory of directories.reverse())await fs.rmdir(directory).catch(()=>{});throw error;}
}
module.exports={writeExport,collect,zip,portablePath,MAX_BYTES,MAX_FILES};
