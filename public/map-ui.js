import { mapNodes, mapPlaces, mapStarts, placeForLocation, walkingRoute, rankedMissions } from "./neighborhood.js";

const $ = (selector) => document.querySelector(selector);
const pointStyle = (node) => {
  const [x, y] = mapNodes[node];
  return `left:${x / 10}%;top:${y / 6.2}%`;
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function initNeighborhood({ getPosts, showDetail, isInterested, toggleInterest }) {
  const section = $("#neighborhoodMap");
  const shell = $(".page-shell");
  const toggle = $("#mapToggle");
  const startControl = $("#mapStart");
  const interestControl = $("#mapInterest");
  let selectedId = null;
  let heatVisible = false;

  function showMap() {
    section.hidden = false;
    $(".main-grid").hidden = true;
    $(".page-intro").hidden = true;
    shell.classList.add("map-active");
    toggle.textContent = "返回列表";
    toggle.setAttribute("aria-expanded", "true");
    render();
  }
  function showFeed() {
    section.hidden = true;
    $(".main-grid").hidden = false;
    $(".page-intro").hidden = false;
    shell.classList.remove("map-active");
    toggle.textContent = "街区地图";
    toggle.setAttribute("aria-expanded", "false");
  }

  function render() {
    const start = startControl.value;
    const interest = interestControl.value;
    const posts = rankedMissions(getPosts(), start, interest);
    if (!posts.some((post) => post.id === selectedId)) selectedId = posts[0]?.id || null;
    const selected = posts.find((post) => post.id === selectedId);
    const selectedPlace = selected && placeForLocation(selected.location);
    $("#mapSelectedPlace").textContent = selectedPlace ? `当前任务 · ${selectedPlace.name}` : "当前没有可定位的任务";
    const route = selectedPlace && walkingRoute(start, selectedPlace.node);
    const points = route?.points.map(([x, y]) => `${x},${y}`).join(" ") || "";
    $("#mapRoute").setAttribute("points", points);
    $("#mapRouteHalo").setAttribute("points", points);
    $("#mapYou").style.cssText = pointStyle(start);
    $("#mapYou").setAttribute("aria-label", `你的出发点：${mapStarts.find((item) => item.id === start)?.name}`);

    const byPlace = mapPlaces.map((place) => ({ ...place, posts: posts.filter((post) => post.location === place.name) })).filter((place) => place.posts.length);
    $("#mapMarkers").innerHTML = byPlace.map((place) => `<button type="button" class="map-marker ${place.id === selectedPlace?.id ? "is-selected" : ""}" style="${pointStyle(place.node)}" data-place="${place.id}" aria-label="${escapeHtml(place.name)}，${place.posts.length} 件可参与的事"><span class="marker-dot">${place.posts.length}</span><span class="marker-name">${escapeHtml(place.name.replace("春和社区", "社区"))}</span></button>`).join("");
    $("#mapHeat").innerHTML = heatVisible ? byPlace.map((place) => `<span class="heat-spot" style="${pointStyle(place.node)};--heat-size:${70 + place.posts.length * 40}px"></span>`).join("") : "";
    $("#mapHeatToggle").textContent = heatVisible ? "关闭任务热度" : "查看任务热度";
    $("#mapHeatToggle").setAttribute("aria-pressed", String(heatVisible));

    $("#mapMissionCount").textContent = `${posts.length} 件有公开地点`;
    $("#mapMissionList").innerHTML = posts.filter((post) => post.id !== selectedId).map((post) => {
      const walk = walkingRoute(start, placeForLocation(post.location).node);
      return `<button class="mission-list-item" type="button" data-mission="${escapeHtml(post.id)}"><span>${escapeHtml(post.name || "我")} · ${escapeHtml(post.type === "offer" ? "愿意分享" : "想去体验")}</span><strong>${escapeHtml(post.title)}</strong><small>步行约 ${walk.minutes} 分钟 · ${escapeHtml(post.location)}</small></button>`;
    }).join("") || '<p class="mission-empty">目前没有其他标注了公共地点的体验。</p>';

    if (!selected || !route) {
      $("#mapMission").innerHTML = '<p class="mission-empty">还没有标注公开地点的体验。你仍可以在列表中浏览或发布想法。</p>';
      return;
    }
    const mine = selected.id.startsWith("mine-");
    const joined = isInterested(selected.id);
    const reason = interest === "all" ? "这是一件从当前出发点可以步行到达的事。" : "与你选择的体验方向相关，也能从当前出发点步行到达。";
    $("#mapMission").innerHTML = `<div class="mission-person"><span class="mission-avatar">${escapeHtml(selected.avatar || "我")}</span><span>${escapeHtml(selected.name || "我")} · ${escapeHtml(selected.type === "offer" ? "愿意分享" : "想去体验")}</span></div>
      <h4>${escapeHtml(selected.title)}</h4>
      <p class="mission-reason">${reason}</p>
      <div class="mission-route"><span>从 ${escapeHtml(mapStarts.find((item) => item.id === start)?.name)} 出发</span><strong>步行约 ${route.minutes} 分钟 <small>· ${route.meters} 米</small></strong><span>到 ${escapeHtml(selected.location)}</span></div>
      <p class="mission-when">${escapeHtml(selected.time || "时间待确认")} · 先表达意向，再与对方确认</p>
      <div class="mission-actions"><button class="primary-button" id="mapJoin" type="button">${mine ? "查看我的发布" : joined ? "取消参与意向" : "表达参与意向"}</button><button class="ghost-button" id="mapDetail" type="button">查看完整说明</button></div>
      <p class="mission-safety">演示中的意向只保存在本机，不会发送给真实邻居。地点与路线不是实时导航。</p>`;
    $("#mapJoin").addEventListener("click", () => mine ? showDetail(selected) : toggleInterest(selected));
    $("#mapDetail").addEventListener("click", () => showDetail(selected));
  }

  toggle.addEventListener("click", () => section.hidden ? showMap() : showFeed());
  startControl.addEventListener("change", render);
  interestControl.addEventListener("change", () => { selectedId = null; render(); });
  $("#mapSuggest").addEventListener("click", () => {
    selectedId = rankedMissions(getPosts(), startControl.value, interestControl.value)[0]?.id || null;
    render();
    $("#missionTitle").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $("#mapHeatToggle").addEventListener("click", () => { heatVisible = !heatVisible; render(); });
  $("#mapMarkers").addEventListener("click", (event) => {
    const marker = event.target.closest("[data-place]");
    if (!marker) return;
    const posts = rankedMissions(getPosts(), startControl.value, interestControl.value).filter((post) => placeForLocation(post.location)?.id === marker.dataset.place);
    const current = posts.findIndex((post) => post.id === selectedId);
    selectedId = posts[(current + 1) % posts.length]?.id || null;
    render();
    if (window.matchMedia("(max-width: 760px)").matches) $("#missionTitle").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#mapMissionList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-mission]");
    if (button) { selectedId = button.dataset.mission; render(); }
  });
  return { render, showMap, showFeed };
}
