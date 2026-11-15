const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('../job-autopilot/background.js', 'utf8');
const code = source.slice(source.indexOf('chrome.runtime.onMessageExternal.addListener'), source.indexOf('// Toolbar icon / Alt+Shift+J:'));
let listener; const state = {}; const tabs=[]; const paired='a'.repeat(32);
const chrome = {runtime:{onMessageExternal:{addListener:f=>listener=f}},storage:{local:{get:async()=>({socialCollectorId:paired,log:[{url:'https://jobs.example/1',applyUrl:'https://jobs.example/apply/1'}],socialLeads:[],socialSeen:[]})}},tabs:{create:async()=>({id:1}),update:async(id,x)=>tabs.push(x.url)}};
vm.runInNewContext(code, {chrome, URL, setTabState:async(id,x)=>Object.assign(state,x)});
const send = (msg,id=paired) => new Promise(resolve=>listener(msg,{id},resolve));
(async()=>{
  assert.match((await send({type:'socialSync'},'b'.repeat(32))).error,/not paired/);
  assert.equal((await send({type:'socialSync'})).urls.length,2);
  assert.match((await send({type:'socialOpen',url:'javascript:alert(1)'})).error,/Invalid/);
  assert.equal((await send({type:'socialOpen',url:'https://jobs.example/1'})).ok,true);
  assert.equal(state.socialReview,true); assert.deepEqual(tabs,['https://jobs.example/1']);
  console.log('Pairing authorization, log sync and review-tab handoff passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
