import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_CRITERIA, normalizeCriteria, criteriaKey, otherPosts, postsKey, filterExperiences, localRecommendations,
  validateAIRecommendations, validRecommendationData, restoreTodayState } from "../public/experience-planner.js";

const posts = JSON.parse(await readFile(new URL("../public/data.json", import.meta.url), "utf8"));
const criteria = (overrides = {}) => normalizeCriteria({ ...DEFAULT_CRITERIA, ...overrides });
const ids = (conditions, pool = posts) => filterExperiences(conditions, pool).map((item) => item.id);
const custom = (overrides = {}) => ({ ...posts[2], id: "community-new", ...overrides });
const aiItem = { id: "p5", reason: "赵老师愿意提供表达反馈，可以讨论一起写家书。", steps: ["核对原发布和参与角色。", "向发布者确认时间、材料和余位。"] };

test("Today: candidates are actual other people's posts, preserving authors and excluding own, invalid and duplicate posts", () => {
  const pool = otherPosts([...posts, { ...posts[2], id: "mine-own" }, custom(), custom(), null, { id: "broken" }]);
  assert.equal(pool.length, 7); assert.equal(new Set(pool.map((item) => item.id)).size, 7);
  assert.ok(!pool.some((item) => item.id.startsWith("mine-")));
  for (const post of posts) {
    const canonical = pool.find((item) => item.id === post.id);
    assert.equal(canonical.title, post.title); assert.equal(canonical.name, post.name);
    assert.equal(canonical.description, post.description); assert.equal(canonical.location, post.location);
  }
  assert.deepEqual(otherPosts(pool), pool);
  assert.equal(postsKey([...pool].reverse()), postsKey(pool));
  assert.deepEqual(ids(criteria(), [custom()]), ["community-new"]);
});

test("Today: criteria validate time, party size including self, categories, materials and bounded notes", () => {
  assert.ok(criteria({ participants: 1 })); assert.ok(criteria({ participants: 50 }));
  for (const invalid of [null, {}, { ...DEFAULT_CRITERIA, minutes: 45 }, { ...DEFAULT_CRITERIA, participants: 0 },
    { ...DEFAULT_CRITERIA, participants: 51 }, { ...DEFAULT_CRITERIA, participants: 2.5 },
    { ...DEFAULT_CRITERIA, participants: "2" }, { ...DEFAULT_CRITERIA, theme: "unknown" },
    { ...DEFAULT_CRITERIA, materials: ["unknown"] }, { ...DEFAULT_CRITERIA, indoorsOnly: "yes" },
    { ...DEFAULT_CRITERIA, notes: "字".repeat(161) }]) assert.equal(normalizeCriteria(invalid), null);
  assert.deepEqual(criteria({ materials: ["phone", "writing", "phone"], notes: "  安静一点  " }).materials, ["phone", "writing"]);
  assert.equal(criteria({ notes: "  安静一点  " }).notes, "安静一点");
});

test("Today: unknown session duration/materials stay candidates, schedule windows are not session durations", () => {
  const conditions = criteria({ minutes: 15, noPurchase: true, lightOnly: true });
  assert.ok(ids(conditions).includes("p3"));
  const item = localRecommendations({ ...conditions, theme: "旧物新生" }, posts).recommendations[0];
  assert.equal(item.post.durationMinutes, null); assert.equal(item.post.requiredMaterials, null);
  assert.match(item.preparations.join(" "), /未说明单次参与时长.*确认.*15 分钟/);
  assert.match(item.preparations.join(" "), /未说明完整材料要求/);
  assert.match(item.preparations.join(" "), /未说明体力要求/);
  assert.match(item.preparations.join(" "), /每周日 09:00–12:00/);
  assert.equal(item.status, "coordinate"); assert.match(item.firstStep, /原发布.*确认/);
  const pool = [custom({ durationMinutes: 30 }), custom({ id: "long", durationMinutes: 60 })];
  assert.deepEqual(ids(criteria({ minutes: 15 }), pool), []);
  assert.deepEqual(ids(criteria({ minutes: 30 }), pool), ["community-new"]);
  assert.deepEqual(ids(criteria({ minutes: 60 }), pool), ["community-new", "long"]);
});

test("Today: visitors can join group posts; party plus author must fit known capacity, unknown capacity stays", () => {
  assert.ok(ids(criteria({ participants: 1 })).includes("p1"));
  assert.ok(ids(criteria({ participants: 4 })).includes("p1"));
  assert.ok(!ids(criteria({ participants: 5 })).includes("p1"));
  assert.ok(ids(criteria({ participants: 2 })).includes("p4"));
  assert.ok(!ids(criteria({ participants: 3 })).includes("p4"));
  assert.deepEqual(ids(criteria({ participants: 50 })), []);
  assert.deepEqual(ids(criteria({ participants: 50 }), [custom({ participants: "可协商" })]), ["community-new"]);
  assert.deepEqual(ids(criteria({ participants: 2 }), [custom({ participantSettings: { mode: "exact", count: 2 } })]), []);
});

test("Today: themes and known travel, physical and material conflicts filter without relaxing unknown conditions", () => {
  assert.deepEqual(ids(criteria({ theme: "数码互助" })), ["p6"]);
  assert.deepEqual(ids(criteria({ theme: "数码互助", noPurchase: true })), []);
  assert.deepEqual(ids(criteria({ theme: "数码互助", noPurchase: true, materials: ["phone"] })), ["p6"]);
  const pool = [custom({ id: "online", location: "线上视频", durationMinutes: 15, requiredMaterials: [["writing", "phone"], ["old-object"]], lightActivity: true }),
    custom({ id: "offline", location: "社区共享工坊", lightActivity: false }),
    custom({ id: "unknown", location: "地点可协商" })];
  assert.deepEqual(ids(criteria({ indoorsOnly: true }), pool), ["online", "unknown"]);
  assert.deepEqual(ids(criteria({ lightOnly: true }), pool), ["online", "unknown"]);
  assert.ok(!ids(criteria({ noPurchase: true, materials: ["phone"] }), pool).includes("online"));
  assert.ok(ids(criteria({ noPurchase: true, materials: ["phone", "old-object"] }), pool).includes("online"));
  assert.ok(ids(criteria({ noPurchase: true, materials: ["writing", "old-object"] }), pool).includes("online"));
  assert.match(localRecommendations(criteria({ indoorsOnly: true }), [pool[2]]).recommendations[0].preparations.join(" "), /确认对方是否支持线上/);
});

test("Today: at most three real publications, notes affect ranking, both offers and requests can be explored", () => {
  const result = localRecommendations(criteria({ notes: "我想学习木工修复木椅" }), posts);
  assert.equal(result.recommendations.length, 3); assert.equal(result.recommendations[0].id, "p3");
  assert.ok(result.recommendations.every((item) => posts.some((post) => post.id === item.id && post.title === item.post.title)));
  assert.equal(localRecommendations(criteria({ theme: "社区生活" }), posts).recommendations[0].post.type, "need");
  const empty = localRecommendations(criteria({ participants: 50 }), posts);
  assert.equal(empty.recommendations.length, 0); assert.match(empty.emptyReason, /没有符合已知条件/);
  assert.ok(validRecommendationData(result, result.criteria, posts)); assert.ok(validRecommendationData(empty, empty.criteria, posts));
});

test("Today AI: accepts only eligible unique publication ids and bounded reasons/participation suggestions", () => {
  const conditions = criteria({ theme: "学习交流" });
  const valid = validateAIRecommendations({ recommendations: [aiItem] }, conditions, posts);
  assert.equal(valid[0].post.title, posts[4].title); assert.match(valid[0].firstStep, /确认/);
  assert.deepEqual(valid[0].steps.slice(1), aiItem.steps);
  for (const invalid of [null, { recommendations: [] }, { recommendations: [aiItem, aiItem] },
    { recommendations: [{ ...aiItem, id: "p3" }] }, { recommendations: [{ ...aiItem, id: "three-lines" }] },
    { recommendations: [{ ...aiItem, id: "mine-own" }] }, { recommendations: [{ ...aiItem, reason: " " }] },
    { recommendations: [{ ...aiItem, steps: ["只有一步"] }] }, { recommendations: [{ ...aiItem, steps: ["字".repeat(121), "二"] }] }])
    assert.equal(validateAIRecommendations(invalid, conditions, posts), null);
});

test("Today AI: canonical publication facts and confirmation remain intact despite invented output fields", () => {
  const conditions = criteria({ notes: "孩子喜欢安静一点", theme: "学习交流" });
  const items = validateAIRecommendations({ recommendations: [{ ...aiItem, post: custom(), title: "不可信标题", minutes: 120, status: "ready" }] }, conditions, posts);
  assert.equal(items[0].post.title, posts[4].title); assert.equal(items[0].post.durationMinutes, null);
  assert.equal(items[0].status, "coordinate"); assert.equal(items[0].steps[0], items[0].firstStep);
  assert.ok(items[0].preparations.some((line) => /家长/.test(line)));
  const data = { ...localRecommendations(conditions, posts), source: "ai", fallbackReason: null, recommendations: items };
  assert.ok(validRecommendationData(data, conditions, posts));
  for (const damaged of [{ ...items[0], status: "ready" }, { ...items[0], post: { ...items[0].post, title: "假标题" } },
    { ...items[0], firstStep: "立即开始" }]) assert.equal(validRecommendationData({ ...data, recommendations: [damaged] }, conditions, posts), false);
});

test("Today persistence: restores validated snapshots, invalidates changed posts, preserves conditions on corrupt/stale/old data", () => {
  const conditions = criteria({ theme: "旧物新生", notes: "想看看木椅" });
  const result = localRecommendations(conditions, posts);
  assert.deepEqual(restoreTodayState({ criteria: conditions, result }, posts).result, result);
  assert.ok(restoreTodayState({ criteria: conditions, result }).result);
  for (const pool of [posts.filter((post) => post.id !== "p3"), posts.map((post) => post.id === "p3" ? { ...post, description: "已改为分享其它事情。" } : post)])
    assert.equal(restoreTodayState({ criteria: conditions, result }, pool).result, null);
  for (const damaged of [null, { ...result, version: "today-v1" }, { ...result, inputKey: criteriaKey(criteria()) },
    { ...result, generatedAt: "bad date" }, { ...result, generatedAt: new Date(Date.now() - 86400001).toISOString() },
    { ...result, generatedAt: new Date(Date.now() + 60000).toISOString() }, { ...result, fallbackReason: {} },
    { ...result, recommendations: [{ ...result.recommendations[0], reason: 7 }] }]) {
    const restored = restoreTodayState({ criteria: conditions, result: damaged }, posts);
    assert.deepEqual(restored.criteria, conditions); assert.equal(restored.result, null);
  }
  assert.deepEqual(restoreTodayState(null, posts).criteria, DEFAULT_CRITERIA);
});
