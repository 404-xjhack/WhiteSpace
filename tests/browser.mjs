// Dependency-free end-to-end checks using an isolated Chromium profile and CDP.
// Node 22+ provides WebSocket. Set BROWSER_PATH to use another Chromium binary.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { root, startServer } from "./helpers.mjs";

if (typeof WebSocket === "undefined") throw new Error("Browser checks require Node.js 22+ (WebSocket).");
const browserPath = process.env.BROWSER_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"
].find(existsSync);
if (!browserPath) throw new Error("Set BROWSER_PATH to an installed Chromium browser.");
const profileDir = path.join(root, ".tmp", `browser-${Date.now()}`);
await mkdir(profileDir, { recursive: true });
const app = await startServer();
const browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profileDir}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let connection;
let aiApp;
let aiMock;
let mapApp;
const errors = [];
const checks = [];

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url); this.nextId = 0; this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
    this.socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.id) {
        const request = this.pending.get(data.id); if (!request) return;
        this.pending.delete(data.id); clearTimeout(request.timer);
        if (data.error) request.reject(new Error(data.error.message)); else request.resolve(data.result);
      } else if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
      this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}
async function evaluate(expression) {
  const result = await connection.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression, label = expression) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(80); }
  throw new Error(`Browser condition failed: ${label}`);
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',behavior:'instant'})`);
  await pause(100);
  const rect = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing control'); element.scrollIntoView({block:'center',behavior:'instant'}); const rect = element.getBoundingClientRect(); return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,w:rect.width,h:rect.height}; })()`);
  assert.ok(rect.w && rect.h, `Visible control: ${selector}`);
  await connection.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await connection.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
}
async function set(selector, value) {
  await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event('input',{bubbles:true})); element.dispatchEvent(new Event('change',{bubbles:true})); })()`);
}
async function wheel(selector, deltaY) {
  const point = await evaluate(`(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}; })()`);
  await connection.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await connection.send("Input.dispatchMouseEvent", { type: "mouseWheel", ...point, deltaX: 0, deltaY });
  await pause(180);
}
async function reload() { await connection.send("Page.reload"); await until("document.querySelectorAll('.post-card').length >= 6"); }
async function readyMatch(title) { await until(`!document.querySelector('#matchResults').hidden && document.querySelector('#matchingPostTitle').textContent === ${JSON.stringify(title)}`); }
function passed(label) { checks.push(label); console.log(`PASS ${label}`); }

async function assertModal(selector, expectScroll) {
  const layout = await evaluate(`(() => { const dialog = document.querySelector(${JSON.stringify(selector)}); const body = dialog.querySelector('.dialog-body'); const actions = dialog.querySelector('.dialog-actions').getBoundingClientRect(); body.scrollTop = body.scrollHeight; return {outerScroll:dialog.scrollHeight > dialog.clientHeight+2, innerScroll:body.scrollHeight > body.clientHeight+2, bottom:body.scrollTop+body.clientHeight >= body.scrollHeight-2, actionsVisible:actions.top >= 0 && actions.bottom <= innerHeight+1, locked:getComputedStyle(document.documentElement).overflowY === 'hidden', wide:document.documentElement.scrollWidth > innerWidth+1}; })()`);
  assert.equal(layout.outerScroll, false, "Modal outer container must not scroll");
  if (expectScroll) assert.equal(layout.innerScroll, true, "Long body can scroll");
  assert.equal(layout.bottom, true); assert.equal(layout.actionsVisible, true); assert.equal(layout.locked, true); assert.equal(layout.wide, false);
}

try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await readFile(path.join(profileDir, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); break; } catch { await pause(100); }
  }
  assert.ok(port, "Browser starts with isolated profile");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  connection = new CDP(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await connection.send("Runtime.enable"); await connection.send("Page.enable"); await connection.send("Network.enable");
  await connection.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await connection.send("Page.navigate", { url: app.url });
  await until("document.querySelectorAll('.post-card').length === 6");
  assert.equal(await evaluate("document.querySelectorAll('#openCreateIntro,#openCreatePanel').length"), 0);
  assert.equal(await evaluate("document.querySelector('#emptyState').hidden"), true);
  passed("U09: one main publishing entry; examples live in form");

  await click("#mapToggle");
  assert.equal(await evaluate("document.querySelector('#neighborhoodMap').hidden"), false);
  assert.equal(await evaluate("document.querySelector('.main-grid').hidden"), true);
  assert.equal(await evaluate("document.querySelector('#demoMapLayout')"), null);
  await until("/真实地图尚未配置/.test(document.querySelector('#realMapCanvas').textContent)");
  assert.equal(await evaluate("document.querySelector('#mapLocationOption').disabled"), true);
  const unconfiguredMapShot = await connection.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "real-map-unconfigured.png"), Buffer.from(unconfiguredMapShot.data, "base64"));
  for (const width of [375, 320]) {
    await connection.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: true });
    await pause(120);
    assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth + 1"), false, `Map has no horizontal overflow at ${width}px`);
  }
  await connection.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await click("#mapToggle");
  assert.equal(await evaluate("document.querySelector('.main-grid').hidden"), false);
  passed("Only the real map is shown; missing keys fail gracefully at desktop and mobile sizes");
  await click("#openCreateTop"); await until("document.querySelector('#createDialog').open");
  await assertModal("#createDialog", true);
  await click("#publishButton");
  assert.equal(await evaluate("document.activeElement.id"), "postTitle");
  assert.match(await evaluate("document.querySelector('#formError').textContent"), /标题/);
  await set("#postTitle", "修椅"); await set("#postDescription", "帮修");
  await set("#categoryPicker", "旧物新生"); await click("#addCategory");
  await set("#categoryPicker", "旧物新生"); await click("#addCategory");
  assert.equal(await evaluate("document.querySelectorAll('.selected-category').length"), 1);
  await set("#categoryPicker", "other"); await click("#addCategory");
  assert.match(await evaluate("document.querySelector('#formError').textContent"), /其他分类名称/);
  await set("#customCategory", "  邻里 修理  "); await click("#addCategory");
  await set("#categoryPicker", "数码互助"); await click("#addCategory"); await click('[data-remove-category="2"]');
  await set("#timeMode", "weekly"); await set("#postWeekday", "0"); await set("#postStart", "09:00"); await set("#postEnd", "08:00");
  await set("#postLocation", "other"); await set("#locationOther", "公共集合点待确认"); await set("#participantMode", "range"); await set("#participantMin", "5"); await set("#participantMax", "2");
  await click("#profileSection summary"); await set("#profileRole", "新搬来的邻居"); await set("#profileAge", "121");
  await click("#publishButton");
  const invalid = await evaluate("document.querySelector('#formError').textContent");
  assert.match(invalid, /结束时间/); assert.match(invalid, /最多人数/); assert.match(invalid, /年龄/);
  await set("#postEnd", "11:00"); await set("#participantMin", "2"); await set("#participantMax", "5"); await set("#profileAge", "27"); await click("#agePublic");
  assert.equal(await evaluate("document.querySelector('#formError').hidden"), true);
  await assertModal("#createDialog", true); await click("#publishButton"); await readyMatch("修椅");
  assert.equal(await evaluate("document.querySelector('#matchSource').textContent"), "本地规则匹配");
  assert.equal(await evaluate("document.querySelector('#demoMapLayout')"), null);
  let posts = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))");
  const repairId = posts[0].id;
  assert.deepEqual(posts[0].categories, ["旧物新生", "邻里 修理"]); assert.ok(!posts[0].tags.includes("数码互助"));
  assert.equal(posts[0].age, "27岁"); assert.equal(posts[0].role, "新搬来的邻居"); assert.equal(posts[0].participants, "2–5人"); assert.ok(posts[0].createdAt);
  await click(`[data-post-id="${repairId}"]`);
  assert.match(await evaluate("document.querySelector('#detailContent').textContent"), /新搬来的邻居 · 27岁/);
  assert.match(await evaluate("document.querySelector('#detailContent').textContent"), /2–5人/);
  await click("#detailMatchButton"); await readyMatch("修椅");
  await reload(); await readyMatch("修椅");
  await set("#searchInput", "邻里 修理");
  assert.equal(await evaluate("document.querySelectorAll('.post-card').length"), 1);
  assert.equal(await evaluate("document.querySelector('.post-card h3').textContent"), "修椅");
  await set("#searchInput", "");
  passed("B01/B03–B06/U02–U05/U08: short post, categories, profile, schedule, participants, field errors and reload");

  await click('[data-post-id="p3"]'); await click("#interestButton");
  assert.equal(await evaluate("document.querySelector('#interestButton').textContent"), "取消参与意向");
  await click("#interestButton"); assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('writespace.interest.v1'))"), []);
  await click("#interestButton"); await click('#detailDialog [data-close="detailDialog"]');
  await reload(); await click('[data-post-id="p3"]');
  assert.equal(await evaluate("document.querySelector('#interestButton').textContent"), "取消参与意向");
  await click("#interestButton"); await click('#detailDialog [data-close="detailDialog"]');
  passed("U07: interest → cancel → rejoin, retained across reload and scoped to one post");

  await click("#openCreateTop"); await click('[name="type"][value="offer"]');
  assert.equal(await evaluate("document.querySelector('#titleLabel').textContent"), "技能或体验名称");
  assert.equal(await evaluate("document.querySelector('#timeMode').value"), "negotiable");
  await click('[name="type"][value="need"]');
  assert.equal(await evaluate("document.querySelector('#timeMode').value"), "");
  assert.equal(await evaluate("document.querySelector('#postLocation').value"), "");
  await click('[name="type"][value="offer"]');
  await set("#postTitle", "摄影"); await set("#postDescription", "教拍照"); await set("#categoryPicker", "数码互助"); await click("#addCategory");
  await click("#profileSection summary"); assert.equal(await evaluate("document.querySelector('#profileAge').value"), "27"); await click("#agePublic");
  await set("#participantMode", "exact"); await set("#participantCount", "3"); await click("#publishButton");
  await until("document.querySelector('#needDialog').open && !document.querySelector('#extractNeed').disabled");
  assert.match(await evaluate("document.querySelector('#needStatus').textContent"), /尚未配置/);
  await click("#saveNeed"); await readyMatch("摄影");
  posts = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))");
  const photoId = posts[0].id;
  assert.equal(posts[0].age, ""); assert.equal(posts[0].time, "时间可协商"); assert.equal(posts[0].location, "地点可协商"); assert.equal(posts[0].participants, "3人");
  assert.equal(posts[0].need, "");
  await click(`[data-post-id="${photoId}"]`); assert.match(await evaluate("document.querySelector('#detailContent').textContent"), /希望获得未说明/); await click('#detailDialog [data-close="detailDialog"]');
  await click(`[data-post-id="${repairId}"]`); await click("#detailMatchButton"); await readyMatch("修椅");
  await click(`[data-post-id="${photoId}"]`); await click("#detailMatchButton"); await readyMatch("摄影"); await reload(); await readyMatch("摄影");
  passed("U01/U08: capability sharing permits negotiation; each historical post restores its own match");

  // Hold one completed HTTP response to reproduce an old request finishing last.
  await evaluate("window.__realFetch = window.fetch; window.__heldCount = 0; window.fetch = async (...args) => { const response = await window.__realFetch(...args); if (args[0] === '/api/match' && ++window.__heldCount === 1) await new Promise(resolve => window.__releaseMatch = resolve); return response; }");
  await click("#rerunMatch"); await until("typeof window.__releaseMatch === 'function'");
  await click(`[data-post-id="${repairId}"]`); await click("#detailMatchButton"); await readyMatch("修椅");
  await evaluate("window.__releaseMatch(); window.fetch = window.__realFetch"); await pause(150);
  assert.equal(await evaluate("document.querySelector('#matchingPostTitle').textContent"), "修椅");
  passed("U08: late response cannot overwrite a different post's matching context");

  await connection.send("Network.setBlockedURLs", { urls: ["*/api/match"] }); await click("#rerunMatch"); await readyMatch("修椅");
  assert.match(await evaluate("document.querySelector('#matchSourceDetail').textContent"), /未连接/);
  assert.ok(await evaluate("document.querySelectorAll('.match-card').length > 0"));
  await connection.send("Network.setBlockedURLs", { urls: [] });
  passed("U06: API/network failure uses browser fallback with a clear source");

  for (const size of [{ width: 1280, height: 800 }, { width: 375, height: 667 }, { width: 320, height: 568 }]) {
    await connection.send("Emulation.setDeviceMetricsOverride", { ...size, deviceScaleFactor: 1, mobile: false });
    await click("#openCreateTop"); await click("#profileSection summary"); await assertModal("#createDialog", true);
    await set("#timeMode", "date"); await set("#postDate", "2026-10-04"); await set("#postStart", "09:00"); await set("#postEnd", "11:00");
    await click('#createDialog [data-close="createDialog"]');
    await evaluate(`(() => { const posts=JSON.parse(localStorage.getItem('writespace.posts.v1')); posts.find(p=>p.id===${JSON.stringify(repairId)}).description=('长说明'+String.fromCharCode(10)).repeat(80); localStorage.setItem('writespace.posts.v1',JSON.stringify(posts)); })()`);
    await reload(); await click(`[data-post-id="${repairId}"]`); await assertModal("#detailDialog", true); await click('#detailDialog [data-close="detailDialog"]');
    assert.equal(await evaluate("document.documentElement.classList.contains('modal-open')"), false);
  }
  await connection.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 1, mobile: false });
  await click("#openCreateTop");
  const shot = await connection.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "publish-mobile.png"), Buffer.from(shot.data, "base64"));
  await set("#postTitle", "散步"); await set("#postDescription", "一起走");
  await set("#categoryPicker", "社区生活"); await click("#addCategory");
  await set("#timeMode", "date"); await set("#postDate", "2026-10-04"); await set("#postStart", "09:00"); await set("#postEnd", "10:00");
  await set("#postLocation", "other"); await set("#locationOther", "社区花园");
  await click("#publishButton"); await readyMatch("散步");
  const datedPost = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0]");
  assert.equal(datedPost.time, "2026-10-04 09:00–10:00"); assert.equal(datedPost.location, "社区花园"); assert.equal(datedPost.participants, "协商决定");
  await click("#openCreateTop");
  await click('.form-examples summary'); await click('[data-example="food"]');
  assert.equal(await evaluate("document.querySelectorAll('.selected-category').length"), 2);
  await click("#publishButton"); await readyMatch("自动厨房之外，想带孩子体验手工包饺子");
  passed("B02/U09: single modal scroll at 1280/375/320 px, long details, reachable actions and usable example");

  await evaluate("(() => { const posts=JSON.parse(localStorage.getItem('writespace.posts.v1')); posts[0].createdAt=new Date(Date.now()-120000).toISOString(); localStorage.setItem('writespace.posts.v1',JSON.stringify(posts)); })()");
  await reload();
  assert.equal(await evaluate("document.querySelector('.post-age').textContent"), "2分钟前");
  await click(".post-card-action"); assert.equal(await evaluate("document.querySelector('#detailContent [data-published-id]').textContent"), "2分钟前"); await click('#detailDialog [data-close="detailDialog"]');
  await evaluate("window.__clockNow=Date.now; Date.now=()=>window.__clockNow()+60000; document.dispatchEvent(new Event('visibilitychange'))");
  assert.equal(await evaluate("document.querySelector('.post-age').textContent"), "3分钟前");
  await evaluate("Date.now=window.__clockNow");
  await evaluate("localStorage.setItem('writespace.posts.v1',JSON.stringify([{id:'mine-legacy',title:'旧发布',description:'旧说明',type:'need',category:'社区生活',time:'周末下午',location:'春和社区',published:'刚刚'}]))");
  await reload(); assert.equal(await evaluate("document.querySelector('.post-age').textContent"), "发布时间未知");
  await click('[data-post-id="mine-legacy"]'); assert.equal(await evaluate("document.querySelector('#detailMatchButton').hidden"), false); await click('#detailDialog [data-close="detailDialog"]');
  passed("B07/U08: relative timestamps agree in list/detail; legacy posts retain matching access");

  await click("#resetDemo"); assert.equal(await evaluate("document.querySelectorAll('.post-card').length"), 6);
  assert.equal(await evaluate("document.querySelector('#matchWelcome').hidden"), false);
  await reload(); assert.equal(await evaluate("document.querySelector('#matchWelcome').hidden"), false);
  passed("Reset clears publishing, profile, interest and matching persistence");

  const reportedTitle = "想找人一起修好一把旧椅子";
  const reportedDescription = "家里有把用了很多年的木椅，靠背松了。不想直接扔掉，希望和会木工的邻居一起修，也想学一点基础维修。";
  await click("#openCreateTop"); await click('.form-examples summary'); await click('[data-example="repair"]');
  await set("#postTitle", reportedTitle);
  await set("#postDescription", reportedDescription);
  await set("#categoryPicker", "other"); await set("#customCategory", "test"); await click("#addCategory");
  await click("#publishButton"); await readyMatch(reportedTitle);
  const reportedId = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0].id");
  assert.equal(await evaluate("document.querySelector('[data-match-id=\"p3\"]') !== null"), true);
  assert.match(await evaluate("document.querySelector('#matchingPostConditions').textContent"), /每周日 09:00–11:00.*公共集合点待确认/);
  await reload(); await readyMatch(reportedTitle);
  assert.match(await evaluate("document.querySelector('#matchList').textContent"), /陈师傅/);
  passed("Reported case: full chair repair + custom test + Sunday visibly returns Chen and survives reload");

  await evaluate(`(() => { const cache=JSON.parse(localStorage.getItem('writespace.matches.v1')); cache.byPost[${JSON.stringify(reportedId)}].algorithmVersion='legacy'; cache.byPost[${JSON.stringify(reportedId)}].matches=[]; localStorage.setItem('writespace.matches.v1',JSON.stringify(cache)); })()`);
  await reload(); await readyMatch(reportedTitle);
  assert.equal(await evaluate("document.querySelector('[data-match-id=\"p3\"]') !== null"), true);
  await evaluate("(() => { const posts=JSON.parse(localStorage.getItem('writespace.posts.v1')); posts[0].schedule.days=[1]; localStorage.setItem('writespace.posts.v1',JSON.stringify(posts)); })()");
  await reload(); await readyMatch(reportedTitle);
  assert.equal(await evaluate("document.querySelectorAll('.match-card').length"), 0);
  assert.match(await evaluate("document.querySelector('#matchList').textContent"), /时间冲突/);
  assert.match(await evaluate("document.querySelector('#matchDiagnostics').textContent"), /陈师傅.*每周日/);
  assert.match(await evaluate("document.querySelector('#matchingPostConditions').textContent"), /每周一/);
  await evaluate("(() => { const posts=JSON.parse(localStorage.getItem('writespace.posts.v1')); posts[0].schedule.days=[0]; localStorage.setItem('writespace.posts.v1',JSON.stringify(posts)); })()");
  await reload(); await readyMatch(reportedTitle);
  assert.equal(await evaluate("document.querySelector('[data-match-id=\"p3\"]') !== null"), true);
  passed("Version and input changes invalidate stale/empty cache; time conflicts identify Chen and the actual day");

  const originalRepair = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0]");
  await click("#editMatchTime"); await until("document.querySelector('#scheduleDialog').open");
  await assertModal("#scheduleDialog", false);
  assert.equal(await evaluate("document.querySelector('#scheduleWeekday').value"), "0");
  assert.match(await evaluate("document.querySelector('#schedulePreview').textContent"), /每周日 09:00–11:00/);
  assert.equal(await evaluate("document.querySelector('#scheduleNegotiable').disabled"), true);
  await set("#scheduleMode", "date"); await set("#scheduleDate", "2026-10-10"); await set("#scheduleEnd", "08:00");
  await click("#saveSchedule");
  assert.equal(await evaluate("document.querySelector('#scheduleDialog').open"), true);
  assert.match(await evaluate("document.querySelector('#scheduleError').textContent"), /结束时间/);
  assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0]"), originalRepair);
  await set("#scheduleEnd", "11:00");
  assert.match(await evaluate("document.querySelector('#schedulePreview').textContent"), /2026-10-10（周六）/);
  await click("#saveSchedule"); await readyMatch(reportedTitle);
  assert.match(await evaluate("document.querySelector('#matchingPostConditions').textContent"), /2026-10-10（周六）/);
  assert.equal(await evaluate("document.querySelectorAll('.match-card').length"), 0);
  assert.match(await evaluate("document.querySelector('#matchDiagnostics').textContent"), /周六.*陈师傅.*每周日/);
  await click("#editMatchTime"); await set("#scheduleDate", "2026-10-11"); await click('#scheduleDialog [data-close="scheduleDialog"]');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0].schedule.date"), "2026-10-10");
  await click(`[data-post-id="${reportedId}"]`); await click("#detailTimeButton");
  assert.equal(await evaluate("document.querySelector('#scheduleDate').value"), "2026-10-10");
  await set("#scheduleDate", "2026-10-11");
  assert.match(await evaluate("document.querySelector('#schedulePreview').textContent"), /2026-10-11（周日）/);
  await click("#saveSchedule"); await readyMatch(reportedTitle);
  assert.equal(await evaluate("document.querySelector('[data-match-id=\"p3\"]') !== null"), true);
  assert.match(await evaluate("document.querySelector('#matchingPostConditions').textContent"), /2026-10-11（周日）/);
  const editedRepair = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0]");
  const { time: _oldTime, schedule: _oldSchedule, ...originalFields } = originalRepair;
  const { time: _newTime, schedule: _newSchedule, ...editedFields } = editedRepair;
  assert.deepEqual(editedFields, originalFields);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1')).length"), 1);
  await reload(); await readyMatch(reportedTitle);
  assert.equal(await evaluate("document.querySelector('[data-match-id=\"p3\"]') !== null"), true);
  assert.equal(await evaluate("document.documentElement.classList.contains('modal-open')"), false);
  const repairShot = await connection.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "matching-repair-mobile.png"), Buffer.from(repairShot.data, "base64"));
  await click("#editMatchTime"); await set("#scheduleMode", "weekly"); await set("#scheduleWeekday", "0");
  assert.match(await evaluate("document.querySelector('#schedulePreview').textContent"), /每周日 09:00–11:00/);
  await click("#saveSchedule"); await readyMatch(reportedTitle);
  assert.match(await evaluate("document.querySelector('#matchingPostConditions').textContent"), /每周日 09:00–11:00/);
  assert.equal(await evaluate("document.querySelector('[data-match-id=\"p3\"]') !== null"), true);
  assert.match(await evaluate("document.querySelector('#toast').textContent"), /已保存时间：每周日/);
  passed("Actual date: Saturday conflict → adjust original post to Sunday → Chen card; invalid/cancelled edits preserve data");

  await evaluate("(() => { const cache=JSON.parse(localStorage.getItem('writespace.matches.v1')); delete cache.byPost[cache.lastPostId]; localStorage.setItem('writespace.matches.v1',JSON.stringify(cache)); })()");
  await connection.send("Network.setBlockedURLs", { urls: ["*/data.json"] });
  await connection.send("Page.reload"); await readyMatch(reportedTitle);
  assert.equal(await evaluate("document.querySelectorAll('.post-card').length"), 1);
  assert.equal(await evaluate("document.querySelector('[data-match-id=\"p3\"]') !== null"), true);
  await click('[data-match-id="p3"]');
  assert.match(await evaluate("document.querySelector('#detailContent').textContent"), /陈师傅/);
  await click("#interestButton"); assert.equal(await evaluate("document.querySelector('#interestButton').textContent"), "取消参与意向");
  await click('#detailDialog [data-close="detailDialog"]');
  await connection.send("Network.setBlockedURLs", { urls: [] }); await reload(); await readyMatch(reportedTitle);
  passed("Missing browser seed data cannot hide an API candidate; detail and participation still work");

  await click("#openCreateTop"); await click('[name="type"][value="offer"]');
  const broadTitle = "分享手工、木工、写作和手机摄影";
  await set("#postTitle", broadTitle); await set("#postDescription", "我会包饺子、修家具、写作和拍照，希望一起练习");
  await set("#categoryPicker", "other"); await set("#customCategory", "test"); await click("#addCategory");
  await click("#publishButton");
  await until("document.querySelector('#needDialog').open && !document.querySelector('#extractNeed').disabled");
  await click("#saveNeed"); await readyMatch(broadTitle);
  assert.equal(await evaluate("document.querySelectorAll('.match-card').length"), 3);
  assert.equal(await evaluate("document.querySelector('#moreMatches').hidden"), false);
  await click("#moreMatches"); assert.ok(await evaluate("document.querySelectorAll('.match-card').length > 3"));
  const matchingShot = await connection.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "matching-mobile.png"), Buffer.from(matchingShot.data, "base64"));
  assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth+1"), false);
  await click("#moreMatches"); assert.equal(await evaluate("document.querySelectorAll('.match-card').length"), 3);
  await click("#editMatchTime"); assert.equal(await evaluate("document.querySelector('#scheduleNegotiable').disabled"), false);
  await set("#scheduleMode", "negotiable"); await click("#saveSchedule"); await readyMatch(broadTitle);
  assert.equal(await evaluate("document.querySelectorAll('.match-card').length"), 3);
  passed("Full candidate list expands and folds on mobile without discarding results after the first three");

  for (const [width, height] of [[1280, 800], [900, 600]]) {
    await connection.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate("document.querySelector('.feed-section').scrollTop=0; document.querySelector('.match-column').scrollTop=0");
    const layout = await evaluate("(() => { const feed=document.querySelector('.feed-section'), match=document.querySelector('.match-column'), button=document.querySelector('#moreMatches'), rect=match.getBoundingClientRect(), buttonRect=button.getBoundingClientRect(); return {feedScrollable:feed.scrollHeight>feed.clientHeight+2,matchScrollable:match.scrollHeight>match.clientHeight+2,top:rect.top,bottom:rect.bottom,buttonVisible:!button.hidden && buttonRect.top>=rect.top && buttonRect.bottom<=rect.bottom,buttonAboveList:buttonRect.bottom<=document.querySelector('#matchList').getBoundingClientRect().top+1,wide:document.documentElement.scrollWidth>innerWidth+1,height:innerHeight}; })()");
    assert.equal(layout.feedScrollable, true); assert.equal(layout.matchScrollable, true);
    assert.ok(layout.top >= 76 && layout.bottom <= height + 1); assert.equal(layout.wide, false);
    assert.equal(layout.buttonVisible, true); assert.equal(layout.buttonAboveList, true);
    await wheel(".match-column", 350); await until("document.querySelector('.match-column').scrollTop>0");
    assert.equal(await evaluate("document.querySelector('.feed-section').scrollTop"), 0);
    assert.equal(await evaluate("scrollY"), 0);
    const matchScroll = await evaluate("document.querySelector('.match-column').scrollTop");
    await wheel(".feed-section", 350); await until("document.querySelector('.feed-section').scrollTop>0");
    assert.equal(await evaluate("document.querySelector('.match-column').scrollTop"), matchScroll);
    const feedScroll = await evaluate("document.querySelector('.feed-section').scrollTop");
    await evaluate("document.querySelector('.match-column').scrollTop=document.querySelector('.match-column').scrollHeight");
    await wheel(".match-column", 350);
    assert.equal(await evaluate("document.querySelector('.feed-section').scrollTop"), feedScroll);
    assert.equal(await evaluate("scrollY"), 0);
    await evaluate("document.querySelector('.feed-section').scrollTop=0; document.querySelector('.match-column').scrollTop=0");
    if (width === 1280) {
      await pause(300);
      await until("document.querySelector('.feed-section').scrollTop===0 && document.querySelector('.match-column').scrollTop===0");
      const desktopShot = await connection.send("Page.captureScreenshot", { format: "png" });
      await writeFile(path.join(root, ".tmp", "matching-desktop-scroll.png"), Buffer.from(desktopShot.data, "base64"));
    }
  }
  await click("#moreMatches"); assert.ok(await evaluate("document.querySelectorAll('.match-card').length>3"));
  await wheel(".match-column", 450); await click(".match-card:last-child [data-match-id]");
  await until("document.querySelector('#detailDialog').open"); await assertModal("#detailDialog", false);
  await click('#detailDialog [data-close="detailDialog"]');
  await connection.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.match-column')).overflowY"), "visible");
  passed("Desktop columns scroll independently by mouse wheel; expansion is visible above cards and mobile keeps page scrolling");

  let aiReplyMatches = [{ id: "p3", score: 90, reason: "陈师傅提供木工维修和指导，符合修椅子的需求。", first_step: "先沟通椅子损坏情况，确认时间地点和分工。" }];
  let aiNeedReply = { need: "听邻居分享照片背后的社区故事", evidence: "也希望听你分享照片背后的社区故事" };
  aiMock = http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    const result = payload.messages[0].content.includes("内容提炼助手") ? aiNeedReply : { matches: aiReplyMatches };
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  });
  await new Promise((resolve) => aiMock.listen(0, "127.0.0.1", resolve));
  aiApp = await startServer({ AI_API_KEY: "test-only-placeholder", AI_API_URL: `http://127.0.0.1:${aiMock.address().port}` });
  await connection.send("Page.navigate", { url: aiApp.url }); await until("document.querySelectorAll('.post-card').length === 6");
  await click("#openCreateTop"); await click('.form-examples summary'); await click('[data-example="repair"]');
  await set("#postTitle", reportedTitle); await set("#postDescription", reportedDescription); await click("#publishButton"); await readyMatch(reportedTitle);
  assert.equal(await evaluate("document.querySelector('#matchSource').textContent"), "AI 匹配");
  assert.equal(await evaluate("document.querySelector('#moreMatches').hidden"), true);
  assert.doesNotMatch(await evaluate("document.querySelector('#matchSourceDetail').textContent"), /展开/);
  passed("U06: successful AI response is visibly labeled AI in the full publishing flow (mock gateway)");
  aiReplyMatches = [];
  await click("#rerunMatch"); await readyMatch(reportedTitle);
  assert.equal(await evaluate("document.querySelectorAll('.match-card').length"), 0);
  assert.match(await evaluate("document.querySelector('#matchList').textContent"), /AI 本次未推荐/);
  assert.equal(await evaluate("document.querySelector('#moreMatches').hidden"), false);
  assert.match(await evaluate("document.querySelector('#matchSourceDetail').textContent"), /另有 1 个候选可展开查看/);
  assert.equal(await evaluate("document.querySelector('#moreMatches').getBoundingClientRect().bottom<=document.querySelector('#matchList').getBoundingClientRect().top+1"), true);
  await click("#moreMatches");
  assert.match(await evaluate("document.querySelector('#matchSourceDetail').textContent"), /已展开 1 个其他候选/);
  assert.equal(await evaluate("document.querySelector('#moreMatches').getAttribute('aria-expanded')"), "true");
  assert.equal(await evaluate("document.querySelector('[data-match-id=\"p3\"]') !== null"), true);
  assert.equal(await evaluate("document.querySelector('.candidate-source').textContent"), "本地内容匹配");
  await click('[data-match-id="p3"]'); assert.match(await evaluate("document.querySelector('#detailContent').textContent"), /陈师傅/);
  await click('#detailDialog [data-close="detailDialog"]');
  passed("An empty AI recommendation keeps local candidates available with truthful per-card source labels");

  await click("#openCreateTop"); await click('.form-examples summary'); await click('[data-example="photo"]');
  const aiOfferTitle = "分享手机摄影，记录自动化街区的日常";
  await click("#publishButton"); await until("document.querySelector('#needDialog').open && !document.querySelector('#extractNeed').disabled");
  assert.equal(await evaluate("document.querySelector('#needValue').value"), aiNeedReply.need);
  assert.match(await evaluate("document.querySelector('#needEvidence').textContent"), /希望听你分享照片背后的社区故事/);
  await assertModal("#needDialog", false);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1')).length"), 1);
  await click('#needDialog [data-close="needDialog"]'); await until("document.querySelector('#createDialog').open");
  assert.equal(await evaluate("document.querySelector('#postTitle').value"), aiOfferTitle);
  await click("#publishButton"); await until("document.querySelector('#needDialog').open && !document.querySelector('#extractNeed').disabled");
  const needShot = await connection.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "need-extraction-mobile.png"), Buffer.from(needShot.data, "base64"));
  await click("#saveNeed"); await readyMatch(aiOfferTitle);
  const aiOffer = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0]");
  assert.equal(aiOffer.need, aiNeedReply.need); assert.equal(aiOffer.needSummary.source, "ai");
  await reload(); await readyMatch(aiOfferTitle); await click(`[data-post-id="${aiOffer.id}"]`);
  assert.equal(await evaluate("document.querySelector('.need-source').textContent"), "AI 提炼");
  assert.match(await evaluate("document.querySelector('#detailContent').textContent"), /听邻居分享照片背后的社区故事/);
  passed("Offer publishing: AI extraction → evidence preview → cancel/resume → confirm → detail and reload");

  await click("#detailNeedButton"); await until("document.querySelector('#needDialog').open && !document.querySelector('#extractNeed').disabled");
  await set("#needValue", "希望邻居分享搬家经验"); await click("#saveNeed"); await readyMatch(aiOfferTitle);
  const manualOffer = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0]");
  assert.equal(manualOffer.id, aiOffer.id); assert.equal(manualOffer.createdAt, aiOffer.createdAt); assert.equal(manualOffer.needSummary.source, "manual");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1')).length"), 2);
  const { need: _aiNeed, needSummary: _aiSummary, ...aiFields } = aiOffer;
  const { need: _manualNeed, needSummary: _manualSummary, ...manualFields } = manualOffer;
  assert.deepEqual(manualFields, aiFields);
  await click(`[data-post-id="${aiOffer.id}"]`); assert.equal(await evaluate("document.querySelector('.need-source')"), null);
  await click('#detailDialog [data-close="detailDialog"]');
  await evaluate("window.__realNeedFetch=window.fetch; window.fetch=async(...args)=>{const response=await window.__realNeedFetch(...args); if(args[0]==='/api/extract-need') await new Promise(resolve=>window.__releaseNeed=resolve); return response;}");
  await click(`[data-post-id="${aiOffer.id}"]`); await click("#detailNeedButton"); await until("typeof window.__releaseNeed === 'function'");
  assert.equal(await evaluate("document.querySelector('#saveNeed').disabled"), true);
  await set("#needValue", "手动填写不能被晚返回的 AI 覆盖");
  assert.equal(await evaluate("document.querySelector('#saveNeed').disabled"), false);
  await evaluate("window.__releaseNeed(); window.fetch=window.__realNeedFetch"); await pause(150);
  assert.equal(await evaluate("document.querySelector('#needValue').value"), "手动填写不能被晚返回的 AI 覆盖");
  await click('#needDialog [data-close="needDialog"]');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0].need"), manualOffer.need);
  passed("Existing offer: regenerate/edit preserves post identity; cancelled edits and late AI responses cannot overwrite manual text");

  aiNeedReply = { need: "", evidence: "" };
  await click(`[data-post-id="${aiOffer.id}"]`); await click("#detailNeedButton"); await until("document.querySelector('#needDialog').open && !document.querySelector('#extractNeed').disabled");
  assert.equal(await evaluate("document.querySelector('#needValue').value"), "");
  assert.match(await evaluate("document.querySelector('#needStatus').textContent"), /没有|未.*明确诉求/);
  await click("#saveNeed"); await readyMatch(aiOfferTitle);
  await click(`[data-post-id="${aiOffer.id}"]`); assert.match(await evaluate("document.querySelector('#detailContent').textContent"), /未说明/); await click('#detailDialog [data-close="detailDialog"]');
  await connection.send("Network.setBlockedURLs", { urls: ["*/api/extract-need"] });
  await click(`[data-post-id="${aiOffer.id}"]`); await click("#detailNeedButton"); await until("document.querySelector('#needDialog').open && !document.querySelector('#extractNeed').disabled");
  assert.match(await evaluate("document.querySelector('#needStatus').textContent"), /未连接/);
  await set("#needValue", "手动补充社区故事交流"); await click("#saveNeed"); await readyMatch(aiOfferTitle);
  await connection.send("Network.setBlockedURLs", { urls: [] });
  await evaluate("(() => { const posts=JSON.parse(localStorage.getItem('writespace.posts.v1')); posts[0].need='寻找适合的分享对象，具体交流方式见说明'; delete posts[0].needSummary; localStorage.setItem('writespace.posts.v1',JSON.stringify(posts)); })()");
  await reload(); await readyMatch(aiOfferTitle); await click(`[data-post-id="${aiOffer.id}"]`);
  assert.match(await evaluate("document.querySelector('#detailContent').textContent"), /未说明/);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0].need"), "");
  await click('#detailDialog [data-close="detailDialog"]');
  passed("Unstated expectations stay empty; offline extraction permits manual save; legacy canned wishes are removed");

  mapApp = await startServer({ AMAP_WEB_KEY: "public-test-key", AMAP_SECURITY_CODE: "private-test-code", AMAP_SERVICE_KEY: "service-test-key" });
  await connection.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__maps = []; window.__markers = []; window.__serviceWalkingCalls = []; window.__polylines = [];
    Object.defineProperty(navigator, 'geolocation', {configurable:true,value:{getCurrentPosition(success){success({coords:{longitude:120.067,latitude:30.297}})}}});
    const originalFetch = window.fetch.bind(window);
    window.fetch = (url, options) => {
      const path = typeof url === 'string' ? url : url.url;
      if (path.startsWith('/api/map/places?')) return Promise.resolve(new Response(JSON.stringify({ places:[{name:'蒋村社区文化中心',address:'杭州市 · 西湖区 · 文一路',point:{lng:120.0678,lat:30.2982}}] }), {status:200,headers:{'content-type':'application/json'}}));
      if (path.startsWith('/api/map/walking?')) { const params=new URL(path,location.origin).searchParams; const from=params.get('from').split(',').map(Number), to=params.get('to').split(',').map(Number); const distance=Math.round(Math.hypot((to[0]-from[0])*96000,(to[1]-from[1])*111000)*1.35)+50; window.__serviceWalkingCalls.push(path); return Promise.resolve(new Response(JSON.stringify({duration:Math.round(distance/1.2),distance,path:[{lng:from[0],lat:from[1]},{lng:to[0],lat:to[1]}]}), {status:200,headers:{'content-type':'application/json'}})); }
      return originalFetch(url, options);
    };
    class FakeLngLat { constructor(lng, lat) { this.lng=lng; this.lat=lat; } getLng() { return this.lng; } getLat() { return this.lat; } }
    class FakeMap { constructor(id, opts={}) { this.events={}; this.options=opts; this.center=opts.center || [120.067,30.297]; this.zoom=opts.zoom; document.getElementById(id).dataset.fakeMap='ready'; window.__maps.push(this); } on(name, fn) { this.events[name]=fn; } emit(name, data) { this.events[name]?.(data); } resize() {} setCenter(point) { this.center=point; } setZoom(zoom) { this.zoom=zoom; } getCenter() { return new FakeLngLat(...this.center); } }
    class FakeMarker { constructor(opts) { this.position=opts.position; this.title=opts.title; this.content=opts.content; this.events={}; window.__markers.push(this); } on(name, fn) { this.events[name]=fn; } emit(name, data) { if (name==='click' && this.content) this.content.click(); else this.events[name]?.(data); } setMap() {} setPosition(point) { this.position=point; } getPosition() { return new FakeLngLat(...this.position); } }
    class FakePolyline { constructor(opts) { this.path=opts.path; this.strokeColor=opts.strokeColor; this.active=true; window.__polylines.push(this); } setMap(map) { this.active=Boolean(map); } }
    window.AMap={Map:FakeMap,Marker:FakeMarker,Polyline:FakePolyline,LngLat:FakeLngLat,convertFrom:(point,_kind,callback)=>callback('complete',{locations:[new FakeLngLat(point[0]+.0005,point[1]+.0005)]})};
  ` });
  await connection.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await connection.send("Page.navigate", { url: mapApp.url });
  await until("document.querySelectorAll('.post-card').length === 6 && !document.querySelector('#mapLocationOption').disabled");
  await click("#mapToggle");
  await until("document.querySelector('#realMapCanvas').dataset.fakeMap === 'ready' && /已定位/.test(document.querySelector('#realMapArea').textContent)");
  assert.equal(await evaluate("window.__maps[0].zoom"), 16);
  assert.equal(await evaluate("window.__maps[0].options.jogEnable"), false);
  assert.equal(await evaluate("window.__maps[0].options.animateEnable"), false);
  assert.equal(await evaluate("document.querySelector('#demoMapLayout')"), null);
  await until("document.querySelectorAll('#realMissionList [data-real-post]').length === 6");
  assert.match(await evaluate("document.querySelector('.real-demo-notice').textContent"), /位置随机/);
  assert.match(await evaluate("document.querySelector('#realRouteSummary').textContent"), /点击一个任务点/);
  assert.equal(await evaluate("window.__serviceWalkingCalls.length"), 0, "Opening the map does not request walking routes");
  assert.equal(await evaluate("window.__polylines.filter(line=>line.active).length"), 0);
  assert.equal(await evaluate("document.querySelector('#realRouteToggle').hidden"), true);
  const markerCount = await evaluate("window.__markers.length");
  const farthestDemoTitle = await evaluate("(() => { const from=[120.0675,30.2975]; return window.__markers.filter(marker=>marker.title).map(marker=>({title:marker.title,distance:Math.hypot((marker.position[0]-from[0])*96000,(marker.position[1]-from[1])*111000)})).sort((a,b)=>b.distance-a.distance)[0].title; })()");
  await evaluate(`window.__markers.find(marker=>marker.title===${JSON.stringify(farthestDemoTitle)}).emit('click',{originEvent:{stopPropagation(){}}})`);
  await until(`document.querySelector('#realMissionDetail h4')?.textContent === ${JSON.stringify(farthestDemoTitle)}`);
  await until("document.querySelector('#realRouteSummary').dataset.state === 'ready'");
  assert.match(await evaluate("document.querySelector('#realRouteStatus').textContent"), /蓝色当前任务路线.*随机演示点/);
  assert.equal(await evaluate("window.__polylines.filter(line=>line.active && line.strokeColor==='#2c82cf').length"), 1);
  assert.equal(await evaluate("window.__serviceWalkingCalls.length"), 1, "Only the selected task requests a route");
  assert.equal(await evaluate(`JSON.stringify(window.__polylines.find(line=>line.active).path.at(-1)) === JSON.stringify(window.__markers.find(marker=>marker.title===${JSON.stringify(farthestDemoTitle)}).position)`), true);
  assert.equal(await evaluate("window.__markers.length"), markerCount, "Selecting a task keeps existing map markers");
  const nextDemoTitle = await evaluate(`window.__markers.find(marker=>marker.title && marker.title!==${JSON.stringify(farthestDemoTitle)}).title`);
  await evaluate(`window.__markers.find(marker=>marker.title===${JSON.stringify(nextDemoTitle)}).emit('click',{originEvent:{stopPropagation(){}}})`);
  await until(`document.querySelector('#realMissionDetail h4')?.textContent === ${JSON.stringify(nextDemoTitle)}`);
  await until("document.querySelector('#realRouteSummary').dataset.state === 'ready'");
  assert.equal(await evaluate("window.__polylines.filter(line=>line.active).length"), 1, "Switching tasks removes the previous route");
  assert.equal(await evaluate("window.__polylines.find(line=>line.active).strokeColor"), "#2c82cf", "Only the blue selected route remains");
  assert.equal(await evaluate(`JSON.stringify(window.__polylines.find(line=>line.active).path.at(-1)) === JSON.stringify(window.__markers.find(marker=>marker.title===${JSON.stringify(nextDemoTitle)}).position)`), true);
  await evaluate(`window.__markers.find(marker=>marker.title===${JSON.stringify(farthestDemoTitle)}).emit('click',{originEvent:{stopPropagation(){}}})`);
  await until(`document.querySelector('#realMissionDetail h4')?.textContent === ${JSON.stringify(farthestDemoTitle)}`);
  await until("document.querySelector('#realRouteSummary').dataset.state === 'ready'");
  assert.equal(await evaluate("window.__polylines.filter(line=>line.active).length"), 1, "Switching back does not leave a second route");
  await click("#realRouteToggle");
  assert.equal(await evaluate("document.querySelector('#realRouteSummary').dataset.state"), "hidden");
  assert.equal(await evaluate("window.__polylines.filter(line=>line.active).length"), 0);
  await click("#realRouteToggle");
  assert.equal(await evaluate("document.querySelector('#realRouteSummary').dataset.state"), "ready");
  assert.equal(await evaluate("window.__polylines.filter(line=>line.active).length"), 1);
  await evaluate(`window.__markers.findLast(marker=>marker.title===${JSON.stringify(farthestDemoTitle)}).emit('click',{originEvent:{stopPropagation(){}}})`);
  await until("document.querySelector('#realMissionDetail h4') === null");
  assert.equal(await evaluate("document.querySelector('#realRouteSummary').dataset.state"), "idle");
  assert.equal(await evaluate("window.__polylines.filter(line=>line.active).length"), 0, "Deselecting the task hides its route");
  assert.equal(await evaluate("document.querySelector('#realRouteToggle').hidden"), true);
  assert.equal(await evaluate("window.__markers.length"), markerCount, "Toggling routes does not rebuild markers");
  await set("#mapAreaSearch", "文化中心"); await click('#mapAreaSearchForm button[type="submit"]');
  await until("document.querySelectorAll('#mapAreaSearchResults [data-poi-index]').length === 1");
  assert.match(await evaluate("document.querySelector('#mapAreaSearchResults').textContent"), /西湖区/);
  await click('#mapAreaSearchResults [data-poi-index="0"]');
  assert.equal(await evaluate("window.__maps[0].center[0]"), 120.0678);
  await click("#realDemoAreaButton");
  assert.equal(await evaluate("window.__maps[0].center[0]"), 120.067672);
  await click("#realPublishButton"); await until("document.querySelector('#createDialog').open");
  await set("#postTitle", "一起整理社区故事"); await set("#postDescription", "想在公共地点和邻居一起整理旧照片，记录社区的记忆。");
  await set("#categoryPicker", "社区生活"); await click("#addCategory");
  await set("#timeMode", "weekly"); await set("#postWeekday", "6"); await set("#postStart", "14:00"); await set("#postEnd", "15:00");
  await set("#postLocation", "map"); await click("#openLocationPicker");
  await until("document.querySelector('#locationPickerDialog').open && document.querySelector('#locationPickerCanvas').dataset.fakeMap === 'ready'");
  assert.equal(await evaluate("window.__maps[1].options.jogEnable"), false);
  await set("#locationSearch", "文化中心"); await click('#locationSearchForm button[type="submit"]');
  await until("document.querySelectorAll('#locationSearchResults [data-poi-index]').length === 1");
  await click('#locationSearchResults [data-poi-index="0"]');
  assert.equal(await evaluate("document.querySelector('#mapLocationName').value"), "蒋村社区文化中心");
  await evaluate("window.__markers.at(-1).setPosition([120.068,30.2984]); window.__markers.at(-1).emit('dragend')");
  assert.equal(await evaluate("document.querySelector('#mapLocationName').value"), "");
  await set("#mapLocationName", "社区文化中心正门"); await click("#publicPointCheck"); await click("#saveLocationPoint");
  await until("document.querySelector('#createDialog').open");
  await set("#mapFirstStep", "先问好");
  await click("#publishButton");
  await until("document.querySelector('#realMissionList [data-real-post]') !== null");
  assert.equal(await evaluate("document.querySelector('#realMissionDetail h4')"), null);
  assert.match(await evaluate("document.querySelector('#realMissionDetail').textContent"), /点击地图上的任务点/);
  await evaluate("window.__markers.findLast(marker=>marker.title==='一起整理社区故事').emit('click',{originEvent:{stopPropagation(){}}})");
  await until("document.querySelector('#realMissionDetail h4')?.textContent === '一起整理社区故事'");
  const mappedPost = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0]");
  assert.deepEqual(mappedPost.locationPoint, { lng: 120.068, lat: 30.2984 });
  assert.equal(mappedPost.firstStep, "先问好");
  await evaluate("window.__maps[0].emit('click',{lnglat:new AMap.LngLat(120.067,30.297)})");
  await until("/高德路线/.test(document.querySelector('#realRouteStatus').textContent)");
  const firstStart = await evaluate("new URL(window.__serviceWalkingCalls.at(-1),location.origin).searchParams.get('from')");
  await evaluate("window.__maps[0].emit('click',{lnglat:new AMap.LngLat(120.069,30.299)})");
  await until("new URL(window.__serviceWalkingCalls.at(-1),location.origin).searchParams.get('from') === '120.069,30.299'");
  assert.notEqual(await evaluate("new URL(window.__serviceWalkingCalls.at(-1),location.origin).searchParams.get('from')"), firstStart);
  await evaluate("window.__markers.findLast(marker=>marker.title==='一起整理社区故事').emit('click',{originEvent:{stopPropagation(){}}})");
  await until("document.querySelector('#realMissionDetail h4') === null");
  await evaluate("window.__markers.findLast(marker=>marker.title==='一起整理社区故事').emit('click',{originEvent:{stopPropagation(){}}})");
  await until("document.querySelector('#realMissionDetail h4')?.textContent === '一起整理社区故事'");
  await evaluate("Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success){window.__releaseGeo=success}}})");
  await click("#realLocateButton");
  await until("typeof window.__releaseGeo === 'function'");
  await evaluate("window.__maps[0].emit('click',{lnglat:new AMap.LngLat(120.071,30.301)})");
  await until("new URL(window.__serviceWalkingCalls.at(-1),location.origin).searchParams.get('from') === '120.071,30.301'");
  await evaluate("window.__releaseGeo({coords:{longitude:120.067,latitude:30.297}})");
  await pause(50);
  assert.equal(await evaluate("new URL(window.__serviceWalkingCalls.at(-1),location.origin).searchParams.get('from')"), "120.071,30.301");
  assert.match(await evaluate("document.querySelector('#realMapArea').textContent"), /已选定出发点/);
  const configuredMapShot = await connection.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "real-map-mock.png"), Buffer.from(configuredMapShot.data, "base64"));
  await connection.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth + 1"), false);
  const configuredMobileShot = await connection.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "real-map-mock-mobile.png"), Buffer.from(configuredMobileShot.data, "base64"));
  await click("#realJumpMission"); await pause(600);
  assert.equal(await evaluate("document.querySelector('#realMissionTitle').getBoundingClientRect().top < innerHeight"), true);
  await click("#realEdit"); await until("document.querySelector('#createDialog').open");
  assert.equal(await evaluate("document.querySelector('#postTitle').value"), "一起整理社区故事");
  await set("#postTitle", "一起整理街区故事");
  await click("#openLocationPicker"); await until("document.querySelector('#locationPickerDialog').open");
  await evaluate("window.__maps[1].emit('click',{lnglat:new AMap.LngLat(120.0701,30.3002)})");
  await set("#mapLocationName", "社区图书馆正门"); await click("#saveLocationPoint");
  await set("#mapFirstStep", "先一起挑选三张老照片并确认故事");
  await click("#publishButton");
  await until("document.querySelector('#realMissionDetail h4')?.textContent === '一起整理街区故事'");
  const editedMapPost = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0]");
  assert.equal(editedMapPost.id, mappedPost.id);
  assert.deepEqual(editedMapPost.locationPoint, { lng: 120.0701, lat: 30.3002 });
  await click("#realDelete"); await until("document.querySelector('#deleteDialog').open");
  await click("#confirmDeleteButton");
  await until("document.querySelector('#realMissionDetail h4') === null");
  assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))"), []);
  passed("Real map: no automatic route, selected task route, randomized demo tasks, browser location, search, reselection, publish, edit and delete");
  assert.deepEqual(errors, [], "No uncaught browser exceptions");
  console.log(`Browser checks passed: ${checks.length}; no uncaught exceptions.`);
} catch (error) {
  if (connection) {
    console.log(await evaluate("JSON.stringify({dialogs:[...document.querySelectorAll('dialog')].map(d=>({id:d.id,open:d.open,text:d.textContent.slice(-250)})),detail:document.querySelector('#detailTitle').textContent,scrollY,matchTitle:document.querySelector('#matchingPostTitle').textContent})"));
    const shot = await connection.send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(root, ".tmp", "browser-failure.png"), Buffer.from(shot.data, "base64"));
  }
  throw error;
} finally {
  if (connection) { try { await connection.send("Browser.close"); } catch {} connection.socket.close(); }
  if (browser.exitCode === null) browser.kill();
  await app.close(); if (aiApp) await aiApp.close(); if (mapApp) await mapApp.close();
  if (aiMock) await new Promise((resolve) => { aiMock.close(resolve); aiMock.closeAllConnections(); });
}
