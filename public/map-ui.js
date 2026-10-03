const $ = (selector) => document.querySelector(selector);

export function initMapView({ onShow }) {
  const section = $("#neighborhoodMap");
  const shell = $(".page-shell");
  const toggle = $("#mapToggle");

  function showMap() {
    section.hidden = false;
    $(".main-grid").hidden = true;
    $(".page-intro").hidden = true;
    shell.classList.add("map-active");
    toggle.textContent = "返回列表";
    toggle.setAttribute("aria-expanded", "true");
    onShow();
  }

  function showFeed() {
    section.hidden = true;
    $(".main-grid").hidden = false;
    $(".page-intro").hidden = false;
    shell.classList.remove("map-active");
    toggle.textContent = "街区地图";
    toggle.setAttribute("aria-expanded", "false");
  }

  toggle.addEventListener("click", () => section.hidden ? showMap() : showFeed());
  return { showMap, showFeed };
}
