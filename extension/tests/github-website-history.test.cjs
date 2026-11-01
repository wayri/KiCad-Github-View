const test=require('node:test'),assert=require('node:assert/strict'),{parseAtom}=require('../github-website-history.js'),{create}=require('../github-project-buffer.js');
const repository='owner/project',sha='a'.repeat(40),other='b'.repeat(40);
const entry=(id=sha,repo=repository)=>`<entry><id>tag:github.com,2008:Grit::Commit/${id}</id><link rel="alternate" type="text/html" href="https://github.com/${repo}/commit/${id}"/><title>Fix &amp; verify</title><updated>2026-10-30T01:02:03Z</updated><author><name>Designer</name></author></entry>`;
const feed=content=>`<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">${content}</feed>`;
test('Atom website history keeps exact repository links and full SHA, decodes text, bounds visible window',()=>{
 const parsed=parseAtom(feed(entry()+entry(other,'foreign/repo')+entry('bad')+entry()),{repository,ref:sha});
 assert.deepEqual(parsed.commits,[{sha,message:'Fix & verify',author:'Designer',date:'2026-10-30T01:02:03Z'}]);assert.equal(parsed.hasMore,false);assert.match(parsed.warnings[0],/initial commit window/);
 const many=Array.from({length:31},(_,i)=>entry(i.toString(16).padStart(40,'0'))).join('');assert.equal(parseAtom(feed(many),{repository,ref:'main'}).commits.length,30);
 for(const content of ['<html>Login</html>',feed(entry(other)),feed(entry()).replace('<feed','<!DOCTYPE root><feed')])assert.throws(()=>parseAtom(content,{repository,ref:sha}));
});
test('history shared buffer fetches website only, caches and retains exact pinned scope',async()=>{
 let requests=0;const api=create({readSession:async()=>{throw Error('Public feed needs no tab');},fetch:async(url,options)=>{requests++;assert.equal(url,`https://github.com/${repository}/commits/${sha}.atom`);assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);return new Response(feed(entry()),{headers:{'content-type':'application/atom+xml'}});}});
 const [a,b]=await Promise.all([api.history(repository,sha),api.history(repository,sha)]);assert.equal(requests,1);assert.deepEqual(a,b);a.commits.length=0;assert.equal((await api.history(repository,sha)).commits.length,1);api.dispose();
});
test('private history uses repository tab fallback, invalid access is explicit, and policy blocks before traffic',async()=>{
 let sessions=0;const api=create({readSession:async(repo,ref,action)=>{sessions++;assert.equal(repo,repository);assert.equal(ref,sha);assert.equal(action,'history');return {ref,content:feed(entry())};},fetch:async()=>new Response('',{status:404})});
 assert.equal((await api.history(repository,sha)).commits[0].sha,sha);assert.equal(sessions,1);api.dispose();
 const denied=create({readSession:async()=>null,fetch:async()=>new Response('',{status:403})});await assert.rejects(denied.history(repository,sha),/signed-in repository tab/);denied.dispose();
 const blocked=create({assertNetwork:()=>{throw Error('Network disabled by administrator');},readSession:async()=>assert.fail('session forbidden'),fetch:async()=>assert.fail('fetch forbidden')});await assert.rejects(blocked.history(repository,sha),/administrator/);blocked.dispose();
});
