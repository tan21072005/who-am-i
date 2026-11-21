"use strict";
(() => {
  const get = id => document.getElementById(id);

  async function loadMultiState() {
    try {
      const res = await window.requestApi("multi_state", {});
      if (!res || !res.ok) return;

      if (res.stage) {
        const fpsSelect = get("multi-fps-select");
        if (fpsSelect && res.stage.fps) fpsSelect.value = String(res.stage.fps);
        const dragToggle = get("multi-drag-toggle");
        if (dragToggle && res.stage.free_drag !== undefined) dragToggle.checked = Boolean(res.stage.free_drag);
      }

      const list = get("multi-char-list");
      if (!list) return;
      list.innerHTML = "";

      (res.characters || []).forEach(c => {
        const skins = Object.entries((c.renderer && c.renderer.skins) || {});
        const skinOpts = skins.map(([k, v]) =>
          `<option value="${k}" ${c.renderer && c.renderer.active_skin === k ? "selected" : ""}>${v.label || k}</option>`
        ).join("");

        const row = document.createElement("div");
        row.style.cssText = "padding:12px;border:1px solid var(--edge, rgba(255,255,255,0.1));border-radius:12px;background:rgba(255,255,255,0.03);display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;";
        row.innerHTML = `
          <div>
            <strong style="color:var(--accent, #ffc799);font-size:1.05rem;">${c.name}</strong> <small style="opacity:0.7">(${c.id})</small><br/>
            <small style="opacity:0.8">Giọng: ${c.voice?.voice_name || 'Thiện Minh'} · Vị trí X: ${c.stage?.x_ratio ?? 0.5}</small>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <label class="inline" style="margin:0;"><input type="checkbox" data-id="${c.id}" class="mc-enable" ${c.enabled ? "checked" : ""}/> Lên sóng</label>
            ${skinOpts ? `<select data-id="${c.id}" class="mc-skin" style="padding:4px 8px;font-size:0.88rem;">${skinOpts}</select>` : ''}
            <button type="button" data-id="${c.id}" class="mc-wave" style="padding:4px 10px;font-size:0.88rem;">Vẫy chào</button>
          </div>
        `;
        list.appendChild(row);
      });

      list.querySelectorAll(".mc-enable").forEach(el => {
        el.addEventListener("change", async () => {
          try {
            await window.requestApi("multi_update_character", { id: el.dataset.id, enabled: el.checked });
          } catch (e) {
            console.error(e);
          }
        });
      });

      list.querySelectorAll(".mc-skin").forEach(el => {
        el.addEventListener("change", async () => {
          try {
            await window.requestApi("multi_update_character", { id: el.dataset.id, active_skin: el.value });
          } catch (e) {
            console.error(e);
          }
        });
      });

      list.querySelectorAll(".mc-wave").forEach(el => {
        el.addEventListener("click", async () => {
          try {
            el.disabled = true;
            await window.requestApi("multi_trigger_action", {
              speaker: el.dataset.id,
              emotion: "WAVE",
              text: "Xin chào cả nhà vừa vào phòng live nha!"
            });
          } catch (e) {
            console.error(e);
          } finally {
            setTimeout(() => { el.disabled = false; }, 1000);
          }
        });
      });
    } catch (err) {
      console.warn("Chưa tải được trạng thái 4 nhân vật:", err);
    }
  }

  function initListeners() {
    const saveBtn = get("multi-save-stage");
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        const note = get("multi-stage-note");
        try {
          saveBtn.disabled = true;
          if (note) note.textContent = "Đang lưu cấu hình sân khấu...";
          await window.requestApi("multi_stage_settings", {
            fps: Number(get("multi-fps-select").value),
            free_drag: get("multi-drag-toggle").checked
          });
          if (note) note.textContent = "Đã lưu cấu hình sân khấu thành công!";
        } catch (e) {
          if (note) note.textContent = "Lỗi: " + (e.message || "Không lưu được.");
        } finally {
          saveBtn.disabled = false;
        }
      });
    }

    const sendBtn = get("multi-test-send");
    if (sendBtn) {
      sendBtn.addEventListener("click", async () => {
        const input = get("multi-test-input");
        const note = get("multi-test-note");
        const txt = input ? input.value.trim() : "";
        if (!txt) {
          if (note) note.textContent = "Vui lòng nhập nội dung bình luận thử.";
          return;
        }
        try {
          sendBtn.disabled = true;
          if (note) note.textContent = "Đang gửi bình luận đến Đạo diễn AI...";
          const res = await window.requestApi("multi_test_comment", {
            viewer_name: "Chủ phòng",
            comment_text: txt
          });
          if (note) {
            const count = (res && res.turns) ? res.turns.length : 0;
            note.textContent = `Đã gửi thành công! Sinh ${count} lượt thoại đối đáp.`;
          }
          if (input) input.value = "";
        } catch (e) {
          if (note) note.textContent = "Lỗi: " + (e.message || "Không gửi được.");
        } finally {
          sendBtn.disabled = false;
        }
      });
    }

    const idleBtn = get("multi-test-idle");
    if (idleBtn) {
      idleBtn.addEventListener("click", async () => {
        const note = get("multi-test-note");
        try {
          idleBtn.disabled = true;
          if (note) note.textContent = "Đang kích hoạt chuyện phiếm 4 bé...";
          const res = await window.requestApi("multi_trigger_idle", {});
          if (note) {
            const count = (res && res.turns) ? res.turns.length : 0;
            note.textContent = `4 bé đang tán gẫu (${count} lượt thoại)!`;
          }
        } catch (e) {
          if (note) note.textContent = "Lỗi: " + (e.message || "Không kích hoạt được.");
        } finally {
          idleBtn.disabled = false;
        }
      });
    }

    const tabBtn = get("tab-nhanvat");
    if (tabBtn) {
      tabBtn.addEventListener("click", () => {
        void loadMultiState();
      });
    }

    if (location.hash === "#nhanvat") {
      void loadMultiState();
    } else {
      setTimeout(() => { void loadMultiState(); }, 500);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initListeners);
  } else {
    initListeners();
  }

  window.loadMultiState = loadMultiState;
})();
