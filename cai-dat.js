"use strict";
(() => {
  const item = id => document.getElementById(id);
  const action = item("sound-action");
  const file = item("sound-file");
  const volume = item("sound-volume");
  const upload = item("sound-upload");
  const test = item("sound-test");
  const reset = item("sound-reset");
  const mode = item("performance-mode");
  const descriptions = {
    custom: "File bạn đã lưu cho kênh này",
    shared: "File dùng chung trong thư mục effects",
    bundled: "Bản thu đi kèm",
    none: "Chưa có hiệu ứng"
  };
  let state;
  let saving = false;

  for (const [value, name] of Object.entries(BongHoa.actions)) action.add(new Option(name, value));
  action.value = "LAUGH";

  function render() {
    action.disabled = file.disabled = mode.disabled = !state || saving;
    if (!state) return;
    const sound = state.sounds[action.value];
    mode.value = state.mode;
    volume.value = sound.volume;
    item("sound-volume-label").value = sound.volume + "%";
    item("sound-source").textContent = descriptions[sound.source];
    volume.disabled = saving;
    upload.disabled = saving || !file.files.length;
    test.disabled = saving || sound.source === "none" || sound.volume === 0;
    reset.disabled = saving || sound.source !== "custom";
  }

  async function change(work, note, success) {
    saving = true;
    render();
    note.textContent = "Đang lưu…";
    try {
      state = await work();
      note.textContent = success;
    } catch (error) {
      note.textContent = error.message;
    } finally {
      saving = false;
      render();
    }
  }

  const soundNote = item("sound-note");
  action.addEventListener("change", () => {
    file.value = "";
    soundNote.textContent = "";
    render();
  });
  file.addEventListener("change", render);

  volume.addEventListener("input", () => {
    item("sound-volume-label").value = volume.value + "%";
  });
  volume.addEventListener("change", () => {
    const chosenVolume = Number(volume.value);
    void change(() => requestApi("preferences", {operation: "volume", gesture: action.value, volume: chosenVolume}),
      soundNote, "Đã lưu âm lượng.");
  });

  upload.addEventListener("click", () => {
    const clip = file.files[0];
    const gesture = action.value;
    if (!clip) return;
    void change(async () => {
      if (!/\.(mp3|wav)$/i.test(clip.name) || clip.size > 1500000 || clip.size < 44)
        throw new Error("Chọn tệp MP3 hoặc WAV tối đa 1,5 MB.");
      const original = await clip.arrayBuffer();
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(original.slice(0));
        if (decoded.duration > 4 || decoded.duration < .04)
          throw new Error("Tệp phải dài từ 0,04 đến 4 giây.");
      } catch (error) {
        if (error.name === "EncodingError") throw new Error("Trình duyệt không đọc được tệp này. Hãy thử MP3 hoặc WAV PCM.");
        throw error;
      } finally {
        await context.close();
      }
      const buffer = new Uint8Array(original);
      const chunks = [];
      for (let i = 0; i < buffer.length; i += 16384) chunks.push(String.fromCharCode(...buffer.subarray(i, i + 16384)));
      const result = await requestApi("preferences", {operation: "upload", gesture, data: btoa(chunks.join(""))});
      file.value = "";
      return result;
    }, soundNote, "Đã lưu file cho hành động.");
  });

  test.addEventListener("click", async () => {
    try {
      const status = await requestApi("status");
      if (status.renderer !== "ready") {
        soundNote.textContent = "Mở nguồn OBS hoặc Mở phát thử, sau đó bật âm thanh và bấm nghe thử lại.";
        return;
      }
      const result = await requestApi("command", {action: "sound", gesture: action.value});
      soundNote.textContent = result.message;
    } catch (error) {
      soundNote.textContent = error.message;
    }
  });

  reset.addEventListener("click", () => {
    void change(() => requestApi("preferences", {operation: "restore", gesture: action.value}),
      soundNote, "Đã bỏ file đã lưu. Kiểm tra nguồn âm hiện tại.");
  });

  mode.addEventListener("change", () => {
    const selected = mode.value;
    void change(() => requestApi("preferences", {operation: "performance", mode: selected}),
      item("performance-note"), "Đã lưu. Nguồn OBS sẽ tự cập nhật.");
  });

  async function initialize() {
    try {
      state = await requestApi("preferences");
      item("sound-note").textContent = "";
      render();
    } catch {
      soundNote.textContent = "Đang chờ bảng điều khiển kết nối để đọc cài đặt.";
      setTimeout(initialize, 2200);
    }
  }
  void initialize();
})();
