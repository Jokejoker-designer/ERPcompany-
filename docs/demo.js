/* Interactive mock screens for public demo (no backend). */
(function () {
  var meta = {
    dash: { crumb: "Giám đốc / Dashboard", title: "Tổng quan điều hành" },
    debt: { crumb: "Giám đốc / Công nợ", title: "Công nợ phải thu / phải trả" },
    quote: { crumb: "Kinh doanh / Báo giá", title: "Báo giá & BOQ (revision)" },
    dossier: { crumb: "Kỹ thuật / Hồ sơ", title: "Hồ sơ công trình" },
    bank: { crumb: "Kế toán / Sao kê", title: "Sao kê ngân hàng" },
    roles: { crumb: "Quản trị / Tài khoản", title: "Vai trò & phân quyền" }
  };

  function show(name) {
    if (!meta[name]) name = "dash";

    document.querySelectorAll(".screen-tab").forEach(function (btn) {
      var on = btn.getAttribute("data-screen") === name;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });

    document.querySelectorAll(".side-item").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-nav") === name);
    });

    document.querySelectorAll(".screen").forEach(function (pane) {
      pane.classList.toggle("active", pane.getAttribute("data-pane") === name);
    });

    var m = meta[name];
    var crumb = document.getElementById("crumb");
    var title = document.getElementById("page-title");
    if (crumb) crumb.textContent = m.crumb;
    if (title) title.textContent = m.title;
  }

  document.querySelectorAll(".screen-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      show(btn.getAttribute("data-screen"));
    });
  });

  document.querySelectorAll(".side-item").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      show(el.getAttribute("data-nav"));
    });
  });

  // Deep-link: #gallery?screen=debt or #debt
  var hash = (location.hash || "").replace(/^#/, "");
  if (meta[hash]) show(hash);
  else show("dash");
})();
