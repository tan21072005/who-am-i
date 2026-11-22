/* ============================================================================
   nhan-vat-4be.js (v2) — Broadcast Console cho tab #pane-nhanvat
   Tích hợp: Dừng khẩn cấp (Space), Giám sát hàng đợi, 4 Preset đội hình,
   Phím tắt hành động (1-8), Chống vọng tiếng OBS, Đồng bộ SSE/Polling.
   ============================================================================ */

(function () {
  'use strict';

  const CHAR_META = {
    bong: {
      icon: '🌸', short: 'Bông', defaultX: 0.14, defaultScale: 0.92,
      actions: [
        { id: 'IDLE',  icon: '🌸', label: 'Đứng dịu dàng',   sample: 'Bông đang lắng nghe cả nhà đây ạ!' },
        { id: 'WAVE',  icon: '👋', label: 'Vẫy tay chào',    sample: 'Xin chào cả nhà vừa ghé phòng live của tụi mình nha!' },
        { id: 'TALK',  icon: '🗣️', label: 'Dẫn chuyện',      sample: 'Để Bông kể tiếp đoạn thú vị này cho mọi người nghe nhé!' },
        { id: 'HAPPY', icon: '✨', label: 'Vui vẻ tỏa sáng', sample: 'Cảm ơn mọi người đã thả tim siêu nhiệt tình luôn!' },
        { id: 'LAUGH', icon: '😄', label: 'Cười tươi',       sample: 'Haha anh Hổ lại chọc Bé Rồng nữa rồi kìa!' },
        { id: 'LOVE',  icon: '💖', label: 'Thả tim yêu',     sample: 'Thương cả nhà nhiều lắm luôn đó!' },
        { id: 'THINK', icon: '🤔', label: 'Suy nghĩ',        sample: 'Hmm để Bông xem câu hỏi tiếp theo của bạn là gì nào...' },
        { id: 'SHOCK', icon: '😮', label: 'Ngạc nhiên',      sample: 'Ủa thật luôn hả, bất ngờ quá đi mất!' }
      ]
    },
    rong: {
      icon: '🐉', short: 'Rồng', defaultX: 0.38, defaultScale: 0.95,
      actions: [
        { id: 'IDLE',       icon: '🧍', label: 'Đứng chính diện',  sample: 'Bé Rồng đang ngồi ngoan nghe kể chuyện nè!' },
        { id: 'WAVE',       icon: '👋', label: 'Vẫy tay nhấc chân', sample: 'Chào mấy anh chị mới vào phòng live nha!' },
        { id: 'ICE_BREATH', icon: '❄️', label: 'Phun Băng',        sample: 'Hô biến! Băng ngọc lung linh mát lạnh luôn nè!' },
        { id: 'ROAR',       icon: '🐉', label: 'Gầm Rồng',         sample: 'Grào! Đừng có dọa Bé Rồng nha anh Hổ!' },
        { id: 'FLY',        icon: '🪽', label: 'Xòe Cánh Bay',     sample: 'Woa bay lên cao nhìn thấy hết cả phòng live luôn!' },
        { id: 'HAPPY',      icon: '💎', label: 'Cười Ngọc Sáng',   sample: 'Vui quá trời luôn, cảm ơn quà tặng của bạn nha!' },
        { id: 'SCARED',     icon: '🫣', label: 'Ôm Đuôi Nấp',      sample: 'Áaa chuyện ma sợ quá, chị Bông cứu Rồng với!' },
        { id: 'TALK',       icon: '🗣️', label: 'Nói Chuyện',       sample: 'Ủa sao lại thế hả chị Bông, kể tiếp đi mà!' }
      ]
    },
    ho: {
      icon: '🐯', short: 'Hổ', defaultX: 0.62, defaultScale: 1.0,
      actions: [
        { id: 'IDLE',  icon: '🐯', label: 'Khoanh Tay Oai',  sample: 'Tui đứng đây trông chừng mấy đứa nhỏ đó nha.' },
        { id: 'WAVE',  icon: '👋', label: 'Vẫy Tay Chào',    sample: 'Chào mấy ông mới ghé phòng live của anh Hổ nha!' },
        { id: 'TALK',  icon: '👉', label: 'Nói & Phán Xét',  sample: 'Nghe vô lý hết sức, nhưng thôi nể khán giả đó nha!' },
        { id: 'LAUGH', icon: '🥁', label: 'Vỗ Bụng Cười',    sample: 'Hahaha câu này công nhận hài thật sự luôn!' },
        { id: 'ANGRY', icon: '💨', label: 'Bốc Khói Quạu',   sample: 'Này Thỏ kia, ai cho gọi anh Hổ là Hổ Mập hả?!' },
        { id: 'HAPPY', icon: '🏆', label: 'Ăn Mừng',         sample: 'Quá đỉnh luôn! Cảm ơn bạn đã tặng quà cho cả nhóm!' }
      ]
    },
    tho: {
      icon: '🐰', short: 'Thỏ', defaultX: 0.86, defaultScale: 0.94,
      actions: [
        { id: 'IDLE',   icon: '🥕', label: 'Ôm Cà Rốt',       sample: 'Thỏ đang ôm củ cà rốt siêu to khổng lồ chờ đọc comment nè!' },
        { id: 'TALK',   icon: '🎤', label: 'Cà Rốt Micro',    sample: 'Alo alo cả nhà ơi, thả tim tiếp cho tụi mình nha!' },
        { id: 'HAPPY',  icon: '💖', label: 'Cười Ôm Cà Rốt',  sample: 'Yêu cả nhà quá đi, hôm nay phòng live vui hết nấc!' },
        { id: 'WAVE',   icon: '📣', label: 'Vung Cà Rốt Chào', sample: 'Hello bạn mới vào nha, muốn trêu anh Hổ thì gõ @ho nhé!' },
        { id: 'SCARED', icon: '🛡️', label: 'Ngại / Giật Mình', sample: 'Ui giời ơi anh Hổ lại gắt nữa rồi, Thỏ trốn đây!' },
        { id: 'LAUGH',  icon: '😂', label: 'Cười Khoái Chí',  sample: 'Hehe chọc anh Hổ vui nhất trên đời luôn á!' }
      ]
    }
  };

  const PRESETS = [
    { id: 'all4',      label: '✨ Cả 4 bé' },
    { id: 'solo_bong', label: '🌸 Chỉ Bông' },
    { id: 'ho_tho',    label: '🔥 Hổ & Thỏ đấu khẩu' },
    { id: 'trio_3d',   label: '🐉 Bộ 3 3D' }
  ];

  let state = {
    characters: [],
    stage: { fps: 30, free_drag: false, active_preset: 'all4' },
    health: { queue_total: 0, buffer_comments: 0, last_error: null },
    selectedChar: 'rong',
    bgMode: 'dark',
    lastAction: {}
  };

  let toastTimer = null;

  async function callApi(op, payload) {
    if (typeof window.requestApi === 'function') {
      return await window.requestApi(op, payload || {});
    }
    const res = await fetch('/api/' + op, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    return await res.json();
  }

  function showToast(msg) {
    const el = document.getElementById('nv4Toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function postToStage(msg) {
    const frame = document.getElementById('nv4StageFrame');
    if (frame && frame.contentWindow) {
      try { frame.contentWindow.postMessage(msg, '*'); } catch (_e) {}
    }
  }

  function getChar(id) {
    return state.characters.find((c) => c.id === id) || state.characters[0];
  }

  function isTabVisible() {
    const pane = document.getElementById('pane-nhanvat');
    if (!pane) return false;
    return pane.offsetParent !== null && !pane.hidden;
  }

  function buildShell(root) {
    root.innerHTML = `
      <div class="nv-shell">
        <!-- Compact Broadcast Header: Health + FPS + BG + Panic Stop -->
        <div class="nv-topbar">
          <div class="nv-health-strip">
            <span class="nv-metric-pill" id="nv4ConnPill">
              <span class="nv-live-dot" id="nv4LiveDot"></span>
              <span id="nv4ConnText">Sẵn sàng</span>
            </span>
            <span class="nv-metric-pill">Hàng đợi TTS: <strong id="nv4QueueVal">0</strong></span>
            <span class="nv-metric-pill">Buffer chat: <strong id="nv4BufferVal">0</strong></span>
            <span class="nv-metric-pill">Đang bật: <strong id="nv4EnabledVal">4/4</strong></span>
          </div>

          <div class="nv-topbar-controls">
            <div class="nv-pill-group" role="group" aria-label="Chọn FPS">
              <span class="nv-pill-label">FPS</span>
              <button type="button" class="nv-pill-btn" data-fps="24">24</button>
              <button type="button" class="nv-pill-btn active" data-fps="30">30</button>
              <button type="button" class="nv-pill-btn" data-fps="60">60</button>
            </div>
            <div class="nv-pill-group" role="group" aria-label="Chọn nền xem trước">
              <button type="button" class="nv-pill-btn active" data-bg="dark">Tối</button>
              <button type="button" class="nv-pill-btn" data-bg="chroma">OBS Xanh</button>
              <button type="button" class="nv-pill-btn" data-bg="checker">Trong suốt</button>
            </div>
            <button id="nv4PanicBtn" type="button" class="nv-panic-btn" title="Phím tắt: Space">⛔ Dừng khẩn cấp</button>
          </div>
        </div>

        <!-- Stage Preview Card -->
        <section id="nv4StageCard" class="nv-stage-card bg-dark">
          <div class="nv-stage-bar">
            <div class="nv-btn-row" id="nv4PresetRow">
              ${PRESETS.map((p) => `<button type="button" class="nv-preset-btn" data-preset="${p.id}">${p.label}</button>`).join('')}
            </div>
            <div class="nv-btn-row">
              <button id="nv4DragBtn" type="button" class="nv-chip-btn">✋ Kéo-thả: TẮT</button>
              <button id="nv4IdleBtn" type="button" class="nv-chip-btn">🎭 Chuyện phiếm 4 bé</button>
            </div>
          </div>

          <div class="nv-stage-viewport">
            <iframe id="nv4StageFrame" class="nv-stage-iframe" src="/overlay-3d.html?mirror=1&captions=1&preview=1&bg=dark" title="Xem trước sân khấu 4 nhân vật"></iframe>
            <div class="nv-stage-badge">Xem trước tắt tiếng (chống vọng OBS) • Phím 1–8: Hành động • Space: Dừng</div>
          </div>

          <form id="nv4SpeakForm" class="nv-speak-bar">
            <select id="nv4SpeakerSelect" class="nv-select" aria-label="Chọn nhân vật nói">
              <option value="bong">🌸 Bông Đào</option>
              <option value="rong" selected>🐉 Bé Rồng Ngọc</option>
              <option value="ho">🐯 Hổ Mập</option>
              <option value="tho">🐰 Thỏ Cà Rốt</option>
            </select>
            <input id="nv4SpeakInput" class="nv-input" type="text" placeholder="Nhập lời thoại để diễn ngay, hoặc gõ @ho / @rong để thử đối đáp 4 bé..." value="Chào cả nhà! Hôm nay đội hình 4 nhân vật lên sóng cực nét luôn nè!" />
            <button type="submit" class="nv-btn-primary">🗣️ Nói thử</button>
            <button id="nv4TestCommentBtn" type="button" class="nv-btn-secondary">💬 Đối đáp 4 bé</button>
          </form>
        </section>

        <!-- Bottom 2-Column Controls -->
        <div class="nv-bottom-grid">
          <!-- Left: Character Actions + Hotkeys -->
          <div class="nv-panel">
            <div class="nv-panel-head">
              <h3 id="nv4CtrlTitle" class="nv-section-title">Hành động: Bé Rồng Ngọc</h3>
              <div class="nv-pill-group" id="nv4CharTabs"></div>
            </div>
            <div id="nv4CharMeta" class="nv-char-meta"></div>
            <div id="nv4ActionGrid" class="nv-action-grid"></div>
          </div>

          <!-- Right: Skins, Layout & Anti-Echo OBS Links -->
          <div class="nv-panel">
            <div class="nv-panel-head">
              <h3 class="nv-section-title">Đổi Skin</h3>
              <span style="font-size:11px;color:#a99bbd;">Lưu tự động (Atomic)</span>
            </div>
            <div id="nv4SkinGrid" class="nv-skin-grid"></div>

            <div class="nv-divider"></div>

            <h3 class="nv-section-title">Vị trí &amp; Tỉ lệ</h3>
            <div class="nv-slider-row">
              <span class="nv-slider-label">Tỉ lệ:</span>
              <input id="nv4ScaleSlider" class="nv-slider" type="range" min="65" max="125" value="95" />
              <span id="nv4ScaleVal" class="nv-slider-val">95%</span>
            </div>
            <div class="nv-slider-row">
              <span class="nv-slider-label">Vị trí X:</span>
              <input id="nv4PosSlider" class="nv-slider" type="range" min="2" max="98" value="38" />
              <span id="nv4PosVal" class="nv-slider-val">38%</span>
            </div>

            <div class="nv-divider"></div>

            <button id="nv4PartyBtn" type="button" class="nv-btn-secondary" style="width:100%;">🎉 Cả 4 bé cùng vẫy chào khán giả</button>

            <div class="nv-obs-box">
              <div class="nv-obs-head">
                <span>Nguồn phát OBS (Chống vọng tiếng)</span>
                <a href="/overlay-3d.html?captions=1" target="_blank" rel="noopener" style="color:#ffc48c;text-decoration:none;">Mở tab riêng ↗</a>
              </div>
              <div class="nv-obs-actions">
                <button id="nv4CopyObsAudio" type="button" class="nv-chip-btn">🔊 Copy link chính (Có tiếng)</button>
                <button id="nv4CopyObsMirror" type="button" class="nv-chip-btn">🔇 Copy link phụ (Chỉ hình)</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="nv4Toast" class="nv-toast" role="status" aria-live="polite"></div>
    `;
  }

  function renderTopAndHealth() {
    const fps = Number(state.stage.fps || 30);
    document.querySelectorAll('#pane-nhanvat [data-fps]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.fps) === fps);
    });
    document.querySelectorAll('#pane-nhanvat [data-bg]').forEach((b) => {
      b.classList.toggle('active', b.dataset.bg === state.bgMode);
    });
    const stageCard = document.getElementById('nv4StageCard');
    if (stageCard) {
      stageCard.classList.remove('bg-dark', 'bg-chroma', 'bg-checker');
      stageCard.classList.add('bg-' + state.bgMode);
    }

    const activePreset = state.stage.active_preset || 'all4';
    document.querySelectorAll('#nv4PresetRow [data-preset]').forEach((b) => {
      b.classList.toggle('active', b.dataset.preset === activePreset);
    });

    const dragBtn = document.getElementById('nv4DragBtn');
    if (dragBtn) {
      const on = Boolean(state.stage.free_drag);
      dragBtn.textContent = on ? '✋ Kéo-thả: BẬT' : '✋ Kéo-thả: TẮT';
      dragBtn.classList.toggle('drag-on', on);
    }

    const h = state.health || {};
    const qEl = document.getElementById('nv4QueueVal');
    const bEl = document.getElementById('nv4BufferVal');
    const eEl = document.getElementById('nv4EnabledVal');
    const dot = document.getElementById('nv4LiveDot');
    const txt = document.getElementById('nv4ConnText');
    const enabledCount = state.characters.filter((c) => c.enabled).length;

    if (qEl) qEl.textContent = String(h.queue_total ?? 0);
    if (bEl) bEl.textContent = String(h.buffer_comments ?? 0);
    if (eEl) eEl.textContent = `${enabledCount}/${state.characters.length || 4}`;
    if (dot && txt) {
      if (h.last_error) {
        dot.classList.add('warn');
        txt.textContent = 'Cảnh báo: ' + String(h.last_error).slice(0, 28);
      } else {
        dot.classList.remove('warn');
        txt.textContent = `LIVE ${fps} FPS`;
      }
    }
  }

  function renderCharTabs() {
    const container = document.getElementById('nv4CharTabs');
    if (!container) return;
    container.innerHTML = '';
    ['bong', 'rong', 'ho', 'tho'].forEach((id) => {
      const c = getChar(id);
      const meta = CHAR_META[id];
      if (!c || !meta) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nv-pill-btn' + (state.selectedChar === id ? ' active' : '');
      btn.textContent = `${meta.icon} ${meta.short}`;
      btn.addEventListener('click', () => {
        state.selectedChar = id;
        const sel = document.getElementById('nv4SpeakerSelect');
        if (sel) sel.value = id;
        renderCharControls();
      });
      container.appendChild(btn);
    });
  }

  async function triggerAction(c, act) {
    const meta = CHAR_META[c.id] || CHAR_META.rong;
    state.lastAction[c.id] = act.id;
    renderCharControls();
    postToStage({ type: 'previewAction', speaker: c.id, emotion: act.id, text: act.sample, speakerName: c.name });
    await callApi('multi_trigger_action', { speaker: c.id, emotion: act.id, text: act.sample });
    showToast(`${meta.icon} ${c.name} → ${act.label}`);
  }

  function renderCharControls() {
    const c = getChar(state.selectedChar);
    if (!c) return;
    const meta = CHAR_META[c.id] || CHAR_META.rong;

    renderCharTabs();

    const titleEl = document.getElementById('nv4CtrlTitle');
    if (titleEl) titleEl.textContent = `Hành động: ${c.name}`;

    const metaEl = document.getElementById('nv4CharMeta');
    if (metaEl) {
      const voiceName = (c.voice && c.voice.voice_name) || 'Mặc định';
      metaEl.innerHTML = `
        <div><strong>${meta.icon} ${c.name}</strong> <span style="color:#a99bbd;margin-left:6px;">Giọng: ${voiceName}</span></div>
        <label class="nv-switch-label">
          <input id="nv4EnableToggle" type="checkbox" ${c.enabled ? 'checked' : ''} />
          <span>Lên sóng</span>
        </label>
      `;
      const toggle = document.getElementById('nv4EnableToggle');
      toggle.addEventListener('change', async () => {
        c.enabled = toggle.checked;
        renderTopAndHealth();
        await callApi('multi_update_character', { id: c.id, enabled: c.enabled });
        postToStage({ type: 'refreshState' });
        showToast(`${c.name}: ${c.enabled ? 'Đã bật lên sóng' : 'Đã tạm ẩn'}`);
      });
    }

    const actionGrid = document.getElementById('nv4ActionGrid');
    if (actionGrid) {
      actionGrid.innerHTML = '';
      const activeAct = state.lastAction[c.id] || 'IDLE';
      meta.actions.forEach((act, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nv-action-card' + (activeAct === act.id ? ' active' : '');
        btn.innerHTML = `
          <span class="nv-hotkey">${idx + 1}</span>
          <div class="nv-action-name"><span>${act.icon}</span><span>${act.label}</span></div>
          <div class="nv-action-code">${act.id}</div>
        `;
        btn.addEventListener('click', () => triggerAction(c, act));
        actionGrid.appendChild(btn);
      });
    }

    const skinGrid = document.getElementById('nv4SkinGrid');
    if (skinGrid) {
      skinGrid.innerHTML = '';
      const skins = (c.renderer && c.renderer.skins) || {};
      const activeSkin = (c.renderer && c.renderer.active_skin) || Object.keys(skins)[0] || 'default';
      Object.entries(skins).forEach(([skinId, skinObj]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nv-skin-btn' + (activeSkin === skinId ? ' active' : '');
        btn.textContent = skinObj.label || skinId;
        btn.addEventListener('click', async () => {
          if (!c.renderer) c.renderer = {};
          c.renderer.active_skin = skinId;
          renderCharControls();
          await callApi('multi_update_character', { id: c.id, active_skin: skinId });
          postToStage({ type: 'refreshState' });
          showToast(`Skin ${c.name} → ${skinObj.label || skinId}`);
        });
        skinGrid.appendChild(btn);
      });
    }

    const scalePct = Math.round(((c.stage && c.stage.scale) || meta.defaultScale) * 100);
    const posPct = Math.round(((c.stage && c.stage.x_ratio) || meta.defaultX) * 100);
    const scaleSlider = document.getElementById('nv4ScaleSlider');
    const posSlider = document.getElementById('nv4PosSlider');
    if (scaleSlider) {
      scaleSlider.value = String(Math.max(65, Math.min(125, scalePct)));
      document.getElementById('nv4ScaleVal').textContent = `${scaleSlider.value}%`;
    }
    if (posSlider) {
      posSlider.value = String(Math.max(2, Math.min(98, posPct)));
      document.getElementById('nv4PosVal').textContent = `${posSlider.value}%`;
    }
  }

  async function runPanicStop() {
    postToStage({ type: 'panicStop' });
    const res = await callApi('multi_panic_stop', {});
    if (res && res.health) state.health = res.health;
    renderTopAndHealth();
    showToast('⛔ Đã dừng phát thoại & xóa sạch hàng đợi 4 bé!');
  }

  function bindEvents() {
    document.querySelectorAll('#pane-nhanvat [data-fps]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fps = Number(btn.dataset.fps);
        state.stage.fps = fps;
        renderTopAndHealth();
        await callApi('multi_stage_settings', { fps, free_drag: Boolean(state.stage.free_drag) });
        postToStage({ type: 'refreshState' });
        showToast(`Đã đặt ${fps} FPS`);
      });
    });

    document.querySelectorAll('#pane-nhanvat [data-bg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.bgMode = btn.dataset.bg;
        renderTopAndHealth();
        postToStage({ type: 'setBg', bg: state.bgMode });
      });
    });

    document.getElementById('nv4PanicBtn')?.addEventListener('click', runPanicStop);

    document.querySelectorAll('#nv4PresetRow [data-preset]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const preset = btn.dataset.preset;
        const res = await callApi('multi_apply_preset', { preset });
        if (res && res.ok) {
          state.characters = res.characters || state.characters;
          state.stage = Object.assign(state.stage, res.stage || { active_preset: preset });
          renderTopAndHealth();
          renderCharControls();
          postToStage({ type: 'refreshState' });
          showToast(`Đã chuyển đội hình: ${btn.textContent}`);
        }
      });
    });

    document.getElementById('nv4DragBtn')?.addEventListener('click', async () => {
      state.stage.free_drag = !state.stage.free_drag;
      renderTopAndHealth();
      await callApi('multi_stage_settings', {
        fps: Number(state.stage.fps || 30),
        free_drag: state.stage.free_drag
      });
      postToStage({ type: 'refreshState' });
      showToast(state.stage.free_drag ? 'Đã BẬT kéo-thả vị trí' : 'Đã TẮT kéo-thả vị trí');
    });

    document.getElementById('nv4IdleBtn')?.addEventListener('click', async () => {
      showToast('Đang gọi AI sinh chuyện phiếm 4 bé...');
      const res = await callApi('multi_trigger_idle', {});
      if (res && res.ok) showToast(`Đã đẩy ${(res.turns || []).length} lượt đối đáp vào hàng phát`);
    });

    document.getElementById('nv4SpeakForm')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const speaker = document.getElementById('nv4SpeakerSelect').value;
      const text = document.getElementById('nv4SpeakInput').value.trim();
      if (!text) return;
      const c = getChar(speaker);
      postToStage({ type: 'previewAction', speaker, emotion: 'TALK', text, speakerName: c ? c.name : speaker });
      await callApi('multi_trigger_action', { speaker, emotion: 'TALK', text });
      showToast(`Đã gửi lời thoại cho ${c ? c.name : speaker}`);
    });

    document.getElementById('nv4TestCommentBtn')?.addEventListener('click', async () => {
      const text = document.getElementById('nv4SpeakInput').value.trim();
      if (!text) return;
      showToast('Đang sinh hội thoại 4 bé...');
      const res = await callApi('multi_test_comment', { viewer_name: 'Chủ phòng', comment_text: text });
      if (res && res.ok) showToast(`Đã sinh ${(res.turns || []).length} lượt đối đáp`);
    });

    let sliderDebounce = null;
    const scaleSlider = document.getElementById('nv4ScaleSlider');
    const posSlider = document.getElementById('nv4PosSlider');
    const commitTransform = () => {
      const c = getChar(state.selectedChar);
      if (!c) return;
      const scale = Number(scaleSlider.value) / 100;
      const x_ratio = Number(posSlider.value) / 100;
      if (!c.stage) c.stage = {};
      c.stage.scale = scale;
      c.stage.x_ratio = x_ratio;
      clearTimeout(sliderDebounce);
      sliderDebounce = setTimeout(async () => {
        await callApi('multi_update_character', { id: c.id, scale, x_ratio });
        postToStage({ type: 'refreshState' });
      }, 150);
    };

    scaleSlider?.addEventListener('input', () => {
      document.getElementById('nv4ScaleVal').textContent = `${scaleSlider.value}%`;
      commitTransform();
    });
    posSlider?.addEventListener('input', () => {
      document.getElementById('nv4PosVal').textContent = `${posSlider.value}%`;
      commitTransform();
    });

    document.getElementById('nv4PartyBtn')?.addEventListener('click', async () => {
      state.characters.filter((c) => c.enabled).forEach((c) => {
        postToStage({ type: 'previewAction', speaker: c.id, emotion: 'WAVE', text: 'Chào cả nhà nha!', speakerName: c.name });
      });
      await callApi('multi_trigger_action', {
        speaker: state.selectedChar,
        emotion: 'WAVE',
        text: 'Cả 4 tụi mình cùng vẫy tay chào cả nhà đang xem live nha!'
      });
      showToast('🎉 Cả đội hình đã bật vẫy chào!');
    });

    const copyLink = async (suffix, label) => {
      const url = `${window.location.origin}/overlay-3d.html${suffix}`;
      try { await navigator.clipboard.writeText(url); showToast(`Đã copy ${label}!`); }
      catch (_e) { showToast(url); }
    };
    document.getElementById('nv4CopyObsAudio')?.addEventListener('click', () => copyLink('?captions=1', 'link OBS chính (có tiếng)'));
    document.getElementById('nv4CopyObsMirror')?.addEventListener('click', () => copyLink('?mirror=1&captions=1', 'link OBS phụ (chỉ hình)'));

    // Phím tắt Broadcast: 1-8 gọi hành động, Space dừng khẩn cấp
    window.addEventListener('keydown', (e) => {
      if (!isTabVisible()) return;
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Space') {
        e.preventDefault();
        runPanicStop();
        return;
      }
      const num = Number(e.key);
      if (num >= 1 && num <= 8) {
        const c = getChar(state.selectedChar);
        const meta = c && CHAR_META[c.id];
        if (meta && meta.actions[num - 1]) {
          e.preventDefault();
          triggerAction(c, meta.actions[num - 1]);
        }
      }
    });

    window.addEventListener('message', (ev) => {
      if (!ev.data || ev.data.type !== 'charDragged') return;
      const c = getChar(ev.data.id);
      if (c && c.stage) {
        c.stage.x_ratio = ev.data.x_ratio;
        if (state.selectedChar === c.id) renderCharControls();
      }
    });
  }

  async function loadMultiState() {
    try {
      const res = await callApi('multi_state', {});
      if (!res || !res.ok) return;
      state.characters = res.characters || [];
      state.stage = Object.assign({ fps: 30, free_drag: false, active_preset: 'all4' }, res.stage || {});
      if (res.health) state.health = res.health;
      renderTopAndHealth();
      renderCharControls();
    } catch (_err) {}
  }

  async function pollHealth() {
    if (!isTabVisible()) return;
    try {
      const h = await callApi('multi_health', {});
      if (h && h.ok) {
        state.health = h;
        renderTopAndHealth();
      }
    } catch (_err) {}
  }

  function init() {
    const pane = document.getElementById('pane-nhanvat');
    if (!pane) return;
    buildShell(pane);
    bindEvents();
    loadMultiState();
    setInterval(pollHealth, 2500);
    document.getElementById('tab-nhanvat')?.addEventListener('click', loadMultiState);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
