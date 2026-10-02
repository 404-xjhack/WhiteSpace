import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startServer } from "./helpers.mjs";
import { validateDraft, matchPost, matchFingerprint, MATCH_VERSION, needExtractionKey } from "../public/model.js";
import { readFile } from "node:fs/promises";

const post = validateDraft({ type: "need", title: "修椅", description: "帮修", timeMode: "weekly", weekday: "0", start: "09:00", end: "11:00", location: "社区共享工坊", participantMode: "negotiable" }, ["旧物新生", "手作"]).data;
const match = { id: "p3", score: 90, reason: "陈师傅提供木工指导，可以一起修椅子。", first_step: "先确认椅子损坏情况，再商量见面。" };
async function request(url, body) { return fetch(`${url}/api/match`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
async function mockAI(handler) {
  const server = http.createServer(handler); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }) };
}
function reply(res, matches) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ matches }) } }] })); }
async function withAI(t, handler, timeout = "1000") {
  const ai = await mockAI(handler); t.after(() => ai.close());
  const app = await startServer({ AI_API_KEY: "test-only-placeholder", AI_API_URL: ai.url, AI_TIMEOUT_MS: timeout }); t.after(() => app.close()); return app.url;
}
test("API: no key gives labeled fallback and serves module assets", async (t) => {
  const app = await startServer(); t.after(() => app.close());
  const response = await request(app.url, { post }); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.source, "local"); assert.equal(data.fallbackReason, "unconfigured"); assert.equal(data.matches[0].id, "p3");
  assert.equal((await fetch(`${app.url}/model.js`)).status, 200);
  assert.deepEqual(await (await fetch(`${app.url}/api/status`)).json(), { aiConfigured: false });
});
test("API: null, whitespace, oversize and malformed structured input fail gracefully", async (t) => {
  const app = await startServer(); t.after(() => app.close());
  for (const body of [null, {}, { post: { ...post, title: " " } }, { post: { ...post, title: "x".repeat(49) } }, { post: { ...post, description: "x".repeat(321) } }, { post: { ...post, categories: ["x".repeat(31)] } }, { post: { ...post, schedule: { mode: "weekly", days: [0], start: "11:00", end: "09:00" } } }]) {
    const response = await request(app.url, body); assert.equal(response.status, 400); assert.ok((await response.json()).error);
  }
});
test("AI: success forwards all topics and structured schedule, removes duplicate and unknown ids", async (t) => {
  let forwarded;
  const url = await withAI(t, async (req, res) => { let body = ""; for await (const chunk of req) body += chunk; forwarded = JSON.parse(JSON.parse(body).messages[1].content); reply(res, [match, match, { ...match, id: "invented" }]); });
  const data = await (await request(url, { post })).json(); assert.equal(data.source, "ai"); assert.equal(data.matches.length, 1);
  assert.deepEqual(forwarded.post.categories, ["旧物新生", "手作"]); assert.deepEqual(forwarded.post.schedule.days, [0]); assert.ok(forwarded.candidates.every((candidate) => candidate.schedule));
});
test("AI: valid empty recommendations keep AI source", async (t) => {
  const url = await withAI(t, (_req, res) => reply(res, [])); const data = await (await request(url, { post })).json();
  assert.equal(data.source, "ai"); assert.deepEqual(data.matches, []);
});
test("AI: unrelated ids, invalid score/reason and broken JSON fall back", async (t) => {
  let mode = "unrelated";
  const url = await withAI(t, (_req, res) => {
    if (mode === "json") { res.end('{"choices":[{"message":{"content":"broken"}}]}'); return; }
    reply(res, mode === "unrelated" ? [{ ...match, id: "p5" }] : [{ ...match, score: "high", reason: "" }]);
  });
  for (mode of ["unrelated", "invalid", "json"]) {
    const data = await (await request(url, { post })).json(); assert.equal(data.source, "local"); assert.equal(data.fallbackReason, "invalid_response"); assert.equal(data.matches[0].id, "p3");
  }
});
test("AI: HTTP errors and timeout retain usable recommendations", async (t) => {
  const upstream = await withAI(t, (_req, res) => { res.writeHead(503); res.end(); });
  assert.equal((await (await request(upstream, { post })).json()).fallbackReason, "upstream");
  const timeout = await withAI(t, () => {}, "150");
  const data = await (await request(timeout, { post })).json(); assert.equal(data.source, "local"); assert.equal(data.fallbackReason, "timeout"); assert.equal(data.matches[0].id, "p3");
});
test("Reported input: custom test label retains Chen through HTTP with displayable candidate and cache context", async (t) => {
  const app = await startServer(); t.after(() => app.close());
  const sample = { ...post, id: "mine-reported", title: "想找人一起修好一把旧椅子", description: "家里有把用了很多年的木椅，靠背松了。不想直接扔掉，希望和会木工的邻居一起修，也想学一点基础维修。", categories: ["旧物新生", "test"], tags: ["旧物新生", "test"] };
  const response = await request(app.url, { post: sample }); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.matches[0].candidate.name, "陈师傅");
  assert.equal(data.algorithmVersion, MATCH_VERSION); assert.equal(data.inputFingerprint, matchFingerprint(sample)); assert.equal(data.postId, sample.id);
  assert.equal(data.criteria.time, "每周日 09:00–11:00"); assert.equal(data.summary.emptyReason, null);
  const conflict = { ...sample, schedule: { ...sample.schedule, days: [1] } };
  const excluded = await (await request(app.url, { post: conflict })).json();
  assert.equal(excluded.matches.length, 0); assert.equal(excluded.summary.emptyReason, "time_conflict");
  assert.equal(excluded.summary.timeConflicts[0].name, "陈师傅"); assert.equal(excluded.criteria.time, "每周一 09:00–11:00");
});
test("AI can recommend a valid semantic match outside local recall", async (t) => {
  const sample = { ...post, title: "学习造句", need: "学习造句", offer: "一起练习", description: "想让句子写得更自然", categories: ["test"], tags: ["test"], schedule: { mode: "weekly", days: [3], start: "17:00", end: "18:00" }, time: "每周三 17:00–18:00", location: "社区图书角" };
  const seed = JSON.parse(await readFile(new URL("../public/data.json", import.meta.url), "utf8"));
  assert.equal(matchPost(sample, seed).matches.length, 0);
  const url = await withAI(t, (_req, res) => reply(res, [{ ...match, id: "p5", reason: "赵老师提供表达反馈，可以帮助整理句子。" }]));
  const data = await (await request(url, { post: sample })).json();
  assert.equal(data.source, "ai"); assert.equal(data.matches[0].id, "p5"); assert.equal(data.matches[0].candidate.name, "赵老师");
});

const extractionPost = { type: "offer", title: "教手机摄影", description: "我能教拍照，也希望听你分享照片背后的社区故事。" };
const extractionResult = { need: "听你分享照片背后的社区故事", evidence: "也希望听你分享照片背后的社区故事" };
async function extractRequest(url, sample = extractionPost) { return fetch(`${url}/api/extract-need`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ post: sample }) }); }
function replyExtraction(res, result) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] })); }
test("Need API validates only extraction input; missing AI returns explicit unavailability, never a canned wish", async (t) => {
  const app = await startServer(); t.after(() => app.close());
  for (const invalid of [null, { ...extractionPost, type: "need" }, { ...extractionPost, title: " " }, { ...extractionPost, description: "文".repeat(321) }]) assert.equal((await extractRequest(app.url, invalid)).status, 400);
  const data = await (await extractRequest(app.url)).json();
  assert.equal(data.source, "unavailable"); assert.equal(data.fallbackReason, "unconfigured"); assert.equal(data.need, undefined);
});
test("Need AI extracts a grounded wish and forwards only the title and description", async (t) => {
  let forwarded;
  const url = await withAI(t, async (req, res) => { let body = ""; for await (const chunk of req) body += chunk; forwarded = JSON.parse(JSON.parse(body).messages[1].content); replyExtraction(res, extractionResult); });
  const data = await (await extractRequest(url, { ...extractionPost, age: "27岁", location: "秘密地址", apiKey: "not-forwarded" })).json();
  assert.deepEqual(forwarded, extractionPost); assert.equal(data.source, "ai"); assert.equal(data.need, extractionResult.need); assert.equal(data.evidence, extractionResult.evidence);
  assert.equal(data.inputKey, needExtractionKey(extractionPost));
});
test("Need AI accepts no stated expectation; rejects invented evidence, empty evidence and bad JSON", async (t) => {
  let result = { need: "", evidence: "" };
  const url = await withAI(t, (_req, res) => { if (result === null) { res.end('{"choices":[{"message":{"content":"bad json"}}]}'); return; } replyExtraction(res, result); });
  const empty = await (await extractRequest(url)).json(); assert.equal(empty.source, "ai"); assert.equal(empty.need, "");
  for (result of [{ ...extractionResult, evidence: "编造的诉求" }, { ...extractionResult, evidence: "" }, { ...extractionResult, need: "文".repeat(161) }, null]) {
    const data = await (await extractRequest(url)).json(); assert.equal(data.source, "unavailable"); assert.equal(data.fallbackReason, "invalid_response");
  }
});
test("Need AI gateway errors and timeout do not invent fallback expectations", async (t) => {
  const upstream = await withAI(t, (_req, res) => { res.writeHead(503); res.end(); });
  const failed = await (await extractRequest(upstream)).json(); assert.equal(failed.source, "unavailable"); assert.equal(failed.fallbackReason, "upstream");
  const timeout = await withAI(t, () => {}, "150");
  const delayed = await (await extractRequest(timeout)).json(); assert.equal(delayed.fallbackReason, "timeout"); assert.equal(delayed.need, undefined);
});
