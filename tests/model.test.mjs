import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateDraft, validateSchedule, displayTime, normalizedPost, normalizeLocationPoint, uniqueCategories, postTags, formatPublished, localMatch, matchPost, assessCandidate, eligibleForAI, matchFingerprint, MATCH_VERSION, timeCompatibility, needExtractionInput, needExtractionKey, validExtractedNeed, hasAINeed, LEGACY_OFFER_NEED } from "../public/model.js";

const seed = JSON.parse(await readFile(new URL("../public/data.json", import.meta.url), "utf8"));
const values = { type: "need", title: "修椅", description: "帮修", timeMode: "weekly", weekday: "0", start: "09:00", end: "11:00", location: "社区共享工坊", participantMode: "negotiable" };
const make = (overrides = {}, categories = ["旧物新生"]) => validateDraft({ ...values, ...overrides }, categories);

test("Public map meeting point requires explicit confirmation and valid coordinates", () => {
  const draft = make({ location: "map", locationName: "社区文化中心门口", locationLng: "120.067974", locationLat: "30.298083", publicPlaceConfirmed: "yes", firstStep: "先一起辨认三张旧照片的拍摄地点" });
  assert.deepEqual(draft.errors, {});
  assert.deepEqual(draft.data.locationPoint, { lng: 120.067974, lat: 30.298083 });
  assert.deepEqual(normalizedPost(draft.data).locationPoint, draft.data.locationPoint);
  assert.equal(normalizedPost(draft.data).firstStep, "先一起辨认三张旧照片的拍摄地点");
  const shortStep = make({ location: "map", locationName: "文化中心", locationLng: "120.06", locationLat: "30.29", publicPlaceConfirmed: "yes", firstStep: "先问好" });
  assert.deepEqual(shortStep.errors, {});
  assert.equal(normalizedPost(shortStep.data).firstStep, "先问好");
  assert.equal(make({ location: "map", locationName: "文化中心", locationLng: "120.06", locationLat: "30.29", publicPlaceConfirmed: "yes", firstStep: "问好" }).errors.firstStep, "请用 3–80 字说明见面后先做什么。");
  assert.equal(normalizedPost({ ...shortStep.data, firstStep: "问好" }), null);
  assert.equal(normalizedPost({ ...shortStep.data, firstStep: "文".repeat(80) }).firstStep.length, 80);
  assert.equal(normalizedPost({ ...shortStep.data, firstStep: "文".repeat(81) }), null);
  assert.ok(make({ location: "map", locationName: "文化中心", locationLng: "120.06", locationLat: "30.29", publicPlaceConfirmed: "yes" }).errors.firstStep);
  assert.ok(make({ location: "map", locationName: "住宅门口", locationLng: "120.06", locationLat: "30.29" }).errors.location);
  assert.ok(make({ location: "map", locationName: "文化中心", locationLng: "", locationLat: "30.29", publicPlaceConfirmed: "yes" }).errors.location);
  assert.equal(normalizeLocationPoint({ lng: 181, lat: 30 }), null);
  assert.equal(normalizedPost({ ...draft.data, locationPoint: { lng: "bad", lat: 30 } }), null);
  assert.notEqual(matchFingerprint(draft.data), matchFingerprint({ ...draft.data, locationPoint: { lng: 120.1, lat: 30.298083 } }));
});

test("B01: short nonblank posts pass both validators; blanks and limits fail", () => {
  const result = make(); assert.deepEqual(result.errors, {}); assert.ok(normalizedPost(result.data));
  assert.ok(make({ title: "   " }).errors.title); assert.ok(make({ description: "\n " }).errors.description);
  for (const [key, limit] of [["title", 48], ["description", 320]]) {
    assert.ok(make({ [key]: "文".repeat(limit + 1) }).errors[key]);
    assert.equal(normalizedPost({ ...result.data, [key]: "文".repeat(limit + 1) }), null);
    assert.ok(normalizedPost({ ...result.data, [key]: "文".repeat(limit) }));
  }
  assert.equal(normalizedPost({ ...result.data, title: {} }), null);
});
test("B03/U04: multiple normalized categories and legacy descriptive tags", () => {
  assert.deepEqual(uniqueCategories(["  手作  ", "手作", "ＡＩ", "ai", "亲子  共学"]), ["手作", "AI", "亲子 共学"]);
  assert.deepEqual(make({}, ["旧物新生", "手作", "手作"]).data.tags, ["旧物新生", "手作"]);
  assert.ok(make({}, []).errors.category);
  assert.ok(make({}, ["长".repeat(31)]).errors.category);
  assert.ok(make({}, Array.from({ length: 7 }, (_, i) => `主题${i}`)).errors.category);
  assert.deepEqual(postTags({ category: "旧物新生", tags: ["环保", "手作"] }), ["旧物新生", "环保", "手作"]);
});
test("B04/B05: role defaults, optional integer age, explicit age visibility", () => {
  assert.equal(make().data.role, "社区成员"); assert.equal(make().data.age, "");
  const privateAge = make({ role: "  新搬来的邻居 ", age: "27" });
  assert.equal(privateAge.profile.age, 27); assert.equal(privateAge.data.age, ""); assert.equal(privateAge.data.role, "新搬来的邻居");
  assert.equal(make({ age: "27", agePublic: "on" }).data.age, "27岁");
  for (const age of ["0", "121", "20.5", "abc", "-1"]) assert.ok(make({ age }).errors.age);
});
test("B06: participant settings preserve exact/range values and reject contradictions", () => {
  assert.equal(make().data.participants, "协商决定");
  assert.equal(make({ participantMode: "exact", participantCount: "3" }).data.participants, "3人");
  assert.equal(make({ participantMode: "range", participantMin: "2", participantMax: "5" }).data.participants, "2–5人");
  for (const count of ["", "0", "-1", "2.5", "51"]) assert.ok(make({ participantMode: "exact", participantCount: count }).errors.participantCount);
  assert.ok(make({ participantMode: "range", participantMin: "5", participantMax: "2" }).errors.participantMax);
});
test("B07: timestamps cross minute/hour/calendar boundaries and old data remains readable", () => {
  const now = new Date(2026, 9, 2, 12, 0, 0).getTime();
  assert.equal(formatPublished({ createdAt: now - 59999 }, now), "刚刚");
  assert.equal(formatPublished({ createdAt: now - 60000 }, now), "1分钟前");
  assert.equal(formatPublished({ createdAt: now - 3599999 }, now), "59分钟前");
  assert.equal(formatPublished({ createdAt: now - 3600000 }, now), "1小时前");
  assert.equal(formatPublished({ createdAt: new Date(2026, 9, 1, 23).toISOString() }, now), "昨天");
  assert.equal(formatPublished({ createdAt: new Date(2026, 8, 30).toISOString() }, now), "2026-09-30");
  assert.equal(formatPublished({ published: "3天前" }, now), "3天前");
  assert.equal(formatPublished({ published: "刚刚" }, now), "发布时间未知");
  assert.equal(formatPublished({ createdAt: "broken" }, now), "发布时间未知");
});
test("U01/U02/U03/U05: type-aware schedules, places and field errors", () => {
  const offer = make({ type: "offer", timeMode: "negotiable", location: "negotiable" });
  assert.deepEqual(offer.errors, {}); assert.equal(offer.data.time, "时间可协商"); assert.equal(offer.data.location, "地点可协商");
  assert.ok(make({ timeMode: "negotiable", location: "negotiable" }).errors.timeMode);
  assert.equal(make().data.time, "每周日 09:00–11:00");
  const dated = make({ timeMode: "date", date: "2026-10-04" }); assert.deepEqual(dated.errors, {}); assert.equal(dated.data.time, "2026-10-04 09:00–11:00");
  assert.ok(make({ timeMode: "date", date: "2026-02-30" }).errors.date);
  assert.ok(make({ end: "08:00" }).errors.end); assert.ok(make({ end: "09:00" }).errors.end);
  assert.ok(make({ location: "" }).errors.location);
  assert.deepEqual(Object.keys(make({ title: "" }).errors), ["title"]);
  assert.deepEqual(Object.keys(make({ location: "" }).errors), ["location"]);
  assert.equal(make({ location: "other", locationOther: "社区花园" }).data.location, "社区花园");
});
test("U06: several topics rank grounded candidates; unrelated and conflicting posts do not", () => {
  assert.equal(localMatch(make().data, seed)[0].id, "p3");
  const food = make({ title: "包饺子", description: "家长陪孩子一起包饺子", weekday: "6", start: "14:00", end: "16:00", location: "春和社区活动室" }, ["亲子共学", "生活手艺"]).data;
  assert.equal(localMatch(food, seed)[0].id, "p1"); assert.match(localMatch(food, seed)[0].first_step, /家长/);
  const writing = make({ title: "家书", description: "想学写作表达", weekday: "3", start: "17:00", end: "18:00", location: "社区图书角" }, ["学习交流"]).data;
  assert.equal(localMatch(writing, seed)[0].id, "p5");
  const unrelated = make({ type: "offer", title: "观星", description: "望远镜观测", timeMode: "negotiable", location: "negotiable" }, ["天文学"]).data;
  assert.deepEqual(localMatch(unrelated, seed), []);
  const conflict = make({ weekday: "1" }).data; assert.ok(!localMatch(conflict, seed).some((entry) => entry.id === "p3"));
  assert.equal(timeCompatibility(make().data, seed[2]), "overlap");
  assert.equal(timeCompatibility(conflict, seed[2]), "conflict");
  const sameType = localMatch({ ...make().data, type: "offer" }, seed).find((entry) => entry.id === "p3");
  assert.match(sameType.reason, /类型相同/); assert.match(sameType.reason, /尚不能确认/);
});

test("Reported regression: repair chair + test + Sunday always retains Chen", () => {
  const post = make({ title: "想找人一起修好一把旧椅子", description: "家里有把用了很多年的木椅，靠背松了。不想直接扔掉，希望和会木工的邻居一起修，也想学一点基础维修。" }).data;
  const base = localMatch(post, seed);
  const added = localMatch({ ...post, categories: [...post.categories, "test"], tags: [...post.tags, "test"] }, seed);
  assert.deepEqual(added, base);
  assert.equal(base[0].id, "p3");
  assert.equal(localMatch({ ...post, categories: ["test"], category: "test", tags: ["test"] }, seed)[0].id, "p3");
});
test("Content matching uses actual help and novel words independently of labels", () => {
  const tools = make({ title: "借工具", description: "需要基础工具和指导" }, ["工具借用"]).data;
  assert.equal(localMatch(tools, seed)[0].id, "p3");
  const phone = make({ title: "修手机", description: "手机开不了机，想修理电子设备" }).data;
  assert.ok(!localMatch(phone, seed).some((entry) => entry.id === "p3"));
  const gardening = { ...tools, title: "想养兰花", description: "请教兰花养护", categories: ["test"], tags: ["test"] };
  const gardener = { id: "new-skill", type: "offer", title: "分享种植经验", offer: "兰花养护", description: "愿意帮忙", location: "社区共享工坊" };
  assert.equal(localMatch(gardening, [gardener])[0].id, gardener.id);
  assert.equal(assessCandidate(phone, seed[2]).conflictingSkills, true);
});
test("Tags alone cannot establish ability; unrelated labels cannot change existing core score", () => {
  const tools = make({ title: "借工具", description: "需要工具" }, ["工具借用"]).data;
  const misleading = { ...seed[4], tags: ["工具借用", "工具"], category: "工具借用" };
  assert.deepEqual(localMatch(tools, [misleading]), []);
  const before = assessCandidate(tools, seed[2]);
  const after = assessCandidate({ ...tools, tags: [...tools.tags, "test", "摄影", "手机维修"] }, seed[2]);
  assert.equal(before.relevant, after.relevant); assert.equal(after.conflictingSkills, false);
  assert.deepEqual(after.terms, before.terms); assert.deepEqual(after.concepts, before.concepts);
});
test("A person's own skills and opposite expectations do not replace the stated need", () => {
  const post = make({ title: "想学木工", description: "我会摄影，但希望修椅子并学习木工" }, ["test"]).data;
  assert.equal(localMatch(post, seed)[0].id, "p3");
  assert.ok(!localMatch(post, seed).some((entry) => entry.id === "p6"));
  const photoOffer = { ...post, type: "offer", title: "分享手机摄影", offer: "拍照和修图", need: "希望学习木工", description: "我会拍照，想认识不同邻居" };
  assert.ok(!localMatch(photoOffer, seed).some((entry) => entry.id === "p3"));
});
test("All ranked candidates and time exclusions are retained with clear empty reasons", () => {
  const post = make().data;
  const candidates = Array.from({ length: 5 }, (_, i) => ({ ...seed[2], id: `wood-${i}`, name: `木工${i}` }));
  const result = matchPost(post, candidates);
  assert.equal(result.matches.length, 5); assert.equal(localMatch(post, candidates).length, 3);
  assert.equal(result.algorithmVersion, MATCH_VERSION); assert.equal(result.summary.emptyReason, null);
  const conflict = matchPost(make({ weekday: "1" }).data, [seed[2]]);
  assert.equal(conflict.summary.emptyReason, "time_conflict"); assert.equal(conflict.summary.timeConflicts[0].name, "陈师傅");
  assert.equal(matchPost(post, []).summary.emptyReason, "no_candidates");
  assert.equal(matchPost(post, [seed[4]]).summary.emptyReason, "no_content_match");
});
test("AI eligibility allows meanings outside local recall, retaining time and clear skill constraints", () => {
  const post = make({ title: "修椅", description: "想修椅子" }, ["test"]).data;
  const novel = { id: "novel", type: "offer", title: "恢复榫接结构", description: "愿意提供帮助", offer: "修复松动接合处" };
  assert.equal(assessCandidate(post, novel).relevant, false);
  assert.equal(eligibleForAI(post, novel), true);
  assert.equal(eligibleForAI(post, seed[4]), false);
  assert.equal(eligibleForAI(make({ weekday: "1" }).data, seed[2]), false);
});
test("Cache identity follows matching input, not profile display metadata", () => {
  const post = make().data;
  assert.equal(matchFingerprint(post), matchFingerprint({ ...post, role: "不同身份", age: "27岁" }));
  assert.notEqual(matchFingerprint(post), matchFingerprint({ ...post, description: "需要工具" }));
  assert.notEqual(matchFingerprint(post), matchFingerprint({ ...post, categories: [...post.categories, "test"] }));
});
test("Actual reported date: October 10 is Saturday; October 11 overlaps Chen's Sunday availability", () => {
  const saturday = make({ timeMode: "date", date: "2026-10-10" }, ["旧物新生", "test"]).data;
  assert.equal(displayTime(saturday), "2026-10-10（周六） 09:00–11:00");
  assert.equal(timeCompatibility(saturday, seed[2]), "conflict");
  const excluded = matchPost(saturday, seed);
  assert.equal(excluded.summary.timeConflicts[0].name, "陈师傅");
  assert.equal(excluded.criteria.time, displayTime(saturday));
  const { schedule, errors } = validateSchedule({ timeMode: "date", date: "2026-10-11", start: "09:00", end: "11:00" }, "need");
  assert.deepEqual(errors, {});
  assert.equal(timeCompatibility({ ...saturday, schedule }, seed[2]), "overlap");
  assert.equal(matchPost({ ...saturday, schedule }, seed).matches[0].id, "p3");
  assert.ok(validateSchedule({ timeMode: "negotiable" }, "need").errors.timeMode);
});
test("Need extraction input contains only bounded offer title/description; default wishes stay empty", () => {
  const post = make({ type: "offer", title: "摄影", description: "我会拍照，希望听邻居讲社区故事" }).data;
  assert.equal(post.need, "");
  assert.deepEqual(needExtractionInput({ ...post, age: "27岁", role: "邻居" }), { type: "offer", title: post.title, description: post.description });
  for (const input of [null, { ...post, type: "need" }, { ...post, title: " " }, { ...post, description: "文".repeat(321) }]) assert.equal(needExtractionInput(input), null);
  assert.equal(needExtractionKey(post), needExtractionKey({ ...post, location: "其他地点", categories: ["test"] }));
  assert.notEqual(needExtractionKey(post), needExtractionKey({ ...post, description: "其他说明" }));
});
test("AI need provenance requires actual quoted evidence, matching input and unchanged confirmed text", () => {
  const post = { type: "offer", title: "摄影", description: "我会拍照，希望听邻居讲社区故事" };
  const result = { need: "听邻居讲社区故事", evidence: "希望听邻居讲社区故事" };
  assert.equal(validExtractedNeed(post, result), true);
  assert.equal(validExtractedNeed(post, { need: "", evidence: "" }), true);
  for (const invalid of [{ ...result, evidence: "不存在的原文" }, { ...result, evidence: "" }, { ...result, need: "文".repeat(161) }, { ...result, need: "" }, { ...result, need: LEGACY_OFFER_NEED }]) assert.equal(validExtractedNeed(post, invalid), false);
  const confirmed = { ...post, need: result.need, needSummary: { ...result, source: "ai", inputKey: needExtractionKey(post) } };
  assert.equal(hasAINeed(confirmed), true);
  assert.equal(hasAINeed({ ...confirmed, need: "自己填写的愿望" }), false);
  assert.equal(hasAINeed({ ...confirmed, description: "新的说明" }), false);
});
