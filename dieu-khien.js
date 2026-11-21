"use strict";
const el = id => document.getElementById(id);
function updateOverlayUrls() {
  const style = el("bubble-style-select")?.value || "manga";
  const pos = el("bubble-pos-select")?.value || "top";
  let params = "captions=1";
  if (style !== "manga") params += `&bubble=${style}`;
  if (pos !== "top") params += `&pos=${pos}`;

  const setupUrl = `${location.origin}/overlay.html?setup=1&${params}`;
  const mirrorUrl = `${location.origin}/overlay.html?mirror=1&${params}`;

  if (el("overlay-url")) el("overlay-url").textContent = setupUrl;
  if (el("mirror-url")) el("mirror-url").textContent = mirrorUrl;
  if (el("open-test-link")) el("open-test-link").href = setupUrl;
}
el("bubble-style-select")?.addEventListener("change", updateOverlayUrls);
el("bubble-pos-select")?.addEventListener("change", updateOverlayUrls);
updateOverlayUrls();
for (const [value, text] of Object.entries(BongHoa.actions)) el("action").add(new Option(text, value));
el("action").value = "WAVE";
let lastDrafts;
let noticeUntil = 0;

function message(text, error = false, temporary = false) {
  el("status-message").textContent = text;
  el("status-message").classList.toggle("error", error);
  if (temporary) noticeUntil = Date.now() + 4500;
}

async function command(action, data = {}) {
  try {
    const result = await requestApi("command", {action, ...data});
    message(result.message, false, true);
    return true;
  } catch (error) {
    message(error.message, true, true);
    return false;
  }
}

function drawDrafts(drafts) {
  const snapshot = JSON.stringify(drafts);
  if (snapshot === lastDrafts) return;
  lastDrafts = snapshot;
  const list = el("drafts");
  const edits = new Map(Array.from(list.querySelectorAll("[data-draft]"), card =>
    [card.dataset.draft, card.querySelector("textarea").value]));
  const scroll = list.scrollTop;
  list.replaceChildren();
  if (!drafts.length) {
    const empty = document.createElement("small");
    empty.textContent = "Chưa có câu trả lời chờ duyệt.";
    list.append(empty);
  }
  for (const draft of drafts) {
    const card = document.createElement("article");
    card.className = "draft";
    card.dataset.draft = draft.id;
    const comment = document.createElement("small");
    comment.textContent = draft.comment;
    const meta = document.createElement("strong");
    meta.textContent = BongHoa.actions[draft.gesture] || "Trò chuyện";
    const text = document.createElement("textarea");
    text.value = edits.get(draft.id) ?? draft.text;
    text.maxLength = 480;
    text.setAttribute("aria-label", "Sửa câu trả lời của Bông");
    const row = document.createElement("div");
    row.className = "row";
    for (const [action, title] of [["approve", "Phát câu này"], ["reject", "Bỏ qua"]]) {
      const button = document.createElement("button");
      button.textContent = title;
      button.addEventListener("click", async () => {
        button.disabled = true;
        await command(action, {id: draft.id, text: text.value});
        button.disabled = false;
      });
      row.append(button);
    }
    if (draft.record_trigger) {
      const hint = document.createElement("small");
      hint.textContent = "Có bản thu FAQ. Sửa lời thoại sẽ chuyển sang TTS.";
      card.append(comment, meta, hint, text, row);
    } else {
      card.append(comment, meta, text, row);
    }
    list.append(card);
  }
  list.scrollTop = scroll;
}

async function refresh() {
  try {
    const state = await requestApi("status");
    el("channel").textContent = state.name;
    el("source").textContent = state.renderer === "ready" ? "Đã sẵn sàng" :
      state.renderer === "locked" ? "Cần bấm Bật âm thanh" : "Chưa mở nguồn";
    el("source").classList.toggle("good", state.renderer === "ready");
    el("services").textContent = (state.gemini ? (state.llmProvider || "Gemini") + " · Đã nhập key" : "Trả lời mẫu") +
      " / " + (state.tts ? state.voiceLabel : "Chưa có giọng tổng hợp");
    el("tiktok").textContent = state.tiktok;
    el("tiktok-received").textContent = state.tiktokReceived;
    el("tiktok-last").textContent = state.lastTikTok || "—";
    el("chat-stage").textContent = state.chatStage || "—";
    el("gesture-mode").textContent = state.aiGestures ? "AI chọn theo câu chat" :
      "Cố định · " + (BongHoa.actions[state.fixedGesture] || state.fixedGesture);
    el("queue").textContent = state.paused ? "Đã dừng" : state.queue + (state.playing ? " · Đang phát" : " · Đang chờ");
    if (!el("auto").disabled) el("auto").checked = state.auto;
    el("resume").disabled = !state.paused;
    el("mute").disabled = state.paused;
    if (Date.now() > noticeUntil) message(state.note || "Sẵn sàng nhận lệnh.");
    drawDrafts(state.drafts);
  } catch {
    message("Bảng điều khiển mất kết nối. Hãy kiểm tra cửa sổ đang chạy Bông Hoa.", true);
  }
  setTimeout(refresh, 900);
}

for (const action of ["demo", "effect", "act", "speak", "chat"]) {
  el(action).addEventListener("click", () => command(action, {text: el("text").value, gesture: el("action").value}));
}
el("story").addEventListener("click", () => command("story"));
el("mute").addEventListener("click", () => command("pause"));
el("resume").addEventListener("click", () => command("resume"));
el("auto").addEventListener("change", async event => {
  const input = event.target;
  input.disabled = true;
  if (!await command("auto", {on: input.checked})) input.checked = !input.checked;
  input.disabled = false;
});
el("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(url);
    message("Đã chép URL nguồn OBS.", false, true);
  } catch {
    message("Hãy bôi đen URL bên trên và nhấn Ctrl+C.", false, true);
  }
});
void refresh();
