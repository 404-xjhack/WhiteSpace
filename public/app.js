const $ = (selector) => document.querySelector(selector);
const postList = $("#postList");
const createDialog = $("#createDialog");
const detailDialog = $("#detailDialog");
const createForm = $("#createForm");
const toast = $("#toast");
const storagePosts = "writespace.posts.v1";
const storageInterest = "writespace.interest.v1";

let seedPosts = [];
let myPosts = readSaved(storagePosts, []);
let interestedIds = new Set(readSaved(storageInterest, []));
let filter = "all";
let currentDetail = null;
let matchingPost = null;
let toastTimer;

function readSaved(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { showToast("浏览器暂时无法保存，当前页面仍可继续体验。 "); }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3300);
}
function allPosts() { return [...myPosts, ...seedPosts]; }
function personLine(post) { return post.id.startsWith("mine-") ? "由你发布" : `${post.role} · ${post.age}`; }
function avatar(post) { return `<span class="avatar ${escapeHtml(post.color || "self")}" aria-hidden="true">${escapeHtml(post.avatar || "我")}</span>`; }
function icon(kind) {
  return kind === "place" ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
}

function renderPosts() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const visible = allPosts().filter((post) => {
    const matchesFilter = filter === "all" || (filter === "mine" ? post.id.startsWith("mine-") : post.type === filter);
    const content = `${post.title} ${post.description} ${post.category} ${post.location} ${(post.tags || []).join(" ")}`.toLowerCase();
    return matchesFilter && (!query || content.includes(query));
  });
  $("#resultCount").textContent = `${visible.length} 条内容`;
  $("#myPostCount").textContent = String(myPosts.length);
  $("#myPostCount").hidden = myPosts.length === 0;
  postList.innerHTML = visible.map((post) => `<article class="post-card">
    <div class="post-meta">${avatar(post)}<div class="author-lines"><strong>${escapeHtml(post.name)} <span class="type-label ${post.type === "need" ? "need" : ""}">${post.type === "need" ? "想找人" : "我能帮忙"}</span></strong><span>${escapeHtml(personLine(post))}</span></div><span class="post-age">${escapeHtml(post.published)}</span></div>
    <h3>${escapeHtml(post.title)}</h3><p class="post-description">${escapeHtml(post.description)}</p>
    <div class="post-tags">${(post.tags || [post.category]).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    <div class="post-footer"><span class="post-foot-item">${icon("place")}${escapeHtml(post.location)}</span><span class="post-foot-item">${icon("time")}${escapeHtml(post.time)}</span><button type="button" class="post-card-action" data-post-id="${escapeHtml(post.id)}">查看详情 →</button></div>
  </article>`).join("");
  $("#emptyState").hidden = visible.length > 0;
}

function setFilter(next) {
  filter = next;
  document.querySelectorAll(".filter-chip").forEach((button) => {
    const active = button.dataset.filter === next;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderPosts();
}

function openCreate(example) {
  $("#formError").hidden = true;
  if (example === "food") {
    createForm.reset();
    $("#postTitle").value = "想带孩子体验手工包饺子";
    $("#postDescription").value = "孩子很好奇以前的人怎么一起做饭。想找愿意教手工包饺子的邻居；我会准备材料并全程陪同，也愿意一起听老故事。";
    $("#postTime").value = "周六下午";
    $("#postLocation").value = "春和社区活动室";
    $("#postCategory").value = "亲子共学";
  } else if (example === "repair") {
    createForm.reset();
    $("#postTitle").value = "想找人一起修好一把旧椅子";
    $("#postDescription").value = "家里有把用了很多年的木椅，靠背松了。不想直接扔掉，希望和会木工的邻居一起修，也想学一点基础维修。";
    $("#postTime").value = "周日上午";
    $("#postLocation").value = "社区共享工坊";
    $("#postCategory").value = "旧物新生";
  } else createForm.reset();
  createDialog.showModal();
  setTimeout(() => $("#postTitle").focus(), 40);
}

function showDetail(post) {
  currentDetail = post;
  $("#detailTitle").textContent = post.title;
  $("#detailContent").innerHTML = `<div class="detail-person">${avatar(post)}<div><strong>${escapeHtml(post.name)}</strong><small>${escapeHtml(personLine(post))} · ${escapeHtml(post.published)}</small></div></div>
    <p class="detail-description">${escapeHtml(post.description)}</p>
    <div class="detail-grid"><div><span>可以带来</span><strong>${escapeHtml(post.offer || "愿意一起参与")}</strong></div><div><span>希望获得</span><strong>${escapeHtml(post.need || "一起把这件事做好")}</strong></div></div>
    <div class="detail-info"><span>${icon("place")}${escapeHtml(post.location)}</span><span>${icon("time")}${escapeHtml(post.time)}</span><span>参与人数：${escapeHtml(post.participants || "协商决定")}</span></div>
    <p class="detail-footnote">演示资料 · 参与意向仅保存在当前浏览器，不会发送给真实用户。</p>`;
  const button = $("#interestButton");
  const mine = post.id.startsWith("mine-");
  const alreadyInterested = interestedIds.has(post.id);
  button.disabled = true;
  button.textContent = mine ? "这是我的发布" : alreadyInterested ? "已表达意向" : "我想参与";
  detailDialog.showModal();
  if (!mine && !alreadyInterested) setTimeout(() => { if (detailDialog.open && currentDetail?.id === post.id) button.disabled = false; }, 180);
}

function renderMatches(data) {
  const matches = data.matches.map((entry) => ({ ...entry, post: seedPosts.find((post) => post.id === entry.id) })).filter((entry) => entry.post);
  $("#matchLoading").hidden = true;
  $("#matchWelcome").hidden = true;
  $("#matchResults").hidden = false;
  $("#matchingPostTitle").textContent = matchingPost.title;
  const source = $("#matchSource");
  source.textContent = data.source === "ai" ? "AI 匹配" : "本地规则匹配";
  source.classList.toggle("local", data.source !== "ai");
  $("#matchSourceDetail").textContent = data.source === "ai" ? "匹配理由由 AI 生成，见面前仍需双方确认" : "AI 暂不可用，按类别和供需关系生成建议";
  $("#matchList").innerHTML = matches.length ? matches.map(({ post, score, reason, first_step }) => `<article class="match-card"><div class="match-card-top">${avatar(post)}<strong>${escapeHtml(post.name)}</strong><em>参考分 ${Math.round(score)}</em></div><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(reason)}</p><div class="match-first-step"><strong>建议的第一步</strong>${escapeHtml(first_step)}</div><button type="button" data-match-id="${escapeHtml(post.id)}">了解这个人 →</button></article>`).join("") : '<p class="match-empty">还没有足够合适的人。试着写得更具体，或过几天再看看。</p>';
}

async function runMatch(post) {
  matchingPost = post;
  $("#matchWelcome").hidden = true;
  $("#matchResults").hidden = true;
  $("#matchLoading").hidden = false;
  $("#matchPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const response = await fetch("/api/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ post }) });
    if (!response.ok) throw new Error("match_failed");
    renderMatches(await response.json());
  } catch {
    $("#matchLoading").hidden = true;
    $("#matchResults").hidden = false;
    $("#matchingPostTitle").textContent = matchingPost.title;
    $("#matchSource").textContent = "匹配暂不可用";
    $("#matchSource").classList.add("local");
    $("#matchSourceDetail").textContent = "没有取得匹配结果，点击上方“重新匹配”再试。";
    $("#matchList").innerHTML = '<p class="match-empty">这次没有连接成功。你的发布已保存在浏览器，可以随时重试。</p>';
    showToast("匹配服务暂时不可用，你可以重新匹配。 ");
  }
}

document.querySelectorAll("#openCreateTop,#openCreateIntro,#openCreatePanel,#emptyCreate").forEach((button) => button.addEventListener("click", () => openCreate()));
document.querySelectorAll("[data-example]").forEach((button) => button.addEventListener("click", () => openCreate(button.dataset.example)));
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $("#" + button.dataset.close).close()));
$("#searchInput").addEventListener("input", renderPosts);
document.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => setFilter(button.dataset.filter)));
$("#myPostsButton").addEventListener("click", () => { setFilter("mine"); $("#feedTitle").scrollIntoView({ behavior: "smooth", block: "start" }); });
postList.addEventListener("click", (event) => { const button = event.target.closest("[data-post-id]"); if (button) { const post = allPosts().find((item) => item.id === button.dataset.postId); if (post) showDetail(post); } });
$("#matchList").addEventListener("click", (event) => { const button = event.target.closest("[data-match-id]"); if (button) { const post = seedPosts.find((item) => item.id === button.dataset.matchId); if (post) showDetail(post); } });
$("#interestButton").addEventListener("click", () => {
  if (!currentDetail || currentDetail.id.startsWith("mine-")) return;
  interestedIds.add(currentDetail.id);
  save(storageInterest, [...interestedIds]);
  detailDialog.close();
  showToast("已记录参与意向。正式上线后，这一步会等待双方确认。 ");
});
$("#rerunMatch").addEventListener("click", () => { if (matchingPost) runMatch(matchingPost); });
$("#resetDemo").addEventListener("click", () => {
  myPosts = [];
  interestedIds = new Set();
  matchingPost = null;
  save(storagePosts, []);
  save(storageInterest, []);
  $("#searchInput").value = "";
  $("#matchResults").hidden = true;
  $("#matchLoading").hidden = true;
  $("#matchWelcome").hidden = false;
  setFilter("all");
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast("演示内容已重置。 ");
});

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(createForm));
  const title = String(values.title || "").trim();
  const description = String(values.description || "").trim();
  const time = String(values.time || "").trim();
  const location = String(values.location || "").trim();
  const error = $("#formError");
  if (title.length < 3 || description.length < 5 || !time || !location) {
    error.textContent = "请补全标题、具体说明、时间和地点，再发布。";
    error.hidden = false;
    return;
  }
  error.hidden = true;
  const post = {
    id: `mine-${Date.now()}`, name: "我", age: "", avatar: "我", color: "self", role: "社区成员",
    type: values.type === "offer" ? "offer" : "need", category: String(values.category || "社区生活"),
    title, description, time, location, offer: values.type === "offer" ? title : "一起参与、提供自己的时间和经验",
    need: values.type === "offer" ? "有人愿意一起参与" : title, participants: "协商决定", tags: [String(values.category || "社区生活")], published: "刚刚"
  };
  myPosts.unshift(post);
  save(storagePosts, myPosts);
  createDialog.close();
  setFilter("all");
  showToast("发布成功！正在寻找适合一起做的人。 ");
  await runMatch(post);
});

async function init() {
  try {
    const response = await fetch("/data.json");
    if (!response.ok) throw new Error("data_failed");
    seedPosts = await response.json();
    renderPosts();
  } catch {
    $("#emptyState").hidden = false;
    showToast("示例社区内容载入失败，请刷新页面。 ");
  }
}
init();
