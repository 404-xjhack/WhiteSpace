import { normalizeLocationPoint } from "./model.js";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const coordinates = (point) => [point.lng, point.lat];

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

export function initRealMap({ getPosts, showDetail, isInterested, toggleInterest, openCreate, onPick }) {
  let config = { enabled: false, center: [120.067974, 30.298083], centerLabel: "杭州学军中学紫金港校区附近" };
  let map, pickerMap, pickerMarker, startMarker, routeLine;
  let markers = [], selectedId = null, startPoint = null, pickerPoint = null, searchResults = [];
  let choosingStart = false, routeVersion = 0;
  function setStart(point) {
    startPoint = normalizeLocationPoint(point);
    if (!startPoint || !map) return;
    choosingStart = false;
    $("#realStartButton").textContent = "重选出发点";
    if (startMarker) startMarker.setMap(null);
    const pin = document.createElement("span"); pin.className = "real-start-pin"; pin.textContent = "我";
    startMarker = new window.AMap.Marker({ map, position: coordinates(startPoint), content: pin, anchor: "center" });
    $("#realMapStatus").textContent = "出发点只用于本次路线计算，不会保存到发布中。";
    render();
  }
  const configReady = fetch("/api/map-config").then((response) => response.ok ? response.json() : config).catch(() => config).then((data) => {
    config = data;
    $("#mapLocationOption").disabled = !config.enabled;
    $("#realMapArea").textContent = config.centerLabel || "杭州学军中学紫金港校区附近";
    return config;
  });

  function showDemo() {
    $("#demoMapLayout").hidden = false;
    $("#realMapLayout").hidden = true;
    $("#demoMapTab").setAttribute("aria-pressed", "true");
    $("#realMapTab").setAttribute("aria-pressed", "false");
    $(".map-demo-label").textContent = "春和社区 · 虚构演示地图";
    $(".header-location span:not(.demo-badge)").textContent = "春和社区";
  }
  async function showReal() {
    $("#demoMapLayout").hidden = true;
    $("#realMapLayout").hidden = false;
    $("#demoMapTab").setAttribute("aria-pressed", "false");
    $("#realMapTab").setAttribute("aria-pressed", "true");
    $(".map-demo-label").textContent = "真实底图 · 本机演示任务";
    $(".header-location span:not(.demo-badge)").textContent = "杭州·学军紫金港附近";
    await configReady;
    if (!config.enabled) {
      $("#realMapCanvas").innerHTML = '<div class="real-map-empty"><strong>真实地图尚未配置</strong><p>在 .env 中填写高德 Web JS Key 和安全密钥并重启服务。离线街区地图仍可完整演示。</p><button class="primary-button real-fallback-button" type="button">打开演示街区</button></div>';
      $("#realMapCanvas .real-fallback-button").addEventListener("click", showDemo);
      $("#realMapStatus").textContent = "未配置高德地图；不会尝试加载第三方地图。";
      render();
      return;
    }
    $("#realMapStatus").textContent = "正在连接高德地图…";
    try {
      const AMap = await loadAMap(config.key);
      if (!map) {
        $("#realMapCanvas").replaceChildren();
        map = new AMap.Map("realMapCanvas", { zoom: 15, center: config.center, viewMode: "2D" });
        map.on("click", (event) => {
          if (!choosingStart) return;
          setStart({ lng: event.lnglat.getLng(), lat: event.lnglat.getLat() });
        });
      } else map.resize();
      $("#realMapStatus").textContent = "点击任务标记查看内容；需要路线时先在地图上选出发点。";
      render();
    } catch {
      $("#realMapCanvas").innerHTML = '<div class="real-map-empty"><strong>地图连接失败</strong><p>请检查高德密钥、域名和网络；可以切回演示街区继续体验。</p><button class="primary-button real-fallback-button" type="button">打开演示街区</button></div>';
      $("#realMapCanvas .real-fallback-button").addEventListener("click", showDemo);
      $("#realMapStatus").textContent = "真实地图暂不可用，演示街区不受影响。";
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
    if (!posts.some((post) => post.id === selectedId)) selectedId = posts[0]?.id || null;
    const selected = posts.find((post) => post.id === selectedId);
    $("#realJumpMission").textContent = selected ? `查看任务：${selected.title} ↓` : "查看发布指引 ↓";
    if (map) {
      for (const marker of markers) marker.setMap(null);
      markers = posts.map((post) => {
        const marker = new window.AMap.Marker({ map, position: coordinates(post.locationPoint), title: post.title });
        marker.on("click", () => { selectedId = post.id; render(); if (window.matchMedia("(max-width: 760px)").matches) $("#realMissionTitle").scrollIntoView({ behavior: "smooth", block: "start" }); });
        return marker;
      });
    }
    $("#realMissionList").innerHTML = posts.filter((post) => post.id !== selectedId).map((post) => `<button type="button" data-real-post="${escapeHtml(post.id)}"><strong>${escapeHtml(post.title)}</strong><span>${escapeHtml(post.name || "我")} · ${escapeHtml(post.location)}</span></button>`).join("");
    if (!selected) {
      $("#realMissionDetail").innerHTML = '<p>这里暂时没有带公共集合点的本机任务。发布一件小事，在真实地图上选一个见面的公共地点，就能看到它出现在地图上。</p><button id="realEmptyPublish" class="primary-button" type="button">发布一件附近的事</button>';
      $("#realEmptyPublish").addEventListener("click", openCreate);
      routeLine?.setMap(null); routeLine = null;
      return;
    }
    const mine = selected.id.startsWith("mine-");
    const joined = isInterested(selected.id);
    $("#realMissionDetail").innerHTML = `<h4>${escapeHtml(selected.title)}</h4><p>${escapeHtml(selected.name || "我")} · ${escapeHtml(selected.type === "offer" ? "愿意分享" : "想去体验")}</p><p>${escapeHtml(selected.location)} · ${escapeHtml(selected.time || "时间待确认")}</p><p class="real-first-step"><strong>见面后先做</strong><span>${escapeHtml(selected.firstStep || "先了解这件事，再确认双方方便的时间。")}</span></p><p id="realRouteStatus" role="status"></p><div class="mission-actions"><button id="realJoin" class="primary-button" type="button">${mine ? "查看我的发布" : joined ? "取消参与意向" : "我愿意做这一步"}</button><button id="realDetail" class="ghost-button" type="button">完整说明</button></div>`;
    $("#realJoin").addEventListener("click", () => mine ? showDetail(selected) : toggleInterest(selected));
    $("#realDetail").addEventListener("click", () => showDetail(selected));
    if (map) updateRoute(selected);
    else $("#realRouteStatus").textContent = "配置地图后可从自选出发点计算真实步行路线。";
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
        pickerMap = new AMap.Map("locationPickerCanvas", { zoom: 16, center: config.center, viewMode: "2D" });
        pickerMap.on("click", (event) => { setPickerPoint({ lng: event.lnglat.getLng(), lat: event.lnglat.getLat() }); $("#mapLocationName").value = ""; });
      } else pickerMap.resize();
      const prior = normalizeLocationPoint({ lng: $("#locationLng").value, lat: $("#locationLat").value });
      pickerPoint = null;
      if (prior) setPickerPoint(prior, $("#locationName").value);
      else { if (pickerMarker) { pickerMarker.setMap(null); pickerMarker = null; } pickerMap.setCenter(config.center); $("#mapLocationName").value = ""; }
      $("#publicPointCheck").checked = $("#publicPlaceConfirmed").value === "yes";
      $("#locationPickerStatus").textContent = prior ? "可拖动标记微调集合点。" : "点击地图、拖动标记，或搜索一个公共地点。";
    } catch { $("#locationPickerStatus").textContent = "地图未能加载，请检查密钥或网络，稍后再试。"; }
  }

  $("#demoMapTab").addEventListener("click", showDemo);
  $("#realMapTab").addEventListener("click", showReal);
  $("#realJumpMission").addEventListener("click", () => $("#realMissionTitle").scrollIntoView({ behavior: "smooth", block: "start" }));
  $("#realStartButton").addEventListener("click", () => {
    if (!map) { $("#realMapStatus").textContent = "请先配置并加载高德地图。"; return; }
    choosingStart = true;
    $("#realStartButton").textContent = "请点地图选起点";
    $("#realMapStatus").textContent = "现在点地图上的出发点；此位置仅用于路线计算，不会保存。";
  });
  $("#realCenterButton").addEventListener("click", () => {
    if (!map) { $("#realMapStatus").textContent = "请先配置并加载高德地图。"; return; }
    const center = map.getCenter();
    setStart({ lng: center.getLng(), lat: center.getLat() });
  });
  $("#realPublishButton").addEventListener("click", openCreate);
  $("#realMissionList").addEventListener("click", (event) => { const button = event.target.closest("[data-real-post]"); if (button) { selectedId = button.dataset.realPost; render(); } });
  $("#locationSearchForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = $("#locationSearch").value.trim();
    if (!pickerMap || !query) { $("#locationPickerStatus").textContent = "请先打开地图并输入地点名称。"; return; }
    if (!config.servicesEnabled) { $("#locationPickerStatus").textContent = "搜索地点需配置高德 Web 服务 Key；也可以直接点地图选点。"; return; }
    $("#locationPickerStatus").textContent = "正在搜索地点…";
    try {
      const response = await fetch(`/api/map/places?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("places_unavailable");
      const data = await response.json();
      searchResults = Array.isArray(data.places) ? data.places.filter((poi) => poi.name && normalizeLocationPoint(poi.point)) : [];
      $("#locationSearchResults").innerHTML = searchResults.map((poi, index) => `<button type="button" data-poi-index="${index}" title="${escapeHtml(poi.name)}">${escapeHtml(poi.name)}</button>`).join("");
      $("#locationPickerStatus").textContent = searchResults.length ? "选择搜索结果，或在地图上微调集合点。" : "未找到地点；换个关键词或直接点地图。";
    } catch { $("#locationPickerStatus").textContent = "搜索暂不可用，可以直接点地图选点。"; }
  });
  $("#locationSearchResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-poi-index]");
    const poi = button && searchResults[Number(button.dataset.poiIndex)];
    if (!poi) return;
    setPickerPoint(poi.point, poi.name);
  });
  $("#saveLocationPoint").addEventListener("click", () => {
    const name = $("#mapLocationName").value.trim();
    const error = !pickerPoint ? "请先在地图上选点。" : !name || name.length > 40 ? "请填写 1–40 字的公共集合点名称。" : !$("#publicPointCheck").checked ? "请确认这不是住宅或私人地址。" : "";
    $("#locationPickerError").textContent = error;
    $("#locationPickerError").hidden = !error;
    if (error) return;
    onPick({ ...pickerPoint, name });
  });

  return { configReady, render, preparePicker, showReal, showDemo };
}
