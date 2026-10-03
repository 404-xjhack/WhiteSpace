// Optional live smoke test. Uses the ignored .env, but never prints either AMap credential.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root, assertTextContrast } from "./helpers.mjs";
import { gpsToAmapPoint } from "../public/coordinates.js";

const browserPath = process.env.BROWSER_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find(existsSync);
assert.ok(browserPath, "需要本机 Chrome 或 Edge；也可设置 BROWSER_PATH。");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const app = spawn(process.execPath, ["server.mjs"], { cwd: root, env: { ...process.env, PORT: "0" }, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
let browser, socket, nextId = 0;
const pending = new Map();

async function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`浏览器操作超时：${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "页面脚本异常");
  return result.result.value;
}
async function until(expression, label) {
  for (let i = 0; i < 180; i++) {
    if (await evaluate(expression)) return;
    await pause(150);
  }
  throw new Error(`未能等到：${label}`);
}

try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("服务启动超时")), 10000);
    let output = "";
    app.stdout.on("data", (chunk) => {
      output += chunk;
      const port = output.match(/http:\/\/localhost:(\d+)/)?.[1];
      if (port) { clearTimeout(timer); resolve(`http://127.0.0.1:${port}`); }
    });
    app.once("exit", () => { clearTimeout(timer); reject(new Error("服务未能启动")); });
  });
  const config = await (await fetch(`${url}/api/map-config`)).json();
  assert.equal(config.enabled, true, "请先在 .env 填写高德 Web Key 与安全密钥。");

  const profile = path.join(root, ".tmp", `map-live-${Date.now()}`);
  await mkdir(profile, { recursive: true });
  browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); break; } catch { await pause(100); }
  }
  assert.ok(port, "隔离浏览器未启动");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (!data.id || !pending.has(data.id)) return;
    const request = pending.get(data.id); pending.delete(data.id); clearTimeout(request.timer);
    if (data.error) request.reject(new Error(data.error.message)); else request.resolve(data.result);
  });
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success){success({coords:{longitude:120.067,latitude:30.297}})}}});" });
  await send("Page.navigate", { url });
  await until("document.querySelector('#mapToggle') && !document.querySelector('#mapLocationOption').disabled && document.querySelectorAll('.post-card').length>=6", "应用和地图配置");
  await evaluate("document.querySelector('#mapToggle').click()");
  await until("/已定位到你的附近/.test(document.querySelector('#realMapArea')?.textContent || '') || /真实地图暂不可用/.test(document.querySelector('#realMapStatus')?.textContent || '')", "高德地图定位结果");
  const status = await evaluate("document.querySelector('#realMapStatus').textContent");
  assert.doesNotMatch(status, /暂不可用/, `高德地图未加载：${status}`);
  await until("document.querySelector('#realMapCanvas .amap-maps')", "高德底图容器");
  await until("document.querySelector('#realMapCanvas .amap-logo') && document.querySelector('#realMapCanvas .amap-copyright')", "高德原始标识与版权信息");
  const themeMapState = await evaluate("({posts:localStorage.getItem('whitespace.posts.v1'),count:document.querySelectorAll('#realMapCanvas .real-task-marker').length,area:document.querySelector('#realMapArea').textContent})");
  await evaluate("window.liveThemeCanvas=document.querySelector('#realMapCanvas');window.liveLogo=document.querySelector('#realMapCanvas .amap-logo');window.liveLogoMarkup=liveLogo.innerHTML;WhiteSpaceTheme.setPreference('dark')");
  await pause(1600);
  assert.equal(await evaluate("document.documentElement.dataset.theme"),"dark");
  assert.equal(await evaluate("getComputedStyle(liveLogo).backgroundColor"),"rgb(255, 255, 255)","Black SDK logo lettering has a light background in dark mode");
  await assertTextContrast(evaluate,["#realMapCanvas .amap-copyright"]);
  const darkThemeShot=await send("Page.captureScreenshot",{format:"png"});
  await writeFile(path.join(root,".tmp","real-map-live-theme-dark.png"),Buffer.from(darkThemeShot.data,"base64"));
  await evaluate("WhiteSpaceTheme.setPreference('light')");
  await pause(1600);
  const lightThemeShot=await send("Page.captureScreenshot",{format:"png"});
  await writeFile(path.join(root,".tmp","real-map-live-theme-light.png"),Buffer.from(lightThemeShot.data,"base64"));
  assert.equal(await evaluate("liveThemeCanvas===document.querySelector('#realMapCanvas')"),true);
  assert.equal(await evaluate("liveLogo===document.querySelector('#realMapCanvas .amap-logo') && liveLogo.innerHTML===liveLogoMarkup"),true,"Theme changes preserve the SDK logo and its link");
  assert.deepEqual(await evaluate("({posts:localStorage.getItem('whitespace.posts.v1'),count:document.querySelectorAll('#realMapCanvas .real-task-marker').length,area:document.querySelector('#realMapArea').textContent})"),themeMapState);
  assert.equal(await evaluate("document.querySelector('#realRouteSummary').dataset.state"), "idle", "初始地图不自动选路线");
  assert.equal(await evaluate("document.querySelector('#realRouteToggle').hidden"), true);
  await pause(300);
  assert.match(await evaluate("document.querySelector('#realMapArea').textContent"), /已定位到你的附近/);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "real-map-live.png"), Buffer.from(shot.data, "base64"));
  console.log("MAP_BASE_OK: 高德底图已加载；截图保存在 .tmp/real-map-live.png。密钥未输出。");
  const locatedPoint = gpsToAmapPoint({ lng: 120.067, lat: 30.297 });
  const nearbyPoint = { lng: locatedPoint.lng + 0.0008, lat: locatedPoint.lat + 0.001 };
  await evaluate(`localStorage.setItem('whitespace.posts.v1',JSON.stringify([{id:'mine-live-smoke',type:'need',name:'我',title:'一起整理街区故事',description:'仅用于隔离浏览器截图的测试发布。',categories:['社区生活'],category:'社区生活',tags:['社区生活'],time:'周六下午',location:'公共集合点',locationPoint:${JSON.stringify(nearbyPoint)},firstStep:'先一起挑选三张老照片并确认故事',createdAt:new Date().toISOString()}]))`);
  await send("Page.reload");
  await until("document.querySelectorAll('.post-card').length === 7", "隔离浏览器测试发布");
  await evaluate("document.querySelector('#mapToggle').click()");
  await until("document.querySelector('#realMapCanvas .real-task-marker[data-post-id=\"mine-live-smoke\"]')", "真实地图个人任务标记");
  await pause(1000);
  const mapBox = await evaluate("(() => { const r=document.querySelector('#realMapCanvas').getBoundingClientRect(); return {left:r.left,top:r.top,width:r.width,height:r.height}; })()");
  const markerAt = () => evaluate("(() => { const r=document.querySelector('#realMapCanvas .real-task-marker[data-post-id=\"mine-live-smoke\"]').getBoundingClientRect(); return {x:r.x,y:r.y}; })()");
  const still = async (before, label) => {
    await pause(180);
    const after = await markerAt();
    const drift = Math.hypot(after.x - before.x, after.y - before.y);
    assert.ok(drift < 3, `${label}: 地图不应在松开鼠标后继续移动（偏移 ${drift.toFixed(1)}px）`);
  };
  const x = mapBox.left + mapBox.width * 0.72, y = mapBox.top + mapBox.height * 0.58;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
  const idleMarker = await markerAt();
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + 75, y: y + 35, buttons: 0 });
  await still(idleMarker, "仅移动鼠标");
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  const clickedMarker = await markerAt();
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + 65, y: y - 30, buttons: 0 });
  await still(clickedMarker, "点击地图后移动鼠标");
  const beforeDrag = await markerAt();
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + 45, y: y + 24, button: "left", buttons: 1 });
  await pause(100);
  const duringDrag = await markerAt();
  assert.ok(Math.hypot(duringDrag.x - beforeDrag.x, duringDrag.y - beforeDrag.y) > 5, "按住拖动时地图应能移动");
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + 45, y: y + 24, button: "left", buttons: 0, clickCount: 1 });
  await pause(60);
  const draggedMarker = await markerAt();
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + 95, y: y + 45, buttons: 0 });
  await still(draggedMarker, "拖拽松开后移动鼠标");
  const outsideX = mapBox.left + mapBox.width + 25;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: outsideX, y: y + 15, button: "left", buttons: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: outsideX, y: y + 15, button: "left", buttons: 0, clickCount: 1 });
  await pause(60);
  const outsideReleasedMarker = await markerAt();
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + 25, y: y - 20, buttons: 0 });
  await still(outsideReleasedMarker, "地图外松开鼠标后移动");
  await evaluate("document.querySelector('#realLocateButton').click()");
  await until("/已定位到你的附近/.test(document.querySelector('#realMapArea').textContent)", "拖拽后重新定位");
  await pause(150);
  const centeredTask = await evaluate("(() => { const map=document.querySelector('#realMapCanvas').getBoundingClientRect(), pin=document.querySelector('#realMapCanvas .real-task-marker[data-post-id=\"mine-live-smoke\"]').getBoundingClientRect(); return {map:{left:map.left,top:map.top,right:map.right,bottom:map.bottom},pin:{left:pin.left,top:pin.top,right:pin.right,bottom:pin.bottom}}; })()");
  assert.ok(centeredTask.pin.top >= centeredTask.map.top && centeredTask.pin.bottom <= centeredTask.map.bottom && centeredTask.pin.left >= centeredTask.map.left && centeredTask.pin.right <= centeredTask.map.right, `街区尺度下附近任务应在地图视野内：${JSON.stringify(centeredTask)}`);
  assert.equal(await evaluate("document.querySelector('#realMissionDetail h4')"), null);
  assert.equal(await evaluate("document.querySelector('#realMapCanvas .real-task-callout')"), null);
  const pinBox = await evaluate("(() => { const r=document.querySelector('#realMapCanvas .real-task-marker[data-post-id=\"mine-live-smoke\"]').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height*0.4}; })()");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pinBox.x, y: pinBox.y, buttons: 0 });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pinBox.x, y: pinBox.y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pinBox.x, y: pinBox.y, button: "left", buttons: 0, clickCount: 1 });
  await until("document.querySelector('#realMissionDetail h4')?.textContent === '一起整理街区故事'", "点击后出现任务详情");
  if (config.servicesEnabled) {
    await until("document.querySelector('#realRouteSummary').dataset.state === 'ready'", "手动点选任务后显示步行路线");
    assert.match(await evaluate("document.querySelector('#realRouteSummary').textContent"), /蓝色当前任务路线/);
    const routeButton = await evaluate("(() => { const r=document.querySelector('#realRouteToggle').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()");
    for (const state of ["hidden", "ready"]) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...routeButton, button: "left", buttons: 1, clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...routeButton, button: "left", buttons: 0, clickCount: 1 });
      await until(`document.querySelector('#realRouteSummary').dataset.state === '${state}'`, `地图内路线按钮切换到 ${state}`);
    }
  }
  const clickedPin = await markerAt();
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pinBox.x + 50, y: pinBox.y + 30, buttons: 0 });
  await still(clickedPin, "点击任务点后移动鼠标");
  await until("document.querySelector('#realMapCanvas .real-task-marker.is-selected .real-task-callout strong')", "真实地图选中标记气泡");
  assert.equal(await evaluate("document.querySelector('#realMapCanvas .real-task-callout strong').textContent"), "一起整理街区故事");
  assert.equal(await evaluate("document.querySelector('#realMapCanvas .real-task-callout').getBoundingClientRect().width <= 161"), true, "任务气泡应保持紧凑");
  for (const [selected, label] of [[false, "再次点击关闭任务"], [true, "再次点击打开任务"]]) {
    const markerBox = await evaluate("(() => { const r=document.querySelector('#realMapCanvas .real-task-marker[data-post-id=\"mine-live-smoke\"]').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height*0.4}; })()");
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: markerBox.x, y: markerBox.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: markerBox.x, y: markerBox.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: markerBox.x, y: markerBox.y, button: "left", buttons: 0, clickCount: 1 });
    await until(selected ? "document.querySelector('#realMissionDetail h4')?.textContent === '一起整理街区故事'" : "document.querySelector('#realMissionDetail h4') === null", label);
    if (!selected) assert.equal(await evaluate("document.querySelector('#realRouteSummary').dataset.state"), "idle", "关闭任务后路线应消失");
    else if (config.servicesEnabled) await until("document.querySelector('#realRouteSummary').dataset.state === 'ready'", "重新点选任务后显示路线");
    const beforeMove = await markerAt();
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: markerBox.x + 46, y: markerBox.y + 24, buttons: 0 });
    await still(beforeMove, `${label}后空手移动鼠标`);
  }
  await pause(900);
  const taskShot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "real-map-live-task.png"), Buffer.from(taskShot.data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
  await send("Page.reload");
  await until("document.querySelectorAll('.post-card').length === 7", "移动端隔离浏览器测试发布");
  await evaluate("document.querySelector('#mapToggle').click()");
  await until("/已定位到你的附近/.test(document.querySelector('#realMapArea')?.textContent || '')", "移动端地图定位");
  await until("document.querySelector('#realMapCanvas .real-task-marker[data-post-id=\"mine-live-smoke\"]')", "移动端地图个人任务标记");
  assert.equal(await evaluate("document.querySelector('#realRouteSummary').dataset.state"), "idle", "移动端初始地图不自动画路线");
  assert.equal(await evaluate("document.querySelector('#realMapCanvas .real-task-callout')"), null);
  assert.equal(await evaluate("(() => { const map=document.querySelector('#realMapCanvas').getBoundingClientRect(), pin=document.querySelector('#realMapCanvas .real-task-marker[data-post-id=\"mine-live-smoke\"]').getBoundingClientRect(); return pin.top >= map.top && pin.bottom <= map.bottom; })()"), true, "移动端附近任务应在首屏地图内");
  await pause(700);
  assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth + 1"), false, "移动端地图不应横向溢出");
  const mobileShot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "real-map-live-mobile.png"), Buffer.from(mobileShot.data, "base64"));
  await evaluate("document.querySelector('#realMissionList [data-real-post=\"mine-live-smoke\"]').click()");
  await until("document.querySelector('#realMapCanvas .real-task-marker.is-selected .real-task-callout')", "移动端点击后出现标记气泡");
  assert.equal(await evaluate("document.querySelector('#realMapCanvas .real-task-callout').getBoundingClientRect().width <= 151"), true, "移动端任务气泡应保持紧凑");
  if (config.servicesEnabled) await until("document.querySelector('#realRouteSummary').dataset.state === 'ready'", "移动端手动点选后的步行路线");
  const mobileSelectedShot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "real-map-live-mobile-selected.png"), Buffer.from(mobileSelectedShot.data, "base64"));
  if (!config.servicesEnabled) throw new Error("地点搜索和步行路线还需在 .env 填写 AMAP_SERVICE_KEY。");
  const placesResponse = await fetch(`${url}/api/map/places?q=${encodeURIComponent("杭州西湖")}`);
  const places = await placesResponse.json();
  assert.equal(placesResponse.status, 200, `地点搜索失败：${places.code || places.error || placesResponse.status}`);
  assert.ok(places.places?.length > 0, "地点搜索未返回附近地点");
  const routeResponse = await fetch(`${url}/api/map/walking?from=120.067974,30.298083&to=120.0688,30.299`);
  const route = await routeResponse.json();
  assert.equal(routeResponse.status, 200, `步行路线失败：${route.code || route.error || routeResponse.status}`);
  assert.ok(Number.isFinite(route.duration) && Number.isFinite(route.distance), "步行路线缺少时间或距离");
  console.log("MAP_LIVE_OK: 底图、附近地点搜索和步行路线均可用。密钥未输出。");
} catch (error) {
  console.error(`MAP_LIVE_FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (socket) socket.close();
  if (browser && browser.exitCode === null) browser.kill();
  if (app.exitCode === null) app.kill();
}
