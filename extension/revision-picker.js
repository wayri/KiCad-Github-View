/* Read-only Git host branch/file-history picker. Repository identities never come from dropdown labels. */
((root)=>{
  'use strict';
  const data=root.KiCadBrowserData||(typeof require==='function'?require('./browser-data.js'):null),SHA=/^[0-9a-f]{40}$/i;
  function comparisonQuery(request,base,head){
    if(!data.validRepository(request.repository,request.provider)||!data.validRepository(request.headRepository,request.provider)||!data.validPath(request.file)||!data.validPath(request.oldFile||request.file)||!SHA.test(head)||base&&!SHA.test(base))throw new Error('Invalid comparison location or unresolved revision.');
    const params=new URLSearchParams({repository:base?request.repository:request.headRepository,headRepository:request.headRepository,file:request.file,oldFile:base?(request.oldFile||request.file):request.file,head,status:base&&request.oldFile&&request.oldFile!==request.file?'renamed':'modified'});
    if(request.provider==='gitlab'){params.set('provider','gitlab');if(request.host)params.set('host',request.host);}if(base)params.set('base',base);
    // PR viewers use their existing merge-base comparison and do not mount this picker.
    if(request.pullNumber)throw new Error('Manual revision comparison is separate from the pull-request review.');
    return params;
  }
  function mount(options){
    const doc=options.holder.ownerDocument,request={...options.request};let epoch=0,disposed=false;
    const make=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
    const detail=make('details');detail.className='revision-picker';const summary=make('summary','Git revisions');detail.append(summary);
    const panel=make('div');panel.className='revision-picker-panel';detail.append(panel);
    const note=make('p','Browse branches and commits touching this drawing. Selecting refs does not change source files.');panel.append(note);
    const rows={};
    for(const side of ['base','head']){
      const repository=side==='base'?request.repository:request.headRepository,file=side==='base'?(request.oldFile||request.file):request.file;
      const row=make('label',`${side==='base'?'Base':'Head'} · ${repository}`),select=make('select'),input=make('input');select.setAttribute('aria-label',`${side} branches and file commits`);input.setAttribute('aria-label',`${side} branch, tag or commit`);input.placeholder='Branch, tag or commit SHA';input.value=side==='base'?request.base||'':request.head;input.maxLength=200;select.append(make('option','Choose listed revision'));select.firstChild.value='';select.addEventListener('change',()=>{if(select.value)input.value=select.value;});row.append(select,input);panel.append(row);rows[side]={select,input,repository,file};
    }
    const actions=make('div'),load=make('button','Load branches + history'),compare=make('button','Compare revisions'),view=make('button','View head');for(const button of [load,compare,view])button.type='button';actions.append(load,compare,view);panel.append(actions);
    const status=make('p');status.setAttribute('role','status');panel.append(status);options.holder.append(detail);
    const tell=text=>{status.textContent=text;};
    const busy=value=>{load.disabled=compare.disabled=view.disabled=value;};
    const send=async(type,row,ref)=>{const response=await options.send({type,...(request.provider==='gitlab'?{provider:'gitlab'}:{}),repository:row.repository,ref,file:row.file});if(!response?.ok)throw new Error(response?.error||'Repository history unavailable.');const result=response.result;if(result?.repository!==row.repository)throw new Error('Revision response repository does not match.');return result;};
    async function populate(){
      const ticket=++epoch;busy(true);tell('Loading bounded branch lists and file history…');
      try{
        const listings=new Map();for(const side of ['head','base']){const row=rows[side],ref=side==='head'?rows.head.input.value.trim()||request.head:rows.base.input.value.trim()||request.base||request.head;if(!data.validRef(ref))throw new Error('Enter a valid branch, tag or commit.');
          const key=JSON.stringify([row.repository,row.file,ref]);if(!listings.has(key)){const [branches,commits]=await Promise.all([send('revision-branches',row,ref),send('revision-commits',row,ref)]);listings.set(key,{branches,commits});}row.listing=listings.get(key);
        }
        if(disposed||ticket!==epoch)return;const warnings=new Set();
        for(const [side,row] of Object.entries(rows)){const {branches,commits}=row.listing;if(!Array.isArray(branches.branches)||branches.branches.length>100||!Array.isArray(commits.commits)||commits.commits.length>50||!SHA.test(commits.snapshotRef)||commits.file!==row.file)throw new Error('Invalid bounded revision listing.');
          row.select.replaceChildren();const placeholder=make('option','Choose branch or file commit');placeholder.value='';row.select.append(placeholder);
          const group=make('optgroup');group.label='Branches (resolved commit)';for(const branch of branches.branches){if(!data.validRef(branch.name)||!SHA.test(branch.sha))throw new Error('Invalid branch revision.');const option=make('option',`${branch.name} · ${branch.sha.slice(0,10)}`);option.value=branch.sha;group.append(option);}row.select.append(group);
          const history=make('optgroup');history.label='Commits touching this file';for(const commit of commits.commits){if(!SHA.test(commit.sha))throw new Error('Invalid file commit.');const option=make('option',`${commit.sha.slice(0,10)} · ${String(commit.date||'').slice(0,10)} · ${String(commit.message||'').slice(0,140)}`);option.value=commit.sha;history.append(option);}row.select.append(history);
          if(side==='base'&&!row.input.value&&commits.commits.length>1)row.input.value=commits.commits[1].sha;
          for(const warning of [...(branches.warnings||[]),...(commits.warnings||[])])warnings.add(String(warning).slice(0,500));
        }
        tell(`Lists loaded at immutable commits. ${[...warnings].join(' ')}`);
      }catch(error){if(!disposed&&ticket===epoch)tell(error.message);}finally{if(ticket===epoch)busy(false);}
    }
    async function openComparison(withBase){
      const ticket=++epoch;busy(true);tell('Resolving selected refs to immutable commits…');
      try{const values={};for(const side of withBase?['base','head']:['head']){const row=rows[side],ref=row.input.value.trim();if(!data.validRef(ref))throw new Error(`Enter a ${side} branch, tag or commit.`);const result=await send('revision-resolve',row,ref);if(!SHA.test(result.sha))throw new Error('The Git host returned an unresolved revision.');values[side]=result.sha;}
        if(disposed||ticket!==epoch)return;options.navigate(comparisonQuery(request,values.base||null,values.head));
      }catch(error){if(!disposed&&ticket===epoch)tell(error.message);}finally{if(ticket===epoch)busy(false);}
    }
    load.addEventListener('click',populate);compare.addEventListener('click',()=>openComparison(true));view.addEventListener('click',()=>openComparison(false));
    return {populate,openComparison,dispose(){disposed=true;epoch++;detail.remove();}};
  }
  const api={comparisonQuery,mount};root.KiCadRevisionPicker=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
