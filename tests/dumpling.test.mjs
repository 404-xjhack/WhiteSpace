import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, focusStep, replayStep, setAmount, perform } from '../public/experiences/dumpling/state.js';
import { STEPS } from '../public/experiences/dumpling/data.js';
import { startServer } from './helpers.mjs';

function finish(state) {
  const step=STEPS.find(s=>s.id===state.currentStepId);
  while(state.steps[step.id].phase<step.actions.length)state=perform(state,step.actions[state.steps[step.id].phase].id).state;
  return state;
}
test('Scene: viewing arbitrary steps never completes an operation; out-of-order actions do not advance',()=>{
  let state=focusStep(createState(),'cook');assert.deepEqual(state.completedStepIds,[]);
  assert.equal(perform(state,'serve').changed,false);assert.equal(state.steps.cook.phase,0);
  assert.equal(focusStep(state,'unknown'),state);
});
test('Scene: rolling needs three passes; oversized filling must be adjusted before folding',()=>{
  let state=focusStep(createState(),'roll');state=perform(state,'press').state;
  state=perform(state,'roll').state;assert.equal(state.steps.roll.phase,1);assert.equal(state.steps.roll.passes,1);
  state=finish(state);assert.deepEqual(state.completedStepIds,['roll']);
  state=setAmount(focusStep(state,'wrap'),'large');state=perform(state,'place').state;
  const failed=perform(state,'fold');assert.equal(failed.changed,false);assert.match(failed.feedback,/馅量太多/);
  state=setAmount(state,'fit');state=finish(state);assert.equal(state.steps.wrap.phase,3);
  assert.equal(setAmount(state,'large'),state);
});
test('Scene: completion occurs once, replay retains learned steps, reset is independent of application storage',()=>{
  let state=createState(),finishes=0;
  for(const step of STEPS){state=focusStep(state,step.id);while(state.steps[step.id].phase<step.actions.length){const result=perform(state,step.actions[state.steps[step.id].phase].id);state=result.state;finishes+=Number(result.finishedNow);}}
  assert.equal(finishes,1);assert.equal(state.completedStepIds.length,6);
  state=replayStep(state);assert.equal(state.steps.cook.phase,0);assert.equal(state.completedStepIds.length,6);
  assert.equal(perform(finish(state),'serve').finishedNow,false);
  assert.deepEqual(createState(JSON.parse(JSON.stringify(state))),state);
  assert.equal(createState().completedStepIds.length,0);
});
test('Scene: damaged stored data cannot create impossible steps or unsupported filling amounts',()=>{
  const state=createState({version:1,currentStepId:'bad',steps:{wrap:{phase:3,passes:0,amount:'large'},roll:{phase:2,passes:1,amount:'fit'},dough:{phase:99,passes:0,amount:'fit'}},completedStepIds:['bad']});
  assert.equal(state.currentStepId,'dough');assert.equal(state.steps.wrap.phase,0);assert.equal(state.steps.roll.phase,0);assert.equal(state.steps.dough.phase,0);assert.deepEqual(state.completedStepIds,[]);
});
test('Scene: independent entry and local rendering assets are served without opening the project root',async t=>{
  const app=await startServer();t.after(()=>app.close());
  const page=await fetch(`${app.url}/dumpling-house.html?embed=1`);assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/text\/html/);
  const html=await page.text();assert.match(html,/\/experiences\/dumpling\/main.js/);assert.doesNotMatch(html,/unpkg|HOTZONE|NEEDS/);
  for(const file of ['main.js','state.js','models.js','renderer.js','vendor/three.module.js','vendor/OrbitControls.js']){const result=await fetch(`${app.url}/experiences/dumpling/${file}`);assert.equal(result.status,200);assert.match(result.headers.get('content-type'),/javascript/);}
  for(const forbidden of ['/.env','/package.json','/server.mjs'])assert.equal((await fetch(app.url+forbidden)).status,404);
  assert.equal((await fetch(app.url+'/')).status,200);
});
