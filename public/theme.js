// Shared, synchronous startup: resolve appearance before styles or business modules load.
(() => {
  const STORAGE_KEY = "whitespace.theme.v1";
  const validPreference = (value) => ["light", "dark", "system"].includes(value);
  const validState = (value) => value && validPreference(value.preference)
    && ["light", "dark"].includes(value.resolvedTheme)
    && (value.preference === "system" || value.preference === value.resolvedTheme);
  const root = document.documentElement;
  const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let preference = "system", resolvedTheme, statusTimer, transitionFrame;

  function parentState() {
    try {
      if (window.parent !== window && window.parent.location.origin === location.origin) {
        const value = window.parent.WhiteSpaceTheme?.getState();
        if (validState(value)) return value;
      }
    } catch { /* A different-origin embedding uses its own local preference. */ }
    return null;
  }
  function syncControls() {
    document.querySelectorAll("[data-theme-select]").forEach((select) => { select.value = preference; });
  }
  function apply(nextPreference, parentResolved) {
    const nextTheme = parentResolved || (nextPreference === "system" ? (media?.matches ? "dark" : "light") : nextPreference);
    const changed = preference !== nextPreference || resolvedTheme !== nextTheme;
    if (resolvedTheme && resolvedTheme !== nextTheme) {
      // Hover transitions must not interpolate a light button against its new dark text.
      cancelAnimationFrame(transitionFrame); root.classList.add("theme-switching");
      transitionFrame = requestAnimationFrame(() => {
        transitionFrame = requestAnimationFrame(() => root.classList.remove("theme-switching"));
      });
    }
    preference = nextPreference; resolvedTheme = nextTheme;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    const background = resolvedTheme === "dark" ? "#141b17" : "#f8f8f4";
    root.style.backgroundColor = background;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
    syncControls();
    if (changed) window.dispatchEvent(new CustomEvent("whitespace:themechange", { detail: getState() }));
  }
  function getState() { return { preference, resolvedTheme }; }
  function reportSaveFailure() {
    const host = document.querySelector("dialog[open]") || document.body;
    if (!host) return;
    let status = document.querySelector(".theme-save-status");
    if (!status) {
      status = document.createElement("div"); status.className = "theme-save-status";
      status.setAttribute("role", "status");
    }
    host.append(status);
    status.textContent = "当前外观已切换，但此次选择无法保存。";
    clearTimeout(statusTimer); statusTimer = setTimeout(() => status.remove(), 6000);
  }
  function setPreference(value) {
    if (!validPreference(value)) return false;
    if (parentState()) {
      window.parent.WhiteSpaceTheme.setPreference(value);
      const state = parentState(); apply(state.preference, state.resolvedTheme);
      return true;
    }
    apply(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      clearTimeout(statusTimer); document.querySelector(".theme-save-status")?.remove();
    }
    catch { reportSaveFailure(); }
    return true;
  }
  function refresh() {
    const state = parentState();
    if (state) apply(state.preference, state.resolvedTheme);
    else if (preference === "system") apply(preference);
  }
  window.WhiteSpaceTheme = Object.freeze({ getState, setPreference });
  const inherited = parentState();
  if (inherited) apply(inherited.preference, inherited.resolvedTheme);
  else {
    let saved;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Keep system default. */ }
    apply(validPreference(saved) ? saved : "system");
  }
  if (media?.addEventListener) media.addEventListener("change", refresh);
  else media?.addListener?.(refresh);
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const inheritedState = parentState();
    if (inheritedState) apply(inheritedState.preference, inheritedState.resolvedTheme);
    else apply(validPreference(event.newValue) ? event.newValue : "system");
  });
  window.addEventListener("message", (event) => {
    if (window.parent === window || event.source !== window.parent || event.origin !== location.origin) return;
    const message = event.data;
    if (message?.channel !== "whitespace-theme" || message.version !== 1 || message.type !== "sync" || !validState(message)) return;
    apply(message.preference, message.resolvedTheme);
  });
  window.addEventListener("pageshow", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  document.addEventListener("DOMContentLoaded", syncControls, { once: true });
  document.addEventListener("change", (event) => {
    if (event.target.matches?.("[data-theme-select]")) setPreference(event.target.value);
  });
})();
