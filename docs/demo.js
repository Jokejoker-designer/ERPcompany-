/* Demo shell — menu bám PAGES app thật; chỉ dữ liệu fictional. */
(function () {
  "use strict";

  // Rút gọn từ web/app.js PAGES — id dùng cho tab demo
  var NAV = [
    { id: "dashboard", no: "1", group: "Điều hành", name: "Dashboard điều hành", sub: "Cảnh báo CT, bảo trì, công nợ (mẫu)." },
    { id: "customer", no: "2", group: "Vận hành", name: "Khách hàng / Công trình", sub: "Hồ sơ 360° (UI).", demo: "receivable" },
    { id: "quotation", no: "3", group: "Vận hành", name: "Báo giá", sub: "Phiên bản, BOQ, VAT (mẫu)." },
    { id: "progress", no: "4", group: "Vận hành", name: "Tiến độ công trình", sub: "Kanban giai đoạn.", demo: "dashboard" },
    { id: "receivable", no: "9", group: "Công nợ", name: "Theo dõi công nợ", sub: "HĐ còn nợ (tên giả)." },
    { id: "documents", no: "10", group: "Hồ sơ", name: "Kho hồ sơ / Tài liệu", sub: "Index + checklist (mẫu)." },
    { id: "bank", no: "SK", group: "Công nợ", name: "Sao kê NH (demo)", sub: "Đối soát minh họa." },
    { id: "roles", no: "TK", group: "Cấu hình", name: "Tài khoản / vai trò", sub: "Seed 7 role (mẫu)." }
  ];

  var META = {
    dashboard: {
      title: "Dashboard điều hành",
      note: "Cảnh báo từ công trình, bảo trì, KTV, công nợ và giá vật tư. (số liệu fictional)"
    },
    receivable: {
      title: "Theo dõi công nợ",
      note: "Hóa đơn còn nợ + nhật ký nhắc nợ — chỉ tên khách giả DEMO."
    },
    quotation: {
      title: "Báo giá",
      note: "Chuỗi phiên bản, nhóm dịch vụ, nguồn giá vật tư (mẫu)."
    },
    documents: {
      title: "Kho hồ sơ / Tài liệu",
      note: "Index hồ sơ, phân loại. Không có file khách thật trên Pages."
    },
    bank: {
      title: "Sao kê ngân hàng",
      note: "Đối soát minh họa — diễn giải CK giả, không phải sao kê thật."
    },
    roles: {
      title: "Tài khoản & phân quyền",
      note: "Seed sau setup.bat: mật khẩu ngẫu nhiên, bắt đổi lần đầu."
    }
  };

  function paneOf(id) {
    var item = NAV.find(function (n) { return n.id === id; });
    if (item && item.demo) return item.demo;
    if (META[id]) return id;
    return "dashboard";
  }

  function show(id) {
    var pane = paneOf(id);
    var meta = META[pane] || META.dashboard;

    document.querySelectorAll(".screen-tab").forEach(function (btn) {
      var on = btn.getAttribute("data-screen") === pane;
      btn.classList.toggle("active", on);
    });

    document.querySelectorAll(".nav-btn").forEach(function (btn) {
      var bid = btn.getAttribute("data-id");
      btn.classList.toggle("active", paneOf(bid) === pane && (bid === id || paneOf(bid) === bid));
      // highlight exact or mapped
      if (bid === id || (paneOf(bid) === pane && (bid === pane || (NAV.find(function (n) { return n.id === bid; }) || {}).demo === pane))) {
        btn.classList.toggle("active", bid === id || bid === pane);
      }
    });
    // simpler: active = nav whose pane matches
    document.querySelectorAll(".nav-btn").forEach(function (btn) {
      btn.classList.toggle("active", paneOf(btn.getAttribute("data-id")) === pane);
    });

    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-pane") === pane);
    });

    var t = document.getElementById("page-title");
    var n = document.getElementById("page-note");
    if (t) t.textContent = meta.title;
    if (n) n.textContent = meta.note;
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

  document.querySelectorAll(".screen-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      show(btn.getAttribute("data-screen"));
    });
  });

  buildNav();
  show("dashboard");
})();
