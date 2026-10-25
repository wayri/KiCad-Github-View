const test=require('node:test'),assert=require('node:assert/strict');
const {selectTab}=require('../../android-app/web/android-project.js');
test('project tabs switch one task at a time without replacing file/report state',()=>{
 const overview={hidden:false},files={hidden:true,query:'sensor',scrollTop:210},reports={hidden:true,query:'thermal'};
 const pages=new Map([['overview',overview],['files',files],['reports',reports]]),tabs=new Map([...pages.keys()].map(key=>[key,{attrs:{},setAttribute(k,v){this.attrs[k]=v;}}]));
 assert.equal(selectTab(pages,tabs,'files'),true);assert.equal(overview.hidden,true);assert.equal(files.hidden,false);assert.equal(reports.hidden,true);assert.equal(tabs.get('files').attrs['aria-selected'],'true');assert.equal(tabs.get('files').tabIndex,0);assert.equal(tabs.get('overview').tabIndex,-1);
 selectTab(pages,tabs,'reports');selectTab(pages,tabs,'files');assert.equal(files.query,'sensor');assert.equal(files.scrollTop,210);assert.equal(reports.query,'thermal');assert.equal(selectTab(pages,tabs,'missing'),false);assert.equal(files.hidden,false);
});
