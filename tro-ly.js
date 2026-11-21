"use strict";
(() => {
  const el = key => document.getElementById("show-" + key);
  const pane = document.getElementById("pane-assistant");
  const fields = ["topic", "product", "notes", "flow", "ground", "idle_start"];
  const minute = el("minute");
  const line = el("line");
  let revision = -1;
  let plan = {lines: [], chapters: [], flow: "timed"};
  let dirty = false;
  let sending = false;
  let polling = false;
  let state = {mode: "stopped", seconds: 0, cursor: 0};
  const index = () => Math.max(0, minute.selectedIndex);
  const notify = message => { el("message").textContent = message; };
  const asClock = seconds => Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  const hasText = () => plan.lines.some(Boolean);

  function paint() {
    const running = state.mode === "running";
    const paused = state.mode === "paused";
    const story = plan.flow === "story";
    const edit = revision >= 0 && !sending && !state.drafting && !state.preparing && !running && !paused;
    for (const id of [...fields, "line", "save", "new", "duplicate", "library", "version", "import", "sheet"]) {
      el(id).disabled = !edit;
    }
    el("restore").disabled = !edit || !el("version").value;
    el("generate").disabled = !edit || story;
    el("add").disabled = !edit || !story || plan.lines.length >= 6000;
    el("sheet").disabled = !edit || dirty;
    for (const id of ["prepare", "start", "from", "retell", "prepare-chapter"]) {
      el(id).disabled = !edit || dirty || !hasText();
    }
    for (const id of ["from", "retell", "prepare-chapter", "section-help", "add"]) el(id).hidden = !story;
    el("pause").disabled = sending || !running;
    el("resume").disabled = sending || !paused;
    el("stop").disabled = sending || !(running || paused);
    el("prev").disabled = index() === 0;
    el("next").disabled = index() >= plan.lines.length - 1;
    el("start").textContent = story ? (state.cursor > 0 && state.cursor < plan.lines.length ? "Kể tiếp" : "Kể từ đầu") : "Bắt đầu 30 phút";
    el("play-help").textContent = story
      ? "Bông kể nối tiếp. Câu chat sẵn sàng được phát giữa các đoạn. Tiến độ được lưu khi đoạn phát xong."
      : "Mỗi phút tối đa một đoạn. Bông ưu tiên chat và bỏ qua mốc đã trôi.";
    const modes = {stopped: "Chưa chạy", running: "Đang chạy", paused: "Tạm dừng", done: "Đã phát xong"};
    const progress = story ? `Đã kể ${state.cursor}/${plan.lines.length} đoạn` : "30:00";
    el("clock").textContent = `${modes[state.mode]} · ${asClock(state.seconds)} / ${progress}`;
    el("note").textContent = state.audioNote || state.note || "";
  }

  function label(i) {
    const prefix = plan.flow === "story" ? "Đoạn " : "Phút ";
    return prefix + (i + 1) + (plan.lines[i] ? " · " + plan.lines[i].slice(0, 48) : "");
  }

  function move(slot) {
    minute.selectedIndex = Math.min(slot, plan.lines.length - 1);
    line.value = plan.lines[index()] || "";
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
    state = result;
    if (!result.plan) return;
    plan = result.plan;
    for (const key of fields) {
      if (el(key).type === "checkbox") el(key).checked = plan[key];
      else el(key).value = plan[key];
    }
    revision = result.revision;
    dirty = false;
    el("source").textContent = plan.source ? "Tài liệu nguồn · " + plan.source : "";
    el("library").replaceChildren(new Option("Chọn kịch bản", ""),
      ...result.catalog.map(item => new Option(item.title, item.id)));
    el("library").value = result.id || "";
    el("version").replaceChildren(new Option("Chọn bản đã lưu", ""),
      ...result.versions.map(v => new Option(new Date(Number(v.slice(0, -6))).toLocaleString(), v)));
    drawLines(previousId === result.id ? index() : Math.min(result.cursor, plan.lines.length - 1));
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
    plan[key] = el(key).type === "checkbox" ? el(key).checked : el(key).value;
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
    if (dirty && ["open", "new", "import", "restore"].includes(op) &&
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
      apply(await requestApi("assistant", payload));
      notify(op === "save" ? "Đã lưu kịch bản." : "");
    } catch (error) {
      notify(error.message);
      if (op === "open") el("library").value = state.id || "";
    } finally { sending = false; paint(); }
  }

  for (const op of ["save", "generate", "prepare", "start", "stop", "pause", "resume", "new", "duplicate", "import", "sheet"]) {
    el(op).onclick = () => void run(op);
  }
  el("from").onclick = () => void run("start", {slot: index()});
  el("retell").onclick = () => void run("retell", {slot: index()});
  el("prepare-chapter").onclick = () => void run("prepare", {slot: index(), chapter: true});
  el("library").onchange = () => {
    if (el("library").value) void run("open", {id: el("library").value});
  };
  el("restore").onclick = () => void run("restore", {version: el("version").value});

  async function refresh() {
    if (!pane.hidden && !document.hidden && !sending && !polling) {
      polling = true;
      const current = revision;
      try {
        const result = await requestApi("assistant", {operation: current < 0 ? "load" : "status"});
        if (!sending && current === revision) {
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
