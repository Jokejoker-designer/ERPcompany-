/* Demo shell — menu bám PAGES; CT registry load từ data/ct_registry.json (fictional status). */
(function () {
  "use strict";

  var NAV = [
    { id: "dashboard", no: "1", group: "Điều hành", name: "Dashboard điều hành", sub: "KPI điều hành (mẫu)." },
    { id: "quotation", no: "3", group: "Vận hành", name: "Báo giá", sub: "BOQ / VAT (mẫu)." },
    { id: "receivable", no: "9", group: "Công nợ", name: "Theo dõi công nợ", sub: "Tên khách giả." },
    { id: "documents", no: "10", group: "Hồ sơ", name: "Hồ sơ CT V3.1", sub: "84 mẫu CT-00…09." },
    { id: "chungtu", no: "CT", group: "Hồ sơ", name: "7 chứng từ", sub: "BG·BBNT·BQT·HĐ…" },
    { id: "bank", no: "SK", group: "Công nợ", name: "Sao kê NH", sub: "Đối soát minh họa." },
    { id: "roles", no: "TK", group: "Cấu hình", name: "Tài khoản / vai trò", sub: "7 role seed." }
  ];

  var META = {
    dashboard: {
      title: "Dashboard điều hành",
      note: "Tổng quan doanh thu, công nợ, công trình đang chạy và việc cần duyệt."
    },
    receivable: {
      title: "Theo dõi công nợ",
      note: "Phải thu / phải trả theo hợp đồng — trạng thái thanh toán rõ ràng."
    },
    quotation: {
      title: "Báo giá",
      note: "Chuỗi phiên bản, BOQ, VAT — xuất chứng từ chuyên nghiệp."
    },
    documents: {
      title: "Hồ sơ công trình",
      note: "84 mẫu theo giai đoạn — theo dõi đủ / thiếu từng hạng mục."
    },
    chungtu: {
      title: "Chứng từ vận hành",
      note: "Báo giá, BBNT, BQT, hợp đồng, PXK… xuất Word / Excel."
    },
    bank: {
      title: "Sao kê ngân hàng",
      note: "Đối soát dòng tiền, khớp công nợ và phiếu chi."
    },
    roles: {
      title: "Tài khoản & phân quyền",
      note: "GĐ, kế toán, kinh doanh, KTT, KTV, thủ kho — đúng vai đúng quyền."
    }
  };

  var CT = { templates: [], phases: {}, phaseFilter: "all" };

  // Deterministic fictional status for demo project (not real data)
  function demoStatus(code) {
    var n = 0;
    for (var i = 0; i < code.length; i++) n = (n + code.charCodeAt(i) * (i + 3)) % 97;
    if (n % 7 === 0) return { label: "Thiếu", cls: "danger" };
    if (n % 5 === 0) return { label: "Chờ duyệt", cls: "warn" };
    if (n % 4 === 0) return { label: "Bản nháp", cls: "info" };
    return { label: "Đủ", cls: "ok" };
  }

  function paneOf(id) {
    return META[id] ? id : "dashboard";
  }

  function show(id) {
    var pane = paneOf(id);
    var meta = META[pane] || META.dashboard;

    document.querySelectorAll(".screen-tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-screen") === pane);
    });
    document.querySelectorAll(".nav-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-id") === pane);
    });
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-pane") === pane);
    });
    var t = document.getElementById("page-title");
    var n = document.getElementById("page-note");
    if (t) t.textContent = meta.title;
    if (n) n.textContent = meta.note;
    if (pane === "documents") renderCtTable();
  }

  function buildNav() {
    var nav = document.getElementById("demo-nav");
    if (!nav) return;
    var html = "";
    var lastG = null;
    NAV.forEach(function (p) {
      if (p.group !== lastG) {
        html += '<div class="nav-group">' + p.group + "</div>";
        lastG = p.group;
      }
      html +=
        '<button type="button" class="nav-btn" data-id="' + p.id + '">' +
        '<span class="nav-num">' + p.no + "</span>" +
        '<span class="nav-txt"><span class="nav-name">' + p.name + "</span>" +
        '<span class="nav-sub">' + p.sub + "</span></span></button>";
    });
    nav.innerHTML = html;
    nav.querySelectorAll(".nav-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        show(btn.getAttribute("data-id"));
      });
    });
  }

  function renderPhaseTabs() {
    var host = document.getElementById("phase-tabs");
    if (!host) return;
    var phases = Object.keys(CT.phases || {}).sort();
    var html =
      '<button type="button" class="phase-tab active" data-phase="all">Tất cả (' +
      CT.templates.length +
      ")</button>";
    phases.forEach(function (ph) {
      var count = CT.templates.filter(function (t) {
        return t.phase_code === ph;
      }).length;
      html +=
        '<button type="button" class="phase-tab" data-phase="' +
        ph +
        '">' +
        ph +
        " · " +
        (CT.phases[ph] || "") +
        " (" +
        count +
        ")</button>";
    });
    host.innerHTML = html;
    host.querySelectorAll(".phase-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        CT.phaseFilter = btn.getAttribute("data-phase");
        host.querySelectorAll(".phase-tab").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        renderCtTable();
      });
    });
  }

  function renderCtTable() {
    var tbody = document.getElementById("ct-tbody");
    if (!tbody) return;
    var rows = CT.templates;
    if (CT.phaseFilter && CT.phaseFilter !== "all") {
      rows = rows.filter(function (t) {
        return t.phase_code === CT.phaseFilter;
      });
    }
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">Chưa tải được registry (mở qua http/Pages, không file://).</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (t) {
        var st = demoStatus(t.code || "");
        var phaseLabel = (t.phase_code || "") + " — " + (CT.phases[t.phase_code] || "");
        return (
          "<tr>" +
          "<td><code>" +
          (t.code || "") +
          "</code></td>" +
          "<td>" +
          (t.title || "") +
          "</td>" +
          "<td>" +
          phaseLabel +
          "</td>" +
          "<td>" +
          (t.file_type || "") +
          "</td>" +
          "<td>" +
          (t.owner_role || "—") +
          "</td>" +
          "<td>" +
          (t.exists
            ? '<span class="chip ok">Có file</span>'
            : '<span class="chip danger">Thiếu file</span>') +
          "</td>" +
          '<td><span class="chip ' +
          st.cls +
          '">' +
          st.label +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function loadRegistry() {
    var url = "data/ct_registry.json";
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        CT.templates = data.templates || [];
        CT.phases = data.phases || {};
        var exists = CT.templates.filter(function (t) {
          return t.exists;
        }).length;
        var elT = document.getElementById("kpi-total");
        var elE = document.getElementById("kpi-exists");
        if (elT) elT.textContent = String(CT.templates.length);
        if (elE) elE.textContent = String(exists);
        renderPhaseTabs();
        renderCtTable();
      })
      .catch(function (err) {
        var tbody = document.getElementById("ct-tbody");
        if (tbody) {
          tbody.innerHTML =
            '<tr><td colspan="7" class="muted">Không load được ct_registry.json (' +
            String(err.message || err) +
            "). Chạy qua GitHub Pages hoặc python -m http.server trong docs/.</td></tr>";
        }
      });
  }

  document.querySelectorAll(".screen-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      show(btn.getAttribute("data-screen"));
    });
  });

  buildNav();
  loadRegistry();
  show("dashboard");
})();
