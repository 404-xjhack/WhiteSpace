// Browser and server share validation, display and fallback matching rules.
export const CATEGORIES = ["社区生活", "生活手艺", "亲子共学", "旧物新生", "学习交流", "数码互助"];
export const LOCATIONS = ["春和社区活动室", "社区共享工坊", "社区图书角", "春和社区周边"];
export const LIMITS = { title: 48, description: 320, category: 30, categories: 6, time: 40, location: 40 };
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

export function validateDraft(values, selectedCategories) {
  const errors = {};
  const type = values.type === "offer" ? "offer" : "need";
  const title = String(values.title || "").trim();
  const description = String(values.description || "").trim();
  const titleLabel = type === "offer" ? "技能或帮助名称" : "标题";
  const descriptionLabel = type === "offer" ? "分享说明" : "具体说明";
  if (!title) errors.title = `请填写${titleLabel}。`;
  else if (String(values.title).length > LIMITS.title) errors.title = `${titleLabel}最多 ${LIMITS.title} 字。`;
  if (!description) errors.description = `请填写${descriptionLabel}。`;
  else if (String(values.description).length > LIMITS.description) errors.description = `${descriptionLabel}最多 ${LIMITS.description} 字。`;
  const categories = uniqueCategories(selectedCategories);
  if (!categories.length) errors.category = "请至少添加一个分类。";
  else if (categories.length > LIMITS.categories || categories.some((value) => value.length > LIMITS.category)) errors.category = "最多添加 6 个分类，每项最多 30 字。";

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
  if (role.length > 40) errors.role = "社区身份说明最多 40 字。";
  if (age && (!/^\d+$/.test(age) || Number(age) < 1 || Number(age) > 120)) errors.age = "年龄须为 1–120 的整数，可留空。";
  const profile = { role: role || "社区成员", age: age ? Number(age) : null, agePublic: values.agePublic === "on" };
  return {
    errors, profile,
    data: { type, title, description, categories, category: categories[0], tags: categories, schedule, time: schedule ? formatSchedule(schedule) : "", location, participants, participantSettings,
      role: profile.role, age: profile.agePublic && profile.age ? `${profile.age}岁` : "",
      offer: type === "offer" ? title : "一起参与、提供自己的时间和经验", need: type === "offer" ? "寻找适合的分享对象，具体交流方式见说明" : title }
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

const topicTerms = {
  "生活手艺": ["饺子", "做饭", "和面", "擀皮", "食物", "手作", "手工"],
  "旧物新生": ["维修", "修好", "木工", "椅子", "家具", "旧物", "环保", "打磨", "手工", "手作"],
  "亲子共学": ["孩子", "亲子", "小朋友", "体验", "手工", "手作"],
  "学习交流": ["写作", "表达", "故事", "家书", "自我介绍", "语文"],
  "数码互助": ["手机", "摄影", "照片", "修图", "数码"],
  "社区生活": ["邻居", "社区", "散步", "街区", "认识"]
};
const genericTerms = new Set(["社区", "邻居", "体验", "跨代交流", "代际交流", "技能分享", "亲子友好"]);

export function localMatch(post, candidates, limit = 3) {
  const haystack = `${post.title} ${post.description} ${postCategories(post).join(" ")} ${postTags(post).join(" ")}`.toLowerCase();
  return candidates.filter((item) => item.id !== post.id).map((item) => {
    const shared = postCategories(item).filter((category) => postCategories(post).includes(category));
    const terms = uniqueCategories([...postCategories(item).flatMap((category) => topicTerms[category] || [category]), ...postTags(item)]);
    const overlap = terms.filter((term) => !genericTerms.has(term) && haystack.includes(term.toLowerCase()));
    const availability = timeCompatibility(post, item);
    // An opposite post type alone is not evidence of a useful match.
    if ((!shared.length && !overlap.length) || availability === "conflict") return null;
    const complementary = item.type !== post.type;
    const samePlace = post.location === item.location && post.location !== "地点可协商";
    const score = Math.min(94, 38 + (shared.length ? 20 : 0) + Math.min(overlap.length * 6, 18) + (complementary ? 14 : 5) + (availability === "overlap" ? 6 : 0) + (samePlace ? 4 : 0));
    const evidence = overlap.length ? `你提到的“${overlap.slice(0, 2).join("、")}”与对方的“${item.title}”相关。` : `双方都选择了“${shared.join("、")}”，可以先确认具体内容。`;
    const benefit = complementary
      ? post.type === "need" ? `对方可提供${item.offer || item.title}；希望获得${item.need || "共同参与"}。` : `对方正在寻找${item.need || item.title}，可以先确认你的分享是否适合。`
      : "双方发布类型相同，可讨论共同参与；尚不能确认供需互补。";
    const timing = availability === "overlap" ? "填写的时间段有交集。" : "时间尚需双方确认。";
    const place = samePlace ? "地点相同。" : "地点尚需双方协商。";
    const children = /孩子|亲子|小朋友/.test(`${haystack} ${item.description}`);
    return { id: item.id, score, reason: `${evidence}${benefit}${timing}${place}`,
      first_step: `${children ? "由家长或社区工作人员在场，" : ""}先沟通“${item.title}”是否适合，确认双方时间、地点和分工，再约一次短交流。` };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit);
}
