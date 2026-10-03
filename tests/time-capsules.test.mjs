import test from "node:test";
import assert from "node:assert/strict";
import { CAPSULE_STORAGE_KEY, CAPSULE_QUESTIONS, validateCapsuleDraft, readCapsules, saveCapsule, capsuleText, capsuleFilename } from "../public/time-capsules.js";

const capsule = (id = "one", savedAt = "2026-10-03T10:00:00.000Z") => ({
  version: 1, id, savedAt, experienceId: "dumpling-house", experienceName: "王阿姨的手工饺子工坊",
  title: "我第一次亲手包饺子", work: "面皮从中间慢慢擀开。\n\n最后捏紧了边缘。\n", moment: "合上的瞬间。", nextTime: "少放一点馅。"
});
function memoryStorage() {
  const data = new Map([["whitespace.posts.v1", "原发布"]]);
  return { data, getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value) };
}

test("empty work and missing reflections have specific prompts", () => {
  const errors = validateCapsuleDraft({ title: " ", work: "\n \t", moment: "", nextTime: "" });
  assert.deepEqual(Object.keys(errors), ["title", "work", "moment", "nextTime"]);
  assert.match(errors.work, /还没有文字作品/);
});

test("save preserves full work, orders newest first, and uses only its own key", () => {
  const storage = memoryStorage(), first = capsule(), newest = capsule("two", "2026-10-04T10:00:00.000Z");
  assert.equal(saveCapsule(storage, newest).error, null);
  assert.equal(saveCapsule(storage, first).error, null);
  assert.deepEqual(readCapsules(storage).capsules, [newest, first]);
  assert.equal(storage.data.get("whitespace.posts.v1"), "原发布");
  assert.deepEqual([...storage.data.keys()], ["whitespace.posts.v1", CAPSULE_STORAGE_KEY]);
  assert.equal(saveCapsule(storage, first).error, null);
  assert.equal(readCapsules(storage).capsules.length, 2);
});

test("failed writes can be retried without altering history or the draft", () => {
  const storage = memoryStorage(), draft = capsule(), original = structuredClone(draft);
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  assert.equal(saveCapsule(storage, draft).error, "save_failed");
  assert.deepEqual(draft, original);
  assert.equal(storage.data.has(CAPSULE_STORAGE_KEY), false);
  storage.setItem = (key, value) => storage.data.set(key, value);
  assert.equal(saveCapsule(storage, draft).error, null);
  assert.deepEqual(readCapsules(storage).capsules, [original]);
});

test("malformed, incompatible, duplicate and partially broken history are never overwritten", () => {
  const storage = memoryStorage(), valid = capsule();
  for (const raw of ["{broken", "null", "{}", JSON.stringify([valid, null]), JSON.stringify([valid, valid]), JSON.stringify([{ ...valid, moment: 5 }])]) {
    storage.data.set(CAPSULE_STORAGE_KEY, raw);
    assert.ok(readCapsules(storage).error);
    assert.ok(saveCapsule(storage, capsule("new")).error);
    assert.equal(storage.data.get(CAPSULE_STORAGE_KEY), raw);
  }
  storage.data.set(CAPSULE_STORAGE_KEY, JSON.stringify([valid, null]));
  assert.deepEqual(readCapsules(storage).capsules, [valid]);
  storage.getItem = () => { throw new Error("Storage disabled"); };
  assert.equal(readCapsules(storage).error, "read_failed");
});

test("txt export opens as UTF-8 with BOM, Chinese, complete answers and CRLF", () => {
  const draft = capsule(), text = capsuleText(draft), bytes = Buffer.from(text, "utf8");
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(bytes.toString("utf8"), text);
  for (const line of [draft.title, draft.experienceName, ...CAPSULE_QUESTIONS, draft.moment, draft.nextTime]) assert.ok(text.includes(line));
  assert.ok(text.includes(draft.work.replace(/\n/g, "\r\n")));
  assert.ok(!/(?<!\r)\n/.test(text));
  assert.match(capsuleFilename({ ...draft, title: '作品<>:"/\\|?*' }), /^作品_+-时间胶囊-2026-10-03\.txt$/);
});
