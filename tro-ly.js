"use strict";
(() => {
  const el = key => document.getElementById("show-" + key);
  const pane = document.getElementById("pane-assistant");
  const fields = ["topic", "product", "notes", "flow", "ground", "idle_start", "chat_limit"];
  const minute = el("minute");
  const line = el("line");
  let revision = -1;
  let plan = {lines: [], chapters: [], flow: "timed", episodes: [0], joins: []};
  let savedPlan = plan;
  let dirty = false;
  let sending = false;
  let polling = false;
  let state = {mode: "stopped", seconds: 0, cursor: 0};
  const episode = () => el("episode").value === "" ? null : Number(el("episode").value);
  const index = () => Math.max(0, minute.selectedIndex);
  const notify = message => { el("message").textContent = message; };
  const asClock = seconds => Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  const hasText = () => plan.lines.some(Boolean);

  function paintChecks() {
    const info = state.checks;
    if (!info) return;
    const surface = info.surface === "setup" ? "overlay setup=1" : info.surface === "plain" ? "overlay thường" : "overlay";
    el("check-source").textContent = info.renderer
      ? `${surface} · phiên ${info.renderer} · ${info.ready ? "đã mở tiếng" : "chưa mở tiếng"}${info.mirror ? " · có nguồn mirror" : ""}`
      : "Overlay phát chính chưa kết nối";
    el("check-voice").textContent = [
      info.engine || "Chưa chọn giọng",
      info.voiceAvailable ? "" : "Thiếu bộ giọng",
      info.playedVoice ? "Đã phát bằng " + info.playedVoice : "Chờ phát thử"
    ].filter(Boolean).join(" · ");
    const audio = info.audio;
    el("check-audio").textContent = audio?.total
      ? `${audio.ready}/${audio.total} đoạn sẵn sàng · thiếu ${audio.total - audio.ready} · ${audio.estimated ? "ước tính " : ""}${asClock(audio.seconds)}`
      : "Chưa có lời thoại";
    let activity = "Sẵn sàng";
    if (!info.renderer) activity = "Overlay mất kết nối";
    else if (!info.ready) activity = "Đang chờ bật âm thanh";
    else if (info.playingSlot != null) activity = "Đang kể đoạn " + (info.playingSlot + 1);
    else if (["chat", "approved"].includes(info.playingKind)) activity = "Đang trả lời chat";
    else if (info.playingKind) activity = "Đang phát lời hoặc hiệu ứng";
    else if (state.mode === "paused") activity = "Kịch bản đang tạm dừng";
    else if (state.preparing) activity = "Đang tạo tiếng trước";
    else if (info.poll) activity = "Đang chờ kết thúc bình chọn";
    else if (info.worker === "script") activity = "Đang chuẩn bị đoạn " + (state.cursor + 1);
    else if (info.worker === "chat") activity = "Đang soạn lời trả lời chat";
    else if (state.mode === "running") activity = "Đang chờ đoạn tiếp theo";
    el("check-now").textContent = activity + (info.drafts ? ` · ${info.drafts} câu chờ duyệt` : "");
  }

  function paint() {
    const running = state.mode === "running";
    const paused = state.mode === "paused";
    const story = plan.flow === "story";
    const edit = revision >= 0 && !sending && !state.drafting && !state.preparing;
    const canStart = !sending && !running && !paused && Boolean(state.id && savedPlan.lines.some(Boolean));
    for (const id of [...fields, "line", "save", "new", "duplicate", "library", "version", "import", "sheet"]) {
      el(id).disabled = !edit;
    }
    if (el("delete")) el("delete").disabled = !edit || !state.id;
    if (el("delete-segment")) el("delete-segment").disabled = !edit || plan.lines.length <= 1;
    if (el("preview-audio")) el("preview-audio").disabled = !plan.lines[index()];
    if (el("clear-audio")) el("clear-audio").disabled = !edit || !state.id;
    el("restore").disabled = !edit || !el("version").value;
    el("generate").hidden = story;
    el("generate").disabled = !edit;
    el("add").disabled = !edit || !story || plan.lines.length >= 6000;
    el("sheet").disabled = !edit || dirty;
    el("story-controls").hidden = !story;
    el("join-label").hidden = !story;
    el("join").checked = plan.joins.includes(index());
    el("join").disabled = !edit || index() === 0 || plan.episodes.includes(index());
    el("episode-minutes").disabled = !edit;
    el("episodes").disabled = !edit || dirty || !hasText();
    el("episode").disabled = sending;
    el("prepare-episode").disabled = !edit || dirty || episode() === null || !hasText();
    el("start-episode").disabled = !canStart || episode() === null;
    el("start").disabled = !canStart;
    el("from").disabled = !canStart || !savedPlan.lines[index()];
    for (const id of ["prepare", "retell", "prepare-chapter"]) {
      el(id).disabled = !edit || dirty || !hasText();
    }
    for (const id of ["from", "retell", "prepare-chapter", "section-help", "add"]) el(id).hidden = !story;
    el("pause").disabled = sending || !running;
    el("resume").disabled = sending || !paused;
    el("stop").disabled = sending || !(running || paused);
    el("prev").disabled = index() === 0;
    el("next").disabled = index() >= plan.lines.length - 1;
    el("start").textContent = savedPlan.flow === "story"
      ? (state.editorCursor > 0 && state.editorCursor < savedPlan.lines.length ? "Kể tiếp bản lưu" : "Kể bản đã lưu")
      : "Phát bản đã lưu";
    const modes = {stopped: "Chưa chạy", running: "Đang chạy", paused: "Tạm dừng", done: "Đã phát xong"};
    const progress = state.playbackFlow === "story" ? ` · Đã kể ${state.cursor}/${state.playbackTotal} đoạn` : "";
    const title = state.playbackId ? " · " + (state.playbackTitle || "Kịch bản chưa đặt tên") : "";
    el("clock").textContent = `${modes[state.mode]} · ${asClock(state.seconds)}${title}${progress}`;
    el("note").textContent = state.audioNote || state.note || "";
    paintChecks();
  }

  function label(i) {
    const prefix = plan.flow === "story" ? "Đoạn " : "Phút ";
    return prefix + (i + 1) + (plan.lines[i] ? " · " + plan.lines[i].slice(0, 48) : "");
  }

  function move(slot) {
    minute.selectedIndex = Math.min(slot, plan.lines.length - 1);
    line.value = plan.lines[index()] || "";
    if (el("preview-box")) el("preview-box").hidden = true;
    paint();
  }

  function drawLines(slot = index()) {
    minute.replaceChildren(...plan.lines.map((_, i) => new Option(label(i), i)));
    el("chapter").replaceChildren(new Option("Chọn chương", ""),
      ...plan.chapters.map(chapter => new Option(chapter.title, chapter.slot)));
    el("chapter-label").hidden = plan.chapters.length === 0;
    move(slot);
  }

  function apply(result) {
    const previousId = state.id;
    const previousEpisode = episode();
    state = result;
    if (!result.plan) return;
    savedPlan = result.plan;
    plan = structuredClone(savedPlan);
    for (const key of fields) {
      if (el(key).type === "checkbox") el(key).checked = plan[key];
      else el(key).value = plan[key];
    }
    revision = result.revision;
    dirty = false;
    el("episode-minutes").value = plan.episode_minutes;
    const options = plan.episodes.map((start, i) => {
      const end = plan.episodes[i + 1] ?? plan.lines.length;
      const chapter = plan.chapters.find(item => item.slot === start);
      return new Option(`Tập ${i + 1} · Đoạn ${start + 1}–${end}${chapter ? " · " + chapter.title : ""}`, i);
    });
    el("episode").replaceChildren(new Option("Toàn bộ kịch bản", ""), ...options);
    const selected = previousId === result.id ? previousEpisode : null;
    if (selected != null && selected < options.length) el("episode").value = String(selected);
    el("source").textContent = plan.source ? "Tài liệu nguồn · " + plan.source : "";
    el("library").replaceChildren(new Option("Chọn kịch bản", ""),
      ...result.catalog.map(item => new Option(item.title, item.id)));
    el("library").value = result.id || "";
    el("version").replaceChildren(new Option("Chọn bản đã lưu", ""),
      ...result.versions.map(v => new Option(new Date(Number(v.slice(0, -6))).toLocaleString(), v)));
    drawLines(previousId === result.id ? index() : Math.min(result.editorCursor ?? 0, plan.lines.length - 1));
  }

  function changed() {
    dirty = true;
    notify("Có thay đổi chưa lưu.");
    paint();
  }
  for (const key of fields) el(key).oninput = () => {
    if (key === "flow" && el(key).value === "timed" && plan.lines.length > 30) {
      el(key).value = plan.flow;
      notify("Chế độ theo lịch chỉ chứa 30 đoạn. Hãy tạo kịch bản theo lịch riêng.");
      return;
    }
    plan[key] = el(key).type === "checkbox" ? el(key).checked :
      el(key).type === "number" ? Number(el(key).value) : el(key).value;
    if (key === "flow") {
      if (plan.flow === "timed") while (plan.lines.length < 30) plan.lines.push("");
      drawLines();
    }
    changed();
  };
  line.oninput = () => {
    plan.lines[index()] = line.value;
    minute.options[index()].text = label(index());
    changed();
  };
  el("join").onchange = () => {
    plan.joins = plan.joins.filter(slot => slot !== index());
    if (el("join").checked) plan.joins.push(index());
    plan.joins.sort((a, b) => a - b);
    changed();
  };
  el("episode").onchange = () => {
    if (episode() !== null) move(plan.episodes[episode()]);
    void refreshEpisode();
  };
  async function refreshEpisode() {
    try {
      const selected = episode();
      const result = await requestApi("assistant", {operation: "status", episode: selected});
      if (!sending && selected === episode() && result.revision === revision) state = result;
      paint();
    } catch (error) { notify(error.message); }
  }
  minute.onchange = () => move(index());
  el("chapter").onchange = () => {
    if (el("chapter").value !== "") move(Number(el("chapter").value));
  };
  el("version").onchange = paint;
  el("prev").onclick = () => move(index() - 1);
  el("next").onclick = () => move(index() + 1);
  el("add").onclick = () => {
    plan.lines.push("");
    drawLines(plan.lines.length - 1);
    changed();
    line.focus();
  };

  async function upload(field) {
    const file = el(field).files[0];
    if (!file || file.size > 12_000_000) throw Error("Chọn một file hợp lệ tối đa 12 MB.");
    const encoded = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(Error("Không đọc được file."));
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(file);
    });
    return {name: file.name, data: encoded};
  }

  async function run(op, detail = {}) {
    if (sending) return;
    if (dirty && ["open", "new", "import", "restore", "from-document"].includes(op) &&
        !confirm("Mở bản khác và bỏ các chỉnh sửa chưa lưu?")) {
      el("library").value = state.id || "";
      return;
    }
    if (op === "generate" && hasText() && !confirm("Soạn lại nội dung? Bản đã lưu có thể khôi phục trong danh sách phiên bản.")) return;
    sending = true;
    paint();
    try {
      const payload = {operation: op, revision, ...detail};
      if (["generate", "save", "duplicate"].includes(op)) payload.plan = plan;
      if (op === "import" || op === "sheet") Object.assign(payload, await upload(op === "import" ? "document" : "csv"));
      const result = await requestApi("assistant", payload);
      if (dirty && ["start", "stop", "pause", "resume"].includes(op)) state = result;
      else apply(result);
      notify(op === "save" ? "Đã lưu kịch bản." : "");
    } catch (error) {
      notify(error.message);
      if (op === "open") el("library").value = state.id || "";
    } finally { sending = false; paint(); }
  }

  for (const op of ["save", "generate", "prepare", "start", "stop", "pause", "resume", "new", "duplicate", "import", "sheet"]) {
    el(op).onclick = () => void run(op);
  }
  pane.addEventListener("bong-document-excerpt", event => void run("from-document", event.detail));
  el("episodes").onclick = () => void run("episodes", {minutes: Number(el("episode-minutes").value)});
  el("prepare-episode").onclick = () => void run("prepare", {episode: episode()});
  el("start-episode").onclick = () => void run("start", {episode: episode()});
  el("from").onclick = () => void run("start", {slot: index()});
  el("retell").onclick = () => void run("retell", {slot: index()});
  el("prepare-chapter").onclick = () => void run("prepare", {slot: index(), chapter: true, episode: episode()});
  el("library").onchange = () => {
    if (el("library").value) void run("open", {id: el("library").value});
  };
  el("restore").onclick = () => void run("restore", {version: el("version").value});

  if (el("delete")) {
    el("delete").onclick = async () => {
      if (!state.id) return;
      const title = plan.topic || state.id;
      if (!confirm(`Bạn có chắc muốn xóa kịch bản "${title}" không? Toàn bộ các đoạn và file âm thanh của kịch bản này sẽ bị xóa.`)) return;
      await run("delete", {id: state.id});
    };
  }

  if (el("delete-segment")) {
    el("delete-segment").onclick = async () => {
      const slot = index();
      if (slot < 0 || slot >= plan.lines.length) return;
      const snippet = (plan.lines[slot] || "").slice(0, 35);
      if (!confirm(`Bạn có chắc muốn xóa đoạn ${slot + 1} ("${snippet}...")?`)) return;
      await run("delete-segment", {slot});
    };
  }

  if (el("clear-audio")) {
    el("clear-audio").onclick = async () => {
      if (!state.id) return;
      if (!confirm("Bạn có chắc muốn xóa toàn bộ file âm thanh đã tạo trước đó của kịch bản này để tạo lại từ đầu?")) return;
      await run("clear-audio");
    };
  }

  if (el("preview-audio")) {
    el("preview-audio").onclick = async () => {
      const slot = index();
      const btn = el("preview-audio");
      const player = el("preview-audio-player");
      const box = el("preview-box");
      const info = el("preview-info");
      if (!box || !player) return;
      try {
        btn.disabled = true;
        btn.textContent = "Đang tạo/tải tiếng…";
        const result = await requestApi("assistant", {operation: "preview", slot});
        if (result && result.audio) {
          player.src = result.audio;
          box.hidden = false;
          info.textContent = `Đoạn ${slot + 1} (${result.provider || "âm thanh"}) · ${result.text || ""}`;
          try {
            await player.play();
          } catch (e) {
            // Browsers may block auto-play until interaction
          }
        } else {
          notify("Không tạo được âm thanh cho đoạn này.");
        }
      } catch (err) {
        notify("Lỗi nghe thử: " + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Nghe thử đoạn này 🔊";
      }
    };
  }

  async function refresh() {
    if (!pane.hidden && !document.hidden && !sending && !polling) {
      polling = true;
      const current = revision;
      try {
        const selected = plan.flow === "story" ? episode() : null;
        const result = await requestApi("assistant", {operation: current < 0 ? "load" : "status", episode: selected});
        if (!sending && current === revision && selected === (plan.flow === "story" ? episode() : null)) {
          if (!result.plan && result.revision !== revision && dirty && !state.drafting) {
            notify("Kịch bản đã đổi ở cửa sổ khác. Sao chép lời đang sửa rồi tải lại trang.");
          } else {
            const next = !result.plan && result.revision !== revision
              ? await requestApi("assistant", {operation: "load"}) : result;
            if (!sending && current === revision) apply(next);
          }
        }
      } catch (error) { notify(error.message); }
      finally { polling = false; paint(); }
    }
    setTimeout(refresh, 1200);
  }
  paint();
  void refresh();
})();
