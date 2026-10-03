import { CAPSULE_STORAGE_KEY, CAPSULE_QUESTIONS, readCapsules, saveCapsule, validateCapsuleDraft, formatCapsuleDate, capsuleText, capsuleFilename } from "./time-capsules.js";

export function createTimeCapsuleUI() {
  const container = document.createElement("div");
  container.innerHTML = `
    <dialog id="capsuleEditor" class="capsule-dialog" aria-labelledby="capsuleEditorTitle">
      <form id="capsuleForm" novalidate>
        <div class="capsule-header"><div><h2 id="capsuleEditorTitle">保存为时间胶囊</h2><p>留下自己的作品，也留下这次体验里的两句话。</p></div><button class="capsule-button" type="button" data-capsule-close aria-label="关闭时间胶囊表单">关闭</button></div>
        <div class="capsule-body">
          <p id="capsuleExperience" class="capsule-meta"></p>
          <p class="capsule-hint">先确认你的文字作品，可以在这里修改。只记录这次具体的尝试，几句话也可以。</p>
          <label class="capsule-field">作品标题<input id="capsuleTitle" name="title" maxlength="120" placeholder="例如：我第一次亲手包饺子" /></label>
          <label class="capsule-field">我的文字作品<textarea id="capsuleWork" name="work" rows="7" placeholder="写下你做了什么、观察到了什么。这里留下的是你自己的文字。"></textarea></label>
          <label class="capsule-field">${CAPSULE_QUESTIONS[0]}<textarea id="capsuleMoment" name="moment" rows="2" placeholder="例如：面皮终于合上的那一刻。"></textarea></label>
          <label class="capsule-field">${CAPSULE_QUESTIONS[1]}<textarea id="capsuleNextTime" name="nextTime" rows="2" placeholder="例如：保留慢慢擀皮的节奏，下次试着少放一点馅。"></textarea></label>
          <p class="capsule-hint">保存在当前浏览器中。保存后可以重新打开，或导出为文字文件。</p>
        </div>
        <div class="capsule-actions"><p id="capsuleError" class="capsule-error" role="alert" hidden></p><button class="capsule-button" type="button" data-capsule-close>返回回顾</button><button id="saveCapsule" class="capsule-button capsule-primary" type="submit">保存时间胶囊</button></div>
      </form>
    </dialog>
    <dialog id="capsuleHistory" class="capsule-dialog" aria-labelledby="capsuleHistoryTitle">
      <div class="capsule-header"><div><h2 id="capsuleHistoryTitle">生活时间胶囊</h2><p>看看自己做过什么，重新打开那些愿意留下的瞬间。</p></div><button class="capsule-button" type="button" data-capsule-close aria-label="关闭时间胶囊历史">关闭</button></div>
      <div class="capsule-body"><p id="capsuleHistoryError" class="capsule-error" role="alert" hidden></p><div id="capsuleList" class="capsule-list"></div><div id="capsuleEmpty" class="capsule-empty" hidden><span class="capsule-eyebrow">为一次尝试留一个位置</span><h3>你的第一份时间胶囊，还在等待一次体验</h3><p>先完成一次饺子工坊体验，在工艺回顾中点击「保存为时间胶囊」，写下自己的作品和感受。</p><a class="capsule-button capsule-primary" href="/dumpling-house.html">去体验饺子工坊</a></div></div>
      <div class="capsule-actions"><p class="capsule-hint">按保存时间排列，最近的一次在最前面。仅保存在当前浏览器。</p></div>
    </dialog>
    <dialog id="capsuleDetail" class="capsule-dialog" aria-labelledby="capsuleDetailTitle">
      <div class="capsule-header"><div><h2 id="capsuleDetailTitle">我的时间胶囊</h2><p id="capsuleSavedStatus" role="status"></p></div><button class="capsule-button" type="button" data-capsule-close aria-label="关闭时间胶囊作品">关闭</button></div>
      <div class="capsule-body"><article id="capsuleCard" class="capsule-card" tabindex="-1"></article><p id="capsuleExportError" class="capsule-error" role="alert" hidden></p></div>
      <div class="capsule-actions"><button id="capsuleBack" class="capsule-button" type="button">查看历史</button><button id="reopenCapsule" class="capsule-button" type="button">重新打开</button><button id="exportCapsule" class="capsule-button capsule-primary" type="button">导出 .txt</button></div>
    </dialog>`;
  document.body.append(container);
  const $ = (selector) => container.querySelector(selector);
  const editor = $("#capsuleEditor"), historyDialog = $("#capsuleHistory"), detailDialog = $("#capsuleDetail");
  const form = $("#capsuleForm"), saveButton = $("#saveCapsule");
  let draft = null, currentCapsule = null, saving = false;
  const syncLock = () => document.documentElement.classList.toggle("modal-open", Boolean(document.querySelector("dialog[open]")));
  function open(dialog) { if (!dialog.open) dialog.showModal(); syncLock(); }
  function close(dialog) { dialog.close(); syncLock(); }
  for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("close", syncLock);
  container.querySelectorAll("[data-capsule-close]").forEach((button) => button.addEventListener("click", () => close(button.closest("dialog"))));
  function errorMessage(error) {
    return ["read_failed", "invalid_data"].includes(error)
      ? "暂时无法完整读取时间胶囊记录，原记录没有被覆盖。请检查浏览器是否允许本地存储，或稍后重试。"
      : "这次还没能保存，浏览器可能不允许本地存储或空间已满。请检查后重试。";
  }
  function textElement(tag, text, className) {
    const element = document.createElement(tag); element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function loadHistory() {
    try { return readCapsules(window.localStorage); }
    catch { return { capsules: [], error: "read_failed" }; }
  }
  function renderHistory() {
    const history = loadHistory();
    $("#capsuleHistoryError").hidden = !history.error;
    $("#capsuleHistoryError").textContent = history.error ? errorMessage(history.error) : "";
    $("#capsuleEmpty").hidden = history.capsules.length > 0 || Boolean(history.error);
    $("#capsuleList").replaceChildren(...history.capsules.map((capsule) => {
      const item = document.createElement("article"); item.className = "capsule-list-item";
      const summary = capsule.work.replace(/\s+/g, " ").trim();
      const button = textElement("button", "重新打开", "capsule-button"); button.type = "button";
      button.dataset.capsuleId = capsule.id;
      button.setAttribute("aria-label", `重新打开：${capsule.title}`);
      button.addEventListener("click", () => showDetail(capsule));
      item.append(textElement("span", "我的作品", "capsule-eyebrow"), textElement("h3", capsule.title),
        textElement("p", formatCapsuleDate(capsule.savedAt), "capsule-meta"),
        textElement("p", summary.length > 100 ? summary.slice(0, 100) + "…" : summary, "capsule-summary"), button);
      return item;
    }));
  }
  function openHistory() { close(detailDialog); renderHistory(); open(historyDialog); }
  function showDetail(capsule, justSaved = false) {
    currentCapsule = capsule;
    close(historyDialog);
    $("#capsuleSavedStatus").textContent = justSaved ? "已保存。这是你这次体验留下的作品。" : "作品和当时写下的感受，都在这里。";
    $("#reopenCapsule").hidden = !justSaved;
    $("#capsuleExportError").hidden = true;
    const card = $("#capsuleCard");
    const date = textElement("time", formatCapsuleDate(capsule.savedAt)); date.dateTime = capsule.savedAt;
    const meta = textElement("p", "", "capsule-meta");
    if (capsule.experienceName) meta.append(textElement("span", capsule.experienceName), textElement("span", " · "));
    meta.append(date);
    card.replaceChildren(textElement("span", "我的作品 · 生活时间胶囊", "capsule-eyebrow"), textElement("h2", capsule.title), meta,
      textElement("p", capsule.work, "capsule-work"));
    for (const [question, answer] of [[CAPSULE_QUESTIONS[0], capsule.moment], [CAPSULE_QUESTIONS[1], capsule.nextTime]]) {
      const section = document.createElement("section"); section.className = "capsule-reflection";
      section.append(textElement("h3", question), textElement("p", answer)); card.append(section);
    }
    open(detailDialog);
    detailDialog.querySelector(".capsule-body").scrollTop = 0;
  }
  function openDraft(context = {}) {
    if (editor.open) return;
    if (!draft || draft.experienceId !== (context.experienceId || "")) {
      draft = { id: crypto.randomUUID(), experienceId: context.experienceId || "", experienceName: context.experienceName || "" };
      form.reset();
      form.elements.title.value = context.title || "我的一次体验";
      form.elements.work.value = context.work || "";
      $("#capsuleError").hidden = true;
      form.querySelectorAll("[aria-invalid]").forEach((element) => element.removeAttribute("aria-invalid"));
    }
    $("#capsuleExperience").textContent = draft.experienceName ? `这次体验：${draft.experienceName}` : "记录这次具体的尝试";
    open(editor); form.elements.work.focus();
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (saving || !draft || !editor.open) return;
    const fields = Object.fromEntries(["title", "work", "moment", "nextTime"].map((key) => [key, form.elements[key].value]));
    const errors = validateCapsuleDraft(fields);
    for (const key of Object.keys(fields)) form.elements[key].setAttribute("aria-invalid", String(Boolean(errors[key])));
    const firstError = Object.keys(errors)[0];
    if (firstError) {
      $("#capsuleError").textContent = errors[firstError]; $("#capsuleError").hidden = false;
      form.elements[firstError].focus(); return;
    }
    saving = true; saveButton.disabled = true;
    try {
      const capsule = { ...draft, ...fields, title: fields.title.trim(), version: 1, savedAt: new Date().toISOString() };
      let result;
      try { result = saveCapsule(window.localStorage, capsule); } catch { result = { error: "save_failed" }; }
      if (result.error) {
        $("#capsuleError").textContent = errorMessage(result.error) + " 作品和回答仍保留在表单中。";
        $("#capsuleError").hidden = false; return;
      }
      draft = null; close(editor); showDetail(result.capsule, true);
    } finally { saving = false; saveButton.disabled = false; }
  });
  $("#capsuleBack").addEventListener("click", openHistory);
  $("#reopenCapsule").addEventListener("click", () => { showDetail(currentCapsule); $("#capsuleCard").focus(); });
  $("#exportCapsule").addEventListener("click", () => {
    let url;
    try {
      url = URL.createObjectURL(new Blob([capsuleText(currentCapsule)], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = capsuleFilename(currentCapsule);
      document.body.append(link); link.click(); link.remove();
      $("#capsuleExportError").hidden = true;
    } catch { $("#capsuleExportError").textContent = "这次没有导出成功，作品仍保存在时间胶囊里，请重试。"; $("#capsuleExportError").hidden = false; }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
  window.addEventListener("storage", (event) => { if (event.key === CAPSULE_STORAGE_KEY && historyDialog.open) renderHistory(); });
  return { openDraft, openHistory };
}
