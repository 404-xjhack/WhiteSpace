import { CATEGORIES, normalizedPost, assessCandidate, contentEvidenceLabels, displayTime } from "./model.js";

export const EXPERIENCE_VERSION = "today-posts-v3";
// Participants is the visitor's party, including the visitor, not the whole event.
export const TIME_PREFERENCES = [{ id: "short", label: "短", hint: "轻松试一试" }, { id: "medium", label: "中", hint: "从容体验" }, { id: "long", label: "长", hint: "深入投入" }];
export const DEFAULT_CRITERIA = { timePreference: "medium", participants: 1, theme: "all", materials: [], indoorsOnly: false, noPurchase: false, lightOnly: false, notes: "" };
export const MATERIALS = [
  { id: "writing", label: "纸笔" }, { id: "paper", label: "纸张" }, { id: "phone", label: "手机" },
  { id: "old-object", label: "可观察的旧物" }, { id: "dumpling-kit", label: "饺子皮、熟馅与用具" },
  { id: "wood-kit", label: "木椅、砂纸与防护用具" }
];

export function normalizeCriteria(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!TIME_PREFERENCES.some((item) => item.id === raw.timePreference) || !Number.isInteger(raw.participants) || raw.participants < 1 || raw.participants > 50
    || !["all", ...CATEGORIES].includes(raw.theme) || !Array.isArray(raw.materials)
    || raw.materials.some((id) => !MATERIALS.some((material) => material.id === id))
    || ["indoorsOnly", "noPurchase", "lightOnly"].some((key) => typeof raw[key] !== "boolean")
    || typeof raw.notes !== "string" || raw.notes.length > 160) return null;
  return { timePreference: raw.timePreference, participants: raw.participants, theme: raw.theme, materials: [...new Set(raw.materials)].sort(),
    indoorsOnly: raw.indoorsOnly, noPurchase: raw.noPurchase, lightOnly: raw.lightOnly, notes: raw.notes.trim() };
}
export function criteriaKey(criteria) {
  const normalized = normalizeCriteria(criteria);
  return normalized ? JSON.stringify({ version: EXPERIENCE_VERSION, ...normalized }) : "";
}

function capacity(raw) {
  if (raw.participantSettings?.mode === "exact" && Number.isInteger(raw.participantSettings.count) && raw.participantSettings.count >= 1 && raw.participantSettings.count <= 50) return raw.participantSettings.count;
  if (raw.participantSettings?.mode === "range" && Number.isInteger(raw.participantSettings.max) && raw.participantSettings.max >= 1 && raw.participantSettings.max <= 50) return raw.participantSettings.max;
  const range = String(raw.participants || "").match(/^(\d+)(?:[–—-](\d+))?人$/);
  const family = String(raw.participants || "").match(/^(\d+)大(\d+)小$/);
  const count = range ? Number(range[2] || range[1]) : family ? Number(family[1]) + Number(family[2]) : null;
  return count >= 1 && count <= 50 ? count : null;
}
export function otherPosts(rawPosts) {
  if (!Array.isArray(rawPosts)) return [];
  const used = new Set();
  return rawPosts.flatMap((raw) => {
    const base = normalizedPost(raw);
    if (!base?.id || base.id.startsWith("mine-") || used.has(base.id)) return [];
    used.add(base.id);
    const text = (key, limit) => typeof raw[key] === "string" ? raw[key].trim().slice(0, limit) : "";
    const requiredMaterials = Array.isArray(raw.requiredMaterials) && raw.requiredMaterials.every((alternatives) => Array.isArray(alternatives) && alternatives.length
      && alternatives.every((id) => MATERIALS.some((material) => material.id === id))) ? raw.requiredMaterials
      : /带自己的手机|自备手机|需带手机/.test(base.description) ? [["phone"]] : null;
    const mode = ["online", "in-person", "unknown"].includes(raw.participationMode) ? raw.participationMode
      : /^(线上|远程|电话|视频)/.test(base.location) ? "online" : /可协商|待确认|待定/.test(base.location) ? "unknown" : "in-person";
    return [{ ...base, name: text("name", 48) || "社区成员", avatar: text("avatar", 4), color: text("color", 20), role: text("role", 40), age: text("age", 12),
      participants: text("participants", 40) || "人数待确认", capacity: Number.isInteger(raw.capacity) && raw.capacity >= 1 && raw.capacity <= 50 ? raw.capacity : capacity(raw),
      durationPreference: TIME_PREFERENCES.some((item) => item.id === raw.durationPreference) ? raw.durationPreference : null,
      durationMinutes: Number.isInteger(raw.durationMinutes) && raw.durationMinutes > 0 && raw.durationMinutes <= 1440 ? raw.durationMinutes : null,
      requiredMaterials, participationMode: mode, lightActivity: typeof raw.lightActivity === "boolean" ? raw.lightActivity : null }];
  });
}
export function postsKey(posts) { return JSON.stringify(otherPosts(posts).sort((a, b) => a.id.localeCompare(b.id))); }
export function filterExperiences(criteria, posts) {
  return otherPosts(posts).filter((post) => (criteria.theme === "all" || post.categories.includes(criteria.theme))
    // Time is a preference for ranking, never a fixed-minute eligibility limit.
    && (post.capacity === null || criteria.participants + 1 <= post.capacity)
    && (!criteria.indoorsOnly || post.participationMode !== "in-person")
    && (!criteria.lightOnly || post.lightActivity !== false)
    && (!criteria.noPurchase || post.requiredMaterials === null || post.requiredMaterials.every((alternatives) => alternatives.some((id) => criteria.materials.includes(id))))
    && respectsInterests(criteria, post));
}
function materialSummary(post) {
  return post.requiredMaterials === null ? "发布未说明完整材料要求，需向发布者确认。" : post.requiredMaterials.length
    ? post.requiredMaterials.map((alternatives) => alternatives.map((id) => MATERIALS.find((material) => material.id === id).label).join("或")).join("、") : "发布注明无需自备材料。";
}
function noteEvidence(text, post) {
  return assessCandidate({ type: "need", title: text, description: text, need: text, categories: [],
    time: "时间待确认", location: "地点待确认" }, post);
}
function splitInterests(notes) {
  const clauses = notes.replace(/(不想|不喜欢|不愿|不考虑|没兴趣|不感兴趣|避免|拒绝|只想|更想)/g, "，$1")
    .split(/[，,。；;！？!\n]|但是|但|而是/).map((part) => part.trim()).filter(Boolean);
  const refused = (part) => /不想|不喜欢|不愿|不考虑|没兴趣|不感兴趣|避免|拒绝/.test(part);
  return { positive: clauses.filter((part) => !refused(part)).join("，"), negative: clauses.filter(refused).join("，") };
}
function respectsInterests(criteria, post) {
  const interests = splitInterests(criteria.notes);
  return !interests.negative || !noteEvidence(interests.negative, post).relevant || noteEvidence(interests.positive, post).relevant;
}
function timeFit(criteria, post, pool) {
  const label = TIME_PREFERENCES.find((item) => item.id === criteria.timePreference).label;
  if (post.durationPreference) {
    return { score: post.durationPreference === criteria.timePreference ? 16 : 0,
      text: "发布标注了“" + TIME_PREFERENCES.find((item) => item.id === post.durationPreference).label + "”的参与倾向，可核对是否符合你的节奏。" };
  }
  // Explicit durations are compared within this candidate pool, without preset minute cutoffs.
  const durations = [...new Set(pool.map((item) => item.durationMinutes).filter((value) => value !== null))].sort((a, b) => a - b);
  if (post.durationMinutes !== null && durations.length > 1) {
    const position = durations.indexOf(post.durationMinutes) / (durations.length - 1);
    const fit = criteria.timePreference === "short" ? 1 - position : criteria.timePreference === "long" ? position : 1 - Math.abs(position - 0.5) * 2;
    return { score: Math.round(fit * 14), text: "发布注明单次约 " + post.durationMinutes + " 分钟，可按自己的安排选择。" };
  }
  // These phrases indicate possible entry or involvement; they do not establish duration.
  const content = post.title + " " + post.description;
  const easy = ["从一句自己的话开始", "简单修图", "带自己的手机就行", "零基础也欢迎", "先观察", "短时参与"].filter((phrase) => content.includes(phrase));
  const deep = ["维修", "修复", "打磨", "和面", "擀皮", "做出一件", "散步地图"].filter((phrase) => content.includes(phrase));
  const balance = Math.max(-4, Math.min(4, easy.length * 2 - deep.length));
  const score = criteria.timePreference === "short" ? balance * 3 : criteria.timePreference === "long" ? -balance * 3 : 8 - Math.abs(balance) * 2;
  const phrase = criteria.timePreference === "short" ? easy[0] : criteria.timePreference === "long" ? deep[0] : ["交流", "散步", "故事"].find((word) => content.includes(word));
  return { score, text: phrase ? "发布提到“" + phrase + "”，可讨论与你的“" + label + "”时间倾向相符的参与方式。" : "" };
}
function evaluateParticipation(criteria, post, pool) {
  const interests = splitInterests(criteria.notes);
  const positive = noteEvidence(interests.positive, post);
  const negative = noteEvidence(interests.negative, post);
  const time = timeFit(criteria, post, pool);
  const materialsReady = post.requiredMaterials !== null && post.requiredMaterials.every((alternatives) => alternatives.some((id) => criteria.materials.includes(id)));
  const novice = /零基础|新手|初学|没经验|不会|不懂/.test(criteria.notes);
  let score = (positive.relevant ? Math.min(66, positive.concepts.length * 18 + positive.terms.length * 3) : 0)
    - (negative.relevant ? 80 : 0) + time.score + (post.type === "offer" ? 12 : 4)
    + (materialsReady ? 8 : post.requiredMaterials !== null ? -6 : 0)
    + (criteria.lightOnly && post.lightActivity === true ? 4 : 0)
    + (criteria.indoorsOnly && post.participationMode === "online" ? 4 : 0);
  if (novice && post.type === "offer" && /零基础|从一句|基础|陪你|指导/.test(post.description + " " + post.offer)) score += 8;
  if (novice && post.type === "need" && /找.{0,12}(带|教|熟悉)|会.{0,8}(木工|做饭)/.test(post.description)) score -= 12;
  const parts = [];
  if (positive.relevant) parts.push("你的兴趣与发布中的“" + contentEvidenceLabels(positive).slice(0, 2).join("、") + "”相关。");
  else if (criteria.theme !== "all") parts.push("主题符合你选择的“" + criteria.theme + "”。");
  if (negative.relevant) parts.push("内容与你不想参与的事项有交集，请先核对。");
  parts.push(post.type === "offer" ? "对方愿意分享" + (post.offer || post.title) + "。" : "对方在寻找同行或帮助，需确认你愿意承担的参与角色。");
  if (time.text) parts.push(time.text);
  if (materialsReady) parts.push("已有材料符合发布已说明的要求。");
  return { post, score, reason: parts.join("").slice(0, 138) + "具体时间、材料与余位需确认。" };
}
export function rankExperiences(criteria, posts) {
  const pool = filterExperiences(criteria, posts);
  const remaining = pool.map((post) => evaluateParticipation(criteria, post, pool));
  const ranked = []; const topics = new Map();
  while (remaining.length) {
    // A small diversity bonus breaks close scores without overriding clear content relevance.
    remaining.sort((a, b) => (b.score - (topics.get(b.post.category) || 0) * 4) - (a.score - (topics.get(a.post.category) || 0) * 4)
      || a.post.id.localeCompare(b.post.id));
    const item = remaining.shift(); ranked.push(item);
    topics.set(item.post.category, (topics.get(item.post.category) || 0) + 1);
  }
  return ranked;
}
export function recommendationItem(post, criteria, adjustment = null) {
  const timeLabel = TIME_PREFERENCES.find((item) => item.id === criteria.timePreference).label;
  const preparations = ["你选择了“" + timeLabel + "”的时间倾向；具体日期和参与时长由你自行选择，并与发布者确认。",
    post.durationMinutes === null ? "发布未说明单次参与时长，需向发布者确认。" : "发布注明单次参与约 " + post.durationMinutes + " 分钟。",
    "同行 " + criteria.participants + " 人（含你），发布人数为“" + post.participants + "”；实际余位与人员组成仍需确认。",
    materialSummary(post), "先查看原发布安排：" + displayTime(post) + "；" + post.location + "。"];
  if (criteria.indoorsOnly && post.participationMode === "unknown") preparations.push("你希望不外出，需确认对方是否支持线上参与。");
  if (criteria.noPurchase && post.requiredMaterials === null) preparations.push("你希望不添购材料，需确认已有材料或发布者提供的材料是否够用。");
  if (criteria.lightOnly && post.lightActivity === null) preparations.push("你希望轻量参与，发布未说明体力要求，请先确认。");
  if (criteria.notes) preparations.push("你的补充：" + criteria.notes + "；参与前需确认这些条件。");
  if (/孩子|亲子|小朋友/.test(post.title + " " + post.description + " " + criteria.notes)) preparations.push("涉及孩子时，须由家长或社区工作人员全程在场。");
  const firstStep = "查看“" + post.title + "”的原发布，自行挑选合适的参与时间，并确认同行 " + criteria.participants + " 人、材料与余位。";
  const steps = [firstStep, ...(adjustment?.steps || ["阅读对方的说明，核对你能带来的材料、经验与希望获得的体验。", "确认条件后表达参与意向；原型只保存意向，不会发送真实预约。"])];
  return { id: post.id, post, reason: adjustment?.reason || evaluateParticipation(criteria, post, [post]).reason, preparations, firstStep, steps, status: "coordinate" };
}
export function localRecommendations(criteria, posts, fallbackReason = "unconfigured") {
  const ranked = rankExperiences(criteria, posts);
  return { version: EXPERIENCE_VERSION, inputKey: criteriaKey(criteria), poolKey: postsKey(posts), criteria, source: "local", fallbackReason,
    generatedAt: new Date().toISOString(), recommendations: ranked.slice(0, 3).map(({ post, reason }) => recommendationItem(post, criteria, { reason })),
    emptyReason: ranked.length ? null : "当前他人发布中没有符合已知条件的想法。可以调整主题、同行人数、补充内容或限制，再试一次。" };
}
function validParticipationAdvice(item, post, criteria) {
  const advice = [item.reason, ...item.steps].join(" ");
  const published = [post.title, post.description, post.offer, post.need].join(" ");
  const durations = advice.match(/(?:\d+(?:\.\d+)?|[一二两三四五六七八九十半]+)\s*(?:[–—~～-]\s*\d+)?\s*(?:分钟|小时|钟头)/g) || [];
  if (post.durationMinutes === null && durations.some((duration) => !published.includes(duration))) return false;
  if (/完全符合|全部符合|无需确认|随时参加|立即参加|保证能/.test(advice)) return false;
  if (/时间灵活/.test(advice) && post.schedule?.mode !== "negotiable" && !published.includes("时间灵活")) return false;
  if (/室内外(?:均|都)可/.test(advice) && !/室内外(?:均|都)可/.test(published)) return false;
  if (/长期|后续每周|每周到场/.test(advice) && !/长期|后续每周|每周到场/.test(published + " " + criteria.notes)) return false;
  return true;
}
export function validateAIRecommendations(raw, criteria, posts) {
  if (!raw || !Array.isArray(raw.recommendations) || !raw.recommendations.length || raw.recommendations.length > 3) return null;
  const eligible = filterExperiences(criteria, posts); const used = new Set();
  for (const item of raw.recommendations) {
    if (!item || !eligible.some((post) => post.id === item.id) || used.has(item.id) || typeof item.reason !== "string" || !item.reason.trim() || item.reason.length > 160
      || !Array.isArray(item.steps) || item.steps.length < 2 || item.steps.length > 4
      || item.steps.some((step) => typeof step !== "string" || !step.trim() || step.length > 120)) return null;
    if (!validParticipationAdvice(item, eligible.find((post) => post.id === item.id), criteria)) return null;
    used.add(item.id);
  }
  return raw.recommendations.map((item) => recommendationItem(eligible.find((post) => post.id === item.id), criteria,
    { reason: item.reason.trim(), steps: item.steps.map((step) => step.trim()) }));
}
export function validRecommendationData(data, criteria, posts = null) {
  if (!data || data.version !== EXPERIENCE_VERSION || data.inputKey !== criteriaKey(criteria) || typeof data.poolKey !== "string"
    || !["ai", "local"].includes(data.source) || typeof data.generatedAt !== "string" || !Number.isFinite(Date.parse(data.generatedAt))
    || (data.source === "local" && typeof data.fallbackReason !== "string") || !Array.isArray(data.recommendations) || data.recommendations.length > 3) return false;
  if (posts !== null && data.poolKey !== postsKey(posts)) return false;
  const used = new Set();
  if (!data.recommendations.length && ((posts !== null && filterExperiences(criteria, posts).length) || typeof data.emptyReason !== "string" || !data.emptyReason.trim())) return false;
  return data.recommendations.every((item) => {
    const post = filterExperiences(criteria, posts === null ? [item?.post] : posts).find((candidate) => candidate.id === item?.id);
    if (!post || used.has(item.id) || JSON.stringify(item.post) !== JSON.stringify(post)) return false;
    used.add(item.id); const canonical = recommendationItem(post, criteria);
    return item.status === "coordinate" && item.firstStep === canonical.firstStep && JSON.stringify(item.preparations) === JSON.stringify(canonical.preparations)
      && typeof item.reason === "string" && Boolean(item.reason.trim()) && item.reason.length <= 160
      && Array.isArray(item.steps) && item.steps.length >= 3 && item.steps.length <= 5
      && item.steps.every((step) => typeof step === "string" && Boolean(step.trim()) && step.length <= 120) && item.steps[0] === canonical.firstStep
      && (data.source !== "ai" || validParticipationAdvice(item, post, criteria));
  });
}
export function restoreTodayState(raw, posts = null) {
  const saved = raw?.criteria;
  const migrated = saved && !saved.timePreference && [15, 30, 60].includes(saved.minutes)
    ? { ...saved, timePreference: { 15: "short", 30: "medium", 60: "long" }[saved.minutes] } : saved;
  const criteria = normalizeCriteria(migrated) || { ...DEFAULT_CRITERIA, materials: [] };
  const result = validRecommendationData(raw?.result, criteria, posts) && Date.now() - Date.parse(raw.result.generatedAt) >= 0
    && Date.now() - Date.parse(raw.result.generatedAt) < 24 * 60 * 60 * 1000 ? raw.result : null;
  return { criteria, result };
}
