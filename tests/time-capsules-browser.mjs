// Real Chromium input and downloads, with no browser automation dependency.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { root, startServer, assertTextContrast } from "./helpers.mjs";
import { CAPSULE_STORAGE_KEY, capsuleText } from "../public/time-capsules.js";

const browserPath = process.env.BROWSER_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(existsSync);
if (!browserPath || typeof WebSocket === "undefined") throw new Error("Capsule browser checks need Chromium and Node.js 22+.");
const profile = path.join(root, ".tmp", `capsule-browser-${Date.now()}`), downloads = path.join(profile, "downloads");
await mkdir(downloads, { recursive: true });
const app = await startServer();
const browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let cdp, scope = "document";
const errors = [], checks = [];
class CDP {
  constructor(url) {
    this.socket = new WebSocket(url); this.next = 1; this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
    this.socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.id) {
        const item = this.pending.get(data.id); if (!item) return;
        this.pending.delete(data.id); clearTimeout(item.timer);
        data.error ? item.reject(new Error(data.error.message)) : item.resolve(data.result);
      } else if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = this.next++, timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}
async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(80); }
  throw new Error(`Condition failed: ${expression}`);
}
const query = (selector) => `${scope}.querySelector(${JSON.stringify(selector)})`;
async function click(selector) {
  await evaluate(`${query(selector)}.scrollIntoView({block:'center',behavior:'instant'})`); await pause(60);
  const point = await evaluate(`(()=>{const r=${query(selector)}.getBoundingClientRect(),f=${scope === "document" ? "{x:0,y:0}" : "document.querySelector('#dumplingExperience').getBoundingClientRect()"};return{x:r.x+r.width/2+f.x,y:r.y+r.height/2+f.y,w:r.width,h:r.height}})()`);
  assert.ok(point.w && point.h, `Visible: ${selector}`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await pause(50);
}
async function type(selector, text) {
  await click(selector);
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
  await cdp.send("Input.insertText", { text });
}
async function shot(name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(root, ".tmp", name), Buffer.from(result.data, "base64"));
}
async function assertLayout(selector) {
  const layout = await evaluate(`(()=>{const dialog=${query(selector)},r=dialog.getBoundingClientRect(),actions=dialog.querySelector('.capsule-actions').getBoundingClientRect();return{wide:${scope}.documentElement.scrollWidth>${scope === "document" ? "innerWidth" : "document.querySelector('#dumplingExperience').contentWindow.innerWidth"},outerScroll:dialog.scrollHeight>dialog.clientHeight+2,footerVisible:actions.bottom<=r.bottom+1&&actions.top>=r.top,locked:${scope}.documentElement.classList.contains('modal-open')}})()`);
  assert.deepEqual(layout, { wide: false, outerScroll: false, footerVisible: true, locked: true });
}
function passed(label) { checks.push(label); console.log(`PASS ${label}`); }
async function stored() { return evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(CAPSULE_STORAGE_KEY)}))`); }

try {
  let port;
  for (let i = 0; i < 120; i++) { try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; } catch { await pause(100); } }
  assert.ok(port, "Chromium starts");
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  cdp = new CDP(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable"); await cdp.send("Network.enable");
  await cdp.send("Page.bringToFront");
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: app.url }); await until("document.querySelectorAll('.post-card').length===6");
  await until("document.querySelector('.site-header img.brand-mark')?.naturalWidth>0");
  assert.equal(await evaluate("document.querySelector('.site-header img.brand-mark').getAttribute('src')"), "/favicon.svg");
  const existingKeys = ["whitespace.posts.v1", "whitespace.matches.v1", "whitespace.profile.v1", "whitespace.interest.v1", "whitespace.today.v1"];
  const existing = await evaluate(`Object.fromEntries(${JSON.stringify(existingKeys)}.map(k=>[k,localStorage.getItem(k)]))`);
  await evaluate("WhiteSpaceTheme.setPreference('dark')");
  await click("#openCapsuleHistory");
  assert.equal(await evaluate("document.querySelector('#capsuleEmpty').hidden"), false);
  assert.equal(await evaluate("document.querySelector('.capsule-empty-actions a')?.getAttribute('href')"), "/dumpling-house.html");
  assert.equal(await evaluate("document.querySelector('#openShop3dFromCapsule')?.textContent"), "逛逛 3D 饺子店");
  await assertLayout("#capsuleHistory");
  await shot("capsules-empty-1280.png");
  const emptyAlignment = await evaluate("(()=>{const d=document.querySelector('#capsuleHistory').getBoundingClientRect(),a=document.querySelector('.capsule-empty-actions').getBoundingClientRect();return {dialogCenter:d.x+d.width/2,actionsCenter:a.x+a.width/2,viewportCenter:innerWidth/2}})()");
  assert.ok(Math.abs(emptyAlignment.dialogCenter-emptyAlignment.viewportCenter)<2 && Math.abs(emptyAlignment.actionsCenter-emptyAlignment.dialogCenter)<5, JSON.stringify(emptyAlignment));
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 700, deviceScaleFactor: 1, mobile: false });
  await assertLayout("#capsuleHistory");
  assert.equal(await evaluate("(()=>{const a=[...document.querySelectorAll('.capsule-empty-actions .capsule-button')].map(e=>e.getBoundingClientRect());return a[1].top>a[0].bottom})()"), true);
  await shot("capsules-empty-375.png");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await click('#openShop3dFromCapsule');
  await until("location.pathname==='/neighborhood-dumpling.html' && document.body.dataset.sceneReady==='true'");
  await until("document.querySelector('.scene-home-mark')?.naturalWidth>0");
  assert.equal(await evaluate("document.querySelector('.scene-home-mark').getAttribute('src')"), "/favicon.svg");
  assert.equal(await evaluate("document.querySelector('#startScreen')"), null);
  assert.equal(await evaluate("document.querySelector('canvas')!==null"), true);
  const sceneTime=await evaluate("({value:document.querySelector('#slider').value,clock:document.querySelector('#clock').textContent,play:document.querySelector('#play').textContent})");
  await evaluate("window.originalSceneCanvas=document.querySelector('canvas');WhiteSpaceTheme.setPreference('light');WhiteSpaceTheme.setPreference('dark');const select=document.querySelector('.scene-theme select');select.focus();select.dispatchEvent(new KeyboardEvent('keydown',{key:'v',bubbles:true}));");
  assert.deepEqual(await evaluate("({value:document.querySelector('#slider').value,clock:document.querySelector('#clock').textContent,play:document.querySelector('#play').textContent})"),sceneTime);
  assert.equal(await evaluate("originalSceneCanvas===document.querySelector('canvas')"),true);
  assert.equal(await evaluate("document.querySelector('#walkBtn').textContent"),'漫游');
  await assertTextContrast(evaluate,['.scene-theme select','.scene-home small','#ui button']);
  await click("#aboutBtn"); await until("document.querySelector('#sceneHelp').open");
  await assertTextContrast(evaluate,['.scene-help p','.scene-help button']);
  await click("#closeSceneHelp");
  for (const width of [375, 320]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 700, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate("(()=>{const r=document.querySelector('#ui').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})()"), true);
    if (width === 375) await shot("neighborhood-dumpling-375.png");
  }
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await shot("neighborhood-dumpling-1280.png");
  await click(".scene-home"); await until("location.pathname==='/' && document.querySelectorAll('.post-card').length===6");
  await click("#openCapsuleHistory");
  passed("Capsule dialog opens the neighborhood scene directly; help, mobile controls and logo return work");
  await click("#capsuleHistory [data-capsule-close]");
  assert.equal(await evaluate("document.documentElement.classList.contains('modal-open')"), false);
  passed("First-use history guides the user to complete an experience");

  await click('[data-post-id="p1"]'); await click("#openDumplingExperience");
  scope = "document.querySelector('#dumplingExperience').contentDocument";
  await until(`${query("#viewport")}?.dataset.renderer && ${query("#loading")}.hidden`);
  await click('[data-step="cook"]'); await click("#next");
  assert.equal(await evaluate(`${query("#capsule-completion")}.hidden`), true);
  await click("#close-summary");
  for (const [step, count] of [["dough", 3], ["filling", 2], ["portion", 2], ["roll", 4], ["wrap", 3], ["cook", 4]]) {
    await click(`[data-step="${step}"]`); for (let i = 0; i < count; i++) await click("#action");
  }
  await until(`${query("#summary-dialog")}.open && !${query("#capsule-completion")}.hidden`);
  await click("#save-experience-capsule"); await assertLayout("#capsuleEditor");
  assert.equal(await evaluate(`${query("#capsuleWork")}.value`), "");
  await click("#saveCapsule");
  assert.match(await evaluate(`${query("#capsuleError")}.textContent`), /还没有文字作品/);
  await assertLayout("#capsuleEditor");
  assert.equal(await evaluate(`(()=>{const r=${query("#capsuleError")}.getBoundingClientRect(),d=${query("#capsuleEditor")}.getBoundingClientRect();return r.top>=d.top&&r.bottom<=d.bottom})()`), true);
  assert.equal(await stored(), null);
  const work = "我把面皮从中间慢慢擀开。\n\n第一次放了太多馅，换成适量后，边缘终于合上了。\n这是一盘我亲手完成的饺子。\n";
  const moment = "边缘合上的瞬间，我想再包一只。\n没有着急。";
  const nextTime = "保留慢慢擀皮的节奏。\n下次少放一点馅。";
  await type("#capsuleTitle", "我第一次亲手包饺子");
  await type("#capsuleWork", work); await type("#capsuleMoment", moment); await type("#capsuleNextTime", nextTime);
  const formValues = await evaluate(`Object.fromEntries(['title','work','moment','nextTime'].map(k=>[k,${query("#capsuleForm")}.elements[k].value]))`);
  await evaluate("WhiteSpaceTheme.setPreference('light');WhiteSpaceTheme.setPreference('dark')");
  await until("document.querySelector('#dumplingExperience').contentDocument.documentElement.dataset.theme==='dark'");
  assert.deepEqual(await evaluate(`Object.fromEntries(['title','work','moment','nextTime'].map(k=>[k,${query("#capsuleForm")}.elements[k].value]))`),formValues);
  assert.equal(await evaluate(`${query("#capsuleEditor")}.open`),true);
  await assertLayout("#capsuleEditor");
  passed("Theme changes preserve the open capsule editor and every draft field");
  const childThemeEvaluate=(expression)=>evaluate(`document.querySelector('#dumplingExperience').contentWindow.eval(${JSON.stringify(expression)})`);
  await assertTextContrast(childThemeEvaluate,['.capsule-field textarea','#saveCapsule','.capsule-hint']);
  assert.notEqual(await childThemeEvaluate("getComputedStyle(document.querySelector('#saveCapsule')).backgroundColor"),await childThemeEvaluate("getComputedStyle(document.querySelector('#capsuleEditor')).backgroundColor"));
  const childWindow = "document.querySelector('#dumplingExperience').contentWindow";
  await evaluate(`${childWindow}.__setItem=${childWindow}.Storage.prototype.setItem;${childWindow}.Storage.prototype.setItem=function(k,v){if(k===${JSON.stringify(CAPSULE_STORAGE_KEY)})throw new DOMException('Quota','QuotaExceededError');return ${childWindow}.__setItem.call(this,k,v)}`);
  await click("#saveCapsule");
  assert.match(await evaluate(`${query("#capsuleError")}.textContent`), /还没能保存/);
  await assertLayout("#capsuleEditor");
  assert.deepEqual(await evaluate(`Object.fromEntries(['title','work','moment','nextTime'].map(k=>[k,${query("#capsuleForm")}.elements[k].value]))`), formValues);
  assert.equal(await evaluate(`${query("#capsuleEditor")}.open && !${query("#saveCapsule")}.disabled`), true);
  await shot("capsules-save-failure.png");
  await click("#capsuleEditor [data-capsule-close]"); await click("#save-experience-capsule");
  assert.deepEqual(await evaluate(`Object.fromEntries(['title','work','moment','nextTime'].map(k=>[k,${query("#capsuleForm")}.elements[k].value]))`), formValues);
  await evaluate(`${childWindow}.Storage.prototype.setItem=${childWindow}.__setItem`);
  await evaluate(`${query("#saveCapsule")}.click();${query("#saveCapsule")}.click();${query("#capsuleForm")}.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
  await until(`${query("#capsuleDetail")}.open`);
  const first = (await stored())[0];
  assert.equal((await stored()).length, 1);
  assert.deepEqual([first.work, first.moment, first.nextTime], [work, moment, nextTime]);
  assert.match(await evaluate(`${query("#capsuleSavedStatus")}.textContent`), /已保存/);
  await assertLayout("#capsuleDetail"); await shot("capsules-saved-1280.png");
  await click("#reopenCapsule");
  assert.equal(await evaluate(`${query(".capsule-work")}.textContent`), work);
  await click("#exportCapsule");
  let downloaded;
  for (let i = 0; i < 100; i++) { downloaded = (await readdir(downloads)).find((name) => name.endsWith(".txt")); if (downloaded) break; await pause(80); }
  assert.ok(downloaded, "Actual .txt download completes");
  const bytes = await readFile(path.join(downloads, downloaded));
  assert.equal(bytes.toString("utf8"), capsuleText(first));
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  passed("Six-step experience → work and answers → failed save keeps draft → retry/double-click creates one full card → actual UTF-8/CRLF download");

  scope = "document";
  await cdp.send("Page.reload"); await until("document.querySelectorAll('.post-card').length===6");
  await click("#openCapsuleHistory"); assert.equal(await evaluate("document.querySelectorAll('.capsule-list-item').length"), 1);
  await click(`[data-capsule-id="${first.id}"]`);
  assert.equal(await evaluate("document.querySelector('.capsule-card h2').textContent"), first.title);
  assert.equal(await evaluate("document.querySelector('.capsule-work').textContent"), first.work);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.capsule-reflection p')].map(p=>p.textContent)"), [moment, nextTime]);
  assert.ok(await evaluate(`document.querySelector('#capsuleCard').textContent.includes(${JSON.stringify(first.experienceName)})`));
  await assertLayout("#capsuleDetail"); await shot("capsules-reopened-1280.png");
  assert.deepEqual(await evaluate(`Object.fromEntries(${JSON.stringify(existingKeys)}.map(k=>[k,localStorage.getItem(k)]))`), existing);
  await click("#capsuleDetail [data-capsule-close]");
  passed("Reload and reopen from homepage history preserves the complete work and reflections without changing existing data");

  // A real second experience record, using the restored completed scene.
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 1, mobile: false });
  await click('[data-post-id="p1"]'); await click("#openDumplingExperience");
  scope = "document.querySelector('#dumplingExperience').contentDocument";
  await until(`${query("#viewport")}?.dataset.renderer && ${query("#loading")}.hidden`);
  await click('[data-step="cook"]'); await click("#next"); await click("#save-experience-capsule");
  await assertLayout("#capsuleEditor"); await shot("capsules-editor-embedded-375.png");
  await type("#capsuleTitle", "第二次：留意面皮边缘"); await type("#capsuleWork", "这次放慢了动作。\n面皮边缘留得更宽。");
  await type("#capsuleMoment", "捏合时发现边缘更稳了。"); await type("#capsuleNextTime", "保留留边的做法，再换一种馅料。");
  await evaluate(`${query("#capsuleTitle")}.focus()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await until(`${query("#capsuleDetail")}.open`); await assertLayout("#capsuleDetail");
  await shot("capsules-saved-embedded-375.png");
  const second = (await stored())[0]; assert.equal((await stored()).length, 2);
  await click("#capsuleDetail [data-capsule-close]"); await click("#close-summary");
  await until(`!${scope}.documentElement.classList.contains('modal-open')`);
  assert.equal(await evaluate(`${scope}.documentElement.classList.contains('modal-open')`), false);
  scope = "document"; await click('#experienceDialog [data-close]');
  await until("document.querySelector('#detailDialog').open && !document.querySelector('#dumplingExperience')");
  await click('#detailDialog [data-close]');
  await click("#openCapsuleHistory");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-capsule-id]')].map(b=>b.dataset.capsuleId)"), [second.id, first.id]);
  assert.ok(await evaluate("document.querySelector('.capsule-summary').textContent.includes('这次放慢')"));
  for (const [width, height] of [[375, 667], [320, 568]]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await assertLayout("#capsuleHistory"); await shot(`capsules-history-${width}.png`);
    await click(`[data-capsule-id="${first.id}"]`); await assertLayout("#capsuleDetail");
    await evaluate("document.querySelector('#capsuleDetail .capsule-body').scrollTop=10000");
    await shot(`capsules-detail-${width}.png`);
    await click("#capsuleBack");
  }
  await click("#capsuleHistory [data-capsule-close]");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#openCapsuleHistory')).display==='none'"), false);
  assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
  passed("Multiple experiences appear newest first; 375/320 px history and full cards keep actions visible; dialog lock clears");

  // Block corrupt-history writes without losing a new user's input.
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: app.url + "/dumpling-house.html" });
  await until("document.querySelector('#viewport')?.dataset.renderer && document.querySelector('#loading').hidden");
  await evaluate(`localStorage.setItem(${JSON.stringify(CAPSULE_STORAGE_KEY)},'{broken')`);
  await click("#open-capsule-history");
  assert.equal(await evaluate("document.querySelector('#capsuleEmpty').hidden"), true);
  assert.match(await evaluate("document.querySelector('#capsuleHistoryError').textContent"), /原记录没有被覆盖/);
  await click("#capsuleHistory [data-capsule-close]"); await click("#open-summary"); await click("#save-experience-capsule");
  await assertLayout("#capsuleEditor"); await shot("capsules-editor-375.png");
  await type("#capsuleWork", "新作品仍在这里。"); await type("#capsuleMoment", "想继续的瞬间。"); await type("#capsuleNextTime", "下次也慢慢做。");
  await click("#saveCapsule"); assert.match(await evaluate("document.querySelector('#capsuleError').textContent"), /原记录没有被覆盖/);
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(CAPSULE_STORAGE_KEY)})`), "{broken");
  assert.equal(await evaluate("document.querySelector('#capsuleWork').value"), "新作品仍在这里。");
  await click("#capsuleEditor [data-capsule-close]"); await click("#close-summary");
  await evaluate(`localStorage.setItem(${JSON.stringify(CAPSULE_STORAGE_KEY)},${JSON.stringify(JSON.stringify([first, null, second]))})`);
  await click("#open-capsule-history");
  assert.equal(await evaluate("document.querySelectorAll('.capsule-list-item').length"), 2);
  assert.equal(await evaluate("document.querySelector('#capsuleHistoryError').hidden"), false);
  await click(`[data-capsule-id="${first.id}"]`);
  assert.equal(await evaluate("document.querySelector('.capsule-work').textContent"), work);
  await click("#capsuleDetail [data-capsule-close]");
  await evaluate("window.__getItem=Storage.prototype.getItem;Storage.prototype.getItem=function(){throw new DOMException('Disabled','SecurityError')}");
  await click("#open-capsule-history");
  assert.equal(await evaluate("document.querySelector('#capsuleHistoryError').hidden"), false);
  await evaluate("Storage.prototype.getItem=window.__getItem");
  passed("Standalone history/editor also work; corrupt and disabled storage show clear errors, preserve drafts and never overwrite history; readable entries remain accessible");

  await cdp.send("Page.navigate", { url: app.url }); await until("document.querySelectorAll('.post-card').length===6");
  const historyBeforeReset = JSON.stringify([first, second]);
  await evaluate(`localStorage.setItem(${JSON.stringify(CAPSULE_STORAGE_KEY)},${JSON.stringify(historyBeforeReset)});window.__removeItem=Storage.prototype.removeItem;Storage.prototype.removeItem=function(key){if(key===${JSON.stringify(CAPSULE_STORAGE_KEY)})throw new DOMException('Disabled','SecurityError');return window.__removeItem.call(this,key)}`);
  await click("#resetDemo");
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(CAPSULE_STORAGE_KEY)})`), historyBeforeReset);
  assert.match(await evaluate("document.querySelector('#toast').textContent"), /时间胶囊未能清空/);
  await click("#openCapsuleHistory"); assert.equal(await evaluate("document.querySelectorAll('.capsule-list-item').length"), 2);
  await click("#capsuleHistory [data-capsule-close]");
  await evaluate("Storage.prototype.removeItem=window.__removeItem");
  await click("#resetDemo"); assert.equal(await stored(), null);
  assert.match(await evaluate("document.querySelector('#toast').textContent"), /时间胶囊已重置/);
  await click("#openCapsuleHistory");
  assert.equal(await evaluate("document.querySelectorAll('.capsule-list-item').length"), 0);
  assert.equal(await evaluate("document.querySelector('#capsuleEmpty').hidden"), false);
  await cdp.send("Page.reload"); await until("document.querySelectorAll('.post-card').length===6");
  await click("#openCapsuleHistory"); assert.equal(await stored(), null);
  assert.equal(await evaluate("document.querySelector('#capsuleEmpty').hidden"), false);
  await click("#capsuleHistory [data-capsule-close]");
  await evaluate(`localStorage.setItem(${JSON.stringify(CAPSULE_STORAGE_KEY)},'{broken')`);
  await click("#resetDemo"); await click("#openCapsuleHistory");
  assert.equal(await stored(), null);
  assert.equal(await evaluate("document.querySelector('#capsuleHistoryError').hidden"), true);
  assert.equal(await evaluate("document.querySelector('#capsuleEmpty').hidden"), false);
  passed("Homepage reset clears capsules immediately and after reload, including corrupt history; a denied clear preserves records and reports failure until retry");
  assert.deepEqual(errors, [], "No uncaught browser exceptions");
  console.log(`Capsule browser checks passed: ${checks.length}; download: ${path.join(downloads, downloaded)}`);
} catch (error) {
  console.error(error);
  console.error("Browser exceptions:", errors);
  if (cdp) { try { console.error(await evaluate(`({active:${scope}.activeElement?.id,dialogs:[...${scope}.querySelectorAll('dialog')].map(d=>({id:d.id,open:d.open}))})`)); } catch {} }
  if (cdp) { try { await shot("capsules-browser-failure.png"); } catch {} }
  throw error;
} finally {
  if (cdp) { try { await cdp.send("Browser.close"); } catch {} cdp.socket.close(); }
  if (browser.exitCode === null) browser.kill();
  await app.close();
}
