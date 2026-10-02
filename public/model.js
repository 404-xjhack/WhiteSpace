// Browser and server share validation, display and fallback matching rules.
export const CATEGORIES = ["社区生活", "生活手艺", "亲子共学", "旧物新生", "学习交流", "数码互助"];
export const LOCATIONS = ["春和社区活动室", "社区共享工坊", "社区图书角", "春和社区周边"];
export const LIMITS = { title: 48, description: 320, category: 30, categories: 6, time: 40, location: 40 };
export const LEGACY_OFFER_NEED = "寻找适合的分享对象，具体交流方式见说明";
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function cleanCategory(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function uniqueCategories(values) {
  const seen = new Set();
  return values.map(cleanCategory).filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function postCategories(post) {
  return uniqueCategories(Array.isArray(post.categories) ? post.categories : [post.category]).filter(Boolean);
}

export function postTags(post) {
  return uniqueCategories([...postCategories(post), ...(Array.isArray(post.tags) ? post.tags : [])]);
}

export function needExtractionInput(raw) {
  if (!raw || raw.type !== "offer" || typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > LIMITS.title
    || typeof raw.description !== "string" || !raw.description.trim() || raw.description.length > LIMITS.description) return null;
  return { type: "offer", title: raw.title.trim(), description: raw.description.trim() };
}
export function needExtractionKey(post) {
  const input = needExtractionInput(post);
  return input ? JSON.stringify({ version: "need-v1", ...input }) : "";
}
export function validExtractedNeed(input, result) {
  if (!result || typeof result.need !== "string" || typeof result.evidence !== "string" || result.need.length > 160 || result.evidence.length > 160) return false;
  const need = result.need.trim(); const evidence = result.evidence.trim();
  if (need === LEGACY_OFFER_NEED) return false;
  return need ? Boolean(evidence) && [input.title, input.description].some((text) => text.includes(evidence)) : evidence === "";
}
export function hasAINeed(post) {
  const summary = post.needSummary;
  return summary?.source === "ai" && summary.inputKey === needExtractionKey(post) && summary.need === post.need
    && validExtractedNeed(post, summary);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const validClock = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function normalizeSchedule(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.mode === "negotiable") return { mode: "negotiable" };
  if (!validClock(raw.start) || !validClock(raw.end) || raw.end <= raw.start) return null;
  if (raw.mode === "date" && validDate(raw.date)) return { mode: "date", date: raw.date, start: raw.start, end: raw.end };
  if (raw.mode === "weekly" && Array.isArray(raw.days) && raw.days.length && raw.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) {
    return { mode: "weekly", days: [...new Set(raw.days)].sort(), start: raw.start, end: raw.end };
  }
  return null;
}

export function formatSchedule(schedule) {
  if (schedule.mode === "negotiable") return "时间可协商";
  const day = schedule.mode === "date" ? schedule.date : `每${schedule.days.map((value) => weekdays[value]).join("、")}`;
  return `${day} ${schedule.start}–${schedule.end}`;
}

export function displayTime(post) {
  const schedule = normalizeSchedule(post.schedule);
  if (!schedule) return post.time || "时间待确认";
  if (schedule.mode !== "date") return formatSchedule(schedule);
  const weekday = weekdays[new Date(`${schedule.date}T00:00:00Z`).getUTCDay()];
  return `${schedule.date}（${weekday}） ${schedule.start}–${schedule.end}`;
}

export function validateSchedule(values, type) {
  const errors = {};
  let schedule = null;
  if (values.timeMode === "negotiable" && type === "offer") schedule = { mode: "negotiable" };
  else if (["date", "weekly"].includes(values.timeMode)) {
    const raw = { mode: values.timeMode, date: values.date || "", days: [Number(values.weekday)], start: values.start || "", end: values.end || "" };
    if (raw.mode === "date" && !validDate(raw.date)) errors.date = "请选择有效的活动日期。";
    if (raw.mode === "weekly" && (values.weekday === "" || !/^[0-6]$/.test(String(values.weekday)))) errors.weekday = "请选择每周的活动日。";
    if (!validClock(raw.start)) errors.start = "请选择开始时间。";
    if (!validClock(raw.end)) errors.end = "请选择结束时间。";
    else if (validClock(raw.start) && raw.end <= raw.start) errors.end = "结束时间必须晚于开始时间。";
    schedule = normalizeSchedule(raw);
  } else errors.timeMode = type === "offer" ? "请选择交流时间或时间可协商。" : "请选择活动时间安排。";
  return { schedule, errors };
}

export function validateDraft(values, selectedCategories) {
  const errors = {};
  const type = values.type === "offer" ? "offer" : "need";
  const title = String(values.title || "").trim();
  const description = String(values.description || "").trim();
  const titleLabel = type === "offer" ? "技能或体验名称" : "标题";
  const descriptionLabel = type === "offer" ? "分享说明" : "具体说明";
  if (!title) errors.title = `请填写${titleLabel}。`;
  else if (String(values.title).length > LIMITS.title) errors.title = `${titleLabel}最多 ${LIMITS.title} 字。`;
  if (!description) errors.description = `请填写${descriptionLabel}。`;
  else if (String(values.description).length > LIMITS.description) errors.description = `${descriptionLabel}最多 ${LIMITS.description} 字。`;
  const categories = uniqueCategories(selectedCategories);
  if (!categories.length) errors.category = "请至少添加一个分类。";
  else if (categories.length > LIMITS.categories || categories.some((value) => value.length > LIMITS.category)) errors.category = "最多添加 6 个分类，每项最多 30 字。";

  const { schedule, errors: scheduleErrors } = validateSchedule(values, type);
  Object.assign(errors, scheduleErrors);

  let location = String(values.location || "").trim();
  if (location === "other") {
    location = String(values.locationOther || "").trim();
    if (!location) errors.locationOther = "请填写其他地点。";
    else if (String(values.locationOther).length > LIMITS.location) errors.locationOther = "地点最多 40 字。";
  } else if (location === "negotiable" && type === "offer") location = "地点可协商";
  else if (!LOCATIONS.includes(location)) errors.location = "请选择地点。";

  let participants = "协商决定";
  let participantSettings = { mode: "negotiable" };
  const isCount = (value) => /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 50;
  if (values.participantMode === "exact") {
    if (!isCount(values.participantCount)) errors.participantCount = "参与人数须为 1–50 的整数（含发布者）。";
    else { participants = `${Number(values.participantCount)}人`; participantSettings = { mode: "exact", count: Number(values.participantCount) }; }
  } else if (values.participantMode === "range") {
    if (!isCount(values.participantMin)) errors.participantMin = "最少人数须为 1–50 的整数。";
    if (!isCount(values.participantMax)) errors.participantMax = "最多人数须为 1–50 的整数。";
    else if (isCount(values.participantMin) && Number(values.participantMax) < Number(values.participantMin)) errors.participantMax = "最多人数不能少于最少人数。";
    if (!errors.participantMin && !errors.participantMax) {
      participants = `${Number(values.participantMin)}–${Number(values.participantMax)}人`;
      participantSettings = { mode: "range", min: Number(values.participantMin), max: Number(values.participantMax) };
    }
  } else if (values.participantMode !== "negotiable") errors.participantMode = "请选择参与人数设置。";

  const role = String(values.role || "").trim();
  const age = String(values.age || "").trim();
  if (role.length > 40) errors.role = "身份或兴趣说明最多 40 字。";
  if (age && (!/^\d+$/.test(age) || Number(age) < 1 || Number(age) > 120)) errors.age = "年龄须为 1–120 的整数，可留空。";
  const profile = { role: role || "社区成员", age: age ? Number(age) : null, agePublic: values.agePublic === "on" };
  return {
    errors, profile,
    data: { type, title, description, categories, category: categories[0], tags: categories, schedule, time: schedule ? formatSchedule(schedule) : "", location, participants, participantSettings,
      role: profile.role, age: profile.agePublic && profile.age ? `${profile.age}岁` : "",
      offer: type === "offer" ? title : "一起参与、提供自己的时间和经验", need: type === "offer" ? "" : title }
  };
}

export function normalizedPost(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  for (const [key, limit] of Object.entries({ title: 48, description: 320, time: 40, location: 40 })) {
    if (typeof raw[key] !== "string" || !raw[key].trim() || raw[key].length > limit) return null;
  }
  if (raw.categories !== undefined && !Array.isArray(raw.categories)) return null;
  const categoryValues = raw.categories ?? [raw.category];
  if (categoryValues.length > 6 || categoryValues.some((value) => typeof value !== "string" || !cleanCategory(value) || cleanCategory(value).length > 30)) return null;
  const categories = uniqueCategories(categoryValues);
  if (!categories.length || (raw.type !== "need" && raw.type !== "offer")) return null;
  const schedule = raw.schedule === undefined ? undefined : normalizeSchedule(raw.schedule);
  if (raw.schedule !== undefined && !schedule) return null;
  if (schedule?.mode === "negotiable" && raw.type !== "offer") return null;
  const text = (key, limit) => typeof raw[key] === "string" ? raw[key].trim().slice(0, limit) : "";
  return { id: text("id", 80), type: raw.type, title: raw.title.trim(), description: raw.description.trim(), categories, category: categories[0],
    tags: uniqueCategories([...categories, ...(Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === "string").slice(0, 6).map((tag) => tag.slice(0, 30)) : [])]),
    time: schedule ? formatSchedule(schedule) : raw.time.trim(), schedule, location: raw.location.trim(), offer: text("offer", 160), need: text("need", 160) };
}

export function formatPublished(post, now = Date.now()) {
  const timestamp = typeof post.createdAt === "number" ? post.createdAt : Date.parse(post.createdAt);
  if (!Number.isFinite(timestamp)) return typeof post.published === "string" && post.published !== "刚刚" ? post.published : "发布时间未知";
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 60000) return "刚刚";
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}分钟前`;
  const date = new Date(timestamp);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return `${Math.floor(elapsed / 3600000)}小时前`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function timeCompatibility(a, b) {
  const left = normalizeSchedule(a.schedule);
  const right = normalizeSchedule(b.schedule);
  if (!left || !right || left.mode === "negotiable" || right.mode === "negotiable") return "unknown";
  if (left.mode === "date" && right.mode === "date" && left.date !== right.date) return "conflict";
  const days = (schedule) => schedule.mode === "date" ? [new Date(`${schedule.date}T00:00:00Z`).getUTCDay()] : schedule.days;
  if (!days(left).some((day) => days(right).includes(day)) || left.end <= right.start || right.end <= left.start) return "conflict";
  return "overlap";
}

export const MATCH_VERSION = "content-v2";
const normalizeText = (value) => String(value ?? "").normalize("NFKC").toLowerCase().trim();
const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const stopTerms = new Set(["一起", "可以", "希望", "愿意", "自己", "有人", "邻居", "社区", "需要", "提供", "分享", "参与", "帮忙", "帮助", "想要", "想找", "找到", "学习", "基础", "简单", "经验", "具体", "一点", "一次", "一些", "如何", "怎样", "真正", "能够", "维修", "修理", "修好", "指导", "认识", "了解", "交流", "活动", "时候", "事情", "内容", "适合", "时候"]);
// Aliases supplement literal word matches; labels never generate core evidence.
const concepts = [
  { id: "wood", label: "木工与家具", aliases: ["木工", "木纹", "木椅", "椅子", "修椅", "家具", "打磨", "木制", "凳子", "榫卯"] },
  { id: "food", label: "包饺子与做饭", aliases: ["饺子", "包饺", "和面", "擀皮", "做饭", "烹饪", "下厨", "包子"] },
  { id: "photo", label: "摄影与修图", aliases: ["摄影", "拍照", "照相", "修图", "照片"] },
  { id: "writing", label: "写作与表达", aliases: ["写作", "家书", "写信", "文章", "自我介绍", "语文", "表达", "写下来"] },
  { id: "tools", label: "工具", aliases: ["工具"] },
  { id: "craft", label: "手工劳动", aliases: ["手工", "手作", "动手", "劳动"] },
  { id: "walk", label: "散步与街区导览", aliases: ["散步", "街区", "带路", "街坊", "逛街", "社区周边"] }
];
const specificDomains = new Set(["wood", "food", "photo", "writing", "tools", "walk", "electronics"]);

function contentText(post) {
  // The opposite field expresses what this person hopes to receive, not an ability.
  const intent = post.type === "offer" ? post.offer : post.need;
  return normalizeText([post.title, post.description, intent].filter((value) => typeof value === "string").join(" "));
}
function words(text) {
  return [...new Set([...segmenter.segment(text)].filter((part) => part.isWordLike).map((part) => part.segment).filter((word) => word.length >= 2 && !stopTerms.has(word)))];
}
function contentConcepts(text) {
  const found = concepts.filter((concept) => concept.aliases.some((alias) => text.includes(alias))).map((concept) => concept.id);
  if (/手机|电脑|电子设备/.test(text) && /维修|修理|故障|坏了|开不了机|修手机|修电脑/.test(text)) found.push("electronics");
  return found;
}
function focusedConcepts(post, text) {
  const intent = post.type === "offer" ? post.offer : post.need;
  const primary = contentConcepts(normalizeText(`${post.title || ""} ${typeof intent === "string" ? intent : ""}`));
  return primary.length ? primary : contentConcepts(text);
}
function domainsConflict(left, right) {
  const a = left.filter((id) => specificDomains.has(id));
  const b = right.filter((id) => specificDomains.has(id));
  return a.length > 0 && b.length > 0 && !a.some((id) => b.includes(id));
}

export function matchFingerprint(post) {
  return JSON.stringify({ type: post.type, title: post.title, description: post.description, offer: post.offer || "", need: post.need || "",
    categories: postCategories(post), tags: postTags(post), time: post.time, schedule: normalizeSchedule(post.schedule), location: post.location });
}

export function assessCandidate(post, candidate) {
  const query = contentText(post);
  const content = contentText(candidate);
  const queryConcepts = focusedConcepts(post, query);
  const candidateConcepts = focusedConcepts(candidate, content);
  const conflictingSkills = domainsConflict(queryConcepts, candidateConcepts);
  const sharedConcepts = queryConcepts.filter((id) => candidateConcepts.includes(id));
  if (queryConcepts.includes("craft") && candidateConcepts.some((id) => id === "food" || id === "wood") && !sharedConcepts.includes("craft")) sharedConcepts.push("craft");
  const candidateWords = new Set(words(content));
  const terms = words(query).filter((word) => candidateWords.has(word));
  const labels = postTags(post).filter((tag) => postTags(candidate).some((other) => normalizeText(other) === normalizeText(tag)));
  const availability = timeCompatibility(post, candidate);
  const relevant = !conflictingSkills && (terms.length > 0 || sharedConcepts.length > 0);
  return { relevant, conflictingSkills, terms, concepts: sharedConcepts, labels, availability, complementary: post.type !== candidate.type,
    samePlace: normalizeText(post.location) === normalizeText(candidate.location) && Boolean(post.location) && post.location !== "地点可协商" };
}

export function eligibleForAI(post, candidate) {
  const evidence = assessCandidate(post, candidate);
  // AI may interpret content outside the local lexicon, while clear conflicts stay excluded.
  return candidate.id !== post.id && evidence.availability !== "conflict" && !evidence.conflictingSkills;
}

function rankScore(evidence) {
  const specific = evidence.concepts.some((id) => specificDomains.has(id));
  const content = specific ? 62 : evidence.concepts.length ? 54 : 50;
  return Math.min(96, content + Math.min(evidence.terms.length * 3, 8) + (evidence.complementary ? 12 : 3)
    + (evidence.availability === "overlap" ? 6 : 0) + (evidence.samePlace ? 4 : 0) + Math.min(evidence.labels.length * 2, 4));
}

function explainMatch(post, candidate, evidence) {
  const conceptLabels = evidence.concepts.map((id) => concepts.find((concept) => concept.id === id)?.label || "电子设备维修");
  const shared = [...new Set([...conceptLabels, ...evidence.terms])].slice(0, 2).join("、");
  const fit = `你的“${post.title}”与对方的“${candidate.title}”在“${shared}”方面相关。`;
  const benefit = evidence.complementary
    ? post.type === "need" ? `对方可提供${candidate.offer || candidate.title}；希望获得${candidate.need || "共同参与"}。`
      : `对方正在寻找${candidate.need || candidate.title}，可以确认你的分享是否适合。`
    : "双方发布类型相同，可讨论共同参与；尚不能确认供需互补。";
  const timing = evidence.availability === "overlap" ? "填写的时间段有交集。" : "时间尚需双方确认。";
  const place = evidence.samePlace ? "地点相同。" : "地点尚需双方协商。";
  const children = /孩子|亲子|小朋友/.test(`${post.title} ${post.description} ${candidate.description}`);
  return { reason: `${fit}${benefit}${timing}${place}`,
    first_step: `${children ? "由家长或社区工作人员在场，" : ""}先沟通“${post.title}”如何与“${candidate.title}”配合，确认时间、地点和分工，再约一次短交流。` };
}

export function matchPost(post, candidates) {
  const matches = [];
  const timeConflicts = [];
  let considered = 0;
  for (const candidate of candidates) {
    if (candidate.id === post.id) continue;
    considered++;
    const evidence = assessCandidate(post, candidate);
    if (!evidence.relevant) continue;
    if (evidence.availability === "conflict") {
      timeConflicts.push({ id: candidate.id, name: candidate.name, time: displayTime(candidate) });
      continue;
    }
    matches.push({ id: candidate.id, score: rankScore(evidence), ...explainMatch(post, candidate, evidence), evidence, candidate });
  }
  matches.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { algorithmVersion: MATCH_VERSION, matches,
    criteria: { time: displayTime(post), location: post.location },
    summary: { considered, timeConflicts, emptyReason: matches.length ? null : timeConflicts.length ? "time_conflict" : considered ? "no_content_match" : "no_candidates" } };
}

// Retain the existing helper interface for callers that request a limited list.
export function localMatch(post, candidates, limit = 3) { return matchPost(post, candidates).matches.slice(0, limit); }
