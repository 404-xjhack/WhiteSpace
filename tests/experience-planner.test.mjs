import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CRITERIA, EXPERIENCE_TEMPLATES, normalizeCriteria, criteriaKey, filterExperiences, localRecommendations,
  recommendationItem, validateAIRecommendations, validRecommendationData, restoreTodayState, experienceDraft } from "../public/experience-planner.js";
import { validateDraft } from "../public/model.js";

const criteria = (overrides = {}) => normalizeCriteria({ ...DEFAULT_CRITERIA, ...overrides });
const ids = (conditions) => filterExperiences(conditions).map((item) => item.id);

test("Today: eight usable templates have known related posts and three to five concrete steps", () => {
  assert.equal(EXPERIENCE_TEMPLATES.length, 8);
  assert.equal(new Set(EXPERIENCE_TEMPLATES.map((item) => item.id)).size, 8);
  for (const item of EXPERIENCE_TEMPLATES) {
    assert.ok([15, 30, 60].includes(item.minutes));
    assert.ok(item.steps.length >= 3 && item.steps.length <= 5);
    assert.ok(item.preparation.length && item.categories.length);
    assert.ok(item.relatedPostIds.every((id) => /^p[1-6]$/.test(id)));
  }
});

test("Today: criteria validate time, total participants, categories, materials and bounded notes", () => {
  assert.ok(criteria({ participants: 1 })); assert.ok(criteria({ participants: 50 }));
  for (const invalid of [null, {}, { ...DEFAULT_CRITERIA, minutes: 45 }, { ...DEFAULT_CRITERIA, participants: 0 },
    { ...DEFAULT_CRITERIA, participants: 51 }, { ...DEFAULT_CRITERIA, participants: 2.5 },
    { ...DEFAULT_CRITERIA, participants: "2" }, { ...DEFAULT_CRITERIA, theme: "unknown" },
    { ...DEFAULT_CRITERIA, materials: ["unknown"] }, { ...DEFAULT_CRITERIA, indoorsOnly: "yes" },
    { ...DEFAULT_CRITERIA, notes: "字".repeat(161) }]) assert.equal(normalizeCriteria(invalid), null);
  assert.deepEqual(criteria({ materials: ["phone", "writing", "phone"], notes: "  安静一点  " }).materials, ["phone", "writing"]);
  assert.equal(criteria({ notes: "  安静一点  " }).notes, "安静一点");
});

test("Today: time and participant boundaries exclude longer and unsuitable experiences", () => {
  assert.ok(filterExperiences(criteria({ minutes: 15 })).every((item) => item.minutes === 15));
  assert.ok(!ids(criteria()).includes("dumpling-session"));
  assert.ok(!ids(criteria({ participants: 1, minutes: 60 })).includes("paper-story"));
  assert.ok(ids(criteria({ participants: 2, minutes: 60 })).includes("wood-session"));
  assert.ok(!ids(criteria({ participants: 5, minutes: 60 })).includes("wood-session"));
  assert.deepEqual(ids(criteria({ participants: 7, minutes: 60 })), []);
});

test("Today: themes and structured restrictions are hard filters, including alternative materials", () => {
  assert.deepEqual(ids(criteria({ theme: "数码互助" })), ["three-photos"]);
  assert.deepEqual(ids(criteria({ noPurchase: true })), ["notice"]);
  assert.deepEqual(ids(criteria({ noPurchase: true, materials: ["phone"] })), ["notice", "three-lines", "three-photos", "walk-map"]);
  assert.ok(ids(criteria({ participants: 2, noPurchase: true, materials: ["writing"] })).includes("paper-story"));
  assert.ok(!ids(criteria({ noPurchase: true, materials: ["writing"] })).includes("repair-plan"));
  assert.ok(ids(criteria({ noPurchase: true, materials: ["writing", "old-object"] })).includes("repair-plan"));
  assert.ok(filterExperiences(criteria({ minutes: 60, participants: 2, indoorsOnly: true })).every((item) => !item.outdoors));
  assert.ok(filterExperiences(criteria({ minutes: 60, participants: 2, lightOnly: true })).every((item) => item.light));
});

test("Today: recommendations are capped, stable, explicit about coordination and empty results", () => {
  const solo = localRecommendations(criteria()); assert.equal(solo.recommendations.length, 3);
  assert.equal(solo.recommendations[0].id, "walk-map");
  assert.equal(solo.recommendations[0].status, "ready");
  const group = localRecommendations(criteria({ participants: 2 }));
  assert.ok(group.recommendations.every((item) => item.status === "coordinate" && /确认/.test(item.firstStep)));
  const guided = recommendationItem(EXPERIENCE_TEMPLATES.find((item) => item.id === "wood-session"), criteria({ minutes: 60, participants: 2 }));
  assert.equal(guided.status, "coordinate"); assert.match(guided.firstStep, /指导者/);
  assert.equal(guided.steps.length, 5); // Don't duplicate the mandatory coordination step.
  const empty = localRecommendations(criteria({ theme: "亲子共学", participants: 1 }));
  assert.equal(empty.recommendations.length, 0); assert.match(empty.emptyReason, /没有符合全部条件/);
  assert.ok(validRecommendationData(solo, criteria())); assert.ok(validRecommendationData(empty, empty.criteria));
});

const aiItem = { id: "three-lines", reason: "适合用自己的话安静记录今天。", steps: ["回想今天一件小事。", "用纸笔或手机写三句话。", "读一遍并保留自己的表达。"] };
test("Today AI: only filtered, unique ids with bounded reason and action lists are accepted", () => {
  const conditions = criteria({ theme: "学习交流" });
  const valid = validateAIRecommendations({ recommendations: [aiItem] }, conditions);
  assert.equal(valid[0].title, "亲手写下三句话");
  assert.equal(valid[0].firstStep, aiItem.steps[0]);
  for (const invalid of [null, { recommendations: [] }, { recommendations: [aiItem, aiItem] },
    { recommendations: [{ ...aiItem, id: "notice" }] }, { recommendations: [{ ...aiItem, id: "invented" }] },
    { recommendations: [{ ...aiItem, reason: " " }] }, { recommendations: [{ ...aiItem, steps: ["只有一步"] }] },
    { recommendations: [{ ...aiItem, steps: ["字".repeat(121), "二", "三"] }] }]) assert.equal(validateAIRecommendations(invalid, conditions), null);
});

test("Today AI: template facts and safety preparations stay canonical; coordination stays the first step", () => {
  const conditions = criteria({ participants: 2, notes: "孩子喜欢安静一点" });
  const items = validateAIRecommendations({ recommendations: [{ ...aiItem, title: "不可信标题", minutes: 120, status: "ready", materials: "新工具" }] }, conditions);
  assert.equal(items[0].title, "亲手写下三句话"); assert.equal(items[0].minutes, 15);
  assert.equal(items[0].status, "coordinate"); assert.match(items[0].firstStep, /确认参与伙伴/);
  assert.ok(items[0].preparations.some((line) => /家长/.test(line)));
  const data = { ...localRecommendations(conditions), source: "ai", recommendations: items };
  assert.ok(validRecommendationData(data, conditions));
  assert.equal(validRecommendationData({ ...data, recommendations: [{ ...items[0], status: "ready" }] }, conditions), false);
});

test("Today persistence: restores valid results, keeps conditions when broken, stale or outdated", () => {
  const conditions = criteria({ theme: "学习交流", notes: "安静" });
  const result = localRecommendations(conditions);
  assert.deepEqual(restoreTodayState({ criteria: conditions, result }).result, result);
  for (const broken of [{ ...result, version: "old" }, { ...result, generatedAt: "bad" },
    { ...result, generatedAt: { toString: 123, valueOf: 123 } }, { ...result, fallbackReason: {} },
    { ...result, generatedAt: new Date(Date.now() - 25 * 3600000).toISOString() },
    { ...result, generatedAt: new Date(Date.now() + 60000).toISOString() }, { ...result, recommendations: [null] },
    { ...result, inputKey: criteriaKey(criteria()) }]) {
    const restored = restoreTodayState({ criteria: conditions, result: broken });
    assert.deepEqual(restored.criteria, conditions); assert.equal(restored.result, null);
  }
  assert.deepEqual(restoreTodayState(null).criteria, DEFAULT_CRITERIA);
});

test("Today draft: one person becomes two, AI steps and all restrictions survive within existing form limits", () => {
  for (const template of EXPERIENCE_TEMPLATES) {
    const conditions = criteria({ minutes: 60, participants: template.minParticipants, notes: "补".repeat(160), indoorsOnly: true, noPurchase: true, lightOnly: true });
    const item = recommendationItem(template, conditions, { ...aiItem, steps: Array(5).fill("经过调整的操作".repeat(10)) });
    const draft = experienceDraft(item, conditions);
    assert.ok(draft.title.length <= 48); assert.ok(draft.description.length <= 320);
    assert.ok(draft.description.includes(conditions.notes)); assert.match(draft.description, /不出门、不添购材料、轻量活动/);
    assert.match(draft.description, /经过调整/); assert.equal(draft.participants, Math.max(2, conditions.participants));
    const validated = validateDraft({ type: "need", ...draft, timeMode: "weekly", weekday: "0", start: "09:00", end: "10:00",
      location: "社区共享工坊", participantMode: "exact", participantCount: String(draft.participants) }, draft.categories);
    assert.deepEqual(validated.errors, {});
  }
});
