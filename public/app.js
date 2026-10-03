import { cleanCategory, postTags, validateDraft, validateSchedule, normalizeSchedule, formatSchedule, displayTime, formatPublished, matchPost, matchFingerprint, MATCH_VERSION, LEGACY_OFFER_NEED, needExtractionInput, needExtractionKey, validExtractedNeed, hasAINeed } from "./model.js";
import { initMapView } from "./map-ui.js";
import { initRealMap } from "./real-map.js";
import { placeDemoPosts } from "./demo-map.js";

const $ = (selector) => document.querySelector(selector);
const postList = $("#postList");
const createDialog = $("#createDialog");
const detailDialog = $("#detailDialog");
const createForm = $("#createForm");
const scheduleDialog = $("#scheduleDialog");
const scheduleForm = $("#scheduleForm");
const needDialog = $("#needDialog");
const locationPickerDialog = $("#locationPickerDialog");
const deleteDialog = $("#deleteDialog");
const needForm = $("#needForm");
const toast = $("#toast");
const storagePosts = "writespace.posts.v1";
const storageInterest = "writespace.interest.v1";
const storageProfile = "writespace.profile.v1";
const storageMatches = "writespace.matches.v1";

function readSaved(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
const savedPosts = readSaved(storagePosts, []);
let myPosts = Array.isArray(savedPosts) ? savedPosts.filter((post) => post && typeof post.id === "string" && post.id.startsWith("mine-") && typeof post.title === "string" && typeof post.description === "string") : [];
const hadLegacyNeeds = myPosts.some((post) => post.type === "offer" && post.need === LEGACY_OFFER_NEED);
myPosts = myPosts.map((post) => post.type === "offer" && post.need === LEGACY_OFFER_NEED ? { ...post, need: "" } : post);
const savedInterest = readSaved(storageInterest, []);
let interestedIds = new Set(Array.isArray(savedInterest) ? savedInterest.filter((id) => typeof id === "string") : []);
let profile = readSaved(storageProfile, {});
if (!profile || typeof profile !== "object" || Array.isArray(profile)) profile = {};
let matchState = readSaved(storageMatches, {});
if (!matchState || typeof matchState !== "object" || Array.isArray(matchState)) matchState = {};
if (!matchState.byPost || typeof matchState.byPost !== "object" || Array.isArray(matchState.byPost)) matchState.byPost = {};
let seedPosts = [];
let mapDemoPosts = [];
let selectedCategories = [];
let filter = "all";
let currentDetail = null;
let matchingPost = null;
let matchController = null;
let matchVersion = 0;
let displayedMatches = [];
let displayedMatchData = null;
let matchesExpanded = false;
let schedulePostId = null;
let scheduleAttempted = false;
let needContext = null;
let needResult = null;
let needController = null;
let needVersion = 0;
let formAttempted = false;
let categoryError = "";
let toastTimer;
let realMap;
let editingPostId = null;
let deletingPostId = null;

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { showToast("浏览器暂时无法保存，当前页面仍可继续体验。"); }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function showToast(message) {
  toast.textContent = message; toast.classList.add("is-visible"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3300);
}
function allPosts() { return [...myPosts, ...seedPosts]; }
function isMine(post) { return post.id.startsWith("mine-"); }
const mapView = initMapView({ onShow: () => realMap?.show() });
function personLine(post) {
  const age = typeof post.age === "string" && /^\d+岁$/.test(post.age) ? post.age : "";
  return [isMine(post) ? "由你发布" : "", post.role || "社区成员", age].filter(Boolean).join(" · ");
}
function avatar(post) { return `<span class="avatar ${escapeHtml(post.color || "self")}" aria-hidden="true">${escapeHtml(post.avatar || "我")}</span>`; }
function icon(kind) {
  return kind === "place" ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
}
function tagHtml(post) { return postTags(post).map((tag) => `<span>${escapeHtml(tag)}</span>`).join(""); }

function renderPosts() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const visible = allPosts().filter((post) => {
    const matchesFilter = filter === "all" || (filter === "mine" ? isMine(post) : post.type === filter);
    const content = `${post.title} ${post.description} ${post.location} ${postTags(post).join(" ")}`.toLowerCase();
    return matchesFilter && (!query || content.includes(query));
  });
  $("#resultCount").textContent = `${visible.length} 条内容`;
  $("#myPostCount").textContent = String(myPosts.length); $("#myPostCount").hidden = myPosts.length === 0;
  postList.innerHTML = visible.map((post) => `<article class="post-card">
    <div class="post-meta">${avatar(post)}<div class="author-lines"><strong>${escapeHtml(post.name || "我")} <span class="type-label ${post.type === "need" ? "need" : ""}">${post.type === "need" ? "想去体验" : "愿意分享"}</span></strong><span>${escapeHtml(personLine(post))}</span></div><span class="post-age" data-published-id="${escapeHtml(post.id)}">${escapeHtml(formatPublished(post))}</span></div>
    <h3>${escapeHtml(post.title)}</h3><p class="post-description">${escapeHtml(post.description)}</p><div class="post-tags">${tagHtml(post)}</div>
    <div class="post-footer"><span class="post-foot-item">${icon("place")}${escapeHtml(post.location || "地点待确认")}</span><span class="post-foot-item">${icon("time")}${escapeHtml(displayTime(post))}</span><button type="button" class="post-card-action" data-post-id="${escapeHtml(post.id)}">查看详情 →</button></div></article>`).join("");
  $("#emptyState").hidden = visible.length > 0;
  realMap?.render();
}
function refreshPublished() {
  document.querySelectorAll("[data-published-id]").forEach((element) => {
    const post = allPosts().find((item) => item.id === element.dataset.publishedId);
    if (post) element.textContent = formatPublished(post);
  });
}
function setFilter(next) {
  filter = next;
  document.querySelectorAll(".filter-chip").forEach((button) => {
    const active = button.dataset.filter === next; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active));
  });
  renderPosts();
}
function syncDialogLock() { document.documentElement.classList.toggle("modal-open", createDialog.open || detailDialog.open || scheduleDialog.open || needDialog.open || locationPickerDialog.open || deleteDialog.open); }
function openDialog(dialog) { if (!dialog.open) dialog.showModal(); syncDialogLock(); }
function closeDialog(dialog) { dialog.close(); syncDialogLock(); }
for (const dialog of [createDialog, detailDialog, scheduleDialog, needDialog, locationPickerDialog, deleteDialog]) dialog.addEventListener("close", syncDialogLock);
realMap = initRealMap({
  getPosts: () => [...myPosts, ...mapDemoPosts],
  showDetail: (post) => showDetail(post),
  isInterested: (id) => interestedIds.has(id),
  toggleInterest: (post) => {
    const cancelling = interestedIds.has(post.id);
    if (cancelling) interestedIds.delete(post.id); else interestedIds.add(post.id);
    save(storageInterest, [...interestedIds]); realMap.render();
    showToast(cancelling ? "已取消参与意向。" : "已记录参与意向；演示中不会通知真实用户。");
  },
  openCreate: () => openCreate(),
  editPost: (post) => openEdit(post),
  deletePost: (post) => confirmDelete(post),
  onPick: ({ name, lng, lat }) => {
    $("#postLocation").value = "map";
    $("#locationName").value = name; $("#locationLng").value = String(lng); $("#locationLat").value = String(lat);
    $("#publicPlaceConfirmed").value = "yes";
    $("#pickedMapLocation").textContent = `已选公共集合点：${name}`;
    closeDialog(locationPickerDialog); updateErrors();
  }
});
locationPickerDialog.addEventListener("close", () => { if (!createDialog.open) openDialog(createDialog); });

const needFallbackMessages = {
  unconfigured: "AI 尚未配置，可自行补充或留空，留空将显示“未说明”。",
  timeout: "AI 提炼超时，可重试、自行补充或留空。",
  upstream: "AI 暂时不可用，可重试、自行补充或留空。",
  invalid_response: "AI 未返回可核对的提炼结果，可重试、自行补充或留空。",
  network: "未连接到提炼服务，可重试、自行补充或留空。"
};
function cancelNeedExtraction() {
  needVersion++; needController?.abort(); needController = null;
  $("#extractNeed").disabled = false; $("#extractNeed").textContent = "AI 重新提炼";
  $("#saveNeed").disabled = false;
}
async function extractNeed() {
  const context = needContext; if (!context) return;
  cancelNeedExtraction(); const version = needVersion;
  const controller = new AbortController(); needController = controller;
  const timer = setTimeout(() => controller.abort(), 22000);
  $("#extractNeed").disabled = true; $("#extractNeed").textContent = "正在提炼…";
  $("#saveNeed").disabled = true;
  $("#needStatus").textContent = "正在根据你的说明提炼希望获得…";
  $("#needEvidence").hidden = true;
  try {
    const input = needExtractionInput(context.post);
    const response = await fetch("/api/extract-need", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ post: input }), signal: controller.signal });
    if (!response.ok) throw new Error("network");
    const data = await response.json();
    if (version !== needVersion || needContext !== context || !needDialog.open) return;
    if (data.inputKey !== needExtractionKey(context.post)) throw new Error("invalid_response");
    if (data.source !== "ai") throw new Error(data.fallbackReason || "invalid_response");
    if (!validExtractedNeed(input, data)) throw new Error("invalid_response");
    needResult = { ...data, extractedAt: new Date().toISOString() }; $("#needValue").value = data.need;
    $("#needStatus").textContent = data.need ? "AI 已提炼，请核对或修改后保存。" : "AI 未在说明中找到明确诉求。可以留空，或自行补充。";
    $("#needEvidence").textContent = data.evidence ? `依据的原文：${data.evidence}` : "";
    $("#needEvidence").hidden = !data.evidence;
  } catch (error) {
    if (version !== needVersion || needContext !== context || !needDialog.open) return;
    $("#needStatus").textContent = needFallbackMessages[error.name === "AbortError" ? "timeout" : error.message] || needFallbackMessages.network;
  } finally {
    clearTimeout(timer);
    if (version === needVersion) { needController = null; $("#extractNeed").disabled = false; $("#extractNeed").textContent = "AI 重新提炼"; $("#saveNeed").disabled = false; }
  }
}
function openNeedEditor(context) {
  cancelNeedExtraction(); needContext = context;
  needResult = hasAINeed(context.post) ? context.post.needSummary : null;
  $("#needTitle").textContent = context.kind === "create" ? "确认希望获得" : "提炼希望获得";
  $("#needPostTitle").textContent = context.post.title;
  $("#needDescription").textContent = context.post.description;
  $("#needValue").value = context.post.need || "";
  $("#needError").hidden = true; $("#needValue").removeAttribute("aria-invalid");
  $("#saveNeed").textContent = context.kind === "create" ? "确认并发布" : "保存并重新匹配";
  openDialog(needDialog); extractNeed();
}
needDialog.addEventListener("close", () => {
  const context = needContext; needContext = null; cancelNeedExtraction();
  if (context?.kind === "create") openDialog(createDialog);
});
$("#extractNeed").addEventListener("click", extractNeed);
$("#needValue").addEventListener("input", () => {
  cancelNeedExtraction(); needResult = null; $("#needEvidence").hidden = true;
  $("#needStatus").textContent = "已修改，保存后将使用你填写的希望获得。";
  $("#needError").hidden = true; $("#needValue").removeAttribute("aria-invalid");
});
needForm.addEventListener("submit", (event) => {
  event.preventDefault(); const context = needContext; if (!context) return;
  const value = $("#needValue").value.trim();
  if (value.length > 160) { $("#needError").textContent = "希望获得最多 160 字。"; $("#needError").hidden = false; $("#needValue").setAttribute("aria-invalid", "true"); $("#needValue").focus(); return; }
  const summary = needResult?.need === value ? { ...needResult, confirmedAt: new Date().toISOString() } : { source: "manual" };
  needContext = null; closeDialog(needDialog); cancelNeedExtraction();
  if (context.kind === "create") publishDraft({ ...context.post, need: value, needSummary: summary }, context.profile);
  else {
    const index = myPosts.findIndex((post) => post.id === context.post.id); if (index < 0) return;
    const post = { ...myPosts[index], need: value, needSummary: summary };
    myPosts[index] = post; save(storagePosts, myPosts); delete matchState.byPost[post.id]; renderPosts();
    showToast("希望获得已保存，正在重新匹配。"); runMatch(post);
  }
});

function syncScheduleFields() {
  const mode = scheduleForm.elements.timeMode.value;
  $("#scheduleDateFields").hidden = mode !== "date";
  $("#scheduleWeeklyFields").hidden = mode !== "weekly";
  $("#scheduleClockFields").hidden = !["date", "weekly"].includes(mode);
}
function checkSchedule(focus = false) {
  const post = myPosts.find((post) => post.id === schedulePostId);
  const result = validateSchedule(Object.fromEntries(new FormData(scheduleForm)), post?.type);
  const errors = scheduleAttempted ? result.errors : {};
  scheduleForm.querySelectorAll("[aria-invalid]").forEach((element) => element.removeAttribute("aria-invalid"));
  for (const key of Object.keys(errors)) scheduleForm.elements.namedItem(key)?.setAttribute("aria-invalid", "true");
  $("#scheduleError").textContent = Object.values(errors).join(" ");
  $("#scheduleError").hidden = Object.keys(errors).length === 0;
  $("#schedulePreview").textContent = result.schedule && Object.keys(result.errors).length === 0
    ? `你选择的时间：${displayTime({ schedule: result.schedule })}` : "填写有效时间后，可在这里核对日期和星期。";
  if (focus) scheduleForm.elements.namedItem(Object.keys(errors)[0])?.focus();
  return result;
}
function openSchedule(post) {
  if (!isMine(post)) return;
  schedulePostId = post.id; scheduleAttempted = false; scheduleForm.reset();
  const schedule = normalizeSchedule(post.schedule);
  const offer = post.type === "offer";
  $("#schedulePostTitle").textContent = post.title;
  $("#scheduleNegotiable").hidden = !offer; $("#scheduleNegotiable").disabled = !offer;
  scheduleForm.elements.timeMode.value = schedule?.mode || "";
  scheduleForm.elements.date.value = schedule?.date || "";
  scheduleForm.elements.weekday.value = schedule?.days?.[0] ?? "";
  scheduleForm.elements.start.value = schedule?.start || "";
  scheduleForm.elements.end.value = schedule?.end || "";
  syncScheduleFields(); checkSchedule(); openDialog(scheduleDialog);
}
scheduleForm.addEventListener("change", () => { syncScheduleFields(); checkSchedule(); });
scheduleForm.addEventListener("input", () => { if (scheduleAttempted) checkSchedule(); });
scheduleForm.addEventListener("submit", (event) => {
  event.preventDefault(); scheduleAttempted = true;
  const { schedule, errors } = checkSchedule(true);
  if (Object.keys(errors).length || !schedule) return;
  const index = myPosts.findIndex((post) => post.id === schedulePostId);
  if (index < 0) return;
  const post = { ...myPosts[index], schedule, time: formatSchedule(schedule) };
  myPosts[index] = post; save(storagePosts, myPosts); delete matchState.byPost[post.id];
  closeDialog(scheduleDialog); renderPosts(); showToast(`已保存时间：${displayTime(post)}，正在重新匹配。`); runMatch(post);
});
scheduleDialog.addEventListener("close", () => { schedulePostId = null; });

function renderCategories() {
  $("#selectedCategories").innerHTML = selectedCategories.map((category, index) => `<button class="selected-category" type="button" data-remove-category="${index}" aria-label="移除分类：${escapeHtml(category)}">${escapeHtml(category)} <span aria-hidden="true">×</span></button>`).join("");
}
function addCategory() {
  const pick = $("#categoryPicker").value;
  const value = cleanCategory(pick === "other" ? $("#customCategory").value : pick);
  categoryError = "";
  if (!value) categoryError = pick === "other" ? "请填写其他分类名称。" : "请先选择要添加的分类。";
  else if (value.length > 30) categoryError = "分类名称最多 30 字。";
  else if (selectedCategories.some((category) => category.toLowerCase() === value.toLowerCase())) showToast("这个分类已经添加。");
  else if (selectedCategories.length >= 6) categoryError = "最多添加 6 个分类，请先移除不需要的项。";
  else selectedCategories.push(value);
  if (!categoryError) {
    $("#categoryPicker").value = ""; $("#customCategory").value = ""; $("#customCategory").hidden = true; renderCategories();
  }
  updateErrors(); return !categoryError;
}
function syncConditionalFields() {
  const mode = $("#timeMode").value;
  $("#dateFields").hidden = mode !== "date"; $("#weeklyFields").hidden = mode !== "weekly";
  $("#clockFields").hidden = !["date", "weekly"].includes(mode);
  $("#locationOtherField").hidden = $("#postLocation").value !== "other";
  $("#mapLocationField").hidden = $("#postLocation").value !== "map";
  $("#mapFirstStepField").hidden = $("#postLocation").value !== "map";
  $("#customCategory").hidden = $("#categoryPicker").value !== "other";
  $("#exactParticipants").hidden = $("#participantMode").value !== "exact";
  $("#rangeParticipants").hidden = $("#participantMode").value !== "range";
}
function syncType() {
  const offer = createForm.elements.type.value === "offer";
  $("#createTitle").textContent = offer ? "分享我的经验" : "发起一次体验";
  $("#createSubtitle").textContent = offer ? "介绍愿意分享的手艺或经验，带大家体验一段不同的日常。" : "说说想亲手体验的事，以及希望谁一起参与。";
  $("#titleLabel").textContent = offer ? "技能或体验名称" : "标题"; $("#titleHint").textContent = offer ? "你愿意带大家体验什么？" : "一句话说明想体验的事";
  $("#descriptionLabel").textContent = offer ? "分享说明" : "具体说说"; $("#descriptionHint").textContent = offer ? "适合谁，希望获得什么收获？" : "为什么想尝试，希望谁一起参与？";
  $("#postTitle").placeholder = offer ? "例如：分享手机摄影，记录自动化街区的日常" : "例如：想亲手修好一把旧椅子，体验过去的木工";
  $("#postDescription").placeholder = offer ? "说说愿意分享的经验、大家可以亲手尝试什么、适合谁，以及你希望获得的收获…" : "说说为什么想体验、准备亲手做什么，以及你能带来什么…";
  $("#timeLabel").textContent = offer ? "可交流的时间" : "活动时间"; $("#locationLabel").textContent = offer ? "交流地点" : "活动地点";
  for (const option of [$("#negotiableTime"), $("#negotiableLocation")]) { option.disabled = !offer; option.hidden = !offer; }
  if (offer) {
    if (!$("#timeMode").value) $("#timeMode").value = "negotiable";
    if (!$("#postLocation").value) $("#postLocation").value = "negotiable";
  } else {
    if ($("#timeMode").value === "negotiable") $("#timeMode").value = "";
    if ($("#postLocation").value === "negotiable") $("#postLocation").value = "";
  }
  syncConditionalFields();
  if (editingPostId) {
    $("#createTitle").textContent = "编辑我的发布";
    $("#createSubtitle").textContent = "修改后，地图位置与匹配建议会同步更新。";
  }
}
function getDraft() { return validateDraft(Object.fromEntries(new FormData(createForm)), selectedCategories); }
function updateErrors(focus = false) {
  const result = getDraft(); const errors = formAttempted ? { ...result.errors } : {};
  if (categoryError) errors[$("#categoryPicker").value === "other" ? "customCategory" : "category"] = categoryError;
  if (formAttempted && $("#categoryPicker").value === "other" && !cleanCategory($("#customCategory").value)) errors.customCategory = "请填写其他分类名称。";
  document.querySelectorAll(".field-error").forEach((element) => element.remove());
  createForm.querySelectorAll("[aria-invalid]").forEach((element) => { element.removeAttribute("aria-invalid"); element.removeAttribute("aria-describedby"); });
  for (const [key, message] of Object.entries(errors)) {
    const input = createForm.elements.namedItem(key); if (!input || !input.closest) continue;
    input.setAttribute("aria-invalid", "true"); const error = document.createElement("span"); error.className = "field-error"; error.id = `error-${key}`; error.textContent = message;
    input.setAttribute("aria-describedby", error.id); (input.closest(".form-field") || input.parentElement).append(error);
  }
  $("#formError").hidden = Object.keys(errors).length === 0; $("#formError").textContent = Object.values(errors).join(" ");
  if (focus && Object.keys(errors).length) {
    const input = createForm.elements.namedItem(Object.keys(errors)[0]); const details = input?.closest?.("details"); if (details) details.open = true; input?.focus?.();
  }
  return { ...result, errors };
}
function fillExample(example) {
  clearMapLocation();
  selectedCategories = []; categoryError = ""; formAttempted = false; $("#categoryPicker").value = ""; $("#customCategory").value = "";
  createForm.elements.type.value = example === "photo" ? "offer" : "need";
  if (example === "food") {
    $("#postTitle").value = "自动厨房之外，想带孩子体验手工包饺子";
    $("#postDescription").value = "孩子从小习惯自动厨房，很好奇以前的人为什么要一起做饭。想找愿意教手工包饺子的人，从和面、擀皮开始体验；我会准备材料并全程陪同，也想听听过去餐桌上的故事。";
    selectedCategories = ["亲子共学", "生活手艺"]; $("#postLocation").value = "other"; $("#locationOther").value = "公共集合点待确认"; $("#postWeekday").value = "6"; $("#postStart").value = "14:00"; $("#postEnd").value = "16:00";
  } else if (example === "repair") {
    $("#postTitle").value = "想亲手修好一把旧椅子，体验过去的木工";
    $("#postDescription").value = "维修机器人能很快修好这把靠背松动的木椅，但我想亲自试试。希望和会木工的人一起修，学习看木纹、打磨和基础维修，感受过去的人让旧物继续使用的过程。";
    selectedCategories = ["旧物新生"]; $("#postLocation").value = "other"; $("#locationOther").value = "公共集合点待确认"; $("#postWeekday").value = "0"; $("#postStart").value = "09:00"; $("#postEnd").value = "11:00";
  } else {
    $("#postTitle").value = "分享手机摄影，记录自动化街区的日常";
    $("#postDescription").value = "自动影像系统已经能记录整座城市，我仍想和大家亲自选择值得拍下的瞬间。可以教手机摄影和简单修图，也希望听你分享照片背后的社区故事；具体交流方式可先商量。";
    selectedCategories = ["数码互助", "社区生活"]; $("#postLocation").value = "negotiable";
  }
  $("#timeMode").value = example === "photo" ? "negotiable" : "weekly";
  renderCategories(); syncType(); updateErrors(); $("#postTitle").focus();
}
function clearMapLocation() {
  for (const id of ["locationName", "locationLng", "locationLat", "publicPlaceConfirmed"]) $("#" + id).value = "";
  $("#pickedMapLocation").textContent = "还未选择公共集合点。";
}
function openCreate() {
  editingPostId = null;
  createForm.reset(); selectedCategories = []; categoryError = ""; formAttempted = false;
  clearMapLocation();
  $(".form-examples").open = false;
  $("#profileRole").value = typeof profile.role === "string" ? profile.role : ""; $("#profileAge").value = Number.isInteger(profile.age) ? profile.age : "";
  $("#agePublic").checked = profile.agePublic === true; $("#profileSummary").textContent = profile.role || "社区成员"; $("#profileSection").open = false;
  $("#publishButton").textContent = "发布并寻找匹配";
  renderCategories(); syncType(); updateErrors(); openDialog(createDialog); $("#postTitle").focus();
}
function openEdit(post) {
  if (!isMine(post)) return;
  editingPostId = post.id; formAttempted = false; categoryError = "";
  createForm.reset(); clearMapLocation();
  createForm.querySelector(`input[name="type"][value="${post.type}"]`).checked = true;
  selectedCategories = [...(post.categories || [post.category])];
  syncType();
  $("#postTitle").value = post.title;
  $("#postDescription").value = post.description;
  const schedule = normalizeSchedule(post.schedule);
  $("#timeMode").value = schedule?.mode || "";
  $("#postDate").value = schedule?.date || "";
  $("#postWeekday").value = schedule?.days?.[0] ?? "";
  $("#postStart").value = schedule?.start || "";
  $("#postEnd").value = schedule?.end || "";
  if (post.locationPoint) {
    $("#postLocation").value = "map";
    $("#locationName").value = post.location;
    $("#locationLng").value = String(post.locationPoint.lng);
    $("#locationLat").value = String(post.locationPoint.lat);
    $("#publicPlaceConfirmed").value = "yes";
    $("#pickedMapLocation").textContent = `已选公共集合点：${post.location}`;
    $("#mapFirstStep").value = post.firstStep || "";
  } else if (post.location === "地点可协商" && post.type === "offer") $("#postLocation").value = "negotiable";
  else { $("#postLocation").value = "other"; $("#locationOther").value = post.location; }
  const participant = post.participantSettings || { mode: "negotiable" };
  $("#participantMode").value = participant.mode || "negotiable";
  $("#participantCount").value = participant.count || "";
  $("#participantMin").value = participant.min || "";
  $("#participantMax").value = participant.max || "";
  $("#profileRole").value = post.role || "";
  $("#profileAge").value = /^\d+岁$/.test(post.age || "") ? post.age.slice(0, -1) : "";
  $("#agePublic").checked = Boolean(post.age);
  $("#profileSummary").textContent = post.role || "社区成员";
  $("#profileSection").open = false;
  $("#publishButton").textContent = "保存修改";
  renderCategories(); syncConditionalFields(); updateErrors();
  if (detailDialog.open) closeDialog(detailDialog);
  openDialog(createDialog); $("#postTitle").focus();
}
function confirmDelete(post) {
  if (!isMine(post)) return;
  deletingPostId = post.id;
  $("#deletePostTitle").textContent = post.title;
  if (detailDialog.open) closeDialog(detailDialog);
  openDialog(deleteDialog);
}
function showDetail(post) {
  currentDetail = post; $("#detailTitle").textContent = post.title;
  $("#detailContent").innerHTML = `<div class="detail-person">${avatar(post)}<div><strong>${escapeHtml(post.name || "我")}</strong><small>${escapeHtml(personLine(post))} · <span data-published-id="${escapeHtml(post.id)}">${escapeHtml(formatPublished(post))}</span></small></div></div>
    <p class="detail-description">${escapeHtml(post.description)}</p>${post.firstStep ? `<p class="detail-first-step"><strong>见面后先做：</strong>${escapeHtml(post.firstStep)}</p>` : ""}<div class="post-tags">${tagHtml(post)}</div>
    <div class="detail-grid"><div><span>${post.type === "offer" ? "可以分享" : "可以带来"}</span><strong>${escapeHtml(post.offer || "愿意一起参与")}</strong></div><div><span>希望获得${hasAINeed(post) ? '<small class="need-source">AI 提炼</small>' : ""}</span><strong>${escapeHtml(post.need || "未说明")}</strong></div></div>
    <div class="detail-info"><span>${icon("place")}${escapeHtml(post.demoMap ? "学军紫金港附近 · 随机示意点" : post.location || "地点待确认")}</span><span>${icon("time")}${escapeHtml(displayTime(post))}</span><span>参与人数：${escapeHtml(post.participants || "协商决定")}</span></div><p class="detail-footnote">${post.demoMap ? "内置任务是虚构演示，位置随机，并非真实约见点。" : "未来生活演示 · 参与意向仅保存在当前浏览器，不会发送给真实用户。"}</p>`;
  const mine = isMine(post); $("#interestButton").hidden = mine; $("#interestButton").disabled = false;
  $("#interestButton").textContent = interestedIds.has(post.id) ? "取消参与意向" : "我想参与";
  $("#detailMatchButton").hidden = !mine; $("#detailMatchButton").textContent = cachedMatch(post) ? "查看上次匹配" : "寻找匹配";
  $("#detailEditButton").hidden = !mine;
  $("#detailDeleteButton").hidden = !mine;
  $("#detailTimeButton").hidden = !mine;
  $("#detailNeedButton").hidden = !mine || post.type !== "offer";
  openDialog(detailDialog);
}
const fallbackMessages = {
  unconfigured: "未配置 AI，使用主题、供需和时间地点的本地规则", timeout: "AI 响应超时，已切换本地规则",
  upstream: "AI 服务暂不可用，已切换本地规则", invalid_response: "AI 返回内容无效，已切换本地规则", network: "未连接到匹配服务，使用浏览器中的本地规则",
  version_mismatch: "已使用最新的本地内容匹配", invalid_match_data: "返回资料不完整，已使用本地内容匹配"
};
function validMatchData(data) {
  const validEntry = (entry) => entry && typeof entry.id === "string" && Number.isFinite(entry.score) && entry.score >= 0 && entry.score <= 100 && typeof entry.reason === "string" && typeof entry.first_step === "string";
  return data && ["ai", "local"].includes(data.source) && Array.isArray(data.matches) && data.matches.every(validEntry)
    && (data.additionalMatches === undefined || (Array.isArray(data.additionalMatches) && data.additionalMatches.every(validEntry)))
    && (data.summary === undefined || (data.summary && Array.isArray(data.summary.timeConflicts)));
}
function cachedMatch(post) {
  const data = matchState.byPost[post.id];
  return validMatchData(data) && data.algorithmVersion === MATCH_VERSION && data.inputFingerprint === matchFingerprint(post) && data.postId === post.id ? data : null;
}
function renderMatchList() {
  const data = displayedMatchData;
  const mainIds = new Set(data.matches.map((entry) => entry.id));
  const primary = displayedMatches.filter((entry) => mainIds.has(entry.id));
  const collapsed = primary.slice(0, 3);
  const extraCount = displayedMatches.length - collapsed.length;
  const visible = matchesExpanded ? displayedMatches : collapsed;
  let emptyMessage = "当前资料里还未找到适合一起体验的伙伴，可以补充想尝试的事，或浏览其他生活体验。";
  if (data.source === "ai" && displayedMatches.length) emptyMessage = "AI 本次未推荐人选。点击上方“展开其他候选”，查看本地内容候选并进一步确认。";
  else if (data.summary?.emptyReason === "time_conflict") emptyMessage = "有内容相关的人，但与你填写的时间冲突。可调整活动时间后重新匹配。";
  else if (data.summary?.emptyReason === "no_candidates") emptyMessage = "社区资料暂未载入，刷新后可以重新匹配。";
  $("#matchList").innerHTML = visible.length ? visible.map(({ post, score, reason, first_step, source }) => `<article class="match-card"><div class="match-card-top">${avatar(post)}<strong>${escapeHtml(post.name)}</strong><em>参考分 ${Math.round(score)}</em></div>${data.source === "ai" && source === "local" ? '<span class="candidate-source">本地内容匹配</span>' : ""}<h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(reason)}</p><div class="match-first-step"><strong>建议的第一步</strong>${escapeHtml(first_step)}</div><button type="button" data-match-id="${escapeHtml(post.id)}">了解这次体验 →</button></article>`).join("") : `<p class="match-empty">${escapeHtml(emptyMessage)}</p>`;
  const more = $("#moreMatches");
  more.hidden = extraCount === 0;
  more.textContent = matchesExpanded ? "收起其他候选" : `展开其他候选（${extraCount}）`;
  more.setAttribute("aria-expanded", String(matchesExpanded));
  const extraHint = extraCount ? matchesExpanded ? `；已展开 ${extraCount} 个其他候选` : `；另有 ${extraCount} 个候选可展开查看` : "";
  const explanation = data.source === "ai" ? `AI 整理推荐${extraHint}，时间地点仍需双方确认` : fallbackMessages[data.fallbackReason] || "优先比较实际需求与帮助，标签仅作辅助";
  $("#matchSourceDetail").textContent = `${explanation}${data.savedAt ? ` · 生成于 ${new Date(data.savedAt).toLocaleString("zh-CN")}` : ""}`;
}
function renderMatches(data) {
  displayedMatchData = data;
  matchesExpanded = false;
  const used = new Set();
  displayedMatches = [...data.matches, ...(data.additionalMatches || [])].map((entry) => {
    const fromApi = entry.candidate;
    const post = seedPosts.find((post) => post.id === entry.id) || (fromApi?.id === entry.id && typeof fromApi.title === "string" ? fromApi : null);
    return { ...entry, source: entry.source || data.source, post };
  }).filter((entry) => {
    if (!entry.post || used.has(entry.id)) return false;
    used.add(entry.id); return true;
  });
  $("#matchLoading").hidden = true; $("#matchWelcome").hidden = true; $("#matchResults").hidden = false; $("#matchingPostTitle").textContent = matchingPost.title;
  $("#matchingPostConditions").textContent = `${displayTime(matchingPost)} · ${data.criteria?.location || matchingPost.location || "地点待确认"}`;
  const source = $("#matchSource"); source.textContent = data.source === "ai" ? "AI 匹配" : "本地规则匹配"; source.classList.toggle("local", data.source !== "ai");
  const conflicts = Array.isArray(data.summary?.timeConflicts) ? data.summary.timeConflicts : [];
  $("#matchDiagnostics").textContent = conflicts.length ? `以下发布与你的时间（${displayTime(matchingPost)}）不重合：${conflicts.map((item) => `${item.name || "社区成员"}（${item.time || "时间待确认"}）`).join("；")}。` : "";
  $("#matchDiagnostics").hidden = conflicts.length === 0;
  renderMatchList();
}
function cancelMatch() { matchVersion++; matchController?.abort(); matchController = null; }
function restoreMatch(post) {
  const data = cachedMatch(post); if (!data) return false;
  cancelMatch(); matchingPost = post; matchState.lastPostId = post.id; save(storageMatches, matchState); renderMatches(data); return true;
}
async function runMatch(post, { keepMap = false } = {}) {
  if (!keepMap) mapView.showFeed();
  cancelMatch(); const version = matchVersion; const controller = new AbortController(); matchController = controller;
  const timer = setTimeout(() => controller.abort(), 22000); matchingPost = post; matchState.lastPostId = post.id; save(storageMatches, matchState);
  $("#matchWelcome").hidden = true; $("#matchResults").hidden = true; $("#matchLoading").hidden = false; if (!keepMap) $("#matchPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  let data;
  try {
    const response = await fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ post }), signal: controller.signal });
    if (!response.ok) throw new Error("match_failed"); data = await response.json(); if (!validMatchData(data)) throw new Error("invalid_match_data");
    if (data.algorithmVersion !== MATCH_VERSION || data.inputFingerprint !== matchFingerprint(post) || data.postId !== post.id) throw new Error("version_mismatch");
  } catch (error) {
    if (version !== matchVersion) return;
    data = { ...matchPost(post, seedPosts), postId: post.id, inputFingerprint: matchFingerprint(post), source: "local", fallbackReason: ["version_mismatch", "invalid_match_data"].includes(error.message) ? error.message : "network" };
  }
  finally { clearTimeout(timer); if (matchController === controller) matchController = null; }
  if (version !== matchVersion) return;
  data.savedAt = new Date().toISOString(); matchState.byPost[post.id] = data; save(storageMatches, matchState); renderMatches(data);
}

$("#openCreateTop").addEventListener("click", openCreate);
$("#emptyCreate").addEventListener("click", openCreate);
document.querySelectorAll("[data-example]").forEach((button) => button.addEventListener("click", () => fillExample(button.dataset.example)));
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => closeDialog($("#" + button.dataset.close))));
$("#addCategory").addEventListener("click", addCategory);
$("#openLocationPicker").addEventListener("click", () => { closeDialog(createDialog); openDialog(locationPickerDialog); realMap.preparePicker(); });
$("#selectedCategories").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-category]"); if (button) { selectedCategories.splice(Number(button.dataset.removeCategory), 1); categoryError = ""; renderCategories(); updateErrors(); }
});
createForm.addEventListener("change", (event) => { if (event.target.name === "type") syncType(); else syncConditionalFields(); categoryError = ""; updateErrors(); });
createForm.addEventListener("input", () => { categoryError = ""; if (formAttempted) updateErrors(); });
$("#searchInput").addEventListener("input", renderPosts);
document.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => setFilter(button.dataset.filter)));
$("#myPostsButton").addEventListener("click", () => { mapView.showFeed(); $("#searchInput").value = ""; setFilter("mine"); $("#feedTitle").scrollIntoView({ behavior: "smooth", block: "start" }); });
postList.addEventListener("click", (event) => { const button = event.target.closest("[data-post-id]"); if (button) { const post = allPosts().find((item) => item.id === button.dataset.postId); if (post) showDetail(post); } });
$("#matchList").addEventListener("click", (event) => { const button = event.target.closest("[data-match-id]"); if (button) { const post = displayedMatches.find((item) => item.id === button.dataset.matchId)?.post; if (post) showDetail(post); } });
$("#moreMatches").addEventListener("click", () => { matchesExpanded = !matchesExpanded; renderMatchList(); });
$("#interestButton").addEventListener("click", () => {
  if (!currentDetail || isMine(currentDetail)) return; const cancelling = interestedIds.has(currentDetail.id);
  if (cancelling) interestedIds.delete(currentDetail.id); else interestedIds.add(currentDetail.id); save(storageInterest, [...interestedIds]);
  $("#interestButton").textContent = cancelling ? "我想参与" : "取消参与意向"; realMap.render(); showToast(cancelling ? "已取消参与意向，可以随时再次参与。" : "已记录参与意向，可随时取消。");
});
$("#detailMatchButton").addEventListener("click", () => { if (!currentDetail || !isMine(currentDetail)) return; const post = currentDetail; closeDialog(detailDialog); mapView.showFeed(); if (restoreMatch(post)) $("#matchPanel").scrollIntoView({ behavior: "smooth", block: "start" }); else runMatch(post); });
$("#detailEditButton").addEventListener("click", () => { if (currentDetail) openEdit(currentDetail); });
$("#detailDeleteButton").addEventListener("click", () => { if (currentDetail) confirmDelete(currentDetail); });
$("#confirmDeleteButton").addEventListener("click", () => {
  const id = deletingPostId;
  if (!id || !myPosts.some((post) => post.id === id)) return;
  myPosts = myPosts.filter((post) => post.id !== id);
  interestedIds.delete(id);
  delete matchState.byPost[id];
  if (matchState.lastPostId === id || matchingPost?.id === id) {
    cancelMatch(); matchState.lastPostId = null; matchingPost = null;
    $("#matchResults").hidden = true; $("#matchLoading").hidden = true; $("#matchWelcome").hidden = false;
  }
  save(storagePosts, myPosts); save(storageInterest, [...interestedIds]); save(storageMatches, matchState);
  currentDetail = null; deletingPostId = null; closeDialog(deleteDialog);
  renderPosts(); showToast("已从本机删除这条发布。");
});
deleteDialog.addEventListener("close", () => { deletingPostId = null; });
$("#rerunMatch").addEventListener("click", () => { if (matchingPost) runMatch(matchingPost); });
$("#editMatchTime").addEventListener("click", () => { if (matchingPost) openSchedule(matchingPost); });
$("#detailTimeButton").addEventListener("click", () => { if (currentDetail && isMine(currentDetail)) { const post = currentDetail; closeDialog(detailDialog); openSchedule(post); } });
$("#detailNeedButton").addEventListener("click", () => { if (currentDetail && isMine(currentDetail) && currentDetail.type === "offer") { const post = currentDetail; closeDialog(detailDialog); openNeedEditor({ kind: "edit", post }); } });
$("#resetDemo").addEventListener("click", () => {
  cancelMatch(); myPosts = []; interestedIds = new Set(); matchingPost = null; currentDetail = null; profile = {}; matchState = { byPost: {} };
  displayedMatchData = null; displayedMatches = []; matchesExpanded = false;
  for (const [key, value] of [[storagePosts, []], [storageInterest, []], [storageProfile, {}], [storageMatches, matchState]]) save(key, value);
  $("#searchInput").value = ""; $("#matchResults").hidden = true; $("#matchLoading").hidden = true; $("#matchWelcome").hidden = false;
  setFilter("all"); window.scrollTo({ top: 0, behavior: "smooth" }); showToast("演示内容、资料和匹配记录已重置。");
});
function publishDraft(data, nextProfile) {
  const post = { ...data, id: `mine-${crypto.randomUUID()}`, name: "我", avatar: "我", color: "self", createdAt: new Date().toISOString() };
  myPosts.unshift(post); profile = nextProfile; save(storageProfile, profile); save(storagePosts, myPosts); closeDialog(createDialog);
  $("#searchInput").value = ""; setFilter("all");
  if (post.locationPoint) {
    mapView.showMap();
    showToast("已发布到真实地图；集合点可见，参与意向仍只保存在本机。");
    runMatch(post, { keepMap: true });
  } else {
    mapView.showFeed(); showToast("想法已发布！正在寻找一起探索的伙伴。"); runMatch(post);
  }
}
function saveEditedDraft(data, nextProfile) {
  const index = myPosts.findIndex((post) => post.id === editingPostId);
  if (index < 0) { showToast("找不到要修改的发布，请刷新后重试。"); return; }
  const previous = myPosts[index];
  const sameOffer = data.type === "offer" && previous.type === "offer" && previous.title === data.title && previous.description === data.description;
  const post = {
    ...previous, ...data,
    need: sameOffer ? previous.need || "" : data.need,
    ...(sameOffer && previous.needSummary ? { needSummary: previous.needSummary } : { needSummary: undefined }),
    ...(data.locationPoint ? {} : { locationPoint: undefined, firstStep: undefined })
  };
  myPosts[index] = post;
  profile = nextProfile;
  save(storageProfile, profile); save(storagePosts, myPosts);
  delete matchState.byPost[post.id]; save(storageMatches, matchState);
  editingPostId = null; closeDialog(createDialog);
  const keepMap = !$("#neighborhoodMap").hidden;
  renderPosts(); showToast("修改已保存，地图与匹配正在更新。");
  runMatch(post, { keepMap });
}
createForm.addEventListener("submit", (event) => {
  event.preventDefault(); formAttempted = true; if ($("#categoryPicker").value && !addCategory()) { updateErrors(true); return; }
  const { data, profile: nextProfile, errors } = updateErrors(true); if (Object.keys(errors).length) return;
  if (editingPostId) { saveEditedDraft(data, nextProfile); return; }
  if (data.type === "offer") { closeDialog(createDialog); openNeedEditor({ kind: "create", post: data, profile: nextProfile }); }
  else publishDraft(data, nextProfile);
});
async function init() {
  if (hadLegacyNeeds) save(storagePosts, myPosts);
  try { const response = await fetch("/data.json"); if (!response.ok) throw new Error("data_failed"); const data = await response.json(); if (!Array.isArray(data)) throw new Error("data_failed"); seedPosts = data; mapDemoPosts = placeDemoPosts(data); }
  catch { showToast("未来生活示例载入失败，你的发布仍可查看，请刷新重试。"); }
  renderPosts(); const lastPost = myPosts.find((post) => post.id === matchState.lastPostId); if (lastPost && !restoreMatch(lastPost)) runMatch(lastPost);
}
setInterval(refreshPublished, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPublished(); });
init();
