import { CATEGORIES } from "./model.js";

export const EXPERIENCE_VERSION = "today-v1";
export const DEFAULT_CRITERIA = { minutes: 30, participants: 1, theme: "all", materials: [], indoorsOnly: false, noPurchase: false, lightOnly: false, notes: "" };
export const MATERIALS = [
  { id: "writing", label: "纸笔" }, { id: "paper", label: "纸张" }, { id: "phone", label: "手机" },
  { id: "old-object", label: "可观察的旧物" }, { id: "dumpling-kit", label: "饺子皮、熟馅与用具" },
  { id: "wood-kit", label: "木椅、砂纸与防护用具" }
];

export const EXPERIENCE_TEMPLATES = [
  { id: "notice", title: "观察三个日常细节", categories: ["社区生活"], minutes: 15, minParticipants: 1, maxParticipants: 6,
    materials: [], preparation: ["找一个可以安静停留的地方；室内也可以。"], outdoors: false, light: true, coordination: false, relatedPostIds: ["p2"],
    steps: ["停下来，留意身边一个平常会忽略的角落。", "观察三个细节：颜色、声音或人的动作。", "在心里为每个细节起一个名字，选出最想记住的一个。"], stepSummary: "停下来观察；寻找三个细节；记住一个瞬间" },
  { id: "three-lines", title: "亲手写下三句话", categories: ["学习交流"], minutes: 15, minParticipants: 1, maxParticipants: 6,
    materials: [["writing", "phone"]], preparation: ["准备纸笔，或用手机记录；不必追求写得漂亮。"], outdoors: false, light: true, coordination: false, relatedPostIds: ["p5"],
    steps: ["回想今天一个想保留的瞬间。", "用自己的话写三句：发生了什么、你的感受、想对未来的自己说什么。", "读一遍，保留最像自己的一句话；愿意的话再与伙伴分享。"], stepSummary: "回想一个瞬间；写下三句话；读给自己听" },
  { id: "three-photos", title: "用手机拍三张日常照片", categories: ["数码互助", "社区生活"], minutes: 15, minParticipants: 1, maxParticipants: 6,
    materials: [["phone"]], preparation: ["准备手机，在室内寻找光线、物件或纹理；拍人前先征得同意。"], outdoors: false, light: true, coordination: false, relatedPostIds: ["p6"],
    steps: ["选择一个主题，例如窗边的光、桌面或旧物。", "分别从远处、近处和不同角度拍三张照片。", "选出最喜欢的一张，用一句话说明为什么想亲自记录它。"], stepSummary: "选择主题；从三个角度拍照；讲一句照片故事" },
  { id: "walk-map", title: "画一张微型散步地图", categories: ["社区生活"], minutes: 30, minParticipants: 1, maxParticipants: 3,
    materials: [["writing", "phone"]], preparation: ["准备纸笔或手机，选择熟悉且方便返回的公共路线。", "出门前确认天气、路线和自身状况；不合适时改选室内体验。"], outdoors: true, light: false, coordination: false, relatedPostIds: ["p2"],
    steps: ["选一条十分钟内可以走回来的短路线。", "慢慢走，找到两个值得停留的角落。", "用简图或手机记录位置，并写下一个人的日常细节。", "返回起点，为这张地图起一个自己的名字。"], stepSummary: "选短路线；找两个角落；记录位置；返回起点" },
  { id: "paper-story", title: "亲子折纸讲故事", categories: ["亲子共学", "生活手艺"], minutes: 30, minParticipants: 2, maxParticipants: 6,
    materials: [["paper", "writing"]], preparation: ["准备可折叠的纸张，无需剪刀。", "家长全程陪同，先和孩子确认想折什么。"], outdoors: false, light: true, coordination: false, relatedPostIds: ["p4"],
    steps: ["家长陪孩子选一张纸，想象它会变成什么。", "尝试对折、展开，再折出一扇门或一座小房子。", "轮流讲一句故事，让纸上的房子住进一个角色。", "为作品起名字，互相说出最喜欢的一处。"], stepSummary: "家长陪同选纸；折出小房子；轮流讲故事；命名作品" },
  { id: "repair-plan", title: "给旧物写一份修复计划", categories: ["旧物新生"], minutes: 30, minParticipants: 1, maxParticipants: 4,
    materials: [["old-object"], ["writing", "phone"]], preparation: ["准备一件可安全观察的旧物，以及纸笔或手机。", "本次只观察记录，不拆解、不试坐损坏的椅子，也不使用工具。"], outdoors: false, light: true, coordination: false, relatedPostIds: ["p3"],
    steps: ["选一件旧物，回想它陪伴过的一个生活片段。", "观察材质、磨损和松动位置，只记录，不拆解。", "画一张简图，写出想保留与希望修复的地方。", "列出需要向有经验的人请教的问题，完成自己的修复计划。"], stepSummary: "回想旧物故事；观察磨损；记录修复愿望；列出请教问题" },
  { id: "dumpling-session", title: "小批量包饺子初体验", categories: ["生活手艺"], minutes: 60, minParticipants: 2, maxParticipants: 5,
    materials: [["dumpling-kit"]], preparation: ["先与指导者确认场地、时间、分工和食材过敏情况。", "备齐现成饺子皮、熟馅、清洁用具；本次从备料完成后计时。", "涉及孩子须有家长全程陪同；加热食物由熟悉操作的成人负责。"], outdoors: true, light: false, coordination: true, relatedPostIds: ["p1"],
    steps: ["先与指导者确认时间、场地和材料，约好后再开始；有孩子时由家长陪同。", "洗手并清洁桌面，取少量现成饺子皮与熟馅。", "在指导下练习放馅、对折和捏合，先包三只。", "比较不同的褶子，请指导者检查封口，并说说家乡餐桌上的故事。", "按指导者安排完成收尾；加热由熟悉操作的成人负责，不尝未充分加热的食物。"], stepSummary: "确认指导与场地；洗手备料；包三只；检查封口；安全收尾" },
  { id: "wood-session", title: "木椅检查与基础打磨", categories: ["旧物新生"], minutes: 60, minParticipants: 2, maxParticipants: 4,
    materials: [["wood-kit"]], preparation: ["先与木工指导者确认时间、工坊场地和工具。", "准备木椅、砂纸与防护用具，检查和打磨须由指导者在场。", "不使用电动工具，不试坐尚未确认安全的木椅。"], outdoors: true, light: false, coordination: true, relatedPostIds: ["p3"],
    steps: ["先确认指导者与工坊可用，约好时间和分工后再开始。", "在指导下观察木纹与松动部位，不试坐、不自行拆解。", "由指导者检查防护和工具，再在安全的小区域顺着木纹轻轻打磨。", "对比打磨前后的手感，记录仍需修复的问题。", "清理工具和碎屑，请指导者确认木椅安全后结束。"], stepSummary: "确认指导与工坊；观察木椅；指导下打磨；记录问题；清理检查" }
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
export function filterExperiences(criteria) {
  return EXPERIENCE_TEMPLATES.filter((template) => template.minutes <= criteria.minutes
    && criteria.participants >= template.minParticipants && criteria.participants <= template.maxParticipants
    && (criteria.theme === "all" || template.categories.includes(criteria.theme))
    && (!criteria.indoorsOnly || !template.outdoors) && (!criteria.lightOnly || template.light)
    && (!criteria.noPurchase || template.materials.every((alternatives) => alternatives.some((id) => criteria.materials.includes(id)))));
}
export function needsCoordination(template, criteria) { return template.coordination || criteria.participants > 1; }
export function materialSummary(template) {
  return template.materials.map((alternatives) => alternatives.map((id) => MATERIALS.find((material) => material.id === id).label).join("或")).join("、") || "无需材料";
}
export function recommendationItem(template, criteria, adjustment = null) {
  const coordination = needsCoordination(template, criteria);
  const reason = `${template.minutes} 分钟可完成，适合 ${criteria.participants} 人${criteria.theme === "all" ? "尝试" : `探索${criteria.theme}`}。${coordination ? "先确认伙伴、时间与准备事项，再一起动手。" : "无需预约或外部指导，备齐准备事项就能开始。"}`;
  // Coordination and safety instructions stay canonical even when AI adjusts the action list.
  const steps = adjustment ? [...adjustment.steps] : [...template.steps];
  const coordinationStep = template.coordination ? template.steps[0] : "先确认参与伙伴、时间和分工，再按准备事项开始。";
  if (coordination && steps[0] !== coordinationStep) steps.unshift(coordinationStep);
  const preparations = [...template.preparation];
  if (template.categories.includes("亲子共学") || /孩子|亲子|小朋友/.test(criteria.notes)) preparations.push("涉及孩子时，请家长或工作人员全程在场。");
  return { id: template.id, title: template.title, categories: template.categories, minutes: template.minutes,
    participants: criteria.participants, materials: materialSummary(template), preparations, steps,
    status: coordination ? "coordinate" : "ready", reason: adjustment?.reason || reason, firstStep: steps[0], relatedPostIds: template.relatedPostIds };
}
export function localRecommendations(criteria, fallbackReason = "unconfigured") {
  const eligible = filterExperiences(criteria).sort((a, b) => Number(needsCoordination(a, criteria)) - Number(needsCoordination(b, criteria)) || b.minutes - a.minutes);
  return { version: EXPERIENCE_VERSION, inputKey: criteriaKey(criteria), criteria, source: "local", fallbackReason,
    generatedAt: new Date().toISOString(), recommendations: eligible.slice(0, 3).map((template) => recommendationItem(template, criteria)),
    emptyReason: eligible.length ? null : "没有符合全部条件的体验。可以增加可用时间、调整人数或主题，或放宽材料与出行限制。" };
}
export function validateAIRecommendations(raw, criteria) {
  if (!raw || !Array.isArray(raw.recommendations) || !raw.recommendations.length || raw.recommendations.length > 3) return null;
  const allowed = new Set(filterExperiences(criteria).map((template) => template.id));
  const used = new Set();
  for (const item of raw.recommendations) {
    if (!item || !allowed.has(item.id) || used.has(item.id) || typeof item.reason !== "string" || !item.reason.trim() || item.reason.length > 160
      || !Array.isArray(item.steps) || item.steps.length < 3 || item.steps.length > 5
      || item.steps.some((step) => typeof step !== "string" || !step.trim() || step.length > 120)) return null;
    used.add(item.id);
  }
  return raw.recommendations.map((item) => recommendationItem(EXPERIENCE_TEMPLATES.find((template) => template.id === item.id), criteria,
    { reason: item.reason.trim(), steps: item.steps.map((step) => step.trim()) }));
}
export function validRecommendationData(data, criteria) {
  if (!data || data.version !== EXPERIENCE_VERSION || data.inputKey !== criteriaKey(criteria) || !["ai", "local"].includes(data.source)
    || typeof data.generatedAt !== "string" || !Number.isFinite(Date.parse(data.generatedAt))
    || (data.source === "local" && typeof data.fallbackReason !== "string")
    || !Array.isArray(data.recommendations) || data.recommendations.length > 3) return false;
  const eligible = filterExperiences(criteria); const used = new Set();
  if (!data.recommendations.length && (eligible.length || typeof data.emptyReason !== "string" || !data.emptyReason.trim())) return false;
  return data.recommendations.every((item) => {
    const template = eligible.find((candidate) => candidate.id === item?.id);
    if (!template || used.has(item.id)) return false;
    used.add(item.id);
    const canonical = recommendationItem(template, criteria);
    for (const field of ["title", "categories", "minutes", "participants", "materials", "preparations", "status", "relatedPostIds"]) {
      if (JSON.stringify(item[field]) !== JSON.stringify(canonical[field])) return false;
    }
    return typeof item.reason === "string" && Boolean(item.reason.trim()) && item.reason.length <= 160
      && Array.isArray(item.steps) && item.steps.length >= 3 && item.steps.length <= 6
      && item.steps.every((step) => typeof step === "string" && Boolean(step.trim()) && step.length <= 120)
      && item.firstStep === item.steps[0] && (canonical.status !== "coordinate" || item.firstStep === canonical.firstStep);
  });
}
export function restoreTodayState(raw) {
  const criteria = normalizeCriteria(raw?.criteria) || { ...DEFAULT_CRITERIA, materials: [] };
  const result = validRecommendationData(raw?.result, criteria) && Date.now() - Date.parse(raw.result.generatedAt) >= 0
    && Date.now() - Date.parse(raw.result.generatedAt) < 24 * 60 * 60 * 1000 ? raw.result : null;
  return { criteria, result };
}
export function experienceDraft(item, criteria) {
  const template = EXPERIENCE_TEMPLATES.find((candidate) => candidate.id === item.id);
  const count = criteria.participants === 1 ? 2 : criteria.participants;
  const restrictions = [criteria.indoorsOnly && "不出门", criteria.noPurchase && "不添购材料", criteria.lightOnly && "轻量活动"].filter(Boolean);
  const context = [`想一起尝试${template.title}，约${template.minutes}分钟，预计${count}人（含我）。`,
    `准备：${materialSummary(template)}。`, restrictions.length && `限制：${restrictions.join("、")}。`, criteria.notes && `补充：${criteria.notes}`].filter(Boolean).join("\n");
  const stepBudget = Math.floor((320 - context.length - 8 - item.steps.length) / item.steps.length);
  const summary = item.steps.map((step) => step.length > stepBudget ? `${step.slice(0, stepBudget - 1)}…` : step).join("；");
  const description = `${context}\n步骤：${summary}。`;
  return { title: template.title, description, categories: [...template.categories], participants: count };
}
