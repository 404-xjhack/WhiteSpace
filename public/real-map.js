import { normalizeLocationPoint } from "./model.js";
import { gpsToAmapPoint } from "./coordinates.js";
import { DEMO_MAP_CENTER } from "./demo-map.js";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const coordinates = (point) => [point.lng, point.lat];
const mapLocation = (post) => post.demoMap ? "学军紫金港附近 · 随机示意点" : post.location;
const taskPinIcon = {
  need: '<path d="M36 46 25.5 36.5c-8.5-7.7 1.5-17.5 10.5-8 9-9.5 19 0.3 10.5 8L36 46Z" fill="currentColor"/>',
  offer: '<path d="m36 22 3.1 8.9L48 34l-8.9 3.1L36 46l-3.1-8.9L24 34l8.9-3.1L36 22Z" fill="currentColor"/><circle cx="48" cy="24" r="2" fill="currentColor"/><circle cx="24" cy="44" r="1.6" fill="currentColor"/>'
};

let scriptPromise;
function loadAMap(key) {
  if (window.AMap?.Map) return Promise.resolve(window.AMap);
  if (scriptPromise) return scriptPromise;
  window._AMapSecurityConfig = { serviceHost: `${location.origin}/_AMapService` };
  scriptPromise = new Promise((resolve, reject) => {
    const callbackName = "__writeSpaceAMapReady";
    const script = document.createElement("script");
    const timer = setTimeout(() => fail(new Error("地图加载超时")), 15000);
    function fail(error) { clearTimeout(timer); delete window[callbackName]; script.remove(); scriptPromise = null; reject(error); }
    window[callbackName] = () => {
      clearTimeout(timer); delete window[callbackName];
      if (window.AMap?.Map) resolve(window.AMap); else fail(new Error("地图脚本未就绪"));
    };
    script.onerror = () => fail(new Error("地图脚本无法加载"));
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&callback=${callbackName}`;
    script.async = true;
    document.head.append(script);
  });
  return scriptPromise;
}

export function initRealMap({ getPosts, showDetail, isInterested, toggleInterest, openCreate, onPick, editPost, deletePost }) {
  let config = { enabled: false, servicesEnabled: false };
  let map, pickerMap, pickerMarker, startMarker, routeLine;
  let markers = [], selectedId = null, startPoint = null, pickerPoint = null;
  let pickerResults = [], areaResults = [], routeVersion = 0, locationAttempted = false;
  let selectionVersion = 0, areaSearchVersion = 0, pickerSearchVersion = 0;
  function setStart(point, source = "map") {
    const nextPoint = normalizeLocationPoint(point);
    if (!nextPoint || !map) return;
    selectionVersion++;
    startPoint = nextPoint;
    if (startMarker) startMarker.setMap(null);
    const pin = document.createElement("span");
    pin.className = "real-start-pin";
    pin.setAttribute("aria-label", "你的出发点");
    pin.innerHTML = '<svg viewBox="0 0 40 50" aria-hidden="true"><path d="M20 47S3 31 3 20a17 17 0 0 1 34 0c0 11-17 27-17 27Z" fill="#2c82cf" stroke="#fff" stroke-width="3"/><circle cx="20" cy="20" r="7" fill="#fff"/></svg>';
    startMarker = new window.AMap.Marker({ map, position: coordinates(startPoint), content: pin, anchor: "center" });
    $("#realMapArea").textContent = source === "geo" ? "已定位到你的附近" : source === "search" ? "已选定查看区域" : "已选定出发点";
    $("#realMapStatus").textContent = "点击地图空白处可随时更换出发点；位置仅用于本次路线，不会保存。";
    render();
  }
  const configReady = fetch("/api/map-config").then((response) => response.ok ? response.json() : config).catch(() => config).then((data) => {
    config = data;
    $("#mapLocationOption").disabled = !config.enabled;
    return config;
  });

  async function gpsToMap(point) {
    const inBrowser = await new Promise((resolve) => {
      if (!window.AMap?.convertFrom) { resolve(null); return; }
      let settled = false;
      const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => finish(null), 3000);
      try {
        window.AMap.convertFrom([point.lng, point.lat], "gps", (status, result) => {
          const converted = result?.locations?.[0];
          finish(status === "complete" && converted ? normalizeLocationPoint({ lng: converted.getLng(), lat: converted.getLat() }) : null);
        });
      } catch { finish(null); }
    });
    return inBrowser || gpsToAmapPoint(point);
  }

  async function locateUser() {
    if (!map) { $("#realMapStatus").textContent = "请先加载地图。"; return; }
    if (!navigator.geolocation) { $("#realMapStatus").textContent = "此浏览器无法定位。可搜索街区，或拖动地图手动选点。"; return; }
    const requestVersion = ++selectionVersion;
    $("#realMapArea").textContent = "正在获取你的位置…";
    $("#realMapStatus").textContent = "浏览器将请求定位许可；位置只用于本次查看和路线。";
    $("#realLocateButton").disabled = true;
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }));
      const point = await gpsToMap({ lng: position.coords.longitude, lat: position.coords.latitude });
      if (requestVersion !== selectionVersion) return;
      const longitudeScale = Math.cos(point.lat * Math.PI / 180);
      const nearest = mappedPosts().filter((post) => !post.demoMap).map((post) => normalizeLocationPoint(post.locationPoint)).filter(Boolean)
        .map((target) => ({ target, distance: Math.hypot((target.lng - point.lng) * longitudeScale, target.lat - point.lat) }))
        .sort((left, right) => left.distance - right.distance)[0];
      const center = nearest?.distance < 0.0025
        ? [(point.lng + nearest.target.lng) / 2, (point.lat + nearest.target.lat) / 2]
        : coordinates(point);
      map.setZoom(16);
      map.setCenter(center);
      setStart(point, "geo");
    } catch (error) {
      if (requestVersion !== selectionVersion) return;
      $("#realMapArea").textContent = "学军紫金港附近 · 演示区域";
      $("#realMapStatus").textContent = error?.code === 1 ? "未获得定位许可，当前展示随机演示任务。可搜索地点，或点击地图选出发点。" : "暂时无法定位，当前展示随机演示任务。可搜索地点，或点击地图选出发点。";
    } finally { $("#realLocateButton").disabled = false; }
  }

  async function show() {
    await configReady;
    if (!config.enabled) {
      $("#realMapCanvas").innerHTML = '<div class="real-map-empty"><strong>真实地图尚未配置</strong><p>在 .env 中填写高德 Web JS Key 和安全密钥并重启服务。仍可在列表浏览和发布文字内容。</p></div>';
      $("#realMapStatus").textContent = "未配置高德地图；不会尝试加载第三方地图。";
      render();
      return;
    }
    $("#realMapStatus").textContent = "正在连接高德地图…";
    try {
      const AMap = await loadAMap(config.key);
      if (!map) {
        $("#realMapCanvas").replaceChildren();
        map = new AMap.Map("realMapCanvas", { zoom: 16, center: coordinates(DEMO_MAP_CENTER), viewMode: "2D", jogEnable: false, animateEnable: false });
        map.on("click", (event) => {
          setStart({ lng: event.lnglat.getLng(), lat: event.lnglat.getLat() });
        });
        $("#realMapArea").textContent = "学军紫金港附近 · 演示区域";
        $("#realMapStatus").textContent = "随机演示任务并非真实约见点；点击地图空白处可设置出发点。";
      } else map.resize();
      render();
      if (!locationAttempted) { locationAttempted = true; locateUser(); }
    } catch {
      $("#realMapCanvas").innerHTML = '<div class="real-map-empty"><strong>地图连接失败</strong><p>请检查高德密钥、域名和网络，再点击下方重试。列表功能仍可使用。</p><button class="primary-button real-retry-button" type="button">重试地图</button></div>';
      $("#realMapCanvas .real-retry-button").addEventListener("click", show);
      $("#realMapStatus").textContent = "真实地图暂不可用。";
      map = null;
    }
  }

  function mappedPosts() { return getPosts().filter((post) => normalizeLocationPoint(post.locationPoint)); }

  async function updateRoute(post) {
    routeVersion++;
    const version = routeVersion;
    routeLine?.setMap(null); routeLine = null;
    const target = $("#realRouteStatus");
    if (!target) return;
    if (post.demoMap) { target.textContent = "示例位置随机生成，不提供真实步行路线。"; return; }
    if (!startPoint) { target.textContent = "在地图上选一个出发点，再查看真实步行路线。"; return; }
    if (!config.servicesEnabled) { target.textContent = "步行路线需配置高德 Web 服务 Key；任务地点仍可查看。"; return; }
    target.textContent = "正在计算真实步行路线…";
    try {
      const params = new URLSearchParams({ from: coordinates(startPoint).join(","), to: coordinates(post.locationPoint).join(",") });
      const response = await fetch(`/api/map/walking?${params}`);
      if (!response.ok) throw new Error("walking_unavailable");
      const route = await response.json();
      if (version !== routeVersion) return;
      if (Array.isArray(route.path) && route.path.length > 1) routeLine = new window.AMap.Polyline({ map, path: route.path, strokeColor: "#277252", strokeWeight: 6, strokeOpacity: 0.86 });
      target.textContent = `沿街步行约 ${Math.max(1, Math.ceil(Number(route.duration) / 60))} 分钟 · ${Math.round(Number(route.distance))} 米（高德路线）`;
    } catch { if (version === routeVersion && $("#realRouteStatus")) $("#realRouteStatus").textContent = "路线服务暂不可用；任务详情仍可查看。"; }
  }

  function render() {
    const posts = mappedPosts();
    $("#realMapCanvas").classList.toggle("has-demo-posts", Boolean(map) && posts.some((post) => post.demoMap));
    if (!posts.some((post) => post.id === selectedId)) selectedId = null;
    const selected = posts.find((post) => post.id === selectedId);
    $("#realJumpMission").textContent = selected ? `查看任务：${selected.title} ↓` : posts.length ? "查看街区任务 ↓" : "查看发布指引 ↓";
    if (map) {
      for (const marker of markers) marker.setMap(null);
      markers = posts.map((post) => {
        const selected = post.id === selectedId;
        const pin = document.createElement("div");
        pin.className = `real-task-marker ${post.type === "offer" ? "is-offer" : "is-need"} ${selected ? "is-selected" : ""}`;
        pin.dataset.postId = post.id;
        pin.setAttribute("aria-label", `${post.title}${post.demoMap ? "，随机演示任务" : ""}`);
        pin.innerHTML = `${selected ? `<div class="real-task-callout"><span>${post.demoMap ? "随机演示 · " : ""}${post.type === "offer" ? "愿意分享" : "想去体验"}</span><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(mapLocation(post))}</small></div>` : ""}<svg class="real-task-pin" viewBox="0 0 72 86" aria-hidden="true"><path class="real-task-pin-body" d="M36 3C18 3 4 17 4 35c0 19 32 48 32 48s32-29 32-48C68 17 54 3 36 3Z"/><circle class="real-task-pin-ring" cx="36" cy="34" r="24"/><circle class="real-task-pin-face" cx="36" cy="34" r="19"/>${taskPinIcon[post.type === "offer" ? "offer" : "need"]}</svg>`;
        const marker = new window.AMap.Marker({ map, position: coordinates(post.locationPoint), title: post.title, content: pin, anchor: "bottom-center", bubble: false, zIndex: selected ? 120 : 110 });
        marker.on("click", (event) => {
          event?.originEvent?.stopPropagation?.();
          selectedId = selectedId === post.id ? null : post.id;
          requestAnimationFrame(render);
        });
        return marker;
      });
    }
    $("#realMissionList").innerHTML = posts.filter((post) => post.id !== selectedId).map((post) => `<button type="button" data-real-post="${escapeHtml(post.id)}"><strong>${escapeHtml(post.title)}</strong><span>${post.demoMap ? "演示 · " : ""}${escapeHtml(post.name || "我")} · ${escapeHtml(mapLocation(post))}</span></button>`).join("");
    if (!selected) {
      $("#realMissionDetail").innerHTML = posts.length
        ? '<p>点击地图上的任务点，或从下方列表选择一件事，查看详情和步行路线。</p>'
        : '<p>这里暂时没有带公共集合点的本机任务。发布一件小事，在真实地图上选一个见面的公共地点，就能看到它出现在地图上。</p><button id="realEmptyPublish" class="primary-button" type="button">发布一件附近的事</button>';
      if (!posts.length) $("#realEmptyPublish").addEventListener("click", openCreate);
      routeVersion++;
      routeLine?.setMap(null); routeLine = null;
      return;
    }
    const mine = selected.id.startsWith("mine-");
    const joined = isInterested(selected.id);
    $("#realMissionDetail").innerHTML = `<div class="real-mission-type">${selected.demoMap ? "随机演示 · " : ""}${escapeHtml(selected.type === "offer" ? "愿意分享" : "想去体验")}${mine ? " · 我的发布" : ""}</div><h4>${escapeHtml(selected.title)}</h4><p>${escapeHtml(selected.name || "我")} · ${escapeHtml(mapLocation(selected))} · ${escapeHtml(selected.time || "时间待确认")}</p><p class="real-first-step"><strong>见面后先做</strong><span>${escapeHtml(selected.firstStep || "先了解这件事，再确认双方方便的时间。")}</span></p><p id="realRouteStatus" role="status"></p><div class="mission-actions"><button id="realJoin" class="primary-button" type="button">${mine ? "查看我的发布" : joined ? "取消参与意向" : "我愿意做这一步"}</button><button id="realDetail" class="ghost-button" type="button">完整说明</button>${mine ? '<button id="realEdit" class="ghost-button" type="button">编辑</button><button id="realDelete" class="ghost-button danger-text" type="button">删除</button>' : ""}</div>`;
    $("#realJoin").addEventListener("click", () => mine ? showDetail(selected) : toggleInterest(selected));
    $("#realDetail").addEventListener("click", () => showDetail(selected));
    if (mine) { $("#realEdit").addEventListener("click", () => editPost(selected)); $("#realDelete").addEventListener("click", () => deletePost(selected)); }
    if (map) updateRoute(selected);
    else $("#realRouteStatus").textContent = selected.demoMap ? "示例位置随机生成，不提供真实步行路线。" : "配置地图后可从自选出发点计算真实步行路线。";
  }

  function setPickerPoint(point, name = "") {
    pickerPoint = normalizeLocationPoint(point);
    if (!pickerPoint) return;
    const AMap = window.AMap;
    if (!pickerMarker) {
      pickerMarker = new AMap.Marker({ map: pickerMap, position: coordinates(pickerPoint), draggable: true, title: "拖动微调公共集合点" });
      pickerMarker.on("dragend", () => {
        const position = pickerMarker.getPosition();
        setPickerPoint({ lng: position.getLng(), lat: position.getLat() });
        $("#mapLocationName").value = "";
      });
    } else pickerMarker.setPosition(coordinates(pickerPoint));
    pickerMap.setCenter(coordinates(pickerPoint));
    if (name) $("#mapLocationName").value = name.slice(0, 40);
    $("#locationPickerStatus").textContent = `已选坐标 ${pickerPoint.lng.toFixed(5)}, ${pickerPoint.lat.toFixed(5)}；请确认公共集合点名称。`;
    $("#locationPickerError").hidden = true;
  }

  async function preparePicker() {
    await configReady;
    if (!config.enabled) { $("#locationPickerStatus").textContent = "请先在 .env 配置高德地图，再使用地图选点。"; return; }
    $("#locationPickerStatus").textContent = "正在加载地图…";
    try {
      const AMap = await loadAMap(config.key);
      if (!pickerMap) {
        const initial = startPoint || (map ? normalizeLocationPoint({ lng: map.getCenter().getLng(), lat: map.getCenter().getLat() }) : null);
        pickerMap = new AMap.Map("locationPickerCanvas", { zoom: initial ? 16 : 15, ...(initial ? { center: coordinates(initial) } : {}), viewMode: "2D", jogEnable: false, animateEnable: false });
        pickerMap.on("click", (event) => { setPickerPoint({ lng: event.lnglat.getLng(), lat: event.lnglat.getLat() }); $("#mapLocationName").value = ""; });
      } else pickerMap.resize();
      const prior = normalizeLocationPoint({ lng: $("#locationLng").value, lat: $("#locationLat").value });
      pickerPoint = null;
      if (prior) setPickerPoint(prior, $("#locationName").value);
      else { if (pickerMarker) { pickerMarker.setMap(null); pickerMarker = null; } if (startPoint) pickerMap.setCenter(coordinates(startPoint)); $("#mapLocationName").value = ""; }
      $("#publicPointCheck").checked = $("#publicPlaceConfirmed").value === "yes";
      $("#locationPickerStatus").textContent = prior ? "可拖动标记微调集合点。" : "点击地图、拖动标记，或搜索一个公共地点。";
    } catch { $("#locationPickerStatus").textContent = "地图未能加载，请检查密钥或网络，稍后再试。"; }
  }

  $("#realJumpMission").addEventListener("click", () => $("#realMissionTitle").scrollIntoView({ behavior: "smooth", block: "start" }));
  $("#realLocateButton").addEventListener("click", locateUser);
  $("#realDemoAreaButton").addEventListener("click", () => {
    if (!map) { $("#realMapStatus").textContent = "请先加载真实地图。"; return; }
    selectionVersion++;
    map.setZoom(16);
    map.setCenter(coordinates(DEMO_MAP_CENTER));
    $("#realMapArea").textContent = "学军紫金港附近 · 演示区域";
    $("#realMapStatus").textContent = "正在查看随机演示任务；这些标记不是实际约见点。";
  });
  $("#realPublishButton").addEventListener("click", openCreate);
  $("#realMissionList").addEventListener("click", (event) => { const button = event.target.closest("[data-real-post]"); if (button) { selectedId = button.dataset.realPost; const post = mappedPosts().find((item) => item.id === selectedId); if (post && map) { map.setZoom(16); map.setCenter(coordinates(post.locationPoint)); $("#realMapArea").textContent = post.demoMap ? "学军紫金港附近 · 演示区域" : "正在查看任务位置"; } render(); } });
  async function searchPlaces(query, output, status, isCurrent) {
    if (!isCurrent()) return null;
    if (!config.servicesEnabled) { status.textContent = "地点搜索需配置高德 Web 服务 Key；仍可直接在地图上选点。"; return null; }
    if (query.length < 2) { status.textContent = "请输入至少两个字的地点名称。"; return null; }
    status.textContent = "正在搜索地点…";
    output.hidden = false;
    output.innerHTML = '<p class="place-result-state">正在搜索…</p>';
    try {
      const response = await fetch(`/api/map/places?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("places_unavailable");
      const data = await response.json();
      if (!isCurrent()) return null;
      const places = Array.isArray(data.places) ? data.places.filter((poi) => poi.name && normalizeLocationPoint(poi.point)) : [];
      output.innerHTML = places.length ? places.map((poi, index) => `<button type="button" data-poi-index="${index}"><strong>${escapeHtml(poi.name)}</strong><span>${escapeHtml(poi.address || "地点信息暂缺")}</span></button>`).join("") : '<p class="place-result-state">没有找到地点，试试“城市 + 地点名”。</p>';
      status.textContent = places.length ? "请选择一处地点，或直接在地图上选点。" : "没有找到地点，可换个关键词或直接在地图上选点。";
      return places;
    } catch {
      if (!isCurrent()) return null;
      output.innerHTML = '<p class="place-result-state">搜索暂不可用，请直接在地图上选点。</p>';
      status.textContent = "搜索暂不可用，请直接在地图上选点。";
      return null;
    }
  }
  $("#mapAreaSearchForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!map) { $("#realMapStatus").textContent = "请先加载真实地图。"; return; }
    const version = ++areaSearchVersion;
    const results = await searchPlaces($("#mapAreaSearch").value.trim(), $("#mapAreaSearchResults"), $("#realMapStatus"), () => version === areaSearchVersion);
    if (version === areaSearchVersion) areaResults = results || [];
  });
  $("#mapAreaSearch").addEventListener("input", () => { areaSearchVersion++; areaResults = []; $("#mapAreaSearchResults").hidden = true; });
  $("#mapAreaSearchResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-poi-index]");
    const poi = button && areaResults[Number(button.dataset.poiIndex)];
    if (!poi || !map) return;
    map.setZoom(16);
    map.setCenter(coordinates(poi.point));
    setStart(poi.point, "search");
    areaSearchVersion++;
    areaResults = [];
    $("#mapAreaSearchResults").hidden = true;
    $("#mapAreaSearch").value = poi.name;
  });
  $("#locationSearchForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pickerMap) { $("#locationPickerStatus").textContent = "请先加载地图。"; return; }
    const version = ++pickerSearchVersion;
    const results = await searchPlaces($("#locationSearch").value.trim(), $("#locationSearchResults"), $("#locationPickerStatus"), () => version === pickerSearchVersion);
    if (version === pickerSearchVersion) pickerResults = results || [];
  });
  $("#locationSearch").addEventListener("input", () => { pickerSearchVersion++; pickerResults = []; $("#locationSearchResults").hidden = true; });
  $("#locationSearchResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-poi-index]");
    const poi = button && pickerResults[Number(button.dataset.poiIndex)];
    if (!poi) return;
    setPickerPoint(poi.point, poi.name);
    pickerSearchVersion++;
    pickerResults = [];
    $("#locationSearchResults").hidden = true;
  });
  $("#saveLocationPoint").addEventListener("click", () => {
    const name = $("#mapLocationName").value.trim();
    const error = !pickerPoint ? "请先在地图上选点。" : !name || name.length > 40 ? "请填写 1–40 字的公共集合点名称。" : !$("#publicPointCheck").checked ? "请确认这不是住宅或私人地址。" : "";
    $("#locationPickerError").textContent = error;
    $("#locationPickerError").hidden = !error;
    if (error) return;
    onPick({ ...pickerPoint, name });
  });

  return { configReady, render, preparePicker, show };
}
