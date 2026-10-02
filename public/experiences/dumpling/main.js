import { STEPS, TOOLS, STORAGE_KEY, EXPERIENCE_ID } from "./data.js";
import { createState, focusStep, replayStep, setAmount, perform } from "./state.js";

const $=id=>document.getElementById(id),embedded=new URLSearchParams(location.search).get('embed')==='1';
document.body.classList.toggle('embedded',embedded);$('exit').hidden=!embedded;
let saved=null;try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{}
let state=createState(saved),view=null,mode='guide',compare=false,selectedTool=null,drag=null;
const stationNames={dough:'和面分剂台',filling:'食材制馅台',wrapping:'擀皮包合台',stove:'煮制锅台'};
$('tool-list').innerHTML=TOOLS.map(tool=>`<button type="button" data-tool="${tool.id}">${tool.name}</button>`).join('');
function showTool(id){if(!TOOLS.some(tool=>tool.id===id))return;selectedTool=id;render();$('tool-detail').scrollIntoView({block:'nearest',behavior:'smooth'});}
$('tool-list').addEventListener('click',e=>{const button=e.target.closest('[data-tool]');if(button)showTool(button.dataset.tool);});
function emit(type){
  const detail={version:1,experienceId:EXPERIENCE_ID,type,data:{currentStepId:state.currentStepId,completedStepIds:[...state.completedStepIds]}};
  window.dispatchEvent(new CustomEvent('writespace:experience',{detail}));
  if(window.parent!==window)window.parent.postMessage(detail,location.origin);
}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{ $('progress').title='浏览器无法保存；当前页面仍可继续体验。';}}
function renderDiagram(){
  const id=state.currentStepId,value=state.steps[id],phase=value.phase;
  const dish='<rect x="25" y="153" width="350" height="60" rx="13" fill="#bc9163" stroke="#9d764f"/>';
  const dumpling=(x,y,scale=1)=>`<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-62 19Q-64-55 0-63Q64-55 62 19Q0 39-62 19Z" fill="#f5e5bc" stroke="#bda877" stroke-width="2"/><path d="M-52 2Q-45-27-35-35L-27-19M-25-45L-15-24M-3-54L6-29M20-48L30-26M40-32L48-12" stroke="#c4ad79" stroke-width="2"/></g>`;
  let content=dish;
  if(id==='dough')content+=phase===0?'<path d="M112 136Q115 209 200 208Q285 209 288 136Z" fill="#e9eee5" stroke="#819489" stroke-width="3"/><ellipse cx="200" cy="136" rx="87" ry="25" fill="#f6e5c1" stroke="#a6ad99"/>':phase===1?Array.from({length:17},(_,i)=>`<ellipse cx="${135+i%6*25}" cy="${127+Math.floor(i/6)*17}" rx="15" ry="11" fill="#efddb0" stroke="#c8b382"/>`).join(''):`<ellipse cx="200" cy="143" rx="72" ry="49" fill="${phase===3&&!compare?'#fcf9ed':'#efddb0'}" stroke="#c5b382"/><path d="M151 151Q195 180 250 151" stroke="#c9b990"/>`;
  if(id==='filling')content+=Array.from({length:phase===0?3:40},(_,i)=>`<circle cx="${phase===0?130+i*70:130+i%8*20}" cy="${phase===0?141:115+Math.floor(i/8)*13}" r="${phase===0?28:8}" fill="${['#87a35c','#c6c58a','#d5a072'][i%3]}"/>`).join('');
  if(id==='portion')content+=phase===0?'<ellipse cx="200" cy="146" rx="66" ry="43" fill="#efddb0"/>':phase===1?'<rect x="84" y="126" width="230" height="48" rx="24" fill="#efddb0" stroke="#c5b382"/>':Array.from({length:6},(_,i)=>`<ellipse cx="${90+i*45}" cy="148" rx="19" ry="26" fill="#efddb0" stroke="#c5b382"/>`).join('');
  if(id==='roll')content+=`<ellipse cx="200" cy="144" rx="${phase===0?33:47+value.passes*13}" ry="${phase===0?27:26+value.passes*7}" fill="#f3e0b5" stroke="#c5b382" stroke-width="3"/><ellipse cx="200" cy="144" rx="${phase===0?20:25}" ry="17" fill="#ecd6a4"/><rect x="99" y="190" width="196" height="13" rx="6" fill="#91643d"/>`;
  if(id==='wrap')content+=phase<2?'<ellipse cx="200" cy="145" rx="83" ry="43" fill="#f3e0b5" stroke="#c5b382" stroke-width="2"/>'+ (phase===1?`<ellipse cx="200" cy="142" rx="${value.amount==='large'?77:value.amount==='small'?25:43}" ry="26" fill="#8eaa65"/>`:''):dumpling(200,150);
  if(id==='cook')content=phase===4?dish+dumpling(155,140,.55)+dumpling(230,165,.55):'<path d="M93 107V190Q200 226 307 190V107" fill="#8a9d95" stroke="#576f63" stroke-width="3"/><ellipse cx="200" cy="108" rx="107" ry="29" fill="#bcd6c7" stroke="#576f63" stroke-width="3"/>'+ (phase?dumpling(170,113,.4)+dumpling(234,113,.4):'')+'<path d="M150 72Q135 53 150 33M203 67Q188 48 203 29M257 75Q243 54 256 36" stroke="#fffaf0" stroke-width="5"/>';
  $('diagram').innerHTML=`<svg viewBox="0 0 400 260" role="img" aria-label="${STEPS.find(s=>s.id===id).title}的当前状态">${content}</svg>`;
}
function dragKind(){if(mode!=='guide')return null;if(state.currentStepId==='roll'&&state.steps.roll.phase===1)return'pin';if(state.currentStepId==='wrap'&&state.steps.wrap.phase===0)return'spoon';return null;}
function positions(){return view?view.dragPositions():{tool:{x:$('viewport').clientWidth*(state.currentStepId==='roll'?.4:.78),y:$('viewport').clientHeight*.63},target:{x:$('viewport').clientWidth*.5,y:$('viewport').clientHeight*.54}};}
function positionDrag(points=positions()){
  const kind=dragKind();$('drag-tool').hidden=!kind;$('drop-target').hidden=kind!=='spoon';
  if(!kind||drag)return;
  const rect=$('viewport').getBoundingClientRect(),x=Math.max(34,Math.min(rect.width-34,points.tool.x)),y=Math.max(105,Math.min(rect.height-75,points.tool.y));
  $('drag-tool').style.left=`${x}px`;$('drag-tool').style.top=`${y}px`;$('drag-label').textContent=kind==='pin'?'拖动擀面杖，来回擀压':'把调羹拖到面皮中央';
  $('drop-target').style.left=`${points.target.x}px`;$('drop-target').style.top=`${points.target.y}px`;
}
function render(action=''){
  const index=STEPS.findIndex(s=>s.id===state.currentStepId),step=STEPS[index],value=state.steps[step.id];
  document.body.dataset.step=step.id;
  $('step-nav').innerHTML=STEPS.map((s,i)=>`<button type="button" class="step-tab ${s.id===step.id?'active':''} ${state.completedStepIds.includes(s.id)?'done':''}" data-step="${s.id}" aria-current="${s.id===step.id?'step':'false'}" aria-label="${i+1}，${s.title}${state.completedStepIds.includes(s.id)?'，已动手体验':''}"><span class="number">${state.completedStepIds.includes(s.id)?'✓':String(i+1).padStart(2,'0')}</span><span>${s.short}</span></button>`).join('');
  $('step-number').textContent=`工序 ${String(index+1).padStart(2,'0')} / 06`;$('step-title').textContent=step.title;$('step-question').textContent=step.question;
  for(const [id,key]of [['step-intro','intro'],['step-tools','tool'],['step-why','why'],['step-observe','observe']])$(id).textContent=step[key];
  $('station-name').textContent=mode==='guide'?stationNames[step.station]:'传统手工饺子工坊';
  $('previous').disabled=index===0;$('next').textContent=index===5?'工艺总览':'下一步';
  const nextAction=step.actions[value.phase];$('action').disabled=!nextAction;$('action').textContent=nextAction?nextAction.label+(step.id==='roll'&&value.phase===1?` · ${value.passes}/3`:''):'本步操作完成';
  $('amount-control').hidden=step.id!=='wrap'||value.phase>=2;document.querySelectorAll('input[name=amount]').forEach(input=>input.checked=input.value===state.steps.wrap.amount);
  $('step-insight').hidden=value.phase!==step.actions.length;$('step-insight').textContent=step.insight;
  $('rest-compare').hidden=step.id!=='dough'||value.phase!==3;$('rest-compare').textContent=compare?'回到盖布醒面的示意':'比较醒面前的状态';
  $('progress').textContent=`已动手体验 ${state.completedStepIds.length} / 6 步`;
  $('tool-detail').hidden=!selectedTool;
  if(selectedTool){const tool=TOOLS.find(t=>t.id===selectedTool);$('tool-detail').innerHTML=`<h3>${tool.name}</h3><p><b>用途</b> · ${tool.use}</p><p><b>操作</b> · ${tool.action}</p><p><b>原因</b> · ${tool.reason}</p><p><b>观察</b> · ${tool.observe}</p>`;}
  if(view)view.update(state,compare,action);else renderDiagram();positionDrag();
}
function changeStep(id){cancelDrag();state=focusStep(state,id);compare=false;selectedTool=null;render();$('feedback').textContent='按自己的节奏查看。本步要完成操作后才会计入体验记录。';document.querySelector('.panel-content').scrollTo(0,0);persist();emit('progress');}
function act(actionId){
  const step=STEPS.find(s=>s.id===state.currentStepId),id=actionId||step.actions[state.steps[step.id].phase]?.id;
  const result=perform(state,id);state=result.state;$('feedback').textContent=result.feedback;
  if(result.changed){compare=false;render(id);persist();emit('progress');if(result.finishedNow){emit('complete');openSummary(true);}}
}
function applyMode(next){
  mode=next;document.body.dataset.mode=mode;$('guide-mode').classList.toggle('active',mode==='guide');$('guide-mode').setAttribute('aria-pressed',String(mode==='guide'));
  $('observe-mode').classList.toggle('active',mode!=='guide');$('observe-mode').setAttribute('aria-pressed',String(mode!=='guide'));
  $('walk').textContent=mode==='walk'?'退出漫游':'进入漫游';$('walk').hidden=!view||!matchMedia('(pointer:fine)').matches;
  $('tool-browser').hidden=mode==='guide';
  $('crosshair').hidden=mode!=='walk';$('scene-hint').textContent=mode==='guide'?'按步骤操作；拖拽有按钮替代，随时可以重演。':mode==='observe'?'拖拽旋转 · 滚轮缩放 · 右键或中键平移 · 点击制作工具了解用途':'WASD 移动 · 鼠标转头 · E 查看工具 · Esc 暂停 · V 退出';
  $('station-name').textContent=mode==='guide'?stationNames[STEPS.find(s=>s.id===state.currentStepId).station]:'传统手工饺子工坊';positionDrag();
}
function setMode(next){cancelDrag();selectedTool=null;$('tool-detail').hidden=true;if(view)view.setMode(next);else applyMode(next);}
function openSummary(finished=false){if(mode==='walk')setMode('observe');$('summary-intro').textContent=finished?'你已经动手体验了全部六步。再看一遍每一步里的关键判断。':'每一步既有动作，也有需要观察的变化。';$('summary-list').innerHTML=STEPS.map(s=>`<li><strong>${s.title}${state.completedStepIds.includes(s.id)?' · 已体验':''}</strong>${s.insight}</li>`).join('');if(!$('summary-dialog').open)$('summary-dialog').showModal();}
function reset(){cancelDrag();state=createState();compare=false;selectedTool=null;setMode('guide');render();$('feedback').textContent='从逐渐加水开始，观察面粉怎样形成面团。';persist();emit('progress');}
function cancelDrag(){if(!drag)return;const pointer=drag.pointer;drag=null;if($('drag-tool').hasPointerCapture(pointer))$('drag-tool').releasePointerCapture(pointer);$('drag-tool').classList.remove('dragging');view?.endDrag();positionDrag();}
$('step-nav').addEventListener('click',e=>{const button=e.target.closest('[data-step]');if(button)changeStep(button.dataset.step);});
$('action').addEventListener('click',()=>act());
$('previous').addEventListener('click',()=>{const index=STEPS.findIndex(s=>s.id===state.currentStepId);if(index>0)changeStep(STEPS[index-1].id);});
$('next').addEventListener('click',()=>{const index=STEPS.findIndex(s=>s.id===state.currentStepId);if(index<5)changeStep(STEPS[index+1].id);else openSummary();});
$('replay').addEventListener('click',()=>{cancelDrag();state=replayStep(state);compare=false;render();persist();emit('progress');$('feedback').textContent='本步已回到操作起点，已体验记录保留。';});
document.querySelectorAll('input[name=amount]').forEach(input=>input.addEventListener('change',()=>{state=setAmount(state,input.value);render();persist();emit('progress');$('feedback').textContent=input.value==='large'?'试试过量的馅会怎样影响包合。':input.value==='small'?'少量馅更容易封边，也可以尝试适量。':'给边缘留出空间，尝试对折与捏合。';}));
$('guide-mode').addEventListener('click',()=>setMode('guide'));$('observe-mode').addEventListener('click',()=>setMode('observe'));
$('walk').addEventListener('click',()=>setMode(mode==='walk'?'observe':'walk'));
$('reset-view').addEventListener('click',()=>{if(mode==='walk')setMode('observe');view?.resetView();});
for(const id of ['daylight','show-roof'])$(id).addEventListener('input',()=>view?.setEnvironment(Number($('daylight').value),$('show-roof').checked));
$('rest-compare').addEventListener('click',()=>{compare=!compare;render();$('feedback').textContent=compare?'醒面前的面团：揉合后还需要静置，让水分分布并使面团放松。':'盖布减少表面失水。这里是醒面过程示意，不代表真实所需时间。';});
$('open-summary').addEventListener('click',()=>openSummary());for(const id of ['continue','close-summary'])$(id).addEventListener('click',()=>$('summary-dialog').close());
$('reset').addEventListener('click',()=>{if(mode==='walk')setMode('observe');$('reset-dialog').showModal();});$('cancel-reset').addEventListener('click',()=>$('reset-dialog').close());$('confirm-reset').addEventListener('click',()=>{$('reset-dialog').close();reset();});
$('exit').addEventListener('click',()=>{if(mode==='walk')setMode('observe');emit('exit');$('feedback').textContent='已向所在页面发送关闭请求。';});
$('drag-tool').addEventListener('pointerdown',e=>{
  if(e.button!==0||!dragKind())return;e.preventDefault();const rect=$('viewport').getBoundingClientRect(),points=positions();
  drag={pointer:e.pointerId,kind:dragKind(),lastX:e.clientX,lastY:e.clientY,travel:0,start:points.tool,target:points.target,rect};$('drag-tool').setPointerCapture(e.pointerId);$('drag-tool').classList.add('dragging');
});
$('drag-tool').addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.pointer)return;drag.travel+=Math.hypot(e.clientX-drag.lastX,e.clientY-drag.lastY);drag.lastX=e.clientX;drag.lastY=e.clientY;
  const x=e.clientX-drag.rect.left,y=e.clientY-drag.rect.top;$('drag-tool').style.left=`${x}px`;$('drag-tool').style.top=`${y}px`;view?.moveTool(drag.kind,x,y);
});
$('drag-tool').addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.pointer)return;const value=drag,x=e.clientX-value.rect.left,y=e.clientY-value.rect.top;cancelDrag();
  if(value.kind==='pin'&&value.travel>=45){for(let i=0;i<Math.min(3,Math.floor(value.travel/45))&&state.steps.roll.phase===1;i++)act('roll');}
  else if(value.kind==='spoon'&&value.travel>10&&Math.hypot(x-value.target.x,y-value.target.y)<58)act('place');
  else $('feedback').textContent=value.kind==='pin'?'把擀面杖来回拖动一段距离，或使用操作按钮。':'把调羹拖到标记的面皮中央，或使用操作按钮。';
});
for(const name of ['pointercancel','lostpointercapture'])$('drag-tool').addEventListener(name,cancelDrag);
$('drag-tool').addEventListener('click',e=>{if(e.detail===0)act();});
window.addEventListener('blur',cancelDrag);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDrag();});
window.addEventListener('message',event=>{
  if(window.parent===window||event.source!==window.parent||event.origin!==location.origin)return;
  const message=event.data;if(!message||message.version!==1||message.experienceId!==EXPERIENCE_ID)return;
  if(message.type==='reset')reset();
  if(message.type==='focus-step'&&STEPS.some(s=>s.id===message.data?.stepId)){setMode('guide');changeStep(message.data.stepId);}
});
const observer=new ResizeObserver(()=>{if(!view&&!drag)positionDrag();});observer.observe($('viewport'));
function useFallback(){view?.destroy();view=null;$('diagram').hidden=false;$('loading').hidden=true;$('scene-status').textContent='图文示意模式 · 操作仍可完成';$('viewport').dataset.renderer='fallback';if(mode==='walk')applyMode('guide');$('walk').hidden=true;render();}
render();applyMode('guide');
try{
  const {createRenderer}=await import('./renderer.js');
  view=createRenderer($('viewport'),{onPosition:positionDrag,onMode:applyMode,onWalkStatus:locked=>{if(mode==='walk'){$('crosshair').hidden=!locked;$('scene-hint').textContent=locked?'WASD 移动 · 鼠标转头 · E 查看工具 · Esc 暂停 · V 退出':'漫游已暂停。点击场景继续，或点击「退出漫游」。';}},onTool:showTool,onFailure:useFallback});
  view.update(state);$('loading').hidden=true;$('scene-status').textContent='可观察 · 可动手 · 随时重演';$('viewport').dataset.renderer='webgl';applyMode('guide');
}catch{useFallback();}
emit('ready');
window.addEventListener('pagehide',e=>{if(!e.persisted){observer.disconnect();view?.destroy();}});
