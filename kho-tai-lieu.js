"use strict";
(() => {
  const byId = id => document.getElementById(id);
  const panel = byId("doc-panel");
  const library = byId("doc-library");
  const note = byId("doc-note");
  const progress = byId("doc-progress");
  const results = byId("doc-results");
  const uploadButton = byId("doc-upload");
  const findButton = byId("doc-find");
  const deleteDocButton = byId("doc-delete");
  let watching = "";
  let timer;
  let pending = false;
  let searchRequest = 0;

  function refreshSoon() {
    clearTimeout(timer);
    if (panel.open) timer = setTimeout(refresh, 1500);
  }

  async function refresh() {
    if (!panel.open) return;
    try {
      const {documents} = await requestApi("documents");
      const current = library.value;
      const ready = documents.filter(doc => doc.status === "ready");
      library.replaceChildren(new Option("Chọn tài liệu", ""), ...ready.map(doc => new Option(doc.name, doc.id)));
      const recent = documents.find(doc => doc.id === watching);
      if (recent?.status === "ready") {
        library.value = recent.id;
        results.replaceChildren();
        note.textContent = `Đã đọc ${recent.segments.toLocaleString("vi-VN")} đoạn · ${recent.name}`;
        watching = "";
      } else {
        library.value = current;
        if (recent?.status === "error") {
          note.textContent = recent.detail;
          watching = "";
        }
      }
      const indexing = documents.find(doc => doc.status === "indexing");
      uploadButton.disabled = Boolean(indexing || pending);
      findButton.disabled = !library.value;
      if (deleteDocButton) deleteDocButton.disabled = !library.value;
      if (indexing && !pending) {
        note.textContent = `Đang đọc ${indexing.name} · ${indexing.segments} đoạn đã lập chỉ mục`;
      }
      if (indexing || watching) refreshSoon();
      else if (!library.value && !pending && !note.textContent && documents[0]?.status === "error") {
        note.textContent = documents[0].detail;
      }
    } catch (error) {
      note.textContent = error.message;
      if (watching) refreshSoon();
    }
  }

  panel.addEventListener("toggle", () => {
    clearTimeout(timer);
    if (panel.open) void refresh();
  });

  uploadButton.onclick = () => {
    const file = byId("doc-file").files[0];
    if (!file || !file.size || file.size > 1024 ** 3) {
      note.textContent = "Chọn tệp có dữ liệu, tối đa 1 GiB.";
      return;
    }
    pending = true;
    uploadButton.disabled = true;
    note.textContent = "Đang chép tài liệu vào kho…";
    progress.value = 0;
    progress.hidden = false;
    const request = new XMLHttpRequest();
    request.open("POST", "/api/document-upload");
    request.responseType = "json";
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader("X-Bong-Hoa", "1");
    request.setRequestHeader("X-Bong-Filename", encodeURIComponent(file.name));
    request.upload.onprogress = event => {
      if (event.lengthComputable) progress.value = 100 * event.loaded / event.total;
    };
    request.onloadend = () => {
      pending = false;
      progress.hidden = true;
      if (request.status === 202 && request.response?.id) {
        watching = request.response.id;
        void refresh();
      } else {
        uploadButton.disabled = false;
        note.textContent = request.response?.error || "Không chép được tài liệu. Thử lại.";
      }
    };
    request.send(file);
  };

  library.onchange = () => {
    searchRequest++;
    findButton.disabled = !library.value;
    if (deleteDocButton) deleteDocButton.disabled = !library.value;
    results.replaceChildren();
  };

  if (deleteDocButton) {
    deleteDocButton.onclick = async () => {
      const id = library.value;
      if (!id) return;
      const text = library.options[library.selectedIndex]?.text || id;
      if (!confirm(`Bạn có chắc muốn xóa tài liệu "${text}" khỏi kho không?`)) return;
      try {
        deleteDocButton.disabled = true;
        await requestApi("documents", {operation: "delete", id});
        note.textContent = `Đã xóa tài liệu: ${text}`;
        results.replaceChildren();
        await refresh();
      } catch (error) {
        note.textContent = error.message;
        deleteDocButton.disabled = false;
      }
    };
  }

  byId("doc-search").onsubmit = async event => {
    event.preventDefault();
    const id = library.value;
    if (!id) return;
    const current = ++searchRequest;
    try {
      const {matches} = await requestApi("documents", {operation: "search", id, query: byId("doc-query").value});
      if (current !== searchRequest) return;
      results.replaceChildren(...matches.map(match => {
        const item = document.createElement("article");
        item.className = "stack";
        const label = document.createElement("strong");
        label.textContent = (match.page == null ? "" : `Trang ${match.page} · `) + `Đoạn ${match.ordinal}`;
        const excerpt = document.createElement("p");
        excerpt.textContent = match.body;
        const button = document.createElement("button");
        button.textContent = "Dùng đoạn này tạo kịch bản";
        button.onclick = () => byId("pane-assistant").dispatchEvent(new CustomEvent("bong-document-excerpt", {
          detail: {document: id, ordinal: match.ordinal}
        }));
        item.append(label, excerpt, button);
        return item;
      }));
      note.textContent = matches.length ? `Tìm thấy ${matches.length} đoạn để xem.` : "Chưa tìm thấy đoạn phù hợp.";
    } catch (error) {
      if (current === searchRequest) note.textContent = error.message;
    }
  };
})();
