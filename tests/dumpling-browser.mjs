// Real input, WebGL rendering, touch, fallback, and same-origin embedding. Node 22+ / Chromium.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root,startServer } from './helpers.mjs';
const browserPath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
if(!browserPath||typeof WebSocket==='undefined')throw new Error('Scene checks need Chromium and Node.js 22+.');
const profile=path.join(root,'.tmp',`dumpling-browser-${Date.now()}`);await mkdir(profile,{recursive:true});
const app=await startServer(),browser=spawn(browserPath,['--headless=new','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--window-size=1440,1000',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let cdp;const errors=[],requests=[],checks=[];
class CDP{
  constructor(url){this.socket=new WebSocket(url);this.next=1;this.pending=new Map();this.ready=new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true});});this.socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const item=this.pending.get(data.id);if(item){this.pending.delete(data.id);clearTimeout(item.timer);data.error?item.reject(new Error(data.error.message)):item.resolve(data.result);}}else if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text);else if(data.method==='Network.requestWillBeSent')requests.push(data.params.request.url);});}
  async send(method,params={}){await this.ready;return new Promise((resolve,reject)=>{const id=this.next++,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},15000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
}
async function evaluate(expression){const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function until(expression){const end=Date.now()+15000;while(Date.now()<end){if(await evaluate(expression))return;await pause(80);}throw new Error(`Condition failed: ${expression}`);}
async function navigate(url){await cdp.send('Page.navigate',{url});await until("document.querySelector('#viewport')?.dataset.renderer && document.querySelector('#loading').hidden");await pause(550);}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);await pause(70);const r=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`);assert.ok(r.w&&r.h,selector);await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:r.x,y:r.y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:r.x,y:r.y});await pause(50);}
async function shot(name){await pause(650);const s=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(path.join(root,'.tmp',name),Buffer.from(s.data,'base64'));}
async function stored(){return evaluate("JSON.parse(localStorage.getItem('writespace.experience.dumpling.v1'))");}
async function step(id){await click(`[data-step="${id}"]`);await pause(480);}
async function drag(kind,touch=false,valid=true){
  const coords=await evaluate(`(()=>{const a=document.querySelector('#drag-tool').getBoundingClientRect(),b=document.querySelector('#drop-target').getBoundingClientRect();return{x:a.x+a.width/2,y:a.y+a.height/2,tx:b.x+b.width/2,ty:b.y+b.height/2}})()`);
  const end=kind==='pin'?{x:coords.x+68,y:coords.y}:{x:valid?coords.tx:coords.x-70,y:valid?coords.ty:coords.y-60};
  if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:coords.x,y:coords.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:end.x,y:end.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:coords.x,y:coords.y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:end.x,y:end.y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:end.x,y:end.y});}
  await pause(140);
}
function passed(label){checks.push(label);console.log(`PASS ${label}`);}
async function screenHash(){return createHash('sha256').update((await cdp.send('Page.captureScreenshot',{format:'png'})).data).digest('hex');}
try{
  let port;for(let i=0;i<120;i++){try{port=Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await pause(100);}}
  assert.ok(port,'Chromium starts');const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();cdp=new CDP(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('Network.enable');await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:"window.experienceEvents=[];window.addEventListener('writespace:experience',e=>window.experienceEvents.push(e.detail));"});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate(app.url+'/dumpling-house.html');assert.equal(await evaluate("document.querySelector('#viewport').dataset.renderer"),'webgl');
  await shot('dumpling-dough-1440.png');assert.equal((await stored()),null);
  await step('cook');assert.equal((await stored()).completedStepIds.length,0);await step('dough');
  for(let i=0;i<3;i++)await click('#action');assert.deepEqual((await stored()).completedStepIds,['dough']);
  await click('#rest-compare');assert.match(await evaluate("document.querySelector('#feedback').textContent"),/醒面前/);await click('#rest-compare');
  await step('filling');await click('#action');await click('#action');await step('portion');await click('#action');await click('#action');
  await step('roll');await click('#action');await drag('pin');assert.equal((await stored()).steps.roll.passes,1);await click('#action');await click('#action');await shot('dumpling-wrapper-1440.png');
  await step('wrap');await click('input[value=large]');await drag('spoon',false,false);assert.equal((await stored()).steps.wrap.phase,0);
  await drag('spoon');assert.equal((await stored()).steps.wrap.phase,1);await click('#action');assert.match(await evaluate("document.querySelector('#feedback').textContent"),/馅量太多/);assert.equal((await stored()).steps.wrap.phase,1);
  await click('input[value=fit]');await click('#action');await click('#action');await shot('dumpling-pleats-1440.png');
  await step('cook');for(let i=0;i<4;i++)await click('#action');await until("document.querySelector('#summary-dialog').open");assert.equal((await stored()).completedStepIds.length,6);
  assert.equal(await evaluate("experienceEvents.filter(e=>e.type==='complete').length"),1);await click('#close-summary');await shot('dumpling-plate-1440.png');
  passed('Six-step WebGL flow: real rolling/filling drags, buttons, excessive-filling feedback, completion and review');
  await navigate(app.url+'/dumpling-house.html');assert.equal((await stored()).completedStepIds.length,6);assert.equal(await evaluate("experienceEvents.filter(e=>e.type==='complete').length"),0);
  await step('wrap');await click('#replay');assert.equal((await stored()).steps.wrap.phase,0);assert.equal((await stored()).completedStepIds.length,6);
  await click('#observe-mode');await click('[data-tool=pin]');assert.match(await evaluate("document.querySelector('#tool-detail').textContent"),/用途.*操作.*原因.*观察/);
  await click('#environment summary');await click('#show-roof');await shot('dumpling-shop-1440.png');await click('#show-roof');await click('#environment summary');
  await cdp.send('Page.bringToFront');await click('#walk');await pause(250);assert.equal(await evaluate('document.body.dataset.mode'),'walk');
  if(!await evaluate("document.pointerLockElement?.tagName==='CANVAS'"))await cdp.send('Runtime.evaluate',{expression:"document.querySelector('canvas').requestPointerLock().catch(()=>{})",userGesture:true,awaitPromise:true});
  const nativeLock=await evaluate("document.pointerLockElement?.tagName==='CANVAS'");
  if(!nativeLock){
    console.log('INFO Chromium headless denies native Pointer Lock; simulate the lock only for WASD/blur input verification.');
    await evaluate("window.sceneTestLock=document.querySelector('canvas');window.sceneNativeExit=document.exitPointerLock.bind(document);Object.defineProperty(document,'pointerLockElement',{configurable:true,get(){return sceneTestLock}});document.exitPointerLock=()=>{sceneTestLock=null;document.dispatchEvent(new Event('pointerlockchange'))};document.dispatchEvent(new Event('pointerlockchange'));");
  }
  const beforeMove=await screenHash();
  await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87,nativeVirtualKeyCode:87});await pause(120);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87,nativeVirtualKeyCode:87});
  const afterMove=await screenHash();assert.notEqual(afterMove,beforeMove,'W changes the visible camera position');
  await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87,nativeVirtualKeyCode:87});await pause(100);
  await evaluate("window.dispatchEvent(new Event('blur'))");await pause(120);
  const afterBlur=await screenHash();await pause(220);
  assert.equal(await screenHash(),afterBlur,'Blur clears movement even before keyup');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87,nativeVirtualKeyCode:87});
  await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68,nativeVirtualKeyCode:68});await pause(820);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD',windowsVirtualKeyCode:68,nativeVirtualKeyCode:68});
  await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87,nativeVirtualKeyCode:87});await pause(600);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87,nativeVirtualKeyCode:87});
  const blockedByTable=await screenHash();
  await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87,nativeVirtualKeyCode:87});await pause(600);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87,nativeVirtualKeyCode:87});
  assert.equal(await screenHash(),blockedByTable,'Forward movement stops at the wrapping table');
  if(nativeLock){await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:600,y:450});await pause(120);assert.notEqual(await screenHash(),blockedByTable,'Locked mouse input turns the camera');}
  await evaluate('document.exitPointerLock()');await pause(120);assert.match(await evaluate("document.querySelector('#scene-hint').textContent"),/暂停/);await click('#walk');
  if(!nativeLock)await evaluate("delete document.pointerLockElement;document.exitPointerLock=sceneNativeExit;");
  await evaluate("HTMLCanvasElement.prototype.requestPointerLock=undefined");await click('#walk');assert.match(await evaluate("document.querySelector('#scene-hint').textContent"),/暂停/);await click('#walk');
  await evaluate("HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(new DOMException('Test denial'))");await click('#walk');await pause(120);assert.match(await evaluate("document.querySelector('#scene-hint').textContent"),/暂停/);await click('#walk');
  passed(`Reload, replay, tools, exterior, WASD/blur, collision and Pointer Lock rejection (${nativeLock?'native lock and mouse turn':'simulated headless lock for movement'})`);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:768,height:1024,deviceScaleFactor:1,mobile:false});await click('#guide-mode');await shot('dumpling-tablet-768.png');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:true});await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await step('roll');await click('#replay');await click('#action');await evaluate("document.querySelector('#viewport').scrollIntoView({block:'center',behavior:'instant'})");await drag('pin',true);assert.equal((await stored()).steps.roll.passes,1);
  await evaluate("document.querySelector('#action').focus()");await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});await until("JSON.parse(localStorage.getItem('writespace.experience.dumpling.v1')).steps.roll.passes===2");
  await click('#action');await evaluate('scrollTo(0,0)');await shot('dumpling-mobile-375.png');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  passed('Tablet/mobile layout, actual touch rolling and keyboard button alternative');
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:app.url+'/'});await until("document.querySelector('#postList')");
  await evaluate("window.sceneMessages=[];window.addEventListener('message',e=>{if(e.data?.experienceId==='dumpling-house')sceneMessages.push(e.data)});const frame=document.createElement('iframe');frame.id='scene-frame';frame.title='工坊';frame.style='width:900px;height:700px;border:0';frame.sandbox='allow-scripts allow-same-origin allow-pointer-lock';frame.src='/dumpling-house.html?embed=1';document.body.prepend(frame);");
  await until("sceneMessages.some(m=>m.type==='ready')");
  const frame="document.querySelector('#scene-frame').contentWindow";
  assert.equal(await evaluate(`getComputedStyle(${frame}.document.querySelector('#standalone-header')).display`),'none');
  await evaluate(`${frame}.postMessage({version:1,experienceId:'dumpling-house',type:'reset'},location.origin)`);await until(`JSON.parse(localStorage.getItem('writespace.experience.dumpling.v1')).completedStepIds.length===0`);
  await evaluate(`${frame}.postMessage({version:1,experienceId:'dumpling-house',type:'focus-step',data:{stepId:'wrap'}},location.origin)`);await until(`${frame}.document.body.dataset.step==='wrap'`);
  await evaluate(`${frame}.dispatchEvent(new MessageEvent('message',{data:{version:1,experienceId:'dumpling-house',type:'focus-step',data:{stepId:'cook'}},source:window,origin:'https://wrong.example'}))`);assert.equal(await evaluate(`${frame}.document.body.dataset.step`),'wrap');
  await evaluate(`${frame}.dispatchEvent(new MessageEvent('message',{data:{version:1,experienceId:'dumpling-house',type:'reset'},source:${frame},origin:location.origin}))`);assert.equal(await evaluate(`${frame}.document.body.dataset.step`),'wrap');
  await evaluate(`${frame}.document.querySelector('#exit').click()`);await until("sceneMessages.some(m=>m.type==='exit')");
  await evaluate("document.querySelector('#scene-frame').style.width='375px'");await pause(250);assert.equal(await evaluate(`${frame}.document.documentElement.scrollWidth>${frame}.innerWidth`),false);
  passed('Same-origin iframe: compact layout, ready/progress/exit, reset/focus commands, rejected wrong origin and sender');
  await cdp.send('Network.setBlockedURLs',{urls:['*renderer.js','https://*','http://unpkg.com/*']});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(Storage.prototype,'setItem',{value(){throw new Error('Test storage denied')}});"});
  await navigate(app.url+'/dumpling-house.html');assert.equal(await evaluate("document.querySelector('#viewport').dataset.renderer"),'fallback');
  await click('#reset');await click('#confirm-reset');
  for(const [id,count]of [['dough',3],['filling',2],['portion',2],['roll',4],['wrap',3],['cook',4]]){await step(id);for(let i=0;i<count;i++)await click('#action');}
  await until("document.querySelector('#summary-dialog').open");assert.match(await evaluate("document.querySelector('#progress').textContent"),/6 \/ 6/);await click('#close-summary');await shot('dumpling-fallback.png');
  passed('Rendering-module failure, blocked external network and denied storage still allow the complete learning flow');
  await cdp.send('Network.setBlockedURLs',{urls:['https://*']});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:"const originalContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl/.test(type)?null:originalContext.call(this,type,...args)};"});
  await navigate(app.url+'/dumpling-house.html');assert.equal(await evaluate("document.querySelector('#viewport').dataset.renderer"),'fallback');
  await step('dough');await click('#replay');await click('#action');assert.match(await evaluate("document.querySelector('#feedback').textContent"),/絮状/);
  passed('Unavailable WebGL context also falls back to usable step operations');
  assert.deepEqual(errors,[],'No uncaught exceptions');assert.equal(requests.some(url=>/^https?:/.test(url)&&!url.startsWith(app.url)),false,'No external runtime requests');
  console.log(`Scene browser checks passed: ${checks.length}; screenshots saved in .tmp.`);
}catch(error){if(cdp){try{console.log(await evaluate("JSON.stringify({step:document.body.dataset.step,mode:document.body.dataset.mode,status:document.querySelector('#scene-status')?.textContent,feedback:document.querySelector('#feedback')?.textContent,errors:window.experienceEvents})"));await shot('dumpling-failure.png');}catch{}}throw error;}
finally{if(cdp){try{await cdp.send('Browser.close');}catch{}cdp.socket.close();}if(browser.exitCode===null)browser.kill();await app.close();}
