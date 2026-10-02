import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateDraft, normalizedPost, uniqueCategories, postTags, formatPublished, localMatch, timeCompatibility } from "../public/model.js";

const seed = JSON.parse(await readFile(new URL("../public/data.json", import.meta.url), "utf8"));
const values = { type: "need", title: "修椅", description: "帮修", timeMode: "weekly", weekday: "0", start: "09:00", end: "11:00", location: "社区共享工坊", participantMode: "negotiable" };
const make = (overrides = {}, categories = ["旧物新生"]) => validateDraft({ ...values, ...overrides }, categories);

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
