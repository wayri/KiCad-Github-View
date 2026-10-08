const test=require('node:test'),assert=require('node:assert/strict');
const {host,repository,library}=require('../../android-app/web/gitlab.js');
const store=()=>{const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
test('GitLab server and nested project input reject credentials and foreign paths',()=>{
 assert.equal(host('https://gitlab.example.org/'),'https://gitlab.example.org');
 assert.equal(repository('https://gitlab.example.org/group/sub/project/','https://gitlab.example.org'),'group/sub/project');
 for(const value of ['http://gitlab.com','https://user:secret@gitlab.com','https://gitlab.com/api/v4','https://gitlab.com?token=secret','https://localhost'])assert.throws(()=>host(value));
 for(const value of ['group/../project','group/-/project','https://other.test/group/project','https://gitlab.com/group/project/-/blob/main/a','https://gitlab.com/group/project?private_token=secret'])assert.throws(()=>repository(value,'https://gitlab.com'));
});
test('GitLab saved projects are host-scoped and contain metadata only',()=>{
 const storage=store(),saved=library(storage),item={host:'https://gitlab.com',repository:'group/sub/project',ref:'main',sha:'a'.repeat(40),private:true,token:'secret',files:['private source']};saved.save(item);saved.save(item);saved.save({...item,host:'https://gitlab.example.org'});
 assert.equal(saved.list().length,2);assert.deepEqual(Object.keys(saved.list()[0]),['host','repository','ref','sha','private']);assert.ok(!storage.getItem('android-gitlab-projects-v1').includes('secret'));saved.remove(item);assert.equal(saved.list().length,1);
});
