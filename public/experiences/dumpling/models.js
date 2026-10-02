import * as THREE from "./vendor/three.module.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, ...options });
const wood = material(0xa7794e), darkWood = material(0x654833), bamboo = material(0xd5b47a);
const porcelain = material(0xf5f1e7, { roughness: .3 }), steel = material(0x889795, { metalness: .45, roughness: .4 });
const dough = material(0xf0dfb8), cooked = material(0xf7e9cb, { roughness: .35 }), green = material(0x5e8051);
const fillMaterials = [material(0x73934e), material(0xa6b56b), material(0xd2c489), material(0xc98455)];
function seeded(seed = 73) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, mat); item.position.set(x, y, z); item.castShadow = item.receiveShadow = true; parent.add(item); return item;
}
function box(p, mat, w, h, d, x = 0, y = 0, z = 0) { return mesh(p, new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
function cylinder(p, mat, top, bottom, h, x = 0, y = 0, z = 0, segments = 24) { return mesh(p, new THREE.CylinderGeometry(top, bottom, h, segments), mat, x, y, z); }
function ball(p, mat, r, x = 0, y = 0, z = 0) { return mesh(p, new THREE.SphereGeometry(r, 24, 16), mat, x, y, z); }
function tube(p, points, mat, radius = .012) { return mesh(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v => new THREE.Vector3(...v))), 24, radius, 6, false), mat); }
function lathe(p, profile, mat, x = 0, y = 0, z = 0) { return mesh(p, new THREE.LatheGeometry(profile.map(v => new THREE.Vector2(...v)), 40), mat, x, y, z); }
function bowl(p, radius, x = 0, y = 0, z = 0, mat = porcelain) {
  return lathe(p, [[0,0],[radius*.4,0],[radius*.75,.045],[radius,.18],[radius,.2],[radius*.94,.2],[radius*.7,.06],[0,.045]], mat, x,y,z);
}
function plate(p, x, y, z, radius = .44) { return lathe(p, [[0,0],[radius*.65,0],[radius,.045],[radius,.075],[radius*.75,.04],[0,.03]], porcelain,x,y,z); }
function textPlane(p, text, w, h, x,y,z, color = "#efe4cc", background = "#6b4936") {
  const canvas = document.createElement("canvas"); canvas.height = 192; canvas.width = Math.round(canvas.height * w / h);
  const ctx = canvas.getContext("2d"); ctx.fillStyle = background; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = color;
  // Match the plane's aspect ratio; fit long text by reducing its font uniformly.
  let fontSize = Math.round(canvas.height * .7);
  const setFont = () => { ctx.font = `600 ${fontSize}px "Microsoft YaHei", sans-serif`; }; setFont();
  fontSize = Math.floor(fontSize * Math.min(1, canvas.width * .9 / ctx.measureText(text).width)); setFont();
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text,canvas.width/2,canvas.height/2);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const item = mesh(p, new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}),x,y,z); return item;
}
function makeWoodTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d"), random = seeded(); ctx.fillStyle = "#bf9567"; ctx.fillRect(0,0,256,256);
  for(let i=0;i<90;i++){ const y=random()*256; ctx.strokeStyle=`rgba(94,58,30,${.03+random()*.08})`;ctx.lineWidth=.4+random()*1.1;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(80,y+random()*9,160,y-random()*9,256,y);ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function makePin(p, x,y,z) {
  const g = new THREE.Group(); g.position.set(x,y,z); p.add(g);
  cylinder(g,wood,.057,.057,.66).rotation.z=Math.PI/2;
  for(const side of [-1,1]) cylinder(g,darkWood,.032,.032,.17,side*.4,0,0).rotation.z=Math.PI/2;
  return g;
}
function makeSpoon(p,x,y,z) {
  const g = new THREE.Group(); g.position.set(x,y,z); p.add(g);
  const head=bowl(g,.105,0,0,0,steel); head.scale.set(1.28,.27,.82);
  cylinder(g,steel,.014,.014,.40,.326,.054,0,10).rotation.z=Math.PI/2; g.rotation.y=.3; return g;
}
function makeKnife(p,x,y,z) {
  const g=new THREE.Group();g.position.set(x,y,z);p.add(g);
  box(g,steel,.34,.018,.16,0,.01,0);
  cylinder(g,steel,.024,.024,.025,.182,.021,0,12).rotation.z=Math.PI/2;
  cylinder(g,darkWood,.027,.027,.23,.295,.021,0,12).rotation.z=Math.PI/2;
  return g;
}
function makeStrainer(p,x,y,z) {
  const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=-Math.PI/2;p.add(g);
  const rim=mesh(g,new THREE.TorusGeometry(.15,.012,8,32),steel);rim.rotation.x=Math.PI/2;
  for(let i=-2;i<=2;i++){
    const off=i*.045,edge=Math.sqrt(.15**2-off**2),row=[],column=[];
    for(let j=0;j<=12;j++){const a=-edge+j/6*edge,h=-.045+.045*(a*a+off*off)/(.15**2);row.push([a,h,off]);column.push([off,h,a]);}
    tube(g,row,steel,.005);tube(g,column,steel,.005);
  }
  cylinder(g,steel,.016,.016,.46,.38,0,0,10).rotation.z=Math.PI/2;
  cylinder(g,darkWood,.025,.025,.15,.685,0,0,12).rotation.z=Math.PI/2;return g;
}
function dumpling(p, x=0, y=0,z=0, sealed=true, isCooked=false, scale=1) {
  const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);p.add(g);
  const vertices=[],indices=[],NX=32,NT=24,r=.38;
  for(let i=0;i<=NX;i++){
    const s=i/NX*2-1, f=Math.sqrt(Math.max(0,1-s*s));
    for(let j=0;j<=NT;j++){const a=j/NT*Math.PI*2;vertices.push(r*s,.018+.29*f*(1+Math.sin(a))/2,.155*f*Math.cos(a));}
  }
  for(let i=0;i<NX;i++)for(let j=0;j<NT;j++){const a=i*(NT+1)+j,b=a+NT+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();mesh(g,geo,isCooked?cooked:dough);
  const seam=[];for(let i=0;i<=20;i++){const s=i/10-1;seam.push([r*s,.025+.29*Math.sqrt(Math.max(0,1-s*s)),0]);}tube(g,seam,isCooked?cooked:dough,.015);
  if(sealed)for(let i=-3;i<=3;i++){const x0=i*.086,f=Math.sqrt(1-(x0/r)**2),h=.29*f;tube(g,[[x0,.025+h,0],[x0+.025,.022+h*.89,.07*f],[x0+.014,.025+h*.65,.13*f]],isCooked?cooked:dough,.011);}
  return g;
}
function wrapper(p, passes=3, x=0,y=0,z=0) {
  const r=.15+passes*.053;
  return lathe(p,[[0,-.008],[r,-.008],[r,.005],[r*.7,.014],[r*.33,.027],[0,.03]],dough,x,y,z);
}
function filling(p, x=0,y=0,z=0, scale=1, count=65) {
  const random=seeded(184); const geo=new THREE.SphereGeometry(.026,6,4);
  for(let i=0;i<count;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*.2*scale,h=(1-r/(.25*scale))*.09*scale;const item=mesh(p,geo,fillMaterials[i%4],x+Math.cos(a)*r,y+h+random()*.025,z+Math.sin(a)*r);item.scale.set(1+random(),.6+random(),.5+random());}
}
export function buildShop(scene) {
  const shop=new THREE.Group();scene.add(shop);const shell=new THREE.Group(),roof=new THREE.Group();shop.add(shell,roof);
  const wall=material(0xe6dcc7),tile=material(0x66736e),red=material(0x964d39);
  box(shop,material(0xa9ada0),15,.1,16,0,-.12,1);
  box(shop,material(0xcac1ad),12,.06,10,0,-.02,0);
  for(let x=-6;x<=6;x+=1)box(shop,material(0xb5aa94),.013,.003,10,x,.013,0);
  for(let z=-5;z<=5;z+=1)box(shop,material(0xb5aa94),12,.003,.013,0,.013,z);
  box(shell,wall,12,3.6,.15,0,1.8,-5);box(shell,wall,.15,3.6,10,-6,1.8,0);box(shell,wall,.15,3.6,10,6,1.8,0);
  for(const side of [-1,1]){
    box(shell,wall,3.8,.7,.18,side*4.1,.35,5);box(shell,darkWood,.13,3.7,.2,side*2.2,1.85,5);
    for(let i=0;i<4;i++)box(shell,darkWood,.045,1.9,.09,side*(2.8+i*.8),1.85,5);
    for(let i=0;i<3;i++)box(shell,darkWood,3.6,.045,.09,side*4.1,1.0+i*.7,5);
  }
  box(shell,darkWood,12,.16,.22,0,3.62,5);box(shell,darkWood,12,.16,.22,0,3.62,-5);
  box(shell,red,5.5,.6,.14,0,3.2,5.12);textPlane(shell,"手工饺子工坊",5,.5,0,3.2,5.2);
  box(shop,darkWood,5.4,1.05,.08,0,2.18,-4.9);textPlane(shop,"和面 → 制馅 → 分剂",4.9,.38,0,2.38,-4.84);textPlane(shop,"擀皮 → 包合 → 煮制",4.9,.38,0,1.97,-4.84);
  const roofRise=.9,roofRun=5.3,roofLength=Math.hypot(roofRun,roofRise),roofAngle=Math.atan2(roofRise,roofRun);
  for(const side of [-1,1]){
    const panel=box(roof,tile,12.6,.15,roofLength,0,4.15,side*roofRun/2);panel.rotation.x=side*roofAngle;
    for(let i=-12;i<=12;i++){const rib=box(panel,darkWood,.06,.08,roofLength-.05,i*.49,.115,0);rib.castShadow=false;}
    const gable=new THREE.Shape();gable.moveTo(-5,3.6);gable.lineTo(5,3.6);gable.lineTo(5,4.6-5*roofRise/roofRun);gable.lineTo(0,4.6);gable.lineTo(-5,4.6-5*roofRise/roofRun);gable.closePath();
    const geometry=new THREE.ExtrudeGeometry(gable,{depth:.15,bevelEnabled:false});geometry.rotateY(Math.PI/2);mesh(roof,geometry,wall,side*6-.075,0,0);
  }
  box(roof,tile,12.8,.18,.25,0,4.61,0);roof.visible=false;
  const lanterns=new THREE.Group();roof.add(lanterns);
  for(const [x,z] of [[-4.5,3.5],[4.5,3.5]]){
    const suspensionTop=4.6-z*roofRise/roofRun-.075;
    cylinder(lanterns,darkWood,.012,.012,suspensionTop-2.82,x,(suspensionTop+2.82)/2,z);const lamp=ball(lanterns,red,.27,x,2.5,z);lamp.scale.y=1.25;
    cylinder(lanterns,bamboo,.08,.08,.035,x,2.82,z);cylinder(lanterns,bamboo,.08,.08,.035,x,2.17,z);
  }
  for(const x of [-7.3,7.3]){box(shop,material(0xbac0b2),3,6,4,x*1.7,2.8,-4);cylinder(shop,bamboo,.13,.17,3,x,1.4,6);const leaves=ball(shop,green,.9,x,3.2,6);leaves.scale.y=1.25;}
  const boardMat=material(0xffffff,{map:makeWoodTexture()}),stations={},colliders=[];
  const configs=[['dough',-2.6,1.2,'和面 · 分剂'],['filling',2.7,-1.5,'食材 · 制馅'],['wrapping',1.5,2.6,'擀皮 · 包合']];
  for(const [id,x,z,title] of configs){
    const group=new THREE.Group();group.position.set(x,0,z);shop.add(group);
    box(group,wood,2.0,.09,1.7,0,.79,0);for(const sx of [-1,1])for(const sz of [-1,1])box(group,darkWood,.095,.75,.095,sx*.85,.375,sz*.68);
    box(group,boardMat,1.3,.045,1.1,0,.855,.06);
    const label=textPlane(group,title,1.1,.23,0,.58,.864,"#e8e0cc","#74533b");
    const food=new THREE.Group();food.position.y=.892;group.add(food);
    stations[id]={group,food,label};colliders.push({x,z,hx:1.02,hz:.87});
  }
  bowl(stations.dough.group,.25,-.7,.85,-.5);cylinder(stations.dough.group,porcelain,.09,.14,.32,.66,1.02,-.5);cylinder(stations.dough.group,darkWood,.04,.04,.1,.66,1.23,-.5);
  tube(stations.dough.group,[[.77,1.13,-.5],[.96,1.13,-.5],[.97,.91,-.5],[.79,.91,-.5]],porcelain,.018);
  cylinder(stations.dough.group,porcelain,.035,.045,.17,.49,1.13,-.5,16).rotation.z=Math.PI/3;
  box(stations.dough.group,steel,.35,.18,.016,.65,.97,.53);box(stations.dough.group,darkWood,.35,.07,.035,.65,1.1,.53);
  const cabbage=ball(stations.filling.group,green,.21,-.67,1.02,-.5);cabbage.scale.y=.9;bowl(stations.filling.group,.3,.65,.86,-.45);
  makeKnife(stations.filling.group,.40,.879,.40);
  const pin=makePin(stations.wrapping.group,-.25,.97,.57),spoon=makeSpoon(stations.wrapping.group,.45,.887,.36);bowl(stations.wrapping.group,.26,.65,.86,-.4);filling(stations.wrapping.group,.65,1.0,-.4,.85,36);
  const stoveGroup=new THREE.Group();stoveGroup.position.set(-5.0,0,-2.15);shop.add(stoveGroup);box(stoveGroup,steel,1.4,.9,2.2,0,.45,0);box(stoveGroup,material(0x454f4c),1.45,.045,2.25,0,.93,0);
  const pot=bowl(stoveGroup,.51,0,.96,-.25,steel);pot.scale.y=2.35;
  for(const side of [-1,1])box(stoveGroup,darkWood,.18,.06,.12,side*.57,1.32,-.25);
  const water=cylinder(stoveGroup,material(0x9abfb2,{roughness:.2,transparent:true,opacity:.72}),.456,.456,.018,0,1.385,-.25);water.castShadow=false;
  const strainer=makeStrainer(stoveGroup,-.48,1.01,.58);plate(stoveGroup,.2,.96,.72,.38);
  const cookFood=new THREE.Group();stoveGroup.add(cookFood);stations.stove={group:stoveGroup,food:cookFood,water};colliders.push({x:-5,z:-2.15,hx:.74,hz:1.14});
  const toolTargets=[];
  for(const [id,station,anchor] of [['basin','dough',[-.6,1,-.4]],['board','dough',[.5,1,.4]],['filling-bowl','filling',[0,1,0]],['pin','wrapping',[-.25,1,.57]],['spoon','wrapping',[.65,.94,.29]],['pot','stove',[0,1.45,-.25]]]){
    const target=mesh(stations[station].group,new THREE.SphereGeometry(.23,12,8),new THREE.MeshBasicMaterial({visible:false}),...anchor);target.userData.toolId=id;toolTargets.push(target);
  }
  return {shop,shell,roof,lanterns,stations,colliders,toolTargets,pin,spoon,strainer};
}
export function clearFood(group) { const geometries=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});geometries.forEach(g=>g.dispose());group.clear(); }
export function renderFood(stations,state,compare=false) {
  for(const station of Object.values(stations))clearFood(station.food);
  const s=state.steps,current=state.currentStepId;
  const d=stations.dough.food;
  if(current==='portion'){
    if(s.portion.phase===0)ball(d,dough,.24,0,.14,0).scale.set(1,.72,1);
    else if(s.portion.phase===1)cylinder(d,dough,.11,.11,1.0,0,.12,0).rotation.z=Math.PI/2;
    else for(let i=0;i<6;i++){const o=cylinder(d,dough,.11,.105,.18,(i%3-.9)*.32,.10,(Math.floor(i/3)-.5)*.38);o.rotation.z=.15;}
  }else{
    if(s.dough.phase===0){bowl(d,.34,0,0,0);ball(d,dough,.24,0,.10,0).scale.set(1,.33,1);}
    else if(s.dough.phase===1){const random=seeded();for(let i=0;i<28;i++)ball(d,dough,.055,random()*.48-.24,.04+random()*.06,random()*.4-.2).scale.set(1.2,.8,.8);}
    else{
      ball(d,dough,.25,0,.16,0).scale.set(1,.78,1);
      if(s.dough.phase===3&&!compare){const geo=new THREE.PlaneGeometry(.85,.75,16,16);geo.rotateX(-Math.PI/2);const a=geo.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getZ(i);a.setY(i,.028+.33*Math.exp(-(x*x+z*z)/.055));}geo.computeVertexNormals();mesh(d,geo,porcelain);}
    }
  }
  const f=stations.filling.food;
  if(s.filling.phase===0){for(let i=0;i<3;i++)ball(f,fillMaterials[i],.16,(i-1)*.28,.12,0).scale.set(1,.8,1.3);}
  else if(s.filling.phase===1)filling(f,0,.01,0,1.6,85);
  else{bowl(f,.34,0,0,0);filling(f,0,.09,0,1.25,85);}
  const w=stations.wrapping.food;
  if(current==='wrap'){
    if(s.wrap.phase<2){wrapper(w);if(s.wrap.phase===1)filling(w,0,.045,0,s.wrap.amount==='large'?1.75:s.wrap.amount==='small'?.65:1);}
    else dumpling(w,0,0,0,s.wrap.phase===3,false,.81);
  }else{
    if(s.roll.phase===0)ball(w,dough,.14,0,.1,0).scale.y=.8;
    else wrapper(w,s.roll.passes);
  }
  const c=stations.stove.food;
  if(s.cook.phase>=1&&s.cook.phase<4)for(let i=0;i<3;i++)dumpling(c,s.cook.phase>=2?Math.sin(i*2.1)*.23:(i-1)*.2,s.cook.phase>=3?1.385:1.32,s.cook.phase>=2?-.25+Math.cos(i*2.1)*.18:(i%2)*.16-.36,true,s.cook.phase>=3,.48);
  if(s.cook.phase===4)for(let i=0;i<4;i++)dumpling(c,(i%2)*.22+.04,1.0,Math.floor(i/2)*.2+.60,true,true,.42);
}
