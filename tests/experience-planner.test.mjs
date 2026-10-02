import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_CRITERIA, normalizeCriteria, criteriaKey, otherPosts, postsKey, filterExperiences, rankExperiences, localRecommendations,
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

test("Today: criteria validate fuzzy time preferences, party size including self, categories, materials and bounded notes", () => {
  assert.ok(criteria({ participants: 1 })); assert.ok(criteria({ participants: 50 }));
  for (const invalid of [null, {}, { ...DEFAULT_CRITERIA, timePreference: "15" }, { ...DEFAULT_CRITERIA, participants: 0 },
    { ...DEFAULT_CRITERIA, participants: 51 }, { ...DEFAULT_CRITERIA, participants: 2.5 },
    { ...DEFAULT_CRITERIA, participants: "2" }, { ...DEFAULT_CRITERIA, theme: "unknown" },
    { ...DEFAULT_CRITERIA, materials: ["unknown"] }, { ...DEFAULT_CRITERIA, indoorsOnly: "yes" },
    { ...DEFAULT_CRITERIA, notes: "字".repeat(161) }]) assert.equal(normalizeCriteria(invalid), null);
  assert.deepEqual(criteria({ materials: ["phone", "writing", "phone"], notes: "  安静一点  " }).materials, ["phone", "writing"]);
  assert.equal(criteria({ notes: "  安静一点  " }).notes, "安静一点");
});

test("Today: unknown session duration/materials stay candidates, schedule windows are not session durations", () => {
  const conditions = criteria({ timePreference: "short", noPurchase: true, lightOnly: true });
  assert.ok(ids(conditions).includes("p3"));
  const item = localRecommendations({ ...conditions, theme: "旧物新生" }, posts).recommendations[0];
  assert.equal(item.post.durationMinutes, null); assert.equal(item.post.requiredMaterials, null);
  assert.match(item.preparations.join(" "), /未说明单次参与时长.*确认/);
  assert.match(item.preparations.join(" "), /未说明完整材料要求/);
  assert.match(item.preparations.join(" "), /未说明体力要求/);
  assert.match(item.preparations.join(" "), /每周日 09:00–12:00/);
  assert.equal(item.status, "coordinate"); assert.match(item.firstStep, /原发布.*确认/);
  const pool = [custom({ durationMinutes: 30 }), custom({ id: "long", durationMinutes: 60 })];
  for (const timePreference of ["short", "medium", "long"]) assert.deepEqual(ids(criteria({ timePreference }), pool), ["community-new", "long"]);
  assert.match(item.preparations[0], /具体日期和参与时长由你自行选择/);
  assert.match(item.firstStep, /自行挑选合适的参与时间/);
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
test("Today ranking: fuzzy time is soft; explicit durations are compared relatively without minute thresholds", () => {
  const pool = [custom({ id: "quick", durationMinutes: 25 }), custom({ id: "middle", durationMinutes: 120 }), custom({ id: "deep", durationMinutes: 360 })];
  for (const [timePreference, expected] of [["short", "quick"], ["medium", "middle"], ["long", "deep"]]) {
    const conditions = criteria({ timePreference });
    assert.equal(filterExperiences(conditions, pool).length, 3);
    assert.equal(localRecommendations(conditions, pool).recommendations[0].id, expected);
  }
  const longOnly = localRecommendations(criteria({ timePreference: "short" }), [pool[2]]);
  assert.equal(longOnly.recommendations[0].post.durationMinutes, 360);
  assert.match(longOnly.recommendations[0].preparations.join(" "), /自行选择/);
  const explicit = [custom({ id: "short", durationPreference: "short" }), custom({ id: "long", durationPreference: "long" })];
  assert.equal(rankExperiences(criteria({ timePreference: "long" }), explicit)[0].post.id, "long");
});

test("Today ranking: interest dominates time cues; refusals are not treated as interests and novices are not assumed to be instructors", () => {
  const interest = localRecommendations(criteria({ timePreference: "short", notes: "想学习木工修复木椅" }), posts);
  assert.equal(interest.recommendations[0].id, "p3");
  assert.match(interest.recommendations[0].reason, /木工与家具/);
  const photo = localRecommendations(criteria({ notes: "不想学木工，只想学手机摄影" }), posts);
  assert.equal(photo.recommendations[0].id, "p6");
  assert.ok(!photo.recommendations.some((item) => item.id === "p3"));
  const unpunctuated = localRecommendations(criteria({ notes: "不想学木工只想学手机摄影" }), posts);
  assert.equal(unpunctuated.recommendations[0].id, "p6");
  const refusedOnly = localRecommendations(criteria({ theme: "生活手艺", notes: "不想包饺子" }), posts);
  assert.equal(refusedOnly.recommendations.length, 0);
  assert.ok(validRecommendationData(refusedOnly, refusedOnly.criteria, posts));
  const novice = localRecommendations(criteria({ notes: "我是零基础，想包饺子" }), posts);
  assert.equal(novice.recommendations[0].id, "p1");
  const helper = localRecommendations(criteria({ theme: "亲子共学", notes: "新手想尝试" }), posts);
  assert.match(helper.recommendations[0].reason, /确认.*参与角色/);
});

test("Today ranking: published entry/deeper involvement cues and available materials produce explainable different results", () => {
  const short = localRecommendations(criteria({ timePreference: "short" }), posts);
  const long = localRecommendations(criteria({ timePreference: "long" }), posts);
  assert.deepEqual(short.recommendations.slice(0, 2).map((item) => item.id), ["p5", "p6"]);
  assert.equal(long.recommendations[0].id, "p3");
  assert.match(short.recommendations[0].reason, /从一句自己的话开始/);
  assert.match(long.recommendations[0].reason, /维修/);
  const base = rankExperiences(criteria(), posts).find((item) => item.post.id === "p6");
  const ready = rankExperiences(criteria({ materials: ["phone"] }), posts).find((item) => item.post.id === "p6");
  assert.ok(ready.score > base.score);
  assert.match(ready.reason, /已有材料符合/);
  assert.ok(short.recommendations.every((item) => validRecommendationData({ ...short, recommendations: [item] }, short.criteria, posts)));
});

test("Today persistence: old fixed-minute conditions migrate to fuzzy preferences while old recommendations are discarded", () => {
  for (const [minutes, timePreference] of [[15, "short"], [30, "medium"], [60, "long"]]) {
    const saved = { ...DEFAULT_CRITERIA, notes: "想了解木工", timePreference: undefined, minutes };
    const restored = restoreTodayState({ criteria: saved, result: { version: "today-posts-v2" } }, posts);
    assert.equal(restored.criteria.timePreference, timePreference);
    assert.equal(restored.criteria.minutes, undefined);
    assert.equal(restored.criteria.notes, "想了解木工"); assert.equal(restored.result, null);
  }
});
test("Today AI: invented durations, guaranteed fit, flexible schedules and long-term commitments are rejected", () => {
  const conditions = criteria({ timePreference: "long", theme: "学习交流" });
  for (const reason of ["每次需要3小时。", "先问是否能参加15分钟。", "可以两小时完成。", "完全符合你的条件。", "时间灵活，可以自行参加。", "你可以长期每周来学习。", "可以室内外均可参加。"]) {
    assert.equal(validateAIRecommendations({ recommendations: [{ ...aiItem, reason }] }, conditions, posts), null);
  }
  const result = { ...localRecommendations(conditions, posts), source: "ai", recommendations: validateAIRecommendations({ recommendations: [aiItem] }, conditions, posts) };
  assert.equal(validRecommendationData({ ...result, recommendations: [{ ...result.recommendations[0], reason: "单次2-3小时。" }] }, conditions, posts), false);
});
