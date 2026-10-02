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
  await set("#postLocation", "社区共享工坊"); await set("#participantMode", "range"); await set("#participantMin", "5"); await set("#participantMax", "2");
  await click("#profileSection summary"); await set("#profileRole", "新搬来的邻居"); await set("#profileAge", "121");
  await click("#publishButton");
  const invalid = await evaluate("document.querySelector('#formError').textContent");
  assert.match(invalid, /结束时间/); assert.match(invalid, /最多人数/); assert.match(invalid, /年龄/);
  await set("#postEnd", "11:00"); await set("#participantMin", "2"); await set("#participantMax", "5"); await set("#profileAge", "27"); await click("#agePublic");
  assert.equal(await evaluate("document.querySelector('#formError').hidden"), true);
  await assertModal("#createDialog", true); await click("#publishButton"); await readyMatch("修椅");
  assert.equal(await evaluate("document.querySelector('#matchSource').textContent"), "本地规则匹配");
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
  assert.equal(await evaluate("document.querySelector('#titleLabel').textContent"), "技能或帮助名称");
  assert.equal(await evaluate("document.querySelector('#timeMode').value"), "negotiable");
  await click('[name="type"][value="need"]');
  assert.equal(await evaluate("document.querySelector('#timeMode').value"), "");
  assert.equal(await evaluate("document.querySelector('#postLocation').value"), "");
  await click('[name="type"][value="offer"]');
  await set("#postTitle", "摄影"); await set("#postDescription", "教拍照"); await set("#categoryPicker", "数码互助"); await click("#addCategory");
  await click("#profileSection summary"); assert.equal(await evaluate("document.querySelector('#profileAge').value"), "27"); await click("#agePublic");
  await set("#participantMode", "exact"); await set("#participantCount", "3"); await click("#publishButton"); await readyMatch("摄影");
  posts = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))");
  const photoId = posts[0].id;
  assert.equal(posts[0].age, ""); assert.equal(posts[0].time, "时间可协商"); assert.equal(posts[0].location, "地点可协商"); assert.equal(posts[0].participants, "3人");
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
  await click("#publishButton"); await readyMatch("想带孩子体验手工包饺子");
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
  await set("#postDescription", reportedDescription);
  await set("#categoryPicker", "other"); await set("#customCategory", "test"); await click("#addCategory");
  await click("#publishButton"); await readyMatch(reportedTitle);
  const reportedId = await evaluate("JSON.parse(localStorage.getItem('writespace.posts.v1'))[0].id");
  assert.equal(await evaluate("document.querySelector('[data-match-id=\"p3\"]') !== null"), true);
  assert.match(await evaluate("document.querySelector('#matchingPostConditions').textContent"), /每周日 09:00–11:00.*社区共享工坊/);
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
  await click("#publishButton"); await readyMatch(broadTitle);
  assert.equal(await evaluate("document.querySelectorAll('.match-card').length"), 3);
  assert.equal(await evaluate("document.querySelector('#moreMatches').hidden"), false);
  await click("#moreMatches"); assert.ok(await evaluate("document.querySelectorAll('.match-card').length > 3"));
  const matchingShot = await connection.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", "matching-mobile.png"), Buffer.from(matchingShot.data, "base64"));
  assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth+1"), false);
  await click("#moreMatches"); assert.equal(await evaluate("document.querySelectorAll('.match-card').length"), 3);
  passed("Full candidate list expands and folds on mobile without discarding results after the first three");

  let aiReplyMatches = [{ id: "p3", score: 90, reason: "陈师傅提供木工维修和指导，符合修椅子的需求。", first_step: "先沟通椅子损坏情况，确认时间地点和分工。" }];
  aiMock = http.createServer((_req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ matches: aiReplyMatches }) } }] })); });
  await new Promise((resolve) => aiMock.listen(0, "127.0.0.1", resolve));
  aiApp = await startServer({ AI_API_KEY: "test-only-placeholder", AI_API_URL: `http://127.0.0.1:${aiMock.address().port}` });
  await connection.send("Page.navigate", { url: aiApp.url }); await until("document.querySelectorAll('.post-card').length === 6");
  await click("#openCreateTop"); await click('.form-examples summary'); await click('[data-example="repair"]'); await click("#publishButton"); await readyMatch("想找人一起修好一把旧椅子");
  assert.equal(await evaluate("document.querySelector('#matchSource').textContent"), "AI 匹配");
  passed("U06: successful AI response is visibly labeled AI in the full publishing flow (mock gateway)");
  aiReplyMatches = [];
  await click("#rerunMatch"); await readyMatch(reportedTitle);
  assert.equal(await evaluate("document.querySelectorAll('.match-card').length"), 0);
  assert.match(await evaluate("document.querySelector('#matchList').textContent"), /AI 本次未推荐/);
  await click("#moreMatches");
  assert.equal(await evaluate("document.querySelector('[data-match-id=\"p3\"]') !== null"), true);
  assert.equal(await evaluate("document.querySelector('.candidate-source').textContent"), "本地内容匹配");
  await click('[data-match-id="p3"]'); assert.match(await evaluate("document.querySelector('#detailContent').textContent"), /陈师傅/);
  await click('#detailDialog [data-close="detailDialog"]');
  passed("An empty AI recommendation keeps local candidates available with truthful per-card source labels");
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
  await app.close(); if (aiApp) await aiApp.close();
  if (aiMock) await new Promise((resolve) => { aiMock.close(resolve); aiMock.closeAllConnections(); });
}
