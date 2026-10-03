export const CAPSULE_STORAGE_KEY = "writespace.capsules.v1";
export const CAPSULE_QUESTIONS = ["哪个瞬间让你愿意继续？", "下次想保留什么、换一种什么做法？"];

export function validateCapsuleDraft(draft) {
  const errors = {};
  if (typeof draft?.title !== "string" || !draft.title.trim()) errors.title = "给这份作品起一个标题，方便以后找到它。";
  else if (draft.title.trim().length > 120) errors.title = "标题请写在 120 字以内。";
  if (typeof draft?.work !== "string" || !draft.work.trim()) errors.work = "还没有文字作品。写下这次亲手尝试的过程或发现，再保存。";
  if (typeof draft?.moment !== "string" || !draft.moment.trim()) errors.moment = "写下一句让你愿意继续的瞬间。";
  if (typeof draft?.nextTime !== "string" || !draft.nextTime.trim()) errors.nextTime = "写下一句下次想保留或换一种做法的事。";
  return errors;
}

function isCapsule(value) {
  return value?.version === 1 && typeof value.id === "string" && value.id.length > 0
    && typeof value.savedAt === "string" && Number.isFinite(Date.parse(value.savedAt))
    && typeof value.experienceId === "string" && typeof value.experienceName === "string"
    && Object.keys(validateCapsuleDraft(value)).length === 0;
}

// Keep readable entries available, but never overwrite an unreadable history.
export function readCapsules(storage) {
  try {
    const raw = storage.getItem(CAPSULE_STORAGE_KEY);
    if (raw === null) return { capsules: [], error: null };
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return { capsules: [], error: "invalid_data" };
    const seen = new Set();
    const capsules = values.filter((value) => {
      if (!isCapsule(value) || seen.has(value.id)) return false;
      seen.add(value.id); return true;
    }).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    return { capsules, error: capsules.length === values.length ? null : "invalid_data" };
  } catch { return { capsules: [], error: "read_failed" }; }
}

export function saveCapsule(storage, capsule) {
  if (!isCapsule(capsule)) return { error: "invalid_draft" };
  const history = readCapsules(storage);
  if (history.error) return { error: history.error };
  const existing = history.capsules.find((item) => item.id === capsule.id);
  if (existing) return { capsule: existing, error: null };
  try {
    storage.setItem(CAPSULE_STORAGE_KEY, JSON.stringify([capsule, ...history.capsules]));
    return { capsule, error: null };
  } catch { return { error: "save_failed" }; }
}

export function formatCapsuleDate(savedAt) {
  const date = new Date(savedAt);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function capsuleText(capsule) {
  const lines = ["生活时间胶囊", `作品标题：${capsule.title}`];
  if (capsule.experienceName) lines.push(`体验名称：${capsule.experienceName}`);
  lines.push(`保存日期：${formatCapsuleDate(capsule.savedAt)}`, "", "我的作品", capsule.work,
    "", CAPSULE_QUESTIONS[0], capsule.moment, "", CAPSULE_QUESTIONS[1], capsule.nextTime, "");
  // UTF-8 BOM helps Windows text editors recognize Chinese; CRLF preserves line breaks.
  return "\uFEFF" + lines.join("\n").replace(/\r\n|\r|\n/g, "\r\n");
}

export function capsuleFilename(capsule) {
  const title = capsule.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").slice(0, 80) || "我的作品";
  const date = new Date(capsule.savedAt);
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  return `${title}-时间胶囊-${day}.txt`;
}
