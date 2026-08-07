/* Bảng điều khiển đồng bộ Moodle — vanilla JS, không phụ thuộc thư viện ngoài */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const PAGE_SIZE = 50;
  const TEN_DOT_KEY = "moodleSync.tenDot";

  // ==================== tiện ích ====================

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);

  const fmtCell = (v) => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "boolean") return v ? "có" : "không";
    if (typeof v === "object") return JSON.stringify(v);
    // Chuẩn hóa ngày ISO cho dễ đọc
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(v)) {
      return v.replace("T", " ").replace(/\.\d+Z?$/, "");
    }
    return String(v);
  };

  let toastTimer;
  function toast(message, kind) {
    const el = $("#toast");
    el.textContent = message;
    el.className = "toast" + (kind ? " is-" + kind : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 5000);
  }

  function getTenDot() {
    return $("#tenDot").value.trim();
  }

  function requireTenDot() {
    const v = getTenDot();
    if (!v) {
      toast("Nhập học kỳ (tenDot) ở thanh trên trước, ví dụ: HK1 2026-2027", "err");
      $("#tenDot").focus();
      return null;
    }
    return v;
  }

  // Gọi API, luôn trả về { ok, status, body }
  async function api(path, options = {}) {
    const res = await fetch(path, options);
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = { success: false, message: `Phản hồi không phải JSON (HTTP ${res.status})` };
    }
    return { ok: res.ok, status: res.status, body };
  }

  const postJSON = (path, payload) =>
    api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });

  function withBusy(btn, on) {
    if (!btn) return;
    btn.classList.toggle("is-busy", on);
    // Khóa toàn bộ nút hành động khi đang chạy để tránh gọi chồng
    $$("[data-action]").forEach((b) => (b.disabled = on));
  }

  // ==================== tab ====================

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
      $$(".panel").forEach((p) =>
        p.classList.toggle("is-active", p.id === "panel-" + tab.dataset.tab)
      );
    });
  });

  // ==================== health ====================

  $("#healthBtn").addEventListener("click", async () => {
    const dot = $("#healthDot");
    const text = $("#healthText");
    text.textContent = "Đang kiểm tra...";
    dot.className = "status-dot status-unknown";

    try {
      const { body } = await api("/api/health");
      const s = body?.data?.services || {};
      const allOk = s.database && s.moodle;
      dot.className = "status-dot " + (allOk ? "status-ok" : "status-err");
      text.textContent = `SQL ${s.database ? "OK" : "lỗi"} · Moodle ${s.moodle ? "OK" : "lỗi"}`;
    } catch (err) {
      dot.className = "status-dot status-err";
      text.textContent = "Không gọi được service";
    }
  });

  // ==================== bảng dùng chung ====================

  // Trạng thái của mỗi bảng: dữ liệu gốc, dữ liệu đã lọc, trang hiện tại
  function createTable(containerSel, countSel, filterSel) {
    const state = { rows: [], filtered: [], page: 1, label: "data" };

    function applyFilter() {
      const q = ($(filterSel).value || "").trim().toLowerCase();
      state.filtered = !q
        ? state.rows
        : state.rows.filter((r) =>
            Object.values(r).some((v) => fmtCell(v).toLowerCase().includes(q))
          );
      state.page = 1;
      render();
    }

    function render() {
      const box = $(containerSel);
      const total = state.filtered.length;

      $(countSel).textContent = state.rows.length
        ? `${total.toLocaleString("vi-VN")} dòng` +
          (total !== state.rows.length ? ` / ${state.rows.length.toLocaleString("vi-VN")}` : "")
        : "";

      if (!state.rows.length) {
        box.innerHTML = '<p class="empty">Không có dữ liệu.</p>';
        return;
      }
      if (!total) {
        box.innerHTML = '<p class="empty">Không có dòng nào khớp bộ lọc.</p>';
        return;
      }

      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      state.page = Math.min(state.page, pages);
      const start = (state.page - 1) * PAGE_SIZE;
      const slice = state.filtered.slice(start, start + PAGE_SIZE);
      const cols = Object.keys(state.rows[0]);

      const head = cols.map((c) => `<th>${esc(c)}</th>`).join("");
      const rows = slice
        .map((r, i) => {
          const cells = cols
            .map((c) => {
              const raw = r[c];
              const cls = typeof raw === "number" ? ' class="num"' : "";
              return `<td${cls}>${esc(fmtCell(raw))}</td>`;
            })
            .join("");
          return `<tr><td class="idx">${start + i + 1}</td>${cells}</tr>`;
        })
        .join("");

      box.innerHTML =
        `<table><thead><tr><th class="idx">#</th>${head}</tr></thead><tbody>${rows}</tbody></table>` +
        (pages > 1
          ? `<div class="pager">
               <button class="btn btn-sm" data-page="prev" ${state.page === 1 ? "disabled" : ""}>← Trước</button>
               <span>Trang ${state.page}/${pages}</span>
               <button class="btn btn-sm" data-page="next" ${state.page === pages ? "disabled" : ""}>Sau →</button>
               <span class="spacer"></span>
               <span>Hiển thị ${start + 1}–${Math.min(start + PAGE_SIZE, total)}</span>
             </div>`
          : "");

      const prev = box.querySelector('[data-page="prev"]');
      const next = box.querySelector('[data-page="next"]');
      if (prev) prev.addEventListener("click", () => { state.page--; render(); });
      if (next) next.addEventListener("click", () => { state.page++; render(); });
    }

    // Xuất đúng phần đang lọc ra CSV
    function exportCSV() {
      if (!state.filtered.length) return toast("Không có dữ liệu để xuất", "err");

      const cols = Object.keys(state.rows[0]);
      const escCsv = (v) => `"${fmtCell(v).replace(/"/g, '""')}"`;
      const csv = [
        cols.join(","),
        ...state.filtered.map((r) => cols.map((c) => escCsv(r[c])).join(",")),
      ].join("\r\n");

      // BOM để Excel đọc đúng tiếng Việt
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${state.label}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    $(filterSel).addEventListener("input", applyFilter);

    return {
      setRows(rows, label) {
        state.rows = Array.isArray(rows) ? rows : [];
        state.label = label || "data";
        $(filterSel).value = "";
        applyFilter();
      },
      setMessage(html) {
        $(containerSel).innerHTML = html;
        $(countSel).textContent = "";
      },
      exportCSV,
    };
  }

  // ==================== TAB ĐỒNG BỘ ====================

  const resultBox = $("#syncResult");
  let hasResult = false;

  function statBlock(data) {
    const items = [
      ["total", "Tổng", ""],
      ["succeeded", "Thành công", "stat-ok"],
      ["skipped", "Bỏ qua", "stat-skip"],
      ["failed", "Lỗi", "stat-err"],
    ];
    return (
      '<div class="stats">' +
      items
        .filter(([k]) => typeof data[k] === "number")
        .map(
          ([k, label, cls]) =>
            `<div class="stat ${cls}"><b>${data[k].toLocaleString("vi-VN")}</b><span>${label}</span></div>`
        )
        .join("") +
      "</div>"
    );
  }

  function miniTable(rows, limit) {
    if (!rows || !rows.length) return "";
    const shown = rows.slice(0, limit);
    const cols = Object.keys(shown[0]);
    const head = cols.map((c) => `<th>${esc(c)}</th>`).join("");
    const body = shown
      .map((r) => {
        const cells = cols
          .map((c) => {
            const val = fmtCell(r[c]);
            let cls = "";
            if (c === "TrangThai") {
              if (val === "Thành công") cls = ' class="state-ok"';
              else if (val === "Lỗi") cls = ' class="state-err"';
              else cls = ' class="state-skip"';
            }
            return `<td${cls}>${esc(val)}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    return (
      `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` +
      (rows.length > limit
        ? `<p class="csv-path">Hiển thị ${limit}/${rows.length} dòng.</p>`
        : "")
    );
  }

  function renderResult(title, res, elapsedMs) {
    const { body, status } = res;
    const data = body?.data || {};

    let badge = '<span class="badge badge-ok">Thành công</span>';
    if (!body?.success) {
      badge =
        status === 207
          ? '<span class="badge badge-warn">Hoàn tất, có lỗi</span>'
          : '<span class="badge badge-err">Thất bại</span>';
    }

    let html =
      '<div class="result-entry">' +
      `<div class="result-title"><strong>${esc(title)}</strong>${badge}` +
      `<span class="meta">HTTP ${status} · ${(elapsedMs / 1000).toFixed(1)}s · ${new Date().toLocaleTimeString("vi-VN")}</span></div>` +
      `<p class="msg">${esc(body?.message || "")}</p>`;

    if (typeof data.total === "number") html += statBlock(data);

    if (data.errors && data.errors.length) {
      html +=
        `<details class="sub" open><summary>Lỗi (${data.errors.length}${data.errorsTruncated ? "+" : ""})</summary>` +
        miniTable(data.errors, 50) +
        "</details>";
    }

    if (data.details && data.details.length) {
      html +=
        `<details class="sub"><summary>Chi tiết từng dòng (${data.details.length})</summary>` +
        miniTable(data.details, 200) +
        "</details>";
    }

    if (data.steps) {
      const rows = Object.entries(data.steps).map(([step, r]) => ({
        Bước: step,
        Tổng: r.total ?? "-",
        "Thành công": r.succeeded ?? "-",
        "Bỏ qua": r.skipped ?? "-",
        Lỗi: r.failed ?? r.error ?? "-",
      }));
      html += `<details class="sub" open><summary>Từng bước</summary>${miniTable(rows, 20)}</details>`;
    }

    if (data.csvFile) html += `<p class="csv-path">CSV: ${esc(data.csvFile)}</p>`;
    if (data.csvFiles && data.csvFiles.length)
      html += `<p class="csv-path">Đã ghi ${data.csvFiles.length} file CSV trong logs/csv/</p>`;

    html += "</div>";

    if (!hasResult) {
      resultBox.innerHTML = "";
      hasResult = true;
    }
    resultBox.insertAdjacentHTML("afterbegin", html);
  }

  async function runSync(btn, title, path, payload) {
    const started = Date.now();

    // Bỏ dòng "chưa chạy tác vụ nào" trước khi hiện trạng thái đang chạy
    if (!hasResult) resultBox.innerHTML = "";

    // Dòng báo đang chạy kèm bộ đếm giây
    const runLine = document.createElement("div");
    runLine.className = "run-line";
    runLine.innerHTML = `<span class="status-dot status-unknown"></span><span>Đang chạy: <strong>${esc(title)}</strong> — <span data-elapsed>0</span>s</span>`;
    resultBox.prepend(runLine);
    const ticker = setInterval(() => {
      runLine.querySelector("[data-elapsed]").textContent = Math.round((Date.now() - started) / 1000);
    }, 1000);

    withBusy(btn, true);

    try {
      const res = await postJSON(path, payload);
      renderResult(title, res, Date.now() - started);
      toast(
        `${title}: ${res.body?.message || "hoàn tất"}`,
        res.body?.success ? "ok" : "err"
      );
    } catch (err) {
      renderResult(title, { status: 0, body: { success: false, message: "Không gọi được service: " + err.message } }, Date.now() - started);
      toast("Không gọi được service", "err");
    } finally {
      clearInterval(ticker);
      runLine.remove();
      withBusy(btn, false);
    }
  }

  // Nút "Toàn bộ đợt"
  $$('[data-action="sync"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const path = btn.dataset.path;
      const title = btn.closest(".card").querySelector("h3").textContent + " — toàn bộ đợt";

      // Riêng category không cần học kỳ
      if (path === "/api/sync/categories") {
        return runSync(btn, "Khoa / Bộ môn", path, {});
      }

      const tenDot = requireTenDot();
      if (!tenDot) return;

      if (!confirm(`Chạy "${title}" cho học kỳ ${tenDot}?\n\nTác vụ này có thể mất nhiều phút.`)) return;
      runSync(btn, title, path, { tenDot });
    });
  });

  // Nút "Một đối tượng"
  $$('[data-action="sync-one"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $(`[data-one-input="${btn.dataset.key}"]`);
      const value = input.value.trim();

      if (!value) {
        toast("Nhập mã cần đồng bộ", "err");
        input.focus();
        return;
      }

      const tenDot = requireTenDot();
      if (!tenDot) return;

      const title = btn.closest(".card").querySelector("h3").textContent + ` — ${value}`;
      runSync(btn, title, `${btn.dataset.path}/${encodeURIComponent(value)}`, { tenDot });
    });
  });

  $("#clearResult").addEventListener("click", () => {
    resultBox.innerHTML = '<p class="empty">Chưa chạy tác vụ nào.</p>';
    hasResult = false;
  });

  // ==================== TAB DỮ LIỆU CORE ====================
  // Danh sách dataset và các trường lọc được lấy động từ /api/data,
  // nên thêm cột mới ở backend là giao diện tự có ngay.

  const coreTable = createTable("#coreTable", "#coreCount", "#coreFilterInput");

  const core = {
    datasets: [],      // [{name, label, requireTenDot}]
    active: null,      // tên dataset đang chọn
    meta: null,        // mô tả trường của dataset đang chọn
    operators: [],     // [{name, label, needsValue, multi}]
  };

  async function loadDatasets() {
    const { body } = await api("/api/data");
    if (!body?.success) return toast("Không lấy được danh sách tập dữ liệu", "err");

    core.datasets = body.data.datasets;
    core.operators = body.data.operators;

    $("#coreSubtabs").innerHTML = core.datasets
      .map(
        (d, i) =>
          `<button class="subtab${i === 0 ? " is-active" : ""}" data-name="${esc(d.name)}">${esc(d.label)}</button>`
      )
      .join("");

    $$("#coreSubtabs .subtab").forEach((btn) => {
      btn.addEventListener("click", () => selectDataset(btn.dataset.name));
    });

    if (core.datasets.length) await selectDataset(core.datasets[0].name);
  }

  async function selectDataset(name) {
    core.active = name;
    $$("#coreSubtabs .subtab").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.name === name)
    );

    const { body } = await api(`/api/data/${encodeURIComponent(name)}/fields`);
    if (!body?.success) return toast("Không lấy được danh sách trường", "err");

    core.meta = body.data;

    // Danh sách cột để sắp xếp
    $("#coreSort").innerHTML = core.meta.columns
      .map(
        (c) =>
          `<option value="${esc(c.name)}"${c.name === core.meta.defaultSort ? " selected" : ""}>${esc(c.label)}</option>`
      )
      .join("");

    clearFilterRows();
    coreTable.setMessage('<p class="empty">Bấm <strong>Tải dữ liệu</strong>.</p>');
  }

  // ---- bộ lọc động ----

  function filterRowHtml() {
    const fields = core.meta.columns
      .map((c) => `<option value="${esc(c.name)}" data-type="${esc(c.type)}">${esc(c.label)}</option>`)
      .join("");
    const ops = core.operators
      .map((o) => `<option value="${esc(o.name)}" data-needs-value="${o.needsValue}">${esc(o.label)}</option>`)
      .join("");

    return `<div class="filter-row">
      <select class="select filter-field">${fields}</select>
      <select class="select filter-op">${ops}</select>
      <input class="filter-value" type="text" placeholder="Giá trị">
      <button class="btn btn-sm filter-remove" type="button" title="Xóa điều kiện">✕</button>
    </div>`;
  }

  function syncRowState(row) {
    const field = row.querySelector(".filter-field");
    const opSel = row.querySelector(".filter-op");
    const input = row.querySelector(".filter-value");

    const type = field.selectedOptions[0]?.dataset.type || "string";
    const opDef = core.operators.find((o) => o.name === opSel.value);

    input.disabled = opDef && !opDef.needsValue;
    input.placeholder = input.disabled
      ? "(không cần giá trị)"
      : opDef?.multi
        ? "Nhiều giá trị, cách nhau dấu phẩy"
        : type === "number"
          ? "Số"
          : type === "date"
            ? "YYYY-MM-DD"
            : "Giá trị";
    if (input.disabled) input.value = "";
  }

  function addFilterRow() {
    if (!core.meta) return;

    const wrap = document.createElement("div");
    wrap.innerHTML = filterRowHtml();
    const row = wrap.firstElementChild;

    // Toán tử mặc định theo kiểu của trường đầu tiên
    const firstCol = core.meta.columns[0];
    if (firstCol) row.querySelector(".filter-op").value = firstCol.defaultOperator;

    row.querySelector(".filter-field").addEventListener("change", (e) => {
      const colName = e.target.value;
      const col = core.meta.columns.find((c) => c.name === colName);
      if (col) row.querySelector(".filter-op").value = col.defaultOperator;
      syncRowState(row);
    });
    row.querySelector(".filter-op").addEventListener("change", () => syncRowState(row));
    row.querySelector(".filter-remove").addEventListener("click", () => {
      row.remove();
      updateFilterHint();
    });

    $("#coreFilterRows").appendChild(row);
    syncRowState(row);
    updateFilterHint();
  }

  function clearFilterRows() {
    $("#coreFilterRows").innerHTML = "";
    updateFilterHint();
  }

  function updateFilterHint() {
    const n = $$("#coreFilterRows .filter-row").length;
    $("#coreFilterHint").textContent = n
      ? `${n} điều kiện — các điều kiện được nối bằng AND.`
      : "Không có điều kiện nào — sẽ lấy toàn bộ dữ liệu của học kỳ.";
  }

  // Dựng query string từ các dòng bộ lọc
  function buildFilterQuery() {
    const parts = [];

    for (const row of $$("#coreFilterRows .filter-row")) {
      const field = row.querySelector(".filter-field").value;
      const op = row.querySelector(".filter-op").value;
      const input = row.querySelector(".filter-value");
      const value = input.value.trim();

      const opDef = core.operators.find((o) => o.name === op);
      const needsValue = !opDef || opDef.needsValue;

      if (needsValue && !value) {
        toast(`Điều kiện "${field}" chưa có giá trị`, "err");
        input.focus();
        return null;
      }

      parts.push(`${encodeURIComponent(field + "__" + op)}=${encodeURIComponent(value)}`);
    }

    return parts;
  }

  $("#coreAddFilter").addEventListener("click", addFilterRow);
  $("#coreClearFilters").addEventListener("click", clearFilterRows);

  $("#coreLoad").addEventListener("click", async () => {
    if (!core.meta) return;

    const btn = $("#coreLoad");
    const params = [];

    if (core.meta.requireTenDot) {
      const tenDot = requireTenDot();
      if (!tenDot) return;
      params.push("tenDot=" + encodeURIComponent(tenDot));
    }

    const filterParts = buildFilterQuery();
    if (filterParts === null) return; // có điều kiện thiếu giá trị
    params.push(...filterParts);

    params.push("sort=" + encodeURIComponent($("#coreSort").value));
    params.push("order=" + encodeURIComponent($("#coreOrder").value));
    params.push("limit=" + encodeURIComponent($("#coreLimit").value));

    btn.classList.add("is-busy");
    coreTable.setMessage('<p class="empty">Đang tải...</p>');

    try {
      const { body } = await api(`/api/data/${encodeURIComponent(core.active)}?${params.join("&")}`);
      if (!body?.success) {
        coreTable.setMessage(`<p class="empty">${esc(body?.message || "Tải dữ liệu thất bại")}</p>`);
        return toast(body?.message || "Tải dữ liệu thất bại", "err");
      }

      coreTable.setRows(body.data.items, "core_" + core.active);

      // Báo rõ nếu kết quả bị cắt bởi giới hạn số dòng
      if (body.data.total > body.data.returned) {
        toast(
          `Lấy ${body.data.returned}/${body.data.total} dòng — tăng "Số dòng" để lấy thêm`,
          "err"
        );
      } else {
        toast(`${core.meta.label}: ${body.data.total} dòng`, "ok");
      }
    } catch (err) {
      coreTable.setMessage('<p class="empty">Không gọi được service.</p>');
      toast("Không gọi được service", "err");
    } finally {
      btn.classList.remove("is-busy");
    }
  });

  $("#coreExport").addEventListener("click", () => coreTable.exportCSV());

  // ==================== TAB DỮ LIỆU MOODLE ====================

  const moodleTable = createTable("#moodleTable", "#moodleCount", "#moodleFilterInput");
  let moodleView = "courses";

  const MOODLE_HINTS = {
    courses: "Toàn bộ khóa học trên Moodle. Cột shortname có dạng <MaLopHocPhan>_<TenDot>.",
    users:
      "Moodle yêu cầu ít nhất một tiêu chí tìm kiếm. Mặc định auth=manual — đây là các tài khoản do service này tạo ra.",
    members:
      "Moodle không phân loại sinh viên/giảng viên ở cấp hệ thống mà theo vai trò trong từng khóa học. Nhập Moodle course ID (lấy ở tab Khóa học) rồi chọn vai trò.",
  };

  function setMoodleView(view) {
    moodleView = view;
    $$("#moodleSubtabs .subtab").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    $$(".toolbar-slot").forEach((slot) => (slot.hidden = slot.dataset.for !== view));
    $("#moodleHint").innerHTML = MOODLE_HINTS[view] || "";
    moodleTable.setMessage('<p class="empty">Bấm <strong>Tải dữ liệu</strong>.</p>');
  }

  $$("#moodleSubtabs .subtab").forEach((btn) => {
    btn.addEventListener("click", () => setMoodleView(btn.dataset.view));
  });

  $("#moodleLoad").addEventListener("click", async () => {
    const btn = $("#moodleLoad");
    let url;

    if (moodleView === "courses") {
      url = "/api/moodle/courses";
    } else if (moodleView === "users") {
      const key = $("#moodleUserKey").value;
      const value = $("#moodleUserValue").value.trim();
      if (!value) {
        toast("Nhập giá trị tìm kiếm", "err");
        return $("#moodleUserValue").focus();
      }
      url = `/api/moodle/users?key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`;
    } else {
      const courseId = $("#moodleCourseId").value.trim();
      if (!courseId) {
        toast("Nhập Moodle course ID", "err");
        return $("#moodleCourseId").focus();
      }
      const roleId = $("#moodleRole").value;
      url = `/api/moodle/courses/${encodeURIComponent(courseId)}/users` + (roleId ? `?roleid=${roleId}` : "");
    }

    btn.classList.add("is-busy");
    moodleTable.setMessage('<p class="empty">Đang tải từ Moodle...</p>');

    try {
      const { body } = await api(url);
      if (!body?.success) {
        moodleTable.setMessage(`<p class="empty">${esc(body?.message || "Tải dữ liệu thất bại")}</p>`);
        return toast(body?.message || "Tải dữ liệu thất bại", "err");
      }

      let items = body.data.items || [];

      // Danh sách khóa học Moodle rất nhiều cột, chỉ giữ cột cần nhìn
      if (moodleView === "courses") {
        items = items.map((c) => ({
          id: c.id,
          shortname: c.shortname,
          fullname: c.fullname,
          idnumber: c.idnumber,
          categoryid: c.categoryid,
          visible: c.visible,
          format: c.format,
        }));
      }

      moodleTable.setRows(items, "moodle_" + moodleView);
      toast(`Moodle ${moodleView}: ${items.length} dòng`, "ok");
    } catch (err) {
      moodleTable.setMessage('<p class="empty">Không gọi được service.</p>');
      toast("Không gọi được service", "err");
    } finally {
      btn.classList.remove("is-busy");
    }
  });

  $("#moodleExport").addEventListener("click", () => moodleTable.exportCSV());

  // ==================== khởi tạo ====================

  // Nhớ học kỳ đã nhập giữa các lần mở trang
  const savedTenDot = localStorage.getItem(TEN_DOT_KEY);
  if (savedTenDot) $("#tenDot").value = savedTenDot;
  $("#tenDot").addEventListener("input", () =>
    localStorage.setItem(TEN_DOT_KEY, getTenDot())
  );

  setMoodleView("courses");
  $("#healthBtn").click();
  loadDatasets();
})();
