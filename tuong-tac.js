"use strict";
(() => {
  const get = id => document.getElementById(id);
  const ruleKinds = ["faq", "commands", "gifts"];
  const flags = ["ai_actions", "commands_on", "gifts_on", "announce_results", "memory_on", "memory_context",
    "join_on", "follow_on", "share_on", "like_on", "idle_on"];
  const numbers = ["cooldown", "duration", "goal", "volume", "like_cooldown", "idle_seconds"];
  const actionFields = ["fixed_action", "scene_a", "scene_b", "join_action", "follow_action", "share_action", "like_action"];
  const texts = ["profile", "a_title", "b_title", "join_text", "return_text", "follow_text", "share_text",
    "like_text", "reply_length", "idle_script", ...actionFields];
  const form = get("interaction-settings");
  let ready = false;
  let busy = false;

  function fillActions(select, value) {
    for (const [key, name] of Object.entries(BongHoa.actions)) select.add(new Option(name, key));
    select.value = value;
  }

  function field(parent, labelText, input, key) {
    const label = document.createElement("label");
    label.textContent = labelText;
    input.dataset.field = key;
    input.setAttribute("form", "interaction-settings");
    label.append(input);
    parent.append(label);
  }

  function row(kind, value = {}) {
    const panel = document.createElement("div");
    panel.className = "stack live-rule";
    const trigger = document.createElement("input");
    trigger.required = true;
    trigger.maxLength = 90;
    trigger.value = value.trigger || "";
    field(panel, {faq:"Cụm từ cần nhận", commands:"Lệnh bắt đầu bằng !", gifts:"Tên hoặc ID quà"}[kind], trigger, "trigger");
    if (kind !== "commands") {
      const reply = document.createElement("input");
      reply.required = kind === "faq";
      reply.maxLength = 180;
      reply.value = value.reply || "";
      field(panel, kind === "faq" ? "Câu trả lời" : "Lời cảm ơn", reply, "reply");
    }
    if (kind !== "faq") {
      const action = document.createElement("select");
      fillActions(action, value.action || "LOVE");
      field(panel, "Động tác", action, "action");
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Bỏ dòng";
    remove.addEventListener("click", () => panel.remove());
    panel.append(remove);
    get("live-" + kind).append(panel);
  }

  for (const key of actionFields) fillActions(get("live-" + key), "TALK");
  function load(settings) {
    for (const key of flags) get("live-" + key).checked = settings[key];
    for (const key of [...texts, ...numbers]) get("live-" + key).value = settings[key];
    for (const key of ruleKinds) {
      get("live-" + key).replaceChildren();
      for (const value of settings[key]) row(key, value);
    }
  }

  function collect() {
    const payload = {};
    for (const key of flags) payload[key] = get("live-" + key).checked;
    for (const key of numbers) payload[key] = Number(get("live-" + key).value);
    for (const key of texts) payload[key] = get("live-" + key).value;
    for (const key of ruleKinds) {
      payload[key] = Array.from(get("live-" + key).children, item =>
        Object.fromEntries(Array.from(item.querySelectorAll("[data-field]"), input => [input.dataset.field, input.value])));
    }
    return payload;
  }

  function status(result) {
    for (const slot of ["A", "B"]) get("music-status-" + slot).textContent = result.tracks[slot] ? "Đã nạp nhạc" : "Chưa nạp nhạc";
    get("live-memory-count").textContent = "Đang lưu " + result.memoryCount + " hồ sơ nhận diện.";
    const {poll, message, music} = result.live;
    let line = message || "Chưa mở vòng chơi.";
    if (poll) {
      const tally = poll.kind === "flight" ? poll.total + "/" + poll.goal + " lượt" :
        `A · ${poll.aTitle} (${poll.a}) / B · ${poll.bTitle} (${poll.b})`;
      line = `${poll.title} · ${tally} · ${poll.seconds}s`;
    }
    if (music) line += " · Nhạc đang phát " + music.title;
    get("live-round").textContent = line;
  }

  async function send(operation, detail, okMessage) {
    if (!ready || busy) return false;
    busy = true;
    try {
      const result = await requestApi("interactions", {operation, ...detail});
      status(result);
      get("live-status").textContent = okMessage;
      return true;
    } catch (error) {
      get("live-status").textContent = error.message;
      return false;
    } finally {
      busy = false;
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    void send("save", {settings: collect()}, "Đã lưu cài đặt cho kênh này.");
  });

  document.querySelectorAll("[data-add-rule]").forEach(button => {
    const kind = button.dataset.addRule;
    button.addEventListener("click", () => {
      const limit = {faq:30, commands:18, gifts:40}[kind];
      if (ready && get("live-" + kind).children.length < limit) row(kind);
    });
  });
  document.querySelectorAll("[data-music-upload]").forEach(button => {
    const slot = button.dataset.musicUpload;
    button.addEventListener("click", async () => {
      const input = get("music-file-" + slot);
      const file = input.files[0];
      if (!file || !/\.(mp3|wav)$/i.test(file.name) || file.size > 10_000_000) {
        get("live-status").textContent = "Chọn MP3 hoặc WAV tối đa 10 MB trước khi nạp.";
        return;
      }
      button.disabled = true;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const chunks = [];
        for (let i = 0; i < bytes.length; i += 16384) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
        if (await send("upload", {slot, data: btoa(chunks.join(""))}, "Đã nạp nhạc " + slot + ".")) input.value = "";
      } catch {
        get("live-status").textContent = "Không đọc được file nhạc.";
      } finally {
        button.disabled = false;
      }
    });
  });
  document.querySelectorAll("[data-music-play]").forEach(button => {
    button.addEventListener("click", () => void send("music_play", {slot:button.dataset.musicPlay}, "Đã gửi lệnh phát nhạc."));
  });
  document.querySelectorAll("[data-poll]").forEach(button => {
    button.addEventListener("click", () => void send("start", {kind:button.dataset.poll}, "Đã mở vòng chơi."));
  });
  const options = () => ({viewer:get("live-viewer").value});
  get("live-test-chat").addEventListener("click", () => void send("test_chat", {...options(), text:get("live-comment").value}, "Đã gửi bình luận thử."));
  get("live-test-gift").addEventListener("click", () => void send("test_gift", {...options(), gift:get("live-gift").value}, "Đã gửi quà thử."));
  document.querySelectorAll("[data-test-audience]").forEach(button => {
    button.addEventListener("click", () => void send("test_audience", {...options(), kind:button.dataset.testAudience}, "Đã gửi sự kiện thử."));
  });
  get("live-memory-clear").addEventListener("click", () => {
    if (ready && !busy && window.confirm("Xóa toàn bộ bộ nhớ người xem của kênh này?"))
      void send("memory_clear", {}, "Đã xóa bộ nhớ người xem.");
  });
  get("live-music-stop").addEventListener("click", () => void send("music_stop", {}, "Đã tắt nhạc."));
  get("live-cancel").addEventListener("click", () => void send("cancel", {}, "Đã hủy vòng."));

  async function refresh() {
    try {
      if (!busy && (!ready || !document.hidden)) {
        const response = await requestApi("interactions");
        if (!ready) {
          load(response.settings);
          ready = true;
          get("live-status").textContent = "Đã tải cài đặt. Bấm Lưu sau khi chỉnh hồ sơ hoặc luật.";
        }
        if (!busy) status(response);
      }
    } catch {
      if (!ready) get("live-status").textContent = "Đang chờ kết nối tới kênh…";
    }
    setTimeout(refresh, 1300);
  }
  void refresh();
})();
