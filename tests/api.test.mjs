import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startServer } from "./helpers.mjs";
import { validateDraft } from "../public/model.js";

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
