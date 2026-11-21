"use strict";
(() => {
  const get = id => document.getElementById(id);
  const tabs = Array.from(document.querySelectorAll("[data-tab]"));
  const note = get("live-status");
  let activeTab = "live";
  let initialized = false;
  let busy = false;

  function show(key, focus = false) {
    const selected = tabs.find(button => button.dataset.tab === key) || tabs[0];
    activeTab = selected.dataset.tab;
    for (const button of tabs) {
      const active = button === selected;
      button.tabIndex = active ? 0 : -1;
      button.setAttribute("aria-selected", String(active));
      get(button.getAttribute("aria-controls")).hidden = !active;
    }
    note.hidden = !["rules", "games"].includes(activeTab);
    if (focus) selected.focus();
    window.scrollTo(0, 0);
    history.replaceState(null, "", "#" + activeTab);
    if (activeTab === "voice") void refresh();
  }

  for (const [index, button] of tabs.entries()) {
    button.addEventListener("click", () => show(button.dataset.tab));
    button.addEventListener("keydown", event => {
      const next = {ArrowLeft:(index + tabs.length - 1) % tabs.length,
        ArrowRight:(index + 1) % tabs.length, Home:0, End:tabs.length - 1}[event.key];
      if (next == null) return;
      event.preventDefault();
      show(tabs[next].dataset.tab, true);
    });
  }
  const target = location.hash.slice(1);
  show(target === "interactions" ? "rules" : target);

  function apply(result) {
    if (!initialized) {
      const {settings} = result;
      get("stream-user").value = settings.tiktok_username ? "@" + settings.tiktok_username : "";
      get("stream-enabled").checked = settings.tiktok_enabled;
      get("speech-voice").value = settings.voice;
      get("speech-engine").value = settings.voice_engine;
      get("speech-rate").value = settings.rate;
      initialized = true;
    }
    if (result.restart) get("stream-note").textContent = "Đã lưu. Đóng cửa sổ chạy Bông và mở lại để áp dụng kết nối.";
    const menu = get("record-faq");
    const current = menu.value;
    const signature = JSON.stringify(result.faq);
    if (menu.dataset.signature !== signature) {
      menu.dataset.signature = signature;
      menu.replaceChildren();
      if (!result.faq.length) menu.add(new Option("Chưa có FAQ đã lưu", ""));
      for (const item of result.faq) menu.add(new Option(item.trigger + (item.recorded ? " · Có bản thu" : ""), item.trigger));
      if (result.faq.some(item => item.trigger === current)) menu.value = current;
    }
  }

  async function refresh() {
    if (busy) return;
    try {
      const state = await requestApi("operator");
      if (!busy) apply(state);
    } catch (error) {
      get("stream-note").textContent = error.message;
    }
  }

  async function send(detail, id, success) {
    if (!initialized || busy) return false;
    busy = true;
    try {
      const result = await requestApi("operator", detail);
      apply(result);
      get(id).textContent = success;
      return true;
    } catch (error) {
      get(id).textContent = error.message;
      return false;
    } finally {
      busy = false;
    }
  }

  get("stream-save").addEventListener("click", () => void send({
    operation:"connection", settings:{tiktok_username:get("stream-user").value, tiktok_enabled:get("stream-enabled").checked},
  }, "stream-note", "Đã lưu. Sau khi đổi tài khoản hoặc bật/tắt, hãy mở lại Bông."));
  get("speech-save").addEventListener("click", () => void send({
    operation:"voice", settings:{voice:get("speech-voice").value, voice_engine:get("speech-engine").value, rate:Number(get("speech-rate").value)},
  }, "speech-note", "Đã lưu giọng cho câu tiếp theo."));
  get("speech-test").addEventListener("click", async () => {
    try {
      const out = await requestApi("command", {action:"voice_test"});
      get("speech-note").textContent = out.message + " Hãy mở nguồn phát để nghe.";
    } catch (error) {
      get("speech-note").textContent = error.message;
    }
  });

  const faq = get("record-faq");
  get("record-save").addEventListener("click", async () => {
    if (busy) return;
    const input = get("record-file");
    const file = input.files[0];
    const trigger = faq.value;
    if (!trigger || !file || !/\.(mp3|wav)$/i.test(file.name) || file.size > 1_500_000) {
      get("record-note").textContent = "Chọn một FAQ đã lưu và file MP3 hoặc WAV tối đa 1,5 MB.";
      return;
    }
    const button = get("record-save");
    button.disabled = true;
    try {
      const data = await file.arrayBuffer();
      const context = new AudioContext();
      try {
        const audio = await context.decodeAudioData(data.slice(0));
        if (audio.duration > 30) throw new Error("Giữ bản thu tối đa 30 giây.");
      } finally { await context.close(); }
      const bytes = new Uint8Array(data);
      const parts = [];
      for (let i=0; i<bytes.length; i+=16384) parts.push(String.fromCharCode(...bytes.subarray(i, i+16384)));
      if (await send({operation:"record", trigger, data:btoa(parts.join(""))}, "record-note", "Đã lưu bản thu cho câu FAQ.")) input.value = "";
    } catch (error) {
      get("record-note").textContent = error.message || "Không đọc được bản thu.";
    } finally { button.disabled = false; }
  });
  get("record-play").addEventListener("click", () => void send({operation:"play_record", trigger:faq.value}, "record-note", "Đã đưa bản thu vào hàng phát."));
  get("record-remove").addEventListener("click", () => {
    if (faq.value && window.confirm("Gỡ bản thu của câu FAQ này?"))
      void send({operation:"unrecord", trigger:faq.value}, "record-note", "Đã gỡ liên kết bản thu.");
  });
  void refresh();
})();
