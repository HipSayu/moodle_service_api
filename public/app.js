/* Moodle Sync — giao diện quản trị. Vanilla JS, không phụ thuộc thư viện ngoài. */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const PAGE_SIZE = 50;
  const MAX_STUDENT_CODES = 200;
  const MAX_CLASS_CODES = 50;
  const ACTIVITY_LIMIT = 30;

  const KEY = {
    tenDot: "moodleSync.tenDot",
    khoa: "moodleSync.khoaHoc",
    steps: "moodleSync.steps",
    activity: "moodleSync.activity",
  };

  const ROLE_LABEL = {
    student: "Sinh viên",
    editingteacher: "Giảng viên chính",
    teacher: "Trợ giảng",
    manager: "Quản lý",
  };

  // ==================== tiện ích ====================

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);

  const fmtCell = (v) => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "boolean") return v ? "có" : "không";
    if (typeof v === "object") return JSON.stringify(v);
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(v)) {
      return v.replace("T", " ").replace(/\.\d+Z?$/, "");
    }
    return String(v);
  };

  const fmtTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("vi-VN");
  };

  // Bỏ dấu tiếng Việt để gõ "toan" vẫn tìm ra "Toán"
  const normalize = (v) =>
    String(v ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/đ/g, "d")
      .trim();

  // Mã cách nhau bởi dấu phẩy, chấm phẩy, khoảng trắng hoặc xuống dòng (dán nguyên cột Excel)
  const parseCodes = (text) => [
    ...new Set(
      String(text ?? "")
        .split(/[\s,;]+/)
        .map((v) => v.trim())
        .filter(Boolean)
    ),
  ];

  const codesLabel = (codes, unit) => (codes.length > 1 ? `${codes.length} ${unit}` : codes[0]);

  // localStorage có thể bị chặn (trình duyệt riêng tư, chính sách máy) nên luôn bọc try/catch
  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* bỏ qua */ }
    },
    getJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    setJSON(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bỏ qua */ }
    },
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

  function saveBlob(blob, fileName) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ==================== gọi API ====================

  // Tên tác vụ đang chạy, gửi kèm request để lịch sử lưu đúng tên hiển thị trên giao diện
  let taskHeaders = null;

  // Luôn trả về { ok, status, body, runId } kể cả khi máy chủ trả lỗi.
  // runId: mã lần chạy trong lịch sử (MongoDB), có khi request là tác vụ ghi dữ liệu.
  async function api(path, options = {}) {
    const res = await fetch(path, { ...options, headers: { ...(options.headers || {}), ...(taskHeaders || {}) } });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = { success: false, message: `Phản hồi không phải JSON (HTTP ${res.status})` };
    }
    return { ok: res.ok, status: res.status, body, runId: res.headers.get("X-Run-Id") };
  }

  const post = (path, payload) =>
    api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });

  const withParam = (base, value) => `${base}/${encodeURIComponent(value)}`;

  // 200 = thành công, 207 = xong nhưng có dòng lỗi, còn lại = thất bại
  function outcomeOf(res) {
    if (!res) return "err";
    if (res.status === 207) return "warn";
    return res.body?.success ? "ok" : "err";
  }

  const OUTCOME_LABEL = {
    ok: "Thành công",
    warn: "Có lỗi một phần",
    err: "Thất bại",
    run: "Đang chạy",
    none: "Chưa chạy",
  };

  const pill = (outcome, text) =>
    `<span class="pill pill-${outcome}">${esc(text || OUTCOME_LABEL[outcome])}</span>`;

  // ==================== hộp xác nhận ====================

  function confirmDialog({ title, body, ok = "Đồng ý", danger = false }) {
    const dlg = $("#confirmDialog");

    if (typeof dlg.showModal !== "function") {
      const tmp = document.createElement("div");
      tmp.innerHTML = body;
      return Promise.resolve(window.confirm(`${title}\n\n${tmp.textContent.trim()}`));
    }

    $("#confirmTitle").textContent = title;
    $("#confirmBody").innerHTML = body;
    const okBtn = $("#confirmOk");
    okBtn.textContent = ok;
    okBtn.className = "btn " + (danger ? "btn-danger" : "btn-primary");

    dlg.returnValue = "";
    dlg.showModal();
    // Nút Hủy đứng trước nên được focus mặc định: lỡ tay Enter cũng không chạy nhầm
    return new Promise((resolve) =>
      dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true })
    );
  }

  // ==================== học kỳ / khóa ====================

  const ctx = { terms: [] };

  const getTenDot = () => $("#tenDot").value.trim();
  const getKhoa = () => $("#khoaHoc").value.trim();
  const getKhoaLabel = () => {
    const sel = $("#khoaHoc");
    return sel.value ? sel.selectedOptions[0]?.dataset.ten || sel.value : "";
  };

  // Tác vụ chạy theo phạm vi học kỳ. Tác vụ theo đúng một mã không kèm khóa
  // để khỏi lọc nhầm đối tượng thuộc khóa khác.
  function scopePayload() {
    const tenDot = getTenDot();
    const idKhoaHoc = getKhoa();
    return idKhoaHoc ? { tenDot, idKhoaHoc } : { tenDot };
  }

  function scopeText() {
    const tenDot = getTenDot();
    if (!tenDot) return "chưa chọn học kỳ";
    const khoa = getKhoaLabel();
    return khoa ? `${tenDot} · khóa ${khoa}` : `${tenDot} · tất cả khóa`;
  }

  function requireTenDot() {
    const tenDot = getTenDot();
    if (!tenDot) {
      toast("Chọn học kỳ ở thanh trên cùng trước", "err");
      $("#tenDot").focus();
      return null;
    }
    return tenDot;
  }

  function updateScopeLabels() {
    $$("[data-scope]").forEach((el) => {
      el.textContent = el.dataset.scope === "term" ? getTenDot() || "chưa chọn học kỳ" : scopeText();
    });
  }

  function onScopeChange() {
    updateScopeLabels();
    updateStepStatuses();
    renderDashSteps();
    syncReportTerm(true);
  }

  // Danh sách đợt lấy từ DM_Dot, mới nhất lên đầu
  async function loadTerms() {
    const sel = $("#tenDot");
    const saved = storage.get(KEY.tenDot) || "";

    try {
      const { body } = await api("/api/data/terms?sort=IDDot&order=desc&limit=200");
      if (!body?.success) {
        sel.innerHTML = `<option value="">${esc(body?.message || "Không lấy được danh sách học kỳ")}</option>`;
        return;
      }

      const items = body.data.items || [];
      ctx.terms = items;

      if (!items.length) {
        sel.innerHTML = '<option value="">Không có học kỳ nào</option>';
        return;
      }

      sel.innerHTML = items
        .map((t) => {
          const notes = [];
          if (t.IsDangKyHocPhan) notes.push("đang mở ĐK");
          if (t.SoLopHoc) notes.push(`${t.SoLopHoc} lớp`);
          const suffix = notes.length ? ` (${notes.join(", ")})` : "";
          return `<option value="${esc(t.TenDot)}">${esc(t.TenDot)}${esc(suffix)}</option>`;
        })
        .join("");

      // Ưu tiên học kỳ đã chọn lần trước, rồi đợt đang hoạt động, cuối cùng là đợt mới nhất
      const active = items.find((t) => t.IsActive);
      const pick = items.some((t) => t.TenDot === saved) ? saved : (active || items[0]).TenDot;
      sel.value = pick;
      storage.set(KEY.tenDot, pick);
    } catch {
      sel.innerHTML = '<option value="">Không gọi được service</option>';
    }
  }

  // Khóa có lớp trong học kỳ đang chọn. Rỗng = tất cả khóa.
  async function loadCohorts() {
    const sel = $("#khoaHoc");
    const previous = sel.value || storage.get(KEY.khoa) || "";
    const tenDot = getTenDot();

    sel.innerHTML = '<option value="">Tất cả khóa</option>';
    sel.disabled = true;

    if (tenDot) {
      try {
        const { body } = await api(
          `/api/data/cohorts?tenDot=${encodeURIComponent(tenDot)}&sort=SoLopHocPhan&order=desc&limit=200`
        );
        const items = body?.success ? body.data.items || [] : [];

        sel.innerHTML =
          '<option value="">Tất cả khóa</option>' +
          items
            .map(
              (c) =>
                `<option value="${esc(c.IDKhoaHoc)}" data-ten="${esc(c.TenKhoaHoc)}">` +
                `${esc(c.TenKhoaHoc)} — ${esc(c.SoLopHocPhan)} LHP</option>`
            )
            .join("");
        sel.disabled = items.length === 0;

        if (previous && items.some((c) => String(c.IDKhoaHoc) === String(previous))) {
          sel.value = previous;
        }
      } catch {
        // Không lấy được danh sách khóa thì vẫn chạy được cả học kỳ
      }
    }

    onScopeChange();
  }

  $("#tenDot").addEventListener("change", () => {
    storage.set(KEY.tenDot, getTenDot());
    loadCohorts();
  });

  $("#khoaHoc").addEventListener("change", () => {
    storage.set(KEY.khoa, getKhoa());
    onScopeChange();
  });

  // ==================== đang chạy ====================

  // Chỉ cho một tác vụ ghi chạy tại một thời điểm, tránh gọi chồng lên Moodle
  const busy = { running: false, batch: false, timer: null, started: 0 };

  function setBusy(on, title = "") {
    busy.running = on;
    document.body.classList.toggle("is-busy", on || busy.batch);
    clearInterval(busy.timer);

    if (on) {
      busy.started = Date.now();
      const tick = () => {
        $("#runText").textContent = `${title} · ${Math.round((Date.now() - busy.started) / 1000)}s`;
      };
      tick();
      busy.timer = setInterval(tick, 1000);
      $("#runIndicator").hidden = false;
    } else if (!busy.batch) {
      $("#runIndicator").hidden = true;
    }
  }

  window.addEventListener("beforeunload", (e) => {
    if (busy.running || busy.batch) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // ==================== nhật ký hoạt động ====================

  const PAGE_TITLES = {};

  function recordActivity(entry) {
    const list = storage.getJSON(KEY.activity, []);
    list.unshift(entry);
    storage.setJSON(KEY.activity, list.slice(0, ACTIVITY_LIMIT));
    renderActivity();
  }

  // ---- nhãn dùng chung cho lịch sử ----

  const RUN_STATUS = {
    success: ["ok", "Thành công"],
    partial: ["warn", "Có lỗi một phần"],
    failed: ["err", "Thất bại"],
    running: ["run", "Đang chạy"],
  };
  const CATEGORY_LABEL = {
    sync: "Đồng bộ",
    enroll: "Ghi danh",
    merge: "Gộp lớp",
    cleanup: "Dọn ghi danh",
    report: "Báo cáo",
    moodle: "Moodle",
    system: "Hệ thống",
    other: "Khác",
  };
  const TRIGGER_LABEL = { ui: "Giao diện", api: "Gọi API", scheduler: "Lịch tự động" };

  const runPill = (status) => {
    const [kind, label] = RUN_STATUS[status] || ["none", status || "—"];
    return pill(kind, label);
  };

  // Ưu tiên lịch sử trên MongoDB (chung cho mọi người, mọi máy);
  // chưa kết nối MongoDB thì dùng bản lưu trên trình duyệt này.
  async function renderActivity() {
    const box = $("#activityList");

    try {
      const { body } = await api("/api/history/runs?limit=8");
      if (body?.success) {
        $("#activityClear").hidden = true;
        $("#activityAll").hidden = false;
        const items = body.data.items || [];
        box.innerHTML = items.length
          ? items
              .map(
                (r) =>
                  `<li>${runPill(r.status)}` +
                  `<div><b>${esc(r.title)}</b><span>${esc(r.message || "")}${r.actor ? ` · ${esc(r.actor)}` : ""}</span></div>` +
                  `<a href="#/history/${esc(r.id)}">${esc(fmtTime(r.startedAt))}</a></li>`
              )
              .join("")
          : '<li class="empty">Chưa có lần chạy nào.</li>';
        return;
      }
    } catch {
      // không gọi được thì dùng bản lưu trên trình duyệt
    }

    $("#activityClear").hidden = false;
    $("#activityAll").hidden = true;
    const list = storage.getJSON(KEY.activity, []);

    if (!list.length) {
      box.innerHTML = '<li class="empty">Chưa có hoạt động nào trên trình duyệt này.</li>';
      return;
    }

    box.innerHTML = list
      .map(
        (a) =>
          `<li>${pill(a.outcome)}` +
          `<div><b>${esc(a.title)}</b><span>${esc(a.message)}</span></div>` +
          `<a href="${a.runId ? `#/history/${esc(a.runId)}` : `#/${esc(a.page)}`}" title="${esc(PAGE_TITLES[a.page] || "")}">${esc(fmtTime(a.at))}</a></li>`
      )
      .join("");
  }

  $("#activityClear").addEventListener("click", () => {
    storage.setJSON(KEY.activity, []);
    renderActivity();
  });

  // ==================== vùng kết quả ====================

  function createLog(boxSel) {
    const box = $(boxSel);
    let hasResult = false;

    const log = {
      box,
      prepareRun() {
        if (!hasResult) box.innerHTML = "";
      },
      push(html) {
        if (!hasResult) {
          box.innerHTML = "";
          hasResult = true;
        }
        box.insertAdjacentHTML("afterbegin", html);
      },
      reset() {
        box.innerHTML = '<p class="empty">Chưa chạy tác vụ nào.</p>';
        hasResult = false;
      },
    };
    log.reset();
    return log;
  }

  const logs = {};
  ["term", "students", "teachers", "sections", "merge", "cleanup", "report", "system"].forEach(
    (name) => (logs[name] = createLog(`#log-${name}`))
  );

  $$("[data-clear-log]").forEach((btn) =>
    btn.addEventListener("click", () => logs[btn.dataset.clearLog].reset())
  );

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
      `<div class="table-wrap table-plain"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` +
      (rows.length > limit ? `<p class="file-path">Hiển thị ${limit}/${rows.length} dòng.</p>` : "")
    );
  }

  function stepsBlock(steps) {
    const rows = Object.entries(steps).map(([step, r]) => ({
      Bước: step,
      Tổng: r.total ?? "-",
      "Thành công": r.succeeded ?? "-",
      "Bỏ qua": r.skipped ?? "-",
      Lỗi: r.failed ?? r.error ?? "-",
    }));
    return `<details class="sub" open><summary>Từng bước</summary>${miniTable(rows, 20)}</details>`;
  }

  function renderResult(log, title, res, elapsedMs) {
    const { body, status } = res;
    const data = body?.data || {};
    const outcome = outcomeOf(res);

    let html =
      `<article class="result result-${outcome}">` +
      `<div class="result-title"><strong>${esc(title)}</strong>${pill(outcome)}` +
      `<span class="meta">${status ? `HTTP ${status} · ` : ""}${(elapsedMs / 1000).toFixed(1)}s · ${new Date().toLocaleTimeString("vi-VN")}</span>` +
      (res.runId ? `<a class="result-link" href="#/history/${esc(res.runId)}">Xem chi tiết trong lịch sử →</a>` : "") +
      "</div>" +
      `<p class="msg">${esc(body?.message || "")}</p>`;

    if (data.targetCourse) {
      html +=
        `<p class="msg">${data.targetCourse.existing ? "Lớp giữ lại" : "Lớp mới"}: <strong>${esc(data.targetCourse.shortname)}</strong> — ` +
        `<a href="${esc(data.targetCourse.url)}" target="_blank" rel="noopener">mở trên Moodle (id ${esc(data.targetCourse.id)}) ↗</a></p>`;
    }

    if (typeof data.total === "number") html += statBlock(data);

    if (data.warnings && data.warnings.length) {
      html += '<ul class="warn-list">' + data.warnings.map((w) => `<li>${esc(w)}</li>`).join("") + "</ul>";
    }

    if (data.steps) html += stepsBlock(data.steps);

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

    const files = [];
    if (data.excelFile) files.push(["Excel", data.excelFile]);
    if (data.csvFile) files.push(["CSV", data.csvFile]);
    if (data.filePath) files.push(["File", data.filePath]);
    files.forEach(([label, path]) => (html += `<p class="file-path">${label} trên máy chủ: ${esc(path)}</p>`));
    if (data.csvFiles && data.csvFiles.length) {
      html += `<p class="file-path">Đã ghi ${data.csvFiles.length} file CSV trong logs/csv/</p>`;
    }

    html += "</article>";
    log.push(html);
  }

  // Chạy một tác vụ: khóa các nút ghi, hiện bộ đếm giây, ghi kết quả và nhật ký.
  // exec() trả về { ok, status, body }. Trả về null nếu bị chặn vì đang có tác vụ khác.
  async function runTask({ title, exec, log, page, batch = false }) {
    if (busy.running || (busy.batch && !batch)) {
      toast("Đang có tác vụ khác chạy, đợi xong rồi thử lại", "err");
      return null;
    }

    const started = Date.now();
    log.prepareRun();

    const runLine = document.createElement("div");
    runLine.className = "run-line";
    runLine.innerHTML =
      `<span class="pulse-dot"></span><span>Đang chạy <strong>${esc(title)}</strong> — <span data-elapsed>0</span>s. ` +
      "Tác vụ lớn có thể mất nhiều phút, đừng đóng trang.</span>";
    log.box.prepend(runLine);
    const ticker = setInterval(() => {
      runLine.querySelector("[data-elapsed]").textContent = Math.round((Date.now() - started) / 1000);
    }, 1000);

    setBusy(true, title);
    taskHeaders = { "X-Task-Title": encodeURIComponent(title), "X-Task-Page": page };

    let res;
    try {
      res = await exec();
    } catch (err) {
      res = { ok: false, status: 0, body: { success: false, message: "Không gọi được service: " + err.message } };
    } finally {
      taskHeaders = null;
      clearInterval(ticker);
      runLine.remove();
      setBusy(false);
    }

    const outcome = outcomeOf(res);
    renderResult(log, title, res, Date.now() - started);
    toast(`${title}: ${res.body?.message || OUTCOME_LABEL[outcome]}`, outcome === "ok" ? "ok" : "err");
    recordActivity({
      title,
      outcome,
      message: res.body?.message || "",
      page,
      runId: res.runId || null,
      at: new Date().toISOString(),
    });
    return res;
  }

  // ==================== bảng dùng chung ====================

  // Bảng có lọc nhanh, sắp xếp theo cột, phân trang và (tùy chọn) chọn dòng.
  // Lựa chọn được giữ qua phân trang và bộ lọc.
  function createTable(containerSel, countSel, filterSel, options = {}) {
    const {
      selectable = false,
      idKey = "id",
      onSelectionChange = null,
      pinSelected = false, // dòng đã chọn luôn ở đầu bảng, kể cả khi bộ lọc loại ra
      emptyText = "Chưa có dữ liệu.",
    } = options;

    const state = {
      rows: [],
      filtered: [],
      page: 1,
      label: "data",
      loaded: false,
      selected: new Map(),
      extraFilter: null,
      columns: null,
      sort: null,
    };

    const box = $(containerSel);
    const rowId = (row) => String(row[idKey]);
    const getSelected = () => Array.from(state.selected.values());
    const notifySelection = () => onSelectionChange && onSelectionChange(getSelected());

    const columnDefs = () =>
      state.columns || Object.keys(state.rows[0] || {}).map((key) => ({ key, label: key }));

    const cellValue = (col, row) => row[col.key];

    function sortRows(rows) {
      if (!state.sort) return rows;
      const col = columnDefs().find((c) => c.key === state.sort.key);
      if (!col) return rows;
      const dir = state.sort.dir === "desc" ? -1 : 1;

      return [...rows].sort((a, b) => {
        const x = cellValue(col, a);
        const y = cellValue(col, b);
        if (x === y) return 0;
        if (x === null || x === undefined || x === "") return 1;
        if (y === null || y === undefined || y === "") return -1;
        if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
        return String(x).localeCompare(String(y), "vi", { numeric: true, sensitivity: "base" }) * dir;
      });
    }

    function applyFilter() {
      const q = filterSel ? ($(filterSel).value || "").trim().toLowerCase() : "";

      const matched = sortRows(
        state.rows.filter((r) => {
          if (state.extraFilter && !state.extraFilter(r)) return false;
          if (!q) return true;
          return Object.values(r).some((v) => fmtCell(v).toLowerCase().includes(q));
        })
      );

      if (!pinSelected || !state.selected.size) {
        state.filtered = matched;
      } else {
        const picked = sortRows(state.rows.filter((r) => state.selected.has(rowId(r))));
        const pickedIds = new Set(picked.map(rowId));
        state.filtered = [...picked, ...matched.filter((r) => !pickedIds.has(rowId(r)))];
      }

      state.page = 1;
      render();
    }

    function render() {
      const total = state.filtered.length;

      $(countSel).textContent = state.rows.length
        ? `${total.toLocaleString("vi-VN")} dòng` +
          (total !== state.rows.length ? ` / ${state.rows.length.toLocaleString("vi-VN")}` : "")
        : "";

      if (!state.loaded) {
        box.innerHTML = `<p class="empty">${emptyText}</p>`;
        return;
      }
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
      const cols = columnDefs();

      const head = cols
        .map((c) => {
          if (c.sortable === false) return `<th>${esc(c.label)}</th>`;
          const active = state.sort && state.sort.key === c.key;
          const arrow = active ? (state.sort.dir === "desc" ? " ↓" : " ↑") : "";
          return `<th class="sortable${active ? " is-sorted" : ""}" data-sort-key="${esc(c.key)}" title="Bấm để sắp xếp">${esc(c.label)}${arrow}</th>`;
        })
        .join("");

      const selHead = selectable
        ? '<th class="sel"><input type="checkbox" data-sel-all title="Chọn/bỏ chọn các dòng của trang này"></th>'
        : "";

      const body = slice
        .map((r, i) => {
          const cells = cols
            .map((c) => {
              if (c.render) return `<td>${c.render(r)}</td>`;
              const raw = cellValue(c, r);
              const cls = typeof raw === "number" ? ' class="num"' : "";
              return `<td${cls}>${esc(fmtCell(raw))}</td>`;
            })
            .join("");

          const picked = selectable && state.selected.has(rowId(r));
          const selCell = selectable
            ? `<td class="sel"><input type="checkbox" data-sel-id="${esc(rowId(r))}"${picked ? " checked" : ""}></td>`
            : "";

          return `<tr${picked ? ' class="is-selected"' : ""}>${selCell}<td class="idx">${start + i + 1}</td>${cells}</tr>`;
        })
        .join("");

      box.innerHTML =
        `<table><thead><tr>${selHead}<th class="idx">#</th>${head}</tr></thead><tbody>${body}</tbody></table>` +
        (pages > 1
          ? `<div class="pager">
               <button class="btn btn-sm" type="button" data-page="prev" ${state.page === 1 ? "disabled" : ""}>← Trước</button>
               <span>Trang ${state.page}/${pages}</span>
               <button class="btn btn-sm" type="button" data-page="next" ${state.page === pages ? "disabled" : ""}>Sau →</button>
               <span class="spacer"></span>
               <span>Dòng ${start + 1}–${Math.min(start + PAGE_SIZE, total)}</span>
             </div>`
          : "");

      const prev = box.querySelector('[data-page="prev"]');
      const next = box.querySelector('[data-page="next"]');
      if (prev) prev.addEventListener("click", () => { state.page--; render(); });
      if (next) next.addEventListener("click", () => { state.page++; render(); });

      box.querySelectorAll("[data-sort-key]").forEach((th) => {
        th.addEventListener("click", () => {
          const key = th.dataset.sortKey;
          state.sort =
            state.sort && state.sort.key === key
              ? { key, dir: state.sort.dir === "asc" ? "desc" : "asc" }
              : { key, dir: "asc" };
          applyFilter();
        });
      });

      if (!selectable) return;

      const byId = new Map(slice.map((r) => [rowId(r), r]));

      box.querySelectorAll("[data-sel-id]").forEach((cb) => {
        cb.addEventListener("change", () => {
          const row = byId.get(cb.dataset.selId);
          if (!row) return;
          if (cb.checked) state.selected.set(cb.dataset.selId, row);
          else state.selected.delete(cb.dataset.selId);
          cb.closest("tr").classList.toggle("is-selected", cb.checked);
          const all = box.querySelector("[data-sel-all]");
          if (all) all.checked = slice.every((r) => state.selected.has(rowId(r)));
          notifySelection();
        });
      });

      const selAll = box.querySelector("[data-sel-all]");
      if (selAll) {
        selAll.checked = slice.length > 0 && slice.every((r) => state.selected.has(rowId(r)));
        selAll.addEventListener("change", () => {
          slice.forEach((r) => {
            if (selAll.checked) state.selected.set(rowId(r), r);
            else state.selected.delete(rowId(r));
          });
          render();
          notifySelection();
        });
      }
    }

    function exportCSV() {
      if (!state.filtered.length) return toast("Không có dữ liệu để xuất", "err");

      const cols = columnDefs().filter((c) => c.export !== false);
      const escCsv = (v) => `"${fmtCell(v).replace(/"/g, '""')}"`;
      const csv = [
        cols.map((c) => escCsv(c.label)).join(","),
        ...state.filtered.map((r) => cols.map((c) => escCsv(cellValue(c, r))).join(",")),
      ].join("\r\n");

      // BOM để Excel đọc đúng tiếng Việt
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      saveBlob(blob, `${state.label}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`);
    }

    if (filterSel) $(filterSel).addEventListener("input", applyFilter);
    render();

    return {
      setRows(rows, label) {
        state.rows = Array.isArray(rows) ? rows : [];
        state.label = label || "data";
        state.loaded = true;
        state.selected.clear();
        state.sort = null;
        if (filterSel) $(filterSel).value = "";
        applyFilter();
        notifySelection();
      },
      setColumns(columns) {
        state.columns = columns || null;
      },
      setMessage(html) {
        box.innerHTML = html;
        $(countSel).textContent = "";
      },
      isLoaded: () => state.loaded,
      getSelected,
      deselect(id) {
        state.selected.delete(String(id));
        applyFilter();
        notifySelection();
      },
      clearSelection() {
        state.selected.clear();
        applyFilter();
        notifySelection();
      },
      setExtraFilter(fn) {
        state.extraFilter = fn;
        applyFilter();
      },
      exportCSV,
    };
  }

  // ==================== điều hướng ====================

  const PAGES = {
    dashboard: { title: "Tổng quan", enter: refreshDashboard },
    history: { title: "Lịch sử chạy", enter: enterHistory },
    term: { title: "Đồng bộ đầu học kỳ", enter: updateStepStatuses },
    students: { title: "Sinh viên" },
    teachers: { title: "Giảng viên" },
    sections: { title: "Lớp học phần" },
    courses: { title: "Khóa học & gộp lớp", enter: ensureCourses },
    members: { title: "Thành viên lớp" },
    users: { title: "Người dùng" },
    cleanup: { title: "Dọn ghi danh nhầm cơ sở" },
    data: { title: "Tra cứu dữ liệu nguồn", enter: ensureDatasets },
    report: { title: "Báo cáo khóa điểm", enter: () => syncReportTerm(false) },
    system: { title: "Kết nối & lịch tự động", enter: refreshSystem },
  };
  Object.entries(PAGES).forEach(([name, p]) => (PAGE_TITLES[name] = p.title));

  // "#/history/<mã>" -> trang history, tham số là mã lần chạy
  const currentPage = () => {
    const [name, param] = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
    return PAGES[name] ? { name, param: param || null } : { name: "dashboard", param: null };
  };

  function route() {
    const { name, param } = currentPage();
    $$(".page").forEach((p) => (p.hidden = p.dataset.page !== name));
    $$("[data-nav]").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === name));
    document.title = `${PAGES[name].title} — Moodle Sync`;
    document.body.classList.remove("nav-open");
    window.scrollTo(0, 0);
    if (PAGES[name].enter) PAGES[name].enter(param);
  }

  function go(name) {
    if (location.hash === "#/" + name) route();
    else location.hash = "#/" + name;
  }

  window.addEventListener("hashchange", route);

  $("#navToggle").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("#navOverlay").addEventListener("click", () => document.body.classList.remove("nav-open"));

  // Enter trong ô nhập = bấm nút chính của form
  function onSubmit(formSel, handler) {
    $(formSel).addEventListener("submit", (e) => {
      e.preventDefault();
      handler();
    });
  }

  // ==================== kết nối ====================

  const conn = { reachable: null, database: null, moodle: null, history: null, checkedAt: null };

  function historyConnHtml(h) {
    if (!h) return pill("none", "Đang kiểm tra");
    if (!h.configured) return pill("none", "Chưa cấu hình MONGODB_URI");
    if (h.connected) return `${pill("ok", "Kết nối tốt")} <span class="muted">database ${esc(h.database)}</span>`;
    if (h.state === "connecting") return pill("run", "Đang kết nối");
    return `${pill("err", "Mất kết nối")} <span class="muted">${esc(h.error || "")} — tự thử lại mỗi phút</span>`;
  }

  const connHtml = (value) =>
    value === null ? pill("none", "Đang kiểm tra") : value ? pill("ok", "Kết nối tốt") : pill("err", "Mất kết nối");

  function renderConn() {
    const dot = $("#connDot");
    const text = $("#connText");

    if (conn.reachable === null) {
      dot.className = "status-dot status-unknown";
      text.textContent = "Đang kiểm tra...";
    } else if (!conn.reachable) {
      dot.className = "status-dot status-err";
      text.textContent = "Không gọi được service";
    } else {
      const allOk = conn.database && conn.moodle;
      dot.className = "status-dot " + (allOk ? "status-ok" : "status-err");
      text.textContent = allOk
        ? "Kết nối tốt"
        : `SQL ${conn.database ? "OK" : "lỗi"} · Moodle ${conn.moodle ? "OK" : "lỗi"}`;
    }

    $("#dashDb").innerHTML = connHtml(conn.database);
    $("#dashMoodle").innerHTML = connHtml(conn.moodle);
    $("#sysDb").innerHTML = connHtml(conn.database);
    $("#sysMoodle").innerHTML = connHtml(conn.moodle);
    $("#sysMongo").innerHTML = historyConnHtml(conn.history);
    $("#sysCheckedAt").textContent = conn.checkedAt ? conn.checkedAt.toLocaleString("vi-VN") : "—";
  }

  async function checkHealth() {
    conn.reachable = conn.database = conn.moodle = conn.history = null;
    renderConn();

    try {
      const { body } = await api("/api/health");
      const s = body?.data?.services || {};
      conn.reachable = true;
      conn.database = Boolean(s.database);
      conn.moodle = Boolean(s.moodle);
      conn.history = body?.data?.history || null;
    } catch {
      conn.reachable = false;
      conn.database = false;
      conn.moodle = false;
    }

    conn.checkedAt = new Date();
    renderConn();
  }

  // ==================== lịch tự động ====================

  let scheduler = null;

  async function loadScheduler() {
    try {
      const { body } = await api("/api/scheduler/status");
      scheduler = body?.success ? body.data : null;
    } catch {
      scheduler = null;
    }
    renderScheduler();
  }

  function renderScheduler() {
    const box = $("#schedInfo");

    if (!scheduler) {
      box.innerHTML = "<dt>Trạng thái</dt><dd>Không lấy được trạng thái</dd>";
      $("#dashSched").textContent = "—";
      ["#schedStart", "#schedStop", "#schedRun"].forEach((sel) => ($(sel).disabled = true));
      return;
    }

    const jobs = Object.entries(scheduler.jobs || {});
    const job = jobs[0]?.[1];

    // Chỉ bật/tắt được khi đã có job; chạy ngay cần học kỳ cấu hình trong .env
    $("#schedStart").disabled = !jobs.length || scheduler.schedulerRunning;
    $("#schedStop").disabled = !jobs.length || !scheduler.schedulerRunning;
    $("#schedRun").disabled = !scheduler.tenDot || Boolean(job?.isRunning);

    let state;
    if (!scheduler.autoSyncEnabled) state = pill("none", "Đang tắt trong cấu hình");
    else if (!jobs.length) state = pill("warn", "Chưa có job (thiếu SYNC_TEN_DOT)");
    else state = scheduler.schedulerRunning ? pill("ok", "Đang bật") : pill("none", "Đang dừng");

    box.innerHTML =
      `<dt>Trạng thái</dt><dd>${state}</dd>` +
      `<dt>Học kỳ cấu hình</dt><dd>${esc(scheduler.tenDot || "—")}</dd>` +
      (job
        ? `<dt>Lịch chạy (cron)</dt><dd><code>${esc(job.cronTime || "—")}</code></dd>` +
          `<dt>Lần chạy tới</dt><dd>${esc(scheduler.schedulerRunning ? fmtTime(job.nextRun) : "—")}</dd>` +
          `<dt>Lần chạy gần nhất</dt><dd>${esc(fmtTime(job.lastRun))}</dd>` +
          `<dt>Đang chạy</dt><dd>${job.isRunning ? pill("run", "Đang chạy") : "Không"}</dd>`
        : "");

    $("#dashSched").innerHTML = !scheduler.autoSyncEnabled
      ? "Tắt"
      : scheduler.schedulerRunning
        ? `Bật · ${esc(scheduler.tenDot || "")}`
        : "Đang dừng";
  }

  // ==================== TỔNG QUAN ====================

  function refreshDashboard() {
    updateScopeLabels();
    renderConn();
    renderDashSteps();
    renderActivity();
    if (!scheduler) loadScheduler();
  }

  // ==================== LỊCH SỬ CHẠY ====================
  // Đọc từ MongoDB qua /api/history. Danh sách và chi tiết đều phân trang ở máy chủ
  // vì một lần đồng bộ cả học kỳ có thể có hàng chục nghìn dòng.

  // Tiêu đề cột cho dòng chi tiết
  const COLUMN_TITLES = {
    MaSinhVien: "Mã SV",
    HoTenSinhVien: "Họ tên SV",
    MaGiangVien: "Mã GV",
    MaNhanSu: "Mã nhân sự",
    HoTenGiangVien: "Họ tên GV",
    LoaiGiangVien: "Loại GV",
    MaNguoiDung: "Mã",
    HoTen: "Họ tên",
    TaiKhoan: "Tài khoản",
    Email: "Email",
    EmailTuSinh: "Email tự sinh",
    MaLopHocPhan: "Mã LHP",
    TenLopHoc: "Tên lớp",
    TenMonHoc: "Môn học",
    ShortName: "Shortname",
    MoodleUserId: "Moodle user",
    MoodleCourseId: "Moodle course",
    VaiTro: "Vai trò",
    ThuocLop: "Thuộc lớp",
    HanhDong: "Hành động",
    TrangThai: "Trạng thái",
    LoiChiTiet: "Lỗi chi tiết",
    ThoiGian: "Thời gian",
  };

  const KIND_LABEL = {
    students: "Tài khoản SV",
    teachers: "Tài khoản GV",
    courses: "Khóa học",
    enrollStudents: "Ghi danh SV",
    enrollTeachers: "Ghi danh GV",
    cleanupCampus: "Dọn ghi danh",
    grades: "Điểm",
    result: "Kết quả",
  };

  const fmtDuration = (ms) => {
    if (typeof ms !== "number") return "—";
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)} giây`;
    return `${Math.floor(ms / 60000)} phút ${Math.round((ms % 60000) / 1000)} giây`;
  };

  const runScope = (s = {}) =>
    [
      s.tenDot,
      s.khoaHoc ? `khóa ${s.khoaHoc}` : s.idKhoaHoc ? `khóa id ${s.idKhoaHoc}` : null,
      s.idDot ? `đợt id ${s.idDot}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "—";

  const statusClass = (v) =>
    v === "Thành công" || v === "Tạo mới" ? "state-ok" : v === "Lỗi" ? "state-err" : "state-skip";

  const hist = {
    page: 1,
    limit: 50,
    run: null,
    timer: null,
    detail: { page: 1, limit: 50, status: "", kind: "", q: "" },
  };

  function pagerHtml(page, limit, total) {
    const pages = Math.max(1, Math.ceil(total / limit));
    if (pages <= 1) return "";
    return `<div class="pager">
      <button class="btn btn-sm" type="button" data-goto="${page - 1}" ${page === 1 ? "disabled" : ""}>← Trước</button>
      <span>Trang ${page}/${pages}</span>
      <button class="btn btn-sm" type="button" data-goto="${page + 1}" ${page === pages ? "disabled" : ""}>Sau →</button>
      <span class="spacer"></span>
      <span>Dòng ${((page - 1) * limit + 1).toLocaleString("vi-VN")}–${Math.min(page * limit, total).toLocaleString("vi-VN")} / ${total.toLocaleString("vi-VN")}</span>
    </div>`;
  }

  const bindPager = (box, onPage) =>
    box.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => onPage(Number(b.dataset.goto))));

  function enterHistory(id) {
    clearTimeout(hist.timer);
    $("#historyListView").hidden = Boolean(id);
    $("#historyDetailView").hidden = !id;
    if (id) loadRun(id);
    else loadRuns();
  }

  function showHistoryOff(body) {
    const s = body?.data || {};
    $("#historyOff").hidden = false;
    $("#historyOff").innerHTML = s.configured
      ? `Chưa kết nối được MongoDB (<code>${esc(s.error || s.state || "")}</code>). Service vẫn đồng bộ bình thường nhưng chưa lưu lịch sử, và tự thử kết nối lại mỗi phút. Kiểm tra <code>MONGODB_URI</code> và mạng tới máy MongoDB.`
      : "Chưa cấu hình MongoDB nên không lưu lịch sử. Thêm <code>MONGODB_URI</code>, <code>MONGODB_DB</code> vào file <code>.env</code> rồi khởi động lại service.";
  }

  async function loadRuns() {
    const box = $("#historyTable");
    const params = new URLSearchParams({ page: hist.page, limit: hist.limit });
    [
      ["category", "#hCategory"],
      ["status", "#hStatus"],
      ["from", "#hFrom"],
      ["to", "#hTo"],
      ["q", "#hQuery"],
    ].forEach(([key, sel]) => {
      const value = $(sel).value.trim();
      if (value) params.set(key, value);
    });

    box.innerHTML = '<p class="empty">Đang tải lịch sử...</p>';
    $("#hCount").textContent = "";

    try {
      const { status, body } = await api(`/api/history/runs?${params}`);
      if (status === 503) {
        showHistoryOff(body);
        box.innerHTML = '<p class="empty">Chưa có lịch sử.</p>';
        return;
      }
      $("#historyOff").hidden = true;
      if (!body?.success) {
        box.innerHTML = `<p class="empty">${esc(body?.message || "Không tải được lịch sử")}</p>`;
        return;
      }

      const { items, total, page, limit } = body.data;
      $("#hCount").textContent = `${total.toLocaleString("vi-VN")} lần chạy`;
      if (!items.length) {
        box.innerHTML = '<p class="empty">Không có lần chạy nào khớp bộ lọc.</p>';
        return;
      }

      const num = (v) => (typeof v === "number" ? v.toLocaleString("vi-VN") : "");
      const rows = items
        .map(
          (r) => `<tr class="row-link" data-run-id="${esc(r.id)}">
            <td class="nowrap">${esc(fmtTime(r.startedAt))}</td>
            <td><a href="#/history/${esc(r.id)}">${esc(r.title)}</a>
              <div class="sub-text">${esc(CATEGORY_LABEL[r.category] || r.category)} · ${esc(TRIGGER_LABEL[r.trigger] || r.trigger)}</div></td>
            <td>${esc(runScope(r.scope))}</td>
            <td>${esc(r.actor || "—")}<div class="sub-text">${esc(r.ip || "")}</div></td>
            <td>${runPill(r.status)}</td>
            <td class="num">${num(r.summary?.total)}</td>
            <td class="num">${num(r.summary?.succeeded)}</td>
            <td class="num">${num(r.summary?.skipped)}</td>
            <td class="num">${num(r.summary?.failed)}</td>
            <td class="nowrap">${esc(fmtDuration(r.durationMs))}</td>
          </tr>`
        )
        .join("");

      box.innerHTML =
        `<table><thead><tr><th>Bắt đầu</th><th>Tác vụ</th><th>Phạm vi</th><th>Người chạy</th><th>Kết quả</th>` +
        `<th class="num">Tổng</th><th class="num">Thành công</th><th class="num">Bỏ qua</th><th class="num">Lỗi</th><th>Thời lượng</th>` +
        `</tr></thead><tbody>${rows}</tbody></table>` +
        pagerHtml(page, limit, total);

      bindPager(box, (p) => {
        hist.page = p;
        loadRuns();
      });
    } catch {
      box.innerHTML = '<p class="empty">Không gọi được service.</p>';
    }
  }

  // Bấm vào bất kỳ chỗ nào trên dòng để mở chi tiết
  $("#historyTable").addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    const tr = e.target.closest("[data-run-id]");
    if (tr) location.hash = `#/history/${tr.dataset.runId}`;
  });

  onSubmit("#historyFilter", () => {
    hist.page = 1;
    loadRuns();
  });
  $("#hReload").addEventListener("click", () => loadRuns());
  ["#hCategory", "#hStatus", "#hFrom", "#hTo"].forEach((sel) =>
    $(sel).addEventListener("change", () => {
      hist.page = 1;
      loadRuns();
    })
  );

  async function loadRun(id) {
    clearTimeout(hist.timer);
    $("#hdTitle").textContent = "Đang tải...";
    $("#hdMessage").textContent = "";
    ["#hdInfo", "#hdResult", "#hdTable", "#hdStatusChips"].forEach((sel) => ($(sel).innerHTML = ""));
    $("#hdCount").textContent = "";

    let res;
    try {
      res = await api(`/api/history/runs/${encodeURIComponent(id)}`);
    } catch {
      $("#hdTitle").textContent = "Không gọi được service";
      return;
    }

    if (!res.body?.success) {
      $("#hdTitle").textContent = res.status === 404 ? "Không tìm thấy lần chạy" : "Không tải được lần chạy";
      $("#hdMessage").textContent = res.body?.message || "";
      return;
    }

    const r = res.body.data;
    const sameRun = hist.run?.id === r.id;
    hist.run = r;
    if (!sameRun) {
      hist.detail = { page: 1, limit: 50, status: "", kind: "", q: "" };
      $("#hdQuery").value = "";
    }
    document.title = `${r.title} — Lịch sử chạy — Moodle Sync`;

    $("#hdTitle").textContent = r.title;
    $("#hdMessage").textContent = r.message || "";

    const kv = (k, v) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;
    $("#hdInfo").innerHTML =
      kv("Kết quả", runPill(r.status) + (r.httpStatus ? ` <span class="muted">HTTP ${esc(r.httpStatus)}</span>` : "")) +
      kv("Loại", esc(CATEGORY_LABEL[r.category] || r.category)) +
      kv("Nguồn", esc(TRIGGER_LABEL[r.trigger] || r.trigger)) +
      kv("Người chạy", esc(r.actor || "—") + (r.ip ? ` <span class="muted">${esc(r.ip)}</span>` : "")) +
      kv("Phạm vi", esc(runScope(r.scope))) +
      kv("Bắt đầu", esc(fmtTime(r.startedAt))) +
      kv("Kết thúc", esc(r.finishedAt ? fmtTime(r.finishedAt) : "Chưa xong")) +
      kv("Thời lượng", esc(fmtDuration(r.durationMs))) +
      kv("API", r.path ? `<code>${esc([r.method, r.path].filter(Boolean).join(" "))}</code>` : "—") +
      kv("Trình duyệt", `<span class="muted">${esc(r.userAgent || "—")}</span>`) +
      kv("Mã lần chạy", `<code>${esc(r.id)}</code>`);

    const data = r.result || {};
    let html = statBlock(r.summary || {});

    if (data.targetCourse) {
      html +=
        `<p class="msg">${data.targetCourse.existing ? "Lớp giữ lại" : "Lớp mới"}: <strong>${esc(data.targetCourse.shortname)}</strong> — ` +
        `<a href="${esc(data.targetCourse.url)}" target="_blank" rel="noopener">mở trên Moodle ↗</a></p>`;
    }
    if (Array.isArray(data.khongTimThay) && data.khongTimThay.length) {
      html += `<p class="msg">Không tìm thấy: ${esc(data.khongTimThay.join(", "))}</p>`;
    }
    if (data.warnings?.length) {
      html += '<ul class="warn-list">' + data.warnings.map((w) => `<li>${esc(w)}</li>`).join("") + "</ul>";
    }
    if (data.steps) html += stepsBlock(data.steps);
    if (data.errors?.length) {
      html += `<details class="sub" open><summary>Lỗi (${r.errorCount || data.errors.length})</summary>${miniTable(data.errors, 200)}</details>`;
    }
    html +=
      `<details class="sub"><summary>Tham số gửi lên</summary><pre class="json">${esc(JSON.stringify(r.params, null, 2))}</pre></details>` +
      `<details class="sub"><summary>Toàn bộ kết quả trả về (JSON)</summary><pre class="json">${esc(JSON.stringify(data, null, 2))}</pre></details>`;
    $("#hdResult").innerHTML = html;

    // Đồng bộ toàn bộ có nhiều bước, cho lọc chi tiết theo từng bước
    const kinds = r.detailKinds || [];
    $("#hdKind").hidden = kinds.length < 2;
    $("#hdKind").innerHTML =
      '<option value="">Mọi bước</option>' +
      kinds.map((k) => `<option value="${esc(k)}">${esc(KIND_LABEL[k] || k)}</option>`).join("");
    $("#hdKind").value = hist.detail.kind;

    loadRunDetails();

    // Lần chạy còn đang chạy thì tự làm mới
    if (r.status === "running") {
      hist.timer = setTimeout(() => {
        if (currentPage().param === r.id) loadRun(r.id);
      }, 5000);
    }
  }

  async function loadRunDetails() {
    const r = hist.run;
    if (!r) return;
    const d = hist.detail;

    const filters = new URLSearchParams();
    if (d.status) filters.set("status", d.status);
    if (d.kind) filters.set("kind", d.kind);
    if (d.q) filters.set("q", d.q);
    $("#hdExport").href = `/api/history/runs/${encodeURIComponent(r.id)}/export?${filters}`;

    const params = new URLSearchParams(filters);
    params.set("page", d.page);
    params.set("limit", d.limit);

    const box = $("#hdTable");
    box.innerHTML = '<p class="empty">Đang tải...</p>';

    try {
      const { body } = await api(`/api/history/runs/${encodeURIComponent(r.id)}/details?${params}`);
      if (!body?.success) {
        box.innerHTML = `<p class="empty">${esc(body?.message || "Không tải được chi tiết")}</p>`;
        return;
      }

      const { items, total, page, limit, statuses } = body.data;
      const named = statuses.filter((s) => s.status);
      const all = statuses.reduce((sum, s) => sum + s.count, 0);
      $("#hdCount").textContent = `(${all.toLocaleString("vi-VN")})`;

      $("#hdStatusChips").innerHTML = [{ status: "", count: all }, ...named]
        .map(
          (s) =>
            `<button type="button" class="chip-filter${s.status === d.status ? " is-active" : ""}" data-status="${esc(s.status)}">` +
            `${esc(s.status || "Tất cả")} <b>${s.count.toLocaleString("vi-VN")}</b></button>`
        )
        .join("");

      if (!items.length) {
        box.innerHTML = r.detailCount
          ? '<p class="empty">Không có dòng nào khớp bộ lọc.</p>'
          : '<p class="empty">Lần chạy này không có dòng chi tiết.</p>';
        return;
      }

      const keys = [];
      items.forEach((it) => Object.keys(it.data || {}).forEach((k) => keys.includes(k) || keys.push(k)));
      const showKind = (r.detailKinds || []).length > 1 && !d.kind;

      const head =
        '<th class="idx">#</th>' +
        (showKind ? "<th>Bước</th>" : "") +
        keys.map((k) => `<th>${esc(COLUMN_TITLES[k] || k)}</th>`).join("");

      const body2 = items
        .map(
          (it) =>
            `<tr><td class="idx">${esc(it.seq)}</td>` +
            (showKind ? `<td>${esc(KIND_LABEL[it.kind] || it.kind)}</td>` : "") +
            keys
              .map((k) => {
                const v = it.data?.[k];
                const cls = k === "TrangThai" ? ` class="${statusClass(v)}"` : typeof v === "number" ? ' class="num"' : "";
                return `<td${cls}>${esc(fmtCell(v))}</td>`;
              })
              .join("") +
            "</tr>"
        )
        .join("");

      box.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body2}</tbody></table>` + pagerHtml(page, limit, total);
      bindPager(box, (p) => {
        d.page = p;
        loadRunDetails();
      });
    } catch {
      box.innerHTML = '<p class="empty">Không gọi được service.</p>';
    }
  }

  $("#hdStatusChips").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-status]");
    if (!btn) return;
    hist.detail.status = btn.dataset.status;
    hist.detail.page = 1;
    loadRunDetails();
  });

  $("#hdKind").addEventListener("change", () => {
    hist.detail.kind = $("#hdKind").value;
    hist.detail.status = "";
    hist.detail.page = 1;
    loadRunDetails();
  });

  onSubmit("#hdSearchForm", () => {
    hist.detail.q = $("#hdQuery").value.trim();
    hist.detail.page = 1;
    loadRunDetails();
  });

  // ==================== ĐỒNG BỘ ĐẦU HỌC KỲ ====================

  const STEPS = [
    {
      key: "categories",
      title: "Khoa / Bộ môn",
      desc: "Tạo cây danh mục khoa, bộ môn trên Moodle từ bảng TMP_DsBoMonKhoa. Không phụ thuộc học kỳ, chỉ cần chạy khi có khoa/bộ môn mới.",
      path: "/api/sync/categories",
      scoped: false,
    },
    {
      key: "students",
      title: "Tài khoản sinh viên",
      desc: "Tạo / cập nhật tài khoản cho sinh viên có đăng ký học phần trong học kỳ. Mật khẩu khởi tạo <MaSV>@Huce, chỉ đặt khi tạo mới.",
      path: "/api/sync/students",
      scoped: true,
    },
    {
      key: "teachers",
      title: "Tài khoản giảng viên",
      desc: "Tạo / cập nhật tài khoản cho giảng viên được phân công trong học kỳ. Mật khẩu khởi tạo Huce@1234, chỉ đặt khi tạo mới.",
      path: "/api/sync/teachers",
      scoped: true,
    },
    {
      key: "courses",
      title: "Khóa học (lớp học phần)",
      desc: "Tạo khóa học kèm các section cho lớp học phần chưa có trên Moodle. Lớp đã có được giữ nguyên, không ghi đè.",
      path: "/api/sync/courses",
      scoped: true,
    },
    {
      key: "enrollStudents",
      title: "Ghi danh sinh viên",
      desc: "Đưa sinh viên vào đúng khóa học đã đăng ký. Cần chạy bước 2 và 4 trước.",
      path: "/api/enrollments/students",
      scoped: true,
    },
    {
      key: "enrollTeachers",
      title: "Ghi danh giảng viên",
      desc: "Đưa giảng viên vào khóa học được phân công: giảng viên chính vai trò Teacher, trợ giảng vai trò Non-editing teacher. Cần chạy bước 3 và 4 trước.",
      path: "/api/enrollments/teachers",
      scoped: true,
    },
  ];

  let runningStep = null;

  const stepScopeKey = (step) => (step.scoped ? `${getTenDot()}|${getKhoa() || "*"}` : "*");

  function getStepStatus(step) {
    const all = storage.getJSON(KEY.steps, {});
    return all[stepScopeKey(step)]?.[step.key] || null;
  }

  function setStepStatus(step, status) {
    const all = storage.getJSON(KEY.steps, {});
    const key = stepScopeKey(step);
    all[key] = { ...(all[key] || {}), [step.key]: status };
    storage.setJSON(KEY.steps, all);
  }

  function stepPill(step) {
    if (runningStep === step.key) return pill("run");
    const status = getStepStatus(step);
    return status ? pill(status.outcome) : pill("none");
  }

  function buildSteps() {
    $("#termSteps").innerHTML = STEPS.map(
      (s, i) =>
        `<li class="step" data-step="${s.key}">` +
        `<span class="step-num">${i + 1}</span>` +
        `<div class="step-main">` +
        `<div class="step-title"><b>${esc(s.title)}</b><span data-step-pill></span></div>` +
        `<p class="step-desc">${esc(s.desc)}</p>` +
        (s.key === "students"
          ? `<label class="check"><input type="checkbox" id="optToanKhoa"> Lấy toàn bộ sinh viên của khóa theo hồ sơ, kể cả em chưa đăng ký học phần (phải chọn Khóa)</label>`
          : "") +
        `<p class="step-last" data-step-last></p>` +
        `</div>` +
        `<button class="btn js-run" type="button" data-run-step="${s.key}">Chạy</button>` +
        `</li>`
    ).join("");

    $$("[data-run-step]").forEach((btn) =>
      btn.addEventListener("click", () => runStepWithConfirm(STEPS.find((s) => s.key === btn.dataset.runStep)))
    );
  }

  function updateStepStatuses() {
    STEPS.forEach((step) => {
      const li = $(`.step[data-step="${step.key}"]`);
      if (!li) return;
      const status = getStepStatus(step);
      li.querySelector("[data-step-pill]").innerHTML = stepPill(step);
      li.querySelector("[data-step-last]").textContent = status
        ? `Lần chạy gần nhất ${fmtTime(status.at)}: ${status.message}`
        : "";
    });
  }

  function renderDashSteps() {
    $("#dashSteps").innerHTML = STEPS.map(
      (s, i) => `<li><span>${i + 1}. ${esc(s.title)}</span>${stepPill(s)}</li>`
    ).join("");
  }

  async function runStep(step, { batch = false } = {}) {
    let payload = {};

    if (step.scoped) {
      if (!requireTenDot()) return null;
      payload = scopePayload();

      if (step.key === "students" && $("#optToanKhoa").checked) {
        if (!getKhoa()) {
          toast("Chọn Khóa ở thanh trên trước khi lấy toàn khóa theo hồ sơ", "err");
          $("#khoaHoc").focus();
          return null;
        }
        payload.toanKhoa = true;
      }
    }

    runningStep = step.key;
    updateStepStatuses();

    const res = await runTask({
      title: `${step.title} — ${step.scoped ? scopeText() : "toàn trường"}`,
      exec: () => post(step.path, payload),
      log: logs.term,
      page: "term",
      batch,
    });

    runningStep = null;
    if (res) {
      setStepStatus(step, { outcome: outcomeOf(res), at: new Date().toISOString(), message: res.body?.message || "" });
    }
    updateStepStatuses();
    renderDashSteps();
    return res;
  }

  async function runStepWithConfirm(step) {
    if (step.scoped && !requireTenDot()) return;

    const scope = step.scoped
      ? getKhoa()
        ? `khóa <b>${esc(getKhoaLabel())}</b> của học kỳ <b>${esc(getTenDot())}</b>`
        : `học kỳ <b>${esc(getTenDot())}</b> — <b>tất cả các khóa</b>`
      : "toàn trường";

    const ok = await confirmDialog({
      title: `Chạy "${step.title}"?`,
      body: `<p>Phạm vi: ${scope}.</p><p>Dữ liệu đã có trên Moodle được bỏ qua. Tác vụ có thể mất nhiều phút.</p>`,
      ok: "Chạy",
    });
    if (ok) runStep(step);
  }

  $("#termRunAll").addEventListener("click", async () => {
    if (!requireTenDot()) return;
    if (busy.running || busy.batch) return toast("Đang có tác vụ khác chạy", "err");

    const ok = await confirmDialog({
      title: "Chạy lần lượt cả 6 bước?",
      body:
        `<p>Phạm vi: <b>${esc(scopeText())}</b></p>` +
        `<ol>${STEPS.map((s) => `<li>${esc(s.title)}</li>`).join("")}</ol>` +
        "<p>Các bước chạy nối tiếp nhau, bước nào thất bại thì dừng lại. Có thể mất nhiều phút — không đóng trang trong lúc chạy.</p>",
      ok: "Chạy tất cả",
    });
    if (!ok) return;

    busy.batch = true;
    document.body.classList.add("is-busy");

    try {
      for (const step of STEPS) {
        const res = await runStep(step, { batch: true });
        if (!res || outcomeOf(res) === "err") {
          toast(`Dừng ở bước "${step.title}"`, "err");
          return;
        }
      }
      toast("Đã chạy xong cả 6 bước", "ok");
    } finally {
      busy.batch = false;
      setBusy(false);
    }
  });

  // ==================== SINH VIÊN ====================

  const studentMode = () => $('input[name="stuMode"]:checked').value;

  function updateStudentMode() {
    const byClass = studentMode() === "class";
    $("#stuCodesLabel").textContent = byClass ? "Mã lớp danh nghĩa" : "Mã sinh viên";
    $("#stuCodes").placeholder = byClass ? "Ví dụ: 70CS2, 70CS3" : "Ví dụ: 1653965, 1653966";
    $("#stuHelp").textContent = byClass
      ? `Lấy hết sinh viên của lớp từ hồ sơ, không cần học kỳ. Tối đa ${MAX_CLASS_CODES} lớp một lần.`
      : `Nhiều mã cách nhau dấu phẩy, khoảng trắng hoặc xuống dòng (dán nguyên cột Excel được). Tối đa ${MAX_STUDENT_CODES} mã một lần.`;
    $("#stuChiDangHocRow").hidden = !byClass;
    // Ghi danh chỉ làm được theo mã sinh viên
    $("#stuEnrollBtn").hidden = byClass;
    $("#stuBothBtn").hidden = byClass;
    $("#stuAccountBtn").classList.toggle("btn-primary", byClass);
    updateStudentCount();
  }

  function updateStudentCount() {
    const n = parseCodes($("#stuCodes").value).length;
    $("#stuCount").textContent = n ? `Đang nhập ${n} ${studentMode() === "class" ? "lớp" : "mã"}.` : "";
  }

  $$('input[name="stuMode"]').forEach((r) => r.addEventListener("change", updateStudentMode));
  $("#stuCodes").addEventListener("input", updateStudentCount);

  function readStudentCodes() {
    const byClass = studentMode() === "class";
    const codes = parseCodes($("#stuCodes").value);
    const max = byClass ? MAX_CLASS_CODES : MAX_STUDENT_CODES;

    if (!codes.length) {
      toast(byClass ? "Nhập ít nhất một mã lớp" : "Nhập ít nhất một mã sinh viên", "err");
      $("#stuCodes").focus();
      return null;
    }
    if (codes.length > max) {
      toast(`Tối đa ${max} ${byClass ? "lớp" : "mã"} một lần, đang nhập ${codes.length}`, "err");
      return null;
    }
    return codes;
  }

  function studentAccounts(codes) {
    if (studentMode() === "class") {
      return runTask({
        title: `Tài khoản SV — lớp ${codesLabel(codes, "lớp")}`,
        exec: () =>
          post("/api/sync/students/by-class", {
            maLop: codes.join(","),
            chiDangHoc: $("#stuChiDangHoc").checked,
          }),
        log: logs.students,
        page: "students",
      });
    }

    return runTask({
      title: `Tài khoản SV — ${codesLabel(codes, "mã")}`,
      exec: () => post("/api/sync/students/by-code", { maSinhVien: codes.join(",") }),
      log: logs.students,
      page: "students",
    });
  }

  function studentEnroll(codes, tenDot) {
    return runTask({
      title: `Ghi danh SV — ${codesLabel(codes, "mã")} · ${tenDot}`,
      exec: () => post(withParam("/api/enrollments/students", codes.join(",")), { tenDot }),
      log: logs.students,
      page: "students",
    });
  }

  $("#stuAccountBtn").addEventListener("click", () => {
    const codes = readStudentCodes();
    if (codes) studentAccounts(codes);
  });

  $("#stuEnrollBtn").addEventListener("click", () => {
    const codes = readStudentCodes();
    if (!codes) return;
    const tenDot = requireTenDot();
    if (tenDot) studentEnroll(codes, tenDot);
  });

  onSubmit("#stuForm", async () => {
    const codes = readStudentCodes();
    if (!codes) return;

    if (studentMode() === "class") return studentAccounts(codes);

    const tenDot = requireTenDot();
    if (!tenDot) return;

    const acc = await studentAccounts(codes);
    if (acc && outcomeOf(acc) !== "err") await studentEnroll(codes, tenDot);
  });

  // ==================== GIẢNG VIÊN ====================

  function readTeacherCode() {
    const codes = parseCodes($("#gvCode").value);
    if (!codes.length) {
      toast("Nhập mã giảng viên hoặc email", "err");
      $("#gvCode").focus();
      return null;
    }
    if (codes.length > 1) {
      toast("Mỗi lần chỉ nhập một giảng viên", "err");
      $("#gvCode").focus();
      return null;
    }
    return codes[0];
  }

  const teacherAccount = (code, tenDot) =>
    runTask({
      title: `Tài khoản GV — ${code}`,
      exec: () => post(withParam("/api/sync/teachers", code), { tenDot }),
      log: logs.teachers,
      page: "teachers",
    });

  const teacherEnroll = (code, tenDot) =>
    runTask({
      title: `Ghi danh GV — ${code} · ${tenDot}`,
      exec: () => post(withParam("/api/enrollments/teachers", code), { tenDot }),
      log: logs.teachers,
      page: "teachers",
    });

  $("#gvAccountBtn").addEventListener("click", () => {
    const code = readTeacherCode();
    const tenDot = code && requireTenDot();
    if (tenDot) teacherAccount(code, tenDot);
  });

  $("#gvEnrollBtn").addEventListener("click", () => {
    const code = readTeacherCode();
    const tenDot = code && requireTenDot();
    if (tenDot) teacherEnroll(code, tenDot);
  });

  onSubmit("#gvForm", async () => {
    const code = readTeacherCode();
    const tenDot = code && requireTenDot();
    if (!tenDot) return;
    const acc = await teacherAccount(code, tenDot);
    if (acc && outcomeOf(acc) !== "err") await teacherEnroll(code, tenDot);
  });

  // ==================== LỚP HỌC PHẦN ====================

  function readSectionCode() {
    const codes = parseCodes($("#lhpCode").value);
    if (!codes.length) {
      toast("Nhập mã lớp học phần", "err");
      $("#lhpCode").focus();
      return null;
    }
    if (codes.length > 1) {
      toast("Mỗi lần chỉ nhập một mã lớp học phần", "err");
      $("#lhpCode").focus();
      return null;
    }
    return codes[0];
  }

  onSubmit("#lhpForm", () => {
    const code = readSectionCode();
    const tenDot = code && requireTenDot();
    if (!tenDot) return;
    runTask({
      title: `Lớp ${code} — tạo + ghi danh · ${tenDot}`,
      exec: () => post("/api/sync/courses/full", { tenDot, maLopHocPhan: code }),
      log: logs.sections,
      page: "sections",
    });
  });

  $("#lhpCreateBtn").addEventListener("click", () => {
    const code = readSectionCode();
    const tenDot = code && requireTenDot();
    if (!tenDot) return;
    runTask({
      title: `Lớp ${code} — tạo khóa học · ${tenDot}`,
      exec: () => post("/api/sync/courses/by-code", { tenDot, maLopHocPhan: code }),
      log: logs.sections,
      page: "sections",
    });
  });

  // ==================== KHÓA HỌC & GỘP LỚP ====================

  const categories = { items: [], byId: new Map(), loaded: false };
  let moodleSiteUrl = "";

  const courseTable = createTable("#courseTable", "#courseCount", null, {
    selectable: true,
    idKey: "id",
    pinSelected: true,
    emptyText: "Đang tải danh sách khóa học...",
    onSelectionChange: onCourseSelection,
  });

  courseTable.setColumns([
    { key: "id", label: "ID" },
    {
      key: "shortname",
      label: "Mã lớp (shortname)",
      render: (r) =>
        moodleSiteUrl
          ? `<a href="${esc(moodleSiteUrl)}/course/view.php?id=${esc(r.id)}" target="_blank" rel="noopener" title="Mở trên Moodle">${esc(r.shortname)} ↗</a>`
          : esc(r.shortname),
    },
    { key: "fullname", label: "Tên lớp" },
    { key: "idnumber", label: "Idnumber" },
    { key: "danhMuc", label: "Danh mục" },
    {
      key: "visible",
      label: "Trạng thái",
      render: (r) => (r.visible ? pill("ok", "Đang hiện") : pill("none", "Đang ẩn")),
    },
    {
      key: "_actions",
      label: "",
      sortable: false,
      export: false,
      render: (r) => `<button class="btn btn-sm" type="button" data-members="${esc(r.id)}">Thành viên</button>`,
    },
  ]);

  // Bấm "Thành viên" ở một dòng -> sang trang Thành viên lớp với khóa học đó
  $("#courseTable").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-members]");
    if (!btn) return;
    const row = courseRows.find((c) => String(c.id) === btn.dataset.members);
    openMembers(btn.dataset.members, row);
  });

  let courseRows = [];

  function ensureCourses() {
    if (!courseTable.isLoaded()) loadCourses();
  }

  async function loadCategories() {
    if (categories.loaded) return;
    try {
      const { body } = await api("/api/moodle/categories");
      if (!body?.success) return;

      categories.items = body.data.items || [];
      categories.byId = new Map(categories.items.map((c) => [c.id, c]));
      categories.loaded = true;

      const options = categories.items.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
      $("#courseCategory").innerHTML = '<option value="">Tất cả danh mục</option>' + options;
      $("#mergeCategory").innerHTML = options;
    } catch {
      // Không có danh mục thì bộ lọc danh mục để trống, phần còn lại vẫn dùng được
    }
  }

  async function loadCourses() {
    const btn = $("#courseReload");
    btn.classList.add("is-busy");
    courseTable.setMessage('<p class="empty">Đang tải danh sách khóa học từ Moodle...</p>');

    try {
      await loadCategories();
      const { body } = await api("/api/moodle/courses");
      if (!body?.success) {
        courseTable.setMessage(`<p class="empty">${esc(body?.message || "Không tải được danh sách khóa học")}</p>`);
        return toast(body?.message || "Không tải được danh sách khóa học", "err");
      }

      moodleSiteUrl = (body.data.siteUrl || "").replace(/\/+$/, "");
      courseRows = (body.data.items || [])
        .filter((c) => c.id !== 1) // trang chủ site
        .map((c) => ({
          id: c.id,
          shortname: c.shortname,
          fullname: c.fullname,
          idnumber: c.idnumber,
          categoryid: c.categoryid,
          danhMuc: categories.byId.get(c.categoryid)?.name || "",
          visible: c.visible,
        }));

      courseTable.setRows(courseRows, "moodle_courses");
      applyCourseFilters();
    } catch {
      courseTable.setMessage('<p class="empty">Không gọi được service.</p>');
      toast("Không gọi được service", "err");
    } finally {
      btn.classList.remove("is-busy");
    }
  }

  function applyCourseFilters() {
    const search = normalize($("#courseSearch").value);
    const categoryId = $("#courseCategory").value;
    const visible = $("#courseVisible").value;
    const onlySelected = $("#courseOnlySelected").checked;
    const selectedIds = new Set(courseTable.getSelected().map((r) => r.id));

    courseTable.setExtraFilter((row) => {
      if (search && !normalize(`${row.fullname} ${row.shortname} ${row.idnumber}`).includes(search)) return false;
      if (categoryId && String(row.categoryid) !== categoryId) return false;
      if (visible !== "" && String(row.visible) !== visible) return false;
      if (onlySelected && !selectedIds.has(row.id)) return false;
      return true;
    });
  }

  ["#courseCategory", "#courseVisible", "#courseOnlySelected"].forEach((sel) =>
    $(sel).addEventListener("change", applyCourseFilters)
  );
  $("#courseSearch").addEventListener("input", applyCourseFilters);
  $("#courseReload").addEventListener("click", loadCourses);
  $("#courseExport").addEventListener("click", () => courseTable.exportCSV());

  // ---- gộp lớp ----

  // Kết quả xem trước chỉ còn giá trị khi lựa chọn không đổi
  const merge = { previewKey: null };

  const mergeMode = () => $('input[name="mergeMode"]:checked').value;

  function mergeConfig() {
    const selected = courseTable.getSelected();
    const mode = mergeMode();

    if (mode === "existing") {
      const targetId = Number($("#mergeTarget").value);
      const target = selected.find((c) => Number(c.id) === targetId) || null;
      return { mode, selected, target, sources: selected.filter((c) => c !== target) };
    }
    return { mode, selected, target: null, sources: selected };
  }

  const configKey = (cfg) =>
    `${cfg.mode}|${cfg.target ? cfg.target.id : ""}|${cfg.sources.map((c) => c.id).sort().join(",")}`;

  function onCourseSelection(selected) {
    $("#mergeBox").hidden = selected.length === 0;

    // Giữ lớp giữ lại đã chọn nếu vẫn còn trong danh sách
    const sel = $("#mergeTarget");
    const previous = sel.value;
    sel.innerHTML = selected
      .map((c) => `<option value="${esc(c.id)}">${esc(c.shortname)} — ${esc(c.fullname)}</option>`)
      .join("");
    if (selected.some((c) => String(c.id) === previous)) sel.value = previous;

    if ($("#courseOnlySelected").checked) applyCourseFilters();
    updateMergeState();
  }

  function renderMergeChips(cfg) {
    const deleteSources = $("#mergeDeleteSources").checked;

    $("#mergeChips").innerHTML = cfg.selected
      .map((c) => {
        const isTarget = cfg.target && c.id === cfg.target.id;
        const role = isTarget ? "keep" : deleteSources ? "drop" : "source";
        const tag = isTarget ? "giữ lại" : deleteSources ? "sẽ xóa" : "nguồn";
        return (
          `<span class="chip chip-${role}" title="${esc(c.fullname)}">` +
          `<span>${esc(c.shortname)}</span><span class="chip-tag">${tag}</span>` +
          `<button type="button" data-unpick="${esc(c.id)}" title="Bỏ chọn lớp này">✕</button></span>`
        );
      })
      .join("");

    $$("#mergeChips [data-unpick]").forEach((btn) =>
      btn.addEventListener("click", () => courseTable.deselect(btn.dataset.unpick))
    );

    $("#mergeChipsHelp").textContent =
      cfg.selected.length < 2
        ? "Chọn thêm ít nhất 1 lớp nữa ở bảng phía trên để gộp."
        : "Tích thêm lớp ở bảng phía trên. Lớp đã chọn luôn nằm ở đầu bảng.";
  }

  function updateMergeState() {
    const cfg = mergeConfig();

    $$("[data-merge-mode]").forEach((el) => (el.hidden = el.dataset.mergeMode !== cfg.mode));
    renderMergeChips(cfg);

    const ready = cfg.selected.length >= 2 && (cfg.mode === "new" || cfg.target);
    const fresh = ready && merge.previewKey === configKey(cfg);

    $("#mergePreviewBtn").disabled = !ready;
    $("#mergeRunBtn").disabled = !fresh;

    if (!fresh && merge.previewKey) {
      merge.previewKey = null;
      $("#mergePreview").innerHTML = ready
        ? '<p class="note">Lựa chọn đã thay đổi — bấm <b>Xem trước</b> lại.</p>'
        : "";
    }
  }

  $$('input[name="mergeMode"]').forEach((r) => r.addEventListener("change", updateMergeState));
  $("#mergeTarget").addEventListener("change", updateMergeState);
  $("#mergeDeleteSources").addEventListener("change", () => {
    renderMergeChips(mergeConfig());
    const summary = $("#mergeDeleteSummary");
    if (summary) summary.hidden = !$("#mergeDeleteSources").checked;
  });
  $("#mergeClear").addEventListener("click", () => courseTable.clearSelection());

  function renderMergePreview(data, cfg) {
    const m = data.members;
    const cards =
      data.mode === "existing"
        ? [
            ["Lớp giữ lại", `${data.target.shortname} (${data.target.memberCount} thành viên)`],
            ["Chuyển sang", `${m.incoming} người`],
            ["Người mới vào lớp", `${m.newMembers} người`],
            ["Đã có sẵn, bỏ qua", `${m.alreadyInTarget} người`],
          ]
        : [
            ["Lớp mới sẽ có", `${m.unique} thành viên`],
            ["Lượt trùng đã hợp nhất", `${m.duplicated}`],
          ];

    const byRole = Object.entries(m.byRole || {})
      .map(([label, count]) => `${label}: ${count}`)
      .join(" · ");

    const sources = data.sources.map((s) => ({
      "Course id": s.id,
      "Mã lớp": s.shortname,
      "Tên lớp": s.fullname,
      "Thành viên": s.memberCount,
      "Sinh viên": s.studentCount,
      "Giảng viên": s.teacherCount,
    }));

    $("#mergePreview").innerHTML =
      '<div class="preview">' +
      '<div class="preview-cards">' +
      cards.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("") +
      "</div>" +
      (byRole ? `<p class="help">Theo vai trò: ${esc(byRole)}</p>` : "") +
      `<p class="note note-danger" id="mergeDeleteSummary"${$("#mergeDeleteSources").checked ? "" : " hidden"}>` +
      `Sẽ <b>xóa ${cfg.sources.length} lớp nguồn</b>: ${cfg.sources.map((c) => esc(c.shortname)).join(", ")}</p>` +
      `<details class="sub" open><summary>Lớp nguồn (${sources.length})</summary>${miniTable(sources, 50)}</details>` +
      `<details class="sub"><summary>Danh sách thành viên chuyển sang (${m.items.length})</summary>${miniTable(m.items, 300)}</details>` +
      "</div>";
  }

  $("#mergePreviewBtn").addEventListener("click", async () => {
    const cfg = mergeConfig();
    if (cfg.selected.length < 2) return toast("Chọn ít nhất 2 lớp để gộp", "err");
    if (cfg.mode === "existing" && !cfg.target) return toast("Chọn lớp giữ lại", "err");

    const payload =
      cfg.mode === "existing"
        ? { sourceCourseIds: cfg.sources.map((c) => c.id), targetCourseId: cfg.target.id }
        : { sourceCourseIds: cfg.selected.map((c) => c.id) };

    const btn = $("#mergePreviewBtn");
    btn.classList.add("is-busy");

    try {
      const { body } = await post("/api/moodle/courses/merge/preview", payload);
      if (!body?.success) {
        merge.previewKey = null;
        $("#mergePreview").innerHTML = `<p class="note note-danger">${esc(body?.message || "Không xem trước được")}</p>`;
        return;
      }

      const data = body.data;
      if (data.mode === "new") {
        if (!$("#mergeFullname").value.trim()) $("#mergeFullname").value = data.suggestion.fullname;
        if (!$("#mergeShortname").value.trim()) $("#mergeShortname").value = data.suggestion.shortname;
        if (!$("#mergeCategory").value || !categories.byId.has(Number($("#mergeCategory").value))) {
          if (!categories.byId.has(data.suggestion.categoryid)) {
            $("#mergeCategory").insertAdjacentHTML(
              "beforeend",
              `<option value="${esc(data.suggestion.categoryid)}">Danh mục ${esc(data.suggestion.categoryid)}</option>`
            );
          }
          $("#mergeCategory").value = String(data.suggestion.categoryid);
        }
      }

      merge.previewKey = configKey(cfg);
      renderMergePreview(data, cfg);
    } catch {
      toast("Không gọi được service", "err");
    } finally {
      btn.classList.remove("is-busy");
      updateMergeState();
    }
  });

  $("#mergeRunBtn").addEventListener("click", async () => {
    const cfg = mergeConfig();
    if (merge.previewKey !== configKey(cfg)) return toast("Bấm Xem trước trước khi gộp", "err");

    let fullname = "";
    let shortname = "";
    if (cfg.mode === "new") {
      fullname = $("#mergeFullname").value.trim();
      shortname = $("#mergeShortname").value.trim();
      if (!fullname) {
        toast("Nhập tên lớp mới", "err");
        return $("#mergeFullname").focus();
      }
      if (!shortname) {
        toast("Nhập mã lớp mới", "err");
        return $("#mergeShortname").focus();
      }
    }

    const deleteSources = $("#mergeDeleteSources").checked;
    const list = cfg.sources.map((c) => `<li><b>${esc(c.shortname)}</b> — ${esc(c.fullname)}</li>`).join("");

    const body =
      (cfg.mode === "existing"
        ? `<p>Chuyển thành viên của:</p><ul>${list}</ul>` +
          `<p>vào lớp có sẵn <b>${esc(cfg.target.shortname)}</b> — ${esc(cfg.target.fullname)}.</p>`
        : `<p>Gộp các lớp:</p><ul>${list}</ul><p>thành lớp mới <b>${esc(shortname)}</b> — ${esc(fullname)}.</p>`) +
      (deleteSources
        ? '<p class="note note-danger">Các lớp nguồn ở trên sẽ bị <b>XÓA VĨNH VIỄN</b> cùng bài giảng, bài nộp và điểm. Không hoàn tác được.</p>'
        : "<p>Lớp nguồn được giữ nguyên.</p>");

    const ok = await confirmDialog({
      title: "Xác nhận gộp lớp",
      body,
      ok: deleteSources ? "Gộp và xóa lớp nguồn" : "Gộp lớp",
      danger: deleteSources,
    });
    if (!ok) return;

    const common = { copySections: $("#mergeCopySections").checked, deleteSources, confirm: true };
    const payload =
      cfg.mode === "existing"
        ? { ...common, sourceCourseIds: cfg.sources.map((c) => c.id), targetCourseId: cfg.target.id }
        : {
            ...common,
            sourceCourseIds: cfg.selected.map((c) => c.id),
            fullname,
            shortname,
            idnumber: $("#mergeIdnumber").value.trim(),
            categoryid: $("#mergeCategory").value,
          };

    const res = await runTask({
      title: cfg.mode === "existing" ? `Gộp vào lớp ${cfg.target.shortname}` : `Gộp thành lớp mới ${shortname}`,
      exec: () => post("/api/moodle/courses/merge", payload),
      log: logs.merge,
      page: "courses",
    });

    if (res && res.body?.data?.targetCourse) {
      merge.previewKey = null;
      $("#mergePreview").innerHTML = "";
      $("#mergeFullname").value = "";
      $("#mergeShortname").value = "";
      $("#mergeIdnumber").value = "";
      await loadCourses();
    }
  });

  // ==================== THÀNH VIÊN LỚP ====================

  const membersTable = createTable("#membersTable", "#membersCount", "#membersFilter", {
    emptyText: "Nhập Course ID rồi bấm Xem, hoặc mở từ nút Thành viên ở trang Khóa học.",
  });

  membersTable.setColumns([
    { key: "idnumber", label: "Mã" },
    { key: "fullname", label: "Họ tên" },
    { key: "username", label: "Tài khoản" },
    { key: "email", label: "Email" },
    {
      key: "roles",
      label: "Vai trò",
      render: (r) =>
        esc(
          String(r.roles || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => ROLE_LABEL[s] || s)
            .join(", ")
        ),
    },
    { key: "id", label: "User id" },
  ]);

  function openMembers(courseId, row) {
    $("#membersCourseId").value = courseId;
    $("#membersContext").textContent = row ? `${row.shortname} — ${row.fullname}` : "";
    go("members");
    loadMembers();
  }

  async function loadMembers() {
    const courseId = $("#membersCourseId").value.trim();
    if (!courseId) {
      toast("Nhập Course ID", "err");
      return $("#membersCourseId").focus();
    }

    const roleId = $("#membersRole").value;
    const btn = $("#membersLoad");
    btn.classList.add("is-busy");
    membersTable.setMessage('<p class="empty">Đang tải từ Moodle...</p>');

    try {
      const { body } = await api(
        `/api/moodle/courses/${encodeURIComponent(courseId)}/users` + (roleId ? `?roleid=${roleId}` : "")
      );
      if (!body?.success) {
        membersTable.setMessage(`<p class="empty">${esc(body?.message || "Không tải được")}</p>`);
        return toast(body?.message || "Không tải được", "err");
      }
      membersTable.setRows(body.data.items || [], `moodle_course_${courseId}_members`);
    } catch {
      membersTable.setMessage('<p class="empty">Không gọi được service.</p>');
    } finally {
      btn.classList.remove("is-busy");
    }
  }

  onSubmit("#membersForm", () => {
    const id = $("#membersCourseId").value.trim();
    const row = courseRows.find((c) => String(c.id) === id);
    $("#membersContext").textContent = row ? `${row.shortname} — ${row.fullname}` : "";
    loadMembers();
  });
  $("#membersExport").addEventListener("click", () => membersTable.exportCSV());

  // ==================== NGƯỜI DÙNG ====================

  const usersTable = createTable("#usersTable", "#usersCount", "#usersFilter", {
    emptyText: "Chọn tiêu chí, nhập giá trị rồi bấm Tìm.",
  });

  usersTable.setColumns([
    { key: "idnumber", label: "Mã (idnumber)" },
    { key: "fullname", label: "Họ tên" },
    { key: "username", label: "Tài khoản" },
    { key: "email", label: "Email" },
    { key: "auth", label: "Đăng nhập" },
    {
      key: "suspended",
      label: "Trạng thái",
      render: (r) => (r.suspended ? pill("err", "Bị khóa") : pill("ok", "Hoạt động")),
    },
    { key: "id", label: "User id" },
  ]);

  $("#usersKey").addEventListener("change", () => {
    if ($("#usersKey").value === "auth" && !$("#usersValue").value.trim()) $("#usersValue").value = "manual";
  });

  onSubmit("#usersForm", async () => {
    const key = $("#usersKey").value;
    const value = $("#usersValue").value.trim();
    if (!value) {
      toast("Nhập giá trị cần tìm", "err");
      return $("#usersValue").focus();
    }

    const btn = $("#usersLoad");
    btn.classList.add("is-busy");
    usersTable.setMessage('<p class="empty">Đang tìm trên Moodle...</p>');

    try {
      const { body } = await api(
        `/api/moodle/users?key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`
      );
      if (!body?.success) {
        usersTable.setMessage(`<p class="empty">${esc(body?.message || "Không tìm được")}</p>`);
        return toast(body?.message || "Không tìm được", "err");
      }
      usersTable.setRows(body.data.items || [], `moodle_users_${key}`);
    } catch {
      usersTable.setMessage('<p class="empty">Không gọi được service.</p>');
    } finally {
      btn.classList.remove("is-busy");
    }
  });
  $("#usersExport").addEventListener("click", () => usersTable.exportCSV());

  // ==================== DỌN GHI DANH NHẦM CƠ SỞ ====================

  $("#cleanupPreview").addEventListener("click", () => {
    const tenDot = requireTenDot();
    if (!tenDot) return;
    runTask({
      title: `Xem trước dọn ghi danh nhầm cơ sở · ${tenDot}`,
      exec: () => post("/api/enrollments/cleanup-campus", { tenDot, apply: false }),
      log: logs.cleanup,
      page: "cleanup",
    });
  });

  $("#cleanupApply").addEventListener("click", async () => {
    const tenDot = requireTenDot();
    if (!tenDot) return;

    const ok = await confirmDialog({
      title: "Gỡ thật sinh viên ghi danh nhầm cơ sở?",
      body:
        `<p>Học kỳ <b>${esc(tenDot)}</b>: gỡ sinh viên cơ sở khác ra khỏi khóa học của cơ sở chính.</p>` +
        '<p class="note note-danger">Không hoàn tác được. Nên chạy <b>Xem trước danh sách</b> và kiểm tra file Excel trước.</p>',
      ok: "Gỡ thật",
      danger: true,
    });
    if (!ok) return;

    runTask({
      title: `Dọn ghi danh nhầm cơ sở — gỡ thật · ${tenDot}`,
      exec: () => post("/api/enrollments/cleanup-campus", { tenDot, apply: true, confirm: true }),
      log: logs.cleanup,
      page: "cleanup",
    });
  });

  // ==================== TRA CỨU DỮ LIỆU NGUỒN ====================
  // Danh sách tập dữ liệu và trường lọc lấy động từ /api/data,
  // thêm cột ở backend là giao diện tự có ngay.

  const dataTable = createTable("#dataTable", "#dataCount", "#dataFilter", {
    emptyText: "Chọn tập dữ liệu, thêm điều kiện nếu cần rồi bấm Tải dữ liệu.",
  });

  const core = { datasets: [], operators: [], active: null, meta: null, loading: null };

  function ensureDatasets() {
    if (!core.loading) core.loading = loadDatasets();
    return core.loading;
  }

  async function loadDatasets() {
    try {
      const { body } = await api("/api/data");
      if (!body?.success) throw new Error(body?.message);

      // terms/cohorts chỉ dùng cho thanh chọn học kỳ, không cần tra ở đây
      core.datasets = body.data.datasets.filter((d) => !["terms", "cohorts"].includes(d.name));
      core.operators = body.data.operators;

      $("#dataDataset").innerHTML = core.datasets
        .map((d) => `<option value="${esc(d.name)}">${esc(d.label)}</option>`)
        .join("");

      if (core.datasets.length) await selectDataset(core.datasets[0].name);
    } catch {
      core.loading = null; // cho phép thử lại lần sau mở trang
      toast("Không lấy được danh sách tập dữ liệu", "err");
    }
  }

  async function selectDataset(name) {
    core.active = name;
    core.meta = null;

    const { body } = await api(`/api/data/${encodeURIComponent(name)}/fields`);
    if (!body?.success) return toast("Không lấy được danh sách trường", "err");

    core.meta = body.data;
    const dataset = core.datasets.find((d) => d.name === name);

    $("#dataSort").innerHTML = core.meta.columns
      .map(
        (c) => `<option value="${esc(c.name)}"${c.name === core.meta.defaultSort ? " selected" : ""}>${esc(c.label)}</option>`
      )
      .join("");

    $("#dataScopeHelp").textContent = core.meta.requireTenDot
      ? dataset?.khoaHocFilter
        ? "Lấy theo học kỳ và khóa đang chọn ở thanh trên."
        : "Lấy theo học kỳ đang chọn ở thanh trên."
      : "Không phụ thuộc học kỳ.";

    clearFilterRows();
    dataTable.setMessage('<p class="empty">Bấm <b>Tải dữ liệu</b>.</p>');
  }

  $("#dataDataset").addEventListener("change", () => selectDataset($("#dataDataset").value));

  function filterRowHtml() {
    const fields = core.meta.columns
      .map((c) => `<option value="${esc(c.name)}" data-type="${esc(c.type)}">${esc(c.label)}</option>`)
      .join("");
    const ops = core.operators.map((o) => `<option value="${esc(o.name)}">${esc(o.label)}</option>`).join("");

    return `<div class="filter-row">
      <select class="select filter-field">${fields}</select>
      <select class="select filter-op">${ops}</select>
      <input class="input filter-value" type="text" placeholder="Giá trị">
      <button class="btn btn-sm btn-ghost filter-remove" type="button" title="Xóa điều kiện">✕</button>
    </div>`;
  }

  function syncFilterRow(row) {
    const field = row.querySelector(".filter-field");
    const input = row.querySelector(".filter-value");
    const type = field.selectedOptions[0]?.dataset.type || "string";
    const opDef = core.operators.find((o) => o.name === row.querySelector(".filter-op").value);

    input.disabled = Boolean(opDef && !opDef.needsValue);
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

    const firstCol = core.meta.columns[0];
    if (firstCol) row.querySelector(".filter-op").value = firstCol.defaultOperator;

    row.querySelector(".filter-field").addEventListener("change", (e) => {
      const col = core.meta.columns.find((c) => c.name === e.target.value);
      if (col) row.querySelector(".filter-op").value = col.defaultOperator;
      syncFilterRow(row);
    });
    row.querySelector(".filter-op").addEventListener("change", () => syncFilterRow(row));
    row.querySelector(".filter-remove").addEventListener("click", () => {
      row.remove();
      updateFilterHint();
    });

    $("#dataFilterRows").appendChild(row);
    syncFilterRow(row);
    updateFilterHint();
    row.querySelector(".filter-value").focus();
  }

  function clearFilterRows() {
    $("#dataFilterRows").innerHTML = "";
    updateFilterHint();
  }

  function updateFilterHint() {
    const n = $$("#dataFilterRows .filter-row").length;
    $("#dataFilterHint").textContent = n
      ? `${n} điều kiện, phải thỏa tất cả (AND).`
      : "Chưa có điều kiện nào — lấy toàn bộ dữ liệu.";
  }

  function buildFilterQuery() {
    const parts = [];

    for (const row of $$("#dataFilterRows .filter-row")) {
      const field = row.querySelector(".filter-field");
      const op = row.querySelector(".filter-op").value;
      const input = row.querySelector(".filter-value");
      const value = input.value.trim();
      const opDef = core.operators.find((o) => o.name === op);

      if ((!opDef || opDef.needsValue) && !value) {
        toast(`Điều kiện "${field.selectedOptions[0]?.textContent}" chưa có giá trị`, "err");
        input.focus();
        return null;
      }

      parts.push(`${encodeURIComponent(field.value + "__" + op)}=${encodeURIComponent(value)}`);
    }

    return parts;
  }

  $("#dataAddFilter").addEventListener("click", addFilterRow);
  $("#dataClearFilters").addEventListener("click", clearFilterRows);
  $("#dataExport").addEventListener("click", () => dataTable.exportCSV());

  $("#dataLoad").addEventListener("click", async () => {
    if (!core.meta) return;

    const params = [];
    const dataset = core.datasets.find((d) => d.name === core.active);

    if (core.meta.requireTenDot) {
      const tenDot = requireTenDot();
      if (!tenDot) return;
      params.push("tenDot=" + encodeURIComponent(tenDot));
    }

    const khoa = getKhoa();
    if (khoa && dataset?.khoaHocFilter) params.push("idKhoaHoc=" + encodeURIComponent(khoa));

    const filterParts = buildFilterQuery();
    if (filterParts === null) return;
    params.push(...filterParts);

    params.push("sort=" + encodeURIComponent($("#dataSort").value));
    params.push("order=" + encodeURIComponent($("#dataOrder").value));
    params.push("limit=" + encodeURIComponent($("#dataLimit").value));

    const btn = $("#dataLoad");
    btn.classList.add("is-busy");
    dataTable.setMessage('<p class="empty">Đang tải...</p>');

    try {
      const { body } = await api(`/api/data/${encodeURIComponent(core.active)}?${params.join("&")}`);
      if (!body?.success) {
        dataTable.setMessage(`<p class="empty">${esc(body?.message || "Tải dữ liệu thất bại")}</p>`);
        return toast(body?.message || "Tải dữ liệu thất bại", "err");
      }

      dataTable.setRows(body.data.items, "nguon_" + core.active);

      if (body.data.total > body.data.returned) {
        toast(`Lấy ${body.data.returned}/${body.data.total} dòng — tăng số dòng tối đa để lấy thêm`, "err");
      } else {
        toast(`${core.meta.label}: ${body.data.total} dòng`, "ok");
      }
    } catch {
      dataTable.setMessage('<p class="empty">Không gọi được service.</p>');
      toast("Không gọi được service", "err");
    } finally {
      btn.classList.remove("is-busy");
    }
  });

  // ==================== BÁO CÁO KHÓA ĐIỂM ====================

  let reportTouched = false;

  // Đồng bộ ô học kỳ của báo cáo theo thanh trên, trừ khi người dùng đã tự chọn khác
  function syncReportTerm(force) {
    const sel = $("#reportDot");
    const current = sel.value;

    sel.innerHTML = ctx.terms
      .map((t) => `<option value="${esc(t.IDDot)}">${esc(t.TenDot)}${t.TenDayDu ? ` — ${esc(t.TenDayDu)}` : ""}</option>`)
      .join("");

    const headerTerm = ctx.terms.find((t) => t.TenDot === getTenDot());
    if ((force || !reportTouched || !current) && headerTerm) {
      sel.value = String(headerTerm.IDDot);
      reportTouched = false;
    } else if (current) {
      sel.value = current;
    }
  }

  $("#reportDot").addEventListener("change", () => (reportTouched = true));

  const reportTermName = () => $("#reportDot").selectedOptions[0]?.textContent.split(" — ")[0] || "";

  function reportUrl(download) {
    const q = new URLSearchParams({
      idDot: $("#reportDot").value,
      merge: String($("#reportMerge").checked),
      late: String($("#reportLate").checked),
    });
    if (download) q.set("download", "true");
    return "/api/reports/locked-grades?" + q.toString();
  }

  function fileNameFrom(disposition) {
    if (!disposition) return null;
    const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (star) {
      try { return decodeURIComponent(star[1]); } catch { /* rơi xuống cách dưới */ }
    }
    const plain = disposition.match(/filename="?([^";]+)"?/i);
    return plain ? plain[1] : null;
  }

  function requireReportTerm() {
    if ($("#reportDot").value) return true;
    toast("Chọn học kỳ cho báo cáo", "err");
    $("#reportDot").focus();
    return false;
  }

  onSubmit("#reportForm", () => {
    if (!requireReportTerm()) return;

    runTask({
      title: `Tải Excel khóa điểm — ${reportTermName()}`,
      log: logs.report,
      page: "report",
      exec: async () => {
        const res = await fetch(reportUrl(true), { headers: taskHeaders || {} });
        const type = res.headers.get("content-type") || "";
        const runId = res.headers.get("X-Run-Id");

        if (!res.ok || type.includes("application/json")) {
          let body;
          try { body = await res.json(); } catch { body = null; }
          return {
            ok: false,
            status: res.status,
            runId,
            body: { success: false, message: body?.message || `Không tải được file (HTTP ${res.status})` },
          };
        }

        const name = fileNameFrom(res.headers.get("content-disposition")) || "bao-cao-khoa-diem.xlsx";
        saveBlob(await res.blob(), name);
        return { ok: true, status: res.status, runId, body: { success: true, message: `Đã tải file ${name}`, data: {} } };
      },
    });
  });

  $("#reportCreate").addEventListener("click", () => {
    if (!requireReportTerm()) return;
    runTask({
      title: `Tạo báo cáo khóa điểm — ${reportTermName()}`,
      exec: () => api(reportUrl(false)),
      log: logs.report,
      page: "report",
    });
  });

  // ==================== HỆ THỐNG ====================

  function refreshSystem() {
    renderConn();
    loadScheduler();
  }

  $("#sysCheck").addEventListener("click", checkHealth);
  $("#schedRefresh").addEventListener("click", loadScheduler);

  $("#sysSiteInfo").addEventListener("click", async () => {
    const btn = $("#sysSiteInfo");
    btn.classList.add("is-busy");
    try {
      const { body } = await api("/api/moodle/site-info");
      if (!body?.success) {
        $("#sysSite").innerHTML = `<dt>Lỗi</dt><dd>${esc(body?.message || "Không lấy được")}</dd>`;
        return;
      }
      const d = body.data;
      $("#sysSite").innerHTML =
        `<dt>Tài khoản</dt><dd>${esc(d.username)} — ${esc(`${d.firstname || ""} ${d.lastname || ""}`.trim())}</dd>` +
        `<dt>Địa chỉ site</dt><dd><a href="${esc(d.siteurl)}" target="_blank" rel="noopener">${esc(d.siteurl)} ↗</a></dd>` +
        `<dt>Ngôn ngữ</dt><dd>${esc(d.language || "—")}</dd>` +
        `<dt>Số function được gọi</dt><dd>${esc(d.functions)}</dd>`;
    } catch {
      $("#sysSite").innerHTML = "<dt>Lỗi</dt><dd>Không gọi được service</dd>";
    } finally {
      btn.classList.remove("is-busy");
    }
  });

  async function schedulerAction(title, path) {
    await runTask({ title, exec: () => post(path), log: logs.system, page: "system" });
    loadScheduler();
  }

  $("#schedStart").addEventListener("click", () => schedulerAction("Bật lịch tự động", "/api/scheduler/start"));
  $("#schedStop").addEventListener("click", () => schedulerAction("Tắt lịch tự động", "/api/scheduler/stop"));

  $("#schedRun").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Chạy ngay đồng bộ toàn bộ?",
      body:
        `<p>Chạy cả 6 bước cho học kỳ cấu hình sẵn <b>${esc(scheduler?.tenDot || "SYNC_TEN_DOT")}</b>, chạy nền trên máy chủ.</p>` +
        "<p>Muốn chạy cho học kỳ đang chọn ở thanh trên thì dùng trang <b>Đồng bộ đầu học kỳ</b>.</p>",
      ok: "Chạy ngay",
    });
    if (ok) schedulerAction("Chạy ngay đồng bộ toàn bộ", "/api/scheduler/jobs/syncAllToMoodle/run");
  });

  // ==================== khởi tạo ====================

  buildSteps();
  updateStudentMode();
  updateFilterHint();
  renderActivity();
  route();
  checkHealth();
  // Nạp học kỳ trước rồi mới nạp khóa, vì danh sách khóa phụ thuộc học kỳ đang chọn
  loadTerms().then(loadCohorts);
})();
