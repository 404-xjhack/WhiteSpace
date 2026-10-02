import { CATEGORIES, normalizedPost, assessCandidate, displayTime } from "./model.js";

export const EXPERIENCE_VERSION = "today-posts-v2";
// Participants is the visitor's party, including the visitor, not the whole event.
export const DEFAULT_CRITERIA = { minutes: 30, participants: 1, theme: "all", materials: [], indoorsOnly: false, noPurchase: false, lightOnly: false, notes: "" };
export const MATERIALS = [
  { id: "writing", label: "纸笔" }, { id: "paper", label: "纸张" }, { id: "phone", label: "手机" },
  { id: "old-object", label: "可观察的旧物" }, { id: "dumpling-kit", label: "饺子皮、熟馅与用具" },
  { id: "wood-kit", label: "木椅、砂纸与防护用具" }
];

export function normalizeCriteria(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (![15, 30, 60].includes(raw.minutes) || !Number.isInteger(raw.participants) || raw.participants < 1 || raw.participants > 50
    || !["all", ...CATEGORIES].includes(raw.theme) || !Array.isArray(raw.materials)
    || raw.materials.some((id) => !MATERIALS.some((material) => material.id === id))
    || ["indoorsOnly", "noPurchase", "lightOnly"].some((key) => typeof raw[key] !== "boolean")
    || typeof raw.notes !== "string" || raw.notes.length > 160) return null;
  return { minutes: raw.minutes, participants: raw.participants, theme: raw.theme, materials: [...new Set(raw.materials)].sort(),
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
      durationMinutes: Number.isInteger(raw.durationMinutes) && raw.durationMinutes > 0 && raw.durationMinutes <= 1440 ? raw.durationMinutes : null,
      requiredMaterials, participationMode: mode, lightActivity: typeof raw.lightActivity === "boolean" ? raw.lightActivity : null }];
  });
}
export function postsKey(posts) { return JSON.stringify(otherPosts(posts).sort((a, b) => a.id.localeCompare(b.id))); }
export function filterExperiences(criteria, posts) {
  return otherPosts(posts).filter((post) => (criteria.theme === "all" || post.categories.includes(criteria.theme))
    && (post.durationMinutes === null || post.durationMinutes <= criteria.minutes)
    // The author also participates. Current occupancy is unknown and must be confirmed.
    && (post.capacity === null || criteria.participants + 1 <= post.capacity)
    && (!criteria.indoorsOnly || post.participationMode !== "in-person")
    && (!criteria.lightOnly || post.lightActivity !== false)
    && (!criteria.noPurchase || post.requiredMaterials === null || post.requiredMaterials.every((alternatives) => alternatives.some((id) => criteria.materials.includes(id)))));
}
function materialSummary(post) {
  return post.requiredMaterials === null ? "发布未说明完整材料要求，需向发布者确认。" : post.requiredMaterials.length
    ? post.requiredMaterials.map((alternatives) => alternatives.map((id) => MATERIALS.find((material) => material.id === id).label).join("或")).join("、") : "发布注明无需自备材料。";
}
export function recommendationItem(post, criteria, adjustment = null) {
  const preparations = [post.durationMinutes === null ? `发布未说明单次参与时长，需确认能否安排 ${criteria.minutes} 分钟的参与。` : `发布注明单次参与约 ${post.durationMinutes} 分钟。`,
    `同行 ${criteria.participants} 人（含你），发布人数为“${post.participants}”；实际余位与人员组成仍需确认。`,
    materialSummary(post), `先确认活动安排：${displayTime(post)}；${post.location}。`];
  if (criteria.indoorsOnly && post.participationMode === "unknown") preparations.push("你希望不外出，需确认对方是否支持线上参与。");
  if (criteria.noPurchase && post.requiredMaterials === null) preparations.push("你希望不添购材料，需确认已有材料或发布者提供的材料是否够用。");
  if (criteria.lightOnly && post.lightActivity === null) preparations.push("你希望轻量参与，发布未说明体力要求，请先确认。");
  if (criteria.notes) preparations.push(`你的补充：${criteria.notes}；参与前需确认这些条件。`);
  if (/孩子|亲子|小朋友/.test(`${post.title} ${post.description} ${criteria.notes}`)) preparations.push("涉及孩子时，须由家长或社区工作人员全程在场。");
  const firstStep = `查看“${post.title}”的原发布，确认能否安排 ${criteria.minutes} 分钟、同行 ${criteria.participants} 人参与，以及材料、时间和地点。`;
  const kind = post.type === "offer" ? `对方愿意分享${post.offer || post.title}` : `对方希望${post.need || post.title}，可讨论共同参与及分工`;
  const reason = `${criteria.theme === "all" ? "这条发布提供了一个可参与的生活想法。" : `发布主题符合你选择的“${criteria.theme}”。`}${kind}。`.slice(0, 140) + "具体参与条件仍需确认。";
  const steps = [firstStep, ...(adjustment?.steps || ["阅读对方的说明，核对你能带来的材料、经验与希望获得的体验。", "确认条件后表达参与意向；原型只保存意向，不会发送真实预约。"])];
  return { id: post.id, post, reason: adjustment?.reason || reason, preparations, firstStep, steps, status: "coordinate" };
}
function relevance(criteria, post) {
  if (!criteria.notes) return 0;
  const evidence = assessCandidate({ type: "need", title: criteria.notes, description: criteria.notes, need: criteria.notes,
    categories: criteria.theme === "all" ? [] : [criteria.theme], time: "时间待确认", location: "地点待确认" }, post);
  return evidence.relevant ? evidence.concepts.length * 10 + evidence.terms.length * 3 : 0;
}
export function localRecommendations(criteria, posts, fallbackReason = "unconfigured") {
  const eligible = filterExperiences(criteria, posts).sort((a, b) => relevance(criteria, b) - relevance(criteria, a)
    || Number(b.durationMinutes !== null) - Number(a.durationMinutes !== null) || a.id.localeCompare(b.id));
  return { version: EXPERIENCE_VERSION, inputKey: criteriaKey(criteria), poolKey: postsKey(posts), criteria, source: "local", fallbackReason,
    generatedAt: new Date().toISOString(), recommendations: eligible.slice(0, 3).map((post) => recommendationItem(post, criteria)),
    emptyReason: eligible.length ? null : "当前他人发布中没有符合已知条件的想法。可以调整主题、同行人数或限制，再试一次。" };
}
export function validateAIRecommendations(raw, criteria, posts) {
  if (!raw || !Array.isArray(raw.recommendations) || !raw.recommendations.length || raw.recommendations.length > 3) return null;
  const eligible = filterExperiences(criteria, posts); const used = new Set();
  for (const item of raw.recommendations) {
    if (!item || !eligible.some((post) => post.id === item.id) || used.has(item.id) || typeof item.reason !== "string" || !item.reason.trim() || item.reason.length > 160
      || !Array.isArray(item.steps) || item.steps.length < 2 || item.steps.length > 4
      || item.steps.some((step) => typeof step !== "string" || !step.trim() || step.length > 120)) return null;
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
      && item.steps.every((step) => typeof step === "string" && Boolean(step.trim()) && step.length <= 120) && item.steps[0] === canonical.firstStep;
  });
}
export function restoreTodayState(raw, posts = null) {
  const criteria = normalizeCriteria(raw?.criteria) || { ...DEFAULT_CRITERIA, materials: [] };
  const result = validRecommendationData(raw?.result, criteria, posts) && Date.now() - Date.parse(raw.result.generatedAt) >= 0
    && Date.now() - Date.parse(raw.result.generatedAt) < 24 * 60 * 60 * 1000 ? raw.result : null;
  return { criteria, result };
}
