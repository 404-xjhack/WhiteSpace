// Optional live smoke test. Uses the ignored .env, but never prints either AMap credential.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./helpers.mjs";

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
  await send("Page.navigate", { url });
  await until("document.querySelector('#realMapTab') && !document.querySelector('#mapLocationOption').disabled", "应用和地图配置");
  await evaluate("document.querySelector('#mapToggle').click(); document.querySelector('#realMapTab').click()");
  await until("/点击任务标记|真实地图暂不可用/.test(document.querySelector('#realMapStatus')?.textContent || '')", "高德地图加载结果");
  const status = await evaluate("document.querySelector('#realMapStatus').textContent");
  assert.doesNotMatch(status, /暂不可用/, `高德地图未加载：${status}`);
  await until("document.querySelector('#realMapCanvas .amap-maps')", "高德底图容器");
  await pause(1200);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "real-map-live.png"), Buffer.from(shot.data, "base64"));
  console.log("MAP_BASE_OK: 高德底图已加载；截图保存在 .tmp/real-map-live.png。密钥未输出。");
  if (!config.servicesEnabled) throw new Error("地点搜索和步行路线还需在 .env 填写 AMAP_SERVICE_KEY。");
  const placesResponse = await fetch(`${url}/api/map/places?q=${encodeURIComponent("学军中学紫金港校区")}`);
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
