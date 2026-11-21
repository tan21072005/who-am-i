"use strict";
(() => {
  const el = key => document.getElementById("show-" + key);
  const pane = document.getElementById("pane-assistant");
  const fields = ["topic", "product", "notes"];
  const minute = el("minute");
  const line = el("line");
  let revision = -1;
  let lines = Array(30).fill("");
  let dirty = false;
  let busy = false;
  let state = {mode:"stopped", seconds:0};
  for (let i = 0; i < 30; i++) minute.add(new Option("", String(i)));
  const index = () => Number(minute.value);
  const notify = message => { el("message").textContent = message; };

  function paint() {
    const running = state.mode === "running";
    const paused = state.mode === "paused";
    const edit = revision >= 0 && !busy && !state.drafting && !running && !paused;
    for (const id of [...fields, "line", "generate", "save"]) el(id).disabled = !edit;
    el("prepare").disabled = !edit || state.preparing || dirty || !lines.some(Boolean);
    el("start").disabled = state.preparing || !edit || dirty || !lines.some(Boolean);
    el("pause").disabled = busy || !running;
    el("resume").disabled = busy || !paused;
    el("stop").disabled = busy || !(running || paused);
    el("prev").disabled = index() === 0;
    el("next").disabled = index() === 29;
    for (let i = 0; i < lines.length; i++) {
      minute.options[i].text = "Phút " + (i + 1) + (lines[i] ? " · " + lines[i].slice(0, 32) : " · trống");
    }
    const mode = {stopped:"Chưa chạy", running:"Đang chạy", paused:"Tạm dừng", done:"Đã hết 30 phút"};
    el("clock").textContent = mode[state.mode] + " · " + Math.floor(state.seconds / 60) + ":" +
      String(state.seconds % 60).padStart(2, "0") + " / 30:00";
    el("note").textContent = state.audioNote || state.note || "";
  }

  function move(delta) {
    minute.selectedIndex += delta;
    line.value = lines[index()];
    paint();
  }
  minute.onchange = () => move(0);
  el("prev").onclick = () => move(-1);
  el("next").onclick = () => move(1);
  for (const id of [...fields, "line"]) el(id).oninput = () => {
    lines[index()] = line.value;
    dirty = true;
    notify("Có thay đổi chưa lưu.");
    paint();
  };
  function apply(result) {
    state = result;
    if (result.plan) {
      for (const key of fields) el(key).value = result.plan[key];
      lines = result.plan.lines;
      revision = result.revision;
      line.value = lines[index()];
      dirty = false;
    }
  }

  async function run(op) {
    if (busy) return;
    if (op === "generate" && lines.some(Boolean) &&
        !confirm("Thay toàn bộ lời thoại hiện tại khi AI soạn thành công?")) return;
    busy = true;
    paint();
    try {
      const payload = {operation:op, revision};
      if (op === "generate" || op === "save") {
        payload.plan = {lines};
        for (const key of fields) payload.plan[key] = el(key).value;
      }
      apply(await requestApi("assistant", payload));
      if (op === "save") {
        dirty = false;
        revision = state.revision;
      }
      notify(op === "save" ? "Đã lưu cho kênh này." : "");
    } catch (error) { notify(error.message); }
    finally { busy = false; paint(); }
  }
  for (const op of ["save", "generate", "prepare", "start", "stop", "pause", "resume"]) el(op).onclick = () => run(op);
  async function refresh() {
    if (!pane.hidden && !document.hidden && !busy) {
      busy = true;
      try {
        const result = await requestApi("assistant", {operation:revision < 0 ? "load" : "status"});
        if (!result.plan && result.revision !== revision) {
          if (dirty && !state.drafting) {
            notify("Kịch bản đã đổi ở cửa sổ khác. Sao chép lời đang sửa rồi tải lại trang.");
          } else {
            apply(await requestApi("assistant", {operation:"load"}));
          }
        } else apply(result);
      } catch (error) { notify(error.message); }
      finally { busy = false; paint(); }
    }
    setTimeout(refresh, 1200);
  }
  paint();
  void refresh();
})();
