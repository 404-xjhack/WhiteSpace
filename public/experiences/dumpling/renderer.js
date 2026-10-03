import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { buildShop, renderFood } from "./models.js";
import { STEPS } from "./data.js";

export function createRenderer(container, callbacks) {
  const scene=new THREE.Scene();scene.background=new THREE.Color().setHSL(.08,.19,.67);scene.fog=new THREE.Fog(scene.background,23,65);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label','传统手工饺子制作区');renderer.domElement.tabIndex=0;container.prepend(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(43,1,.05,100),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=1.8;controls.maxDistance=25;controls.maxPolarAngle=Math.PI*.49;
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.PAN};controls.enabled=false;
  const ambient=new THREE.HemisphereLight(0xfff8e8,0xb2a68b,1.9);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xffe0b8,1.4);sun.color.setHSL(.09,.4,.75);sun.position.set(-4,10,6);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:1,far:30});sun.shadow.normalBias=.04;scene.add(sun);
  const shop=buildShop(scene),ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.97);
  const pinHome=shop.pin.position.clone(),spoonHome=shop.spoon.position.clone(),strainerHome=shop.strainer.position.clone();
  let mode='guide',state=null,frameId=0,lastFrame=0,disposed=false,dragging=false,compare=false;
  let yaw=0,pitch=-.1,lastAction=0,actionId='',pointerStart=null,tween=null;const keys=new Set();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targets={dough:new THREE.Vector3(-2.6,.92,1.2),filling:new THREE.Vector3(2.7,.92,-1.5),wrapping:new THREE.Vector3(1.5,.92,2.6),stove:new THREE.Vector3(-5,1.22,-2.25)};
  const steamGeo=new THREE.BufferGeometry(),steamVertices=new Float32Array(42*3);
  for(let i=0;i<42;i++){steamVertices[i*3]=-5+Math.sin(i*2.4)*.28;steamVertices[i*3+1]=1.5+(i%14)*.06;steamVertices[i*3+2]=-2.4+Math.cos(i*1.7)*.28;}
  steamGeo.setAttribute('position',new THREE.BufferAttribute(steamVertices,3));const steam=new THREE.Points(steamGeo,new THREE.PointsMaterial({color:0xfffaf0,size:.05,transparent:true,opacity:.36,depthWrite:false}));scene.add(steam);
  function positionCamera(target,overview=false,immediate=false){
    const scale=overview?1:Math.max(1,.85/camera.aspect),offset=overview?new THREE.Vector3(9,9,12):new THREE.Vector3(1.55,1.65,2.05).multiplyScalar(scale);
    const destination=target.clone().add(offset);
    if(immediate||reduced){camera.position.copy(destination);controls.target.copy(target);camera.lookAt(target);tween=null;}
    else tween={from:camera.position.clone(),targetFrom:controls.target.clone(),to:destination,target:target.clone(),start:performance.now()};
  }
  function focus(){const step=STEPS.find(s=>s.id===state?.currentStepId);if(step&&mode==='guide')positionCamera(targets[step.station],false,!lastFrame);}
  function overview(immediate=false){positionCamera(new THREE.Vector3(0,.8,0),true,immediate);}
  function resize(){const rect=container.getBoundingClientRect();if(!rect.width||!rect.height)return;camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();renderer.setSize(rect.width,rect.height,false);if(mode==='guide'&&state){const step=STEPS.find(s=>s.id===state.currentStepId);positionCamera(targets[step.station],false,true);}else if(!lastFrame)overview(true);}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
  function setMode(next){
    if(!['guide','observe','walk'].includes(next))return;
    if(document.pointerLockElement===renderer.domElement&&next!=='walk')document.exitPointerLock();
    mode=next;keys.clear();tween=null;controls.enabled=next==='observe';shop.roof.visible=next==='walk';
    if(next==='guide')focus();
    if(next==='observe')overview();
    if(next==='walk'){camera.position.set(0,1.55,4.25);yaw=0;pitch=-.08;camera.rotation.order='YXZ';}
    callbacks.onMode(next);if(next==='walk')requestLock();return next;
  }
  function requestLock(){
    if(mode!=='walk')return;
    renderer.domElement.focus({preventScroll:true});
    try{const promise=renderer.domElement.requestPointerLock?.();if(promise?.catch)promise.catch(()=>callbacks.onWalkStatus(false));if(!renderer.domElement.requestPointerLock)callbacks.onWalkStatus(false);}
    catch{callbacks.onWalkStatus(false);}
  }
  function onLock(){keys.clear();callbacks.onWalkStatus(document.pointerLockElement===renderer.domElement);}
  function onMouseMove(e){if(mode==='walk'&&document.pointerLockElement===renderer.domElement){yaw-=e.movementX*.0023;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0023,-1.2,1.2);}}
  const movement={w:'f',arrowup:'f',s:'b',arrowdown:'b',a:'l',arrowleft:'l',d:'r',arrowright:'r'};
  function onKeyDown(e){
    if(mode!=='walk'||document.pointerLockElement!==renderer.domElement||e.target.closest?.('input,textarea,select,button,[contenteditable]'))return;
    const k=movement[e.key.toLowerCase()];if(k){e.preventDefault();keys.add(k);}if(e.key==='Shift')keys.add('run');
    if(e.key.toLowerCase()==='v')setMode('observe');
    if(e.key.toLowerCase()==='e'){ray.setFromCamera(new THREE.Vector2(0,0),camera);const hit=ray.intersectObjects(shop.toolTargets)[0];if(hit&&hit.distance<3){document.exitPointerLock();callbacks.onTool(hit.object.userData.toolId);}}
  }
  function onKeyUp(e){keys.delete(movement[e.key.toLowerCase()]);if(e.key==='Shift')keys.delete('run');}
  function clearKeys(){keys.clear();}
  function collide(){
    for(let repeat=0;repeat<3;repeat++)for(const obstacle of shop.colliders){const dx=camera.position.x-obstacle.x,dz=camera.position.z-obstacle.z,px=obstacle.hx+.24-Math.abs(dx),pz=obstacle.hz+.24-Math.abs(dz);if(px>0&&pz>0){if(px<pz)camera.position.x+=(dx>=0?1:-1)*px;else camera.position.z+=(dz>=0?1:-1)*pz;}}
    const rects=[[-5.65,5.65,-4.65,4.7],[-1.75,1.75,4.7,6.2],[-8,8,6.2,8.7]];let best=null,distance=Infinity;
    for(const [xmin,xmax,zmin,zmax]of rects){const x=THREE.MathUtils.clamp(camera.position.x,xmin,xmax),z=THREE.MathUtils.clamp(camera.position.z,zmin,zmax),d=(x-camera.position.x)**2+(z-camera.position.z)**2;if(d<distance){distance=d;best={x,z};}}
    camera.position.x=best.x;camera.position.z=best.z;camera.position.y=1.55;
  }
  function onPointerDown(e){if(e.button===1||e.button===2)e.preventDefault();pointerStart={x:e.clientX,y:e.clientY,button:e.button};}
  function onPointerUp(e){
    if(mode==='walk'){if(document.pointerLockElement!==renderer.domElement)requestLock();return;}
    if(mode!=='observe'||!pointerStart||pointerStart.button!==0||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)return;
    const rect=container.getBoundingClientRect();ndc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,camera);
    const hit=ray.intersectObjects(shop.toolTargets)[0];if(hit)callbacks.onTool(hit.object.userData.toolId);
  }
  function project(vector){const point=vector.clone().project(camera);return{x:(point.x+1)/2*container.clientWidth,y:(1-point.y)/2*container.clientHeight};}
  function dragPositions(){
    const kind=state?.currentStepId==='roll'?'pin':'spoon',tool=shop[kind],world=new THREE.Vector3();tool.getWorldPosition(world);
    return{tool:project(world),target:project(new THREE.Vector3(1.5,.96,2.66))};
  }
  function moveTool(kind,x,y){const rect=container.getBoundingClientRect();ndc.set(x/rect.width*2-1,1-y/rect.height*2);ray.setFromCamera(ndc,camera);const point=new THREE.Vector3();if(ray.ray.intersectPlane(plane,point)){shop.stations.wrapping.group.worldToLocal(point);shop[kind].position.set(THREE.MathUtils.clamp(point.x,-1,1),.97,THREE.MathUtils.clamp(point.z,-.75,.8));}dragging=true;}
  function endDrag(){dragging=false;shop.pin.position.copy(pinHome);shop.spoon.position.copy(spoonHome);}
  function onVisibility(){keys.clear();if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}else if(!disposed&&!frameId){lastFrame=0;frameId=requestAnimationFrame(animate);}}
  function onContextLost(e){e.preventDefault();callbacks.onFailure();}
  function animate(now){
    if(disposed||document.hidden){frameId=0;return;}frameId=requestAnimationFrame(animate);if(now-lastFrame<32)return;
    const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
    if(tween){const t=Math.min(1,(now-tween.start)/450),ease=t*t*(3-2*t);camera.position.lerpVectors(tween.from,tween.to,ease);controls.target.lerpVectors(tween.targetFrom,tween.target,ease);camera.lookAt(controls.target);if(t===1)tween=null;}
    if(mode==='walk'){
      if(document.pointerLockElement===renderer.domElement){const f=Number(keys.has('f'))-Number(keys.has('b')),r=Number(keys.has('r'))-Number(keys.has('l')),norm=Math.hypot(f,r)||1,speed=(keys.has('run')?2.8:1.5)*dt/norm;camera.position.x+=(-Math.sin(yaw)*f+Math.cos(yaw)*r)*speed;camera.position.z+=(-Math.cos(yaw)*f-Math.sin(yaw)*r)*speed;collide();}
      camera.rotation.set(pitch,yaw,0,'YXZ');
    }else if(mode==='observe'&&!tween)controls.update();
    const elapsed=(now-lastAction)/1000;
    if(!dragging&&state&&!reduced){const current=shop.stations[STEPS.find(s=>s.id===state.currentStepId).station].food;if(elapsed<.7&&actionId==='knead')current.scale.y=1-Math.sin(elapsed/.7*Math.PI)*.22;else current.scale.set(1,1,1);if(elapsed<.7&&actionId==='roll')shop.pin.position.z=pinHome.z-Math.sin(elapsed/.7*Math.PI)*.38;else shop.pin.position.copy(pinHome);}
    if(!reduced&&actionId==='stir'&&elapsed<.9){shop.strainer.position.set(Math.sin(elapsed*6)*.22,1.42,-.25+Math.cos(elapsed*6)*.22);}else shop.strainer.position.copy(strainerHome);
    steam.visible=Boolean(state&&state.steps.cook.phase>0&&state.steps.cook.phase<4);if(steam.visible&&!reduced){steam.position.y=Math.sin(now*.0007)*.06;steam.material.opacity=.25+Math.sin(now*.001)*.07;}
    callbacks.onPosition(dragPositions());renderer.render(scene,camera);
  }
  const listeners=[[document,'pointerlockchange',onLock],[document,'pointerlockerror',onLock],[document,'mousemove',onMouseMove],[window,'keydown',onKeyDown],[window,'keyup',onKeyUp],[window,'blur',clearKeys],[document,'visibilitychange',onVisibility],[renderer.domElement,'pointerdown',onPointerDown],[renderer.domElement,'pointerup',onPointerUp],[renderer.domElement,'webglcontextlost',onContextLost],[renderer.domElement,'contextmenu',e=>e.preventDefault()]];
  listeners.forEach(([target,event,fn])=>target.addEventListener(event,fn));
  frameId=requestAnimationFrame(animate);
  return{
    update(next,comparison=false,action=''){const changed=state?.currentStepId!==next.currentStepId;state=next;compare=comparison;renderFood(shop.stations,state,compare);if(action){lastAction=performance.now();actionId=action;}endDrag();if(changed)focus();},
    setMode,moveTool,endDrag,dragPositions,
    resetView(){if(mode==='guide')focus();else if(mode==='observe')overview();},
    destroy(){if(disposed)return;disposed=true;cancelAnimationFrame(frameId);resizeObserver.disconnect();listeners.forEach(([target,event,fn])=>target.removeEventListener(event,fn));if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();controls.dispose();const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){ms.add(m);if(m.map)ts.add(m.map);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();}
  };
}
