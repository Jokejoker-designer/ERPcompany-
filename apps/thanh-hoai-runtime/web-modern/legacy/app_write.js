/* ============================================================================
   THANH HOAI ERP — app_write.js (WO-09..13): tang GHI + 5 trang moi.
   Nap SAU app.js. Moi validate that su nam o server — day chi la lop tien dung.
   ============================================================================ */
"use strict";

/* ---- 1. Trang moi ------------------------------------------------------- */
PAGES.push(
  { id: "rasoat",   no: "RS", group: "Điều hành", name: "Rà soát dữ liệu", sub: "Hệ tự quét SQL: thiếu phân loại/MST, chưa đối chiếu, gán KTV, chu kỳ HĐBT — anh tick, hệ áp dụng." },
  { id: "schedule", no: "L",  group: "Vận hành", name: "Lịch — Năm / Tháng / Tuần", sub: "Chờ xếp lịch từ báo giá + mốc bảo trì. Anh tự đặt ngày giờ, hệ không tự đặt." },
  { id: "done",     no: "✓",  group: "Công nợ", name: "Đã hoàn thành", sub: "Khách đã xuất hóa đơn: checklist thanh toán, đã thu / chưa thu." },
  { id: "import",   no: "IM", group: "Tích hợp", name: "Import & Rà soát dữ liệu", sub: "Nạp file Excel nguồn chuẩn, đối chiếu báo giá ↔ hóa đơn; trang Rà soát mở từ đây." },
  { id: "nhansu",   no: "NS", group: "Quản trị nâng cao", name: "Nhân sự & Năng suất", sub: "Thợ / KTV / CTV — hồ sơ, folder cá nhân, KPI, xếp hạng." },
  { id: "audit",    no: "AU", group: "Quản trị nâng cao", name: "Nhật ký hệ thống", sub: "Audit log mọi thao tác ghi (ai, lúc nào, cái gì)." },
);
// nhan trang thai bo sung cho khoi 3 moc dashboard (VI_STATUS la object mutable trong app.js)
Object.assign(VI_STATUS, { "Da xuat hoa don": "Đã xuất hóa đơn", "Chua xep lich": "Chưa xếp lịch" });

/* ==== WO-19 (Phu luc A): hub "Bang dieu khien theo Cong ty" + rut nav ==== */
PAGES.unshift({ id: "congty", no: "★", group: "Điều hành", name: "Bảng điều khiển theo Công ty",
  sub: "Mỗi công ty → các bộ hồ sơ → milestone từng bước. Tự đánh dấu theo dữ liệu; tick tay khi làm ngoài hệ thống." });
// P7 (WO-19 §6 / WO-21B 2e): nav chinh dung 6 muc — route cu GIU (drill-down), chi an khoi sidebar.
// Loi vao thay the: Ra soat <- trang Import (+ banner do Dashboard/hub); Audit <- trang Cau hinh;
// Da hoan thanh <- nut tren hub + prio Dashboard.
const NAV_MAIN = ["congty", "dashboard", "viec_cua_toi", "viec_hom_nay", "schedule", "cong_trinh", "nhansu", "import", "template"];
const NAV_ROLE_EXTRA = { "Ky thuat vien": ["technician", "schedule", "viec_hom_nay"],
  "Thu kho": ["pricing", "technician", "viec_hom_nay"], "Ke toan": ["pricing"],
  // 2026-07-10 F4: nav "Tổng quan GĐ" chỉ hiện cho đúng 2 role co the xem (MENU_ROLES da chan lai lan nua)
  "Giam doc": ["gd_tong_quan", "pricing"], "Quan tri he thong": ["gd_tong_quan", "pricing"] };

/* ==== WO-34B: trang mới "Công trình & Hiện trường" — nav mở cho TẤT CẢ 7 vai trò
   (khớp PERMS["cong_trinh_hien_truong"]=ALL ở backend); phân quyền THẬT nằm trong
   từng tab (form/nút ẩn theo PERMS_WRITE tương ứng, server luôn là chốt chặn). ==== */
PAGES.push({ id: "cong_trinh", no: "CT", group: "Vận hành", name: "Công trình",
  sub: "Nhật ký thi công, khối lượng phát sinh, vật tư/CO-CQ, hồ sơ 00-09 theo từng công trình.",
  navName: "Công trình", navSub: "Nhật ký · Phát sinh · Hồ sơ" });
NAV_ICON.cong_trinh = "company";

/* ==== WO-38: 2 trang mới — "Việc hôm nay" (KTV/CTV, lọc theo nhan_su ở backend) +
   "Blueprint tổng thể" (gần tĩnh, số từ cau_hinh_tong_hop/workflow_templates). ==== */
PAGES.push(
  { id: "viec_cua_toi", no: "VC", group: "Vận hành", name: "Việc của tôi",
    sub: "Hàng đợi theo vai trò, mở đúng công trình, tab và bản ghi cần xử lý.",
    navName: "Việc của tôi", navSub: "Tiếp tục · Xử lý" },
  { id: "viec_hom_nay", no: "VH", group: "Vận hành", name: "Việc hôm nay",
    sub: "Công việc hiện trường được giao cho bạn hôm nay — check-in, ảnh, vật tư mang theo.",
    navName: "Việc hôm nay", navSub: "Check-in · Ảnh · Vật tư" },
  { id: "blueprint", no: "BP", group: "Quản trị nâng cao", name: "Blueprint tổng thể hệ thống",
    sub: "Sơ đồ 9 module, ma trận quyền theo vai trò, bộ tài liệu 00-09 và quy trình vòng khép kín.",
    navName: "Blueprint", navSub: "Sơ đồ · Quyền · Vòng khép kín" });
NAV_ICON.viec_hom_nay = "cal";
NAV_ICON.viec_cua_toi = "board";
NAV_ICON.blueprint = "board";

/* ==== 2026-07-10 tham khao FastCon (F4): rollup toan cong ty cho GD — mo rong Bang dieu khien
   theo Cong ty (WO-19/21, tung khach) len toan he thong (moi cong trinh). Chi GD/QT thay duoc
   (MENU_ROLES.gd_tong_quan) — nav rieng qua NAV_ROLE_EXTRA (khong nhet vao NAV_MAIN dung chung
   ca 7 vai tro, giu dung quy uoc WO-19 P7 "nav chinh 6-8 muc"). ==== */
PAGES.push({ id: "gd_tong_quan", no: "GD", group: "Điều hành", name: "Tổng quan công ty (GĐ)",
  sub: "Doanh thu · chi phí · lợi nhuận gộp toàn hệ thống, top 5 công trình, phát sinh chờ duyệt.",
  navName: "Tổng quan GĐ", navSub: "Doanh thu · Lợi nhuận" });
NAV_ICON.gd_tong_quan = "money";

/* ==== WO-22: relabel 6 mục nav + tiêu đề/mô tả trang theo bộ mockup 2026-07 ====
   navName/navSub = chữ trên sidebar (ngắn); name/sub = tiêu đề + mô tả đầu trang. */
{
  const L = {
    congty: { navName: "Bảng điều khiển", navSub: "theo Công ty",
      name: "Bảng điều khiển theo Công ty",
      sub: "Tổng hợp toàn bộ công việc, hồ sơ, công nợ và tiến độ theo từng Công ty." },
    dashboard: { navName: "Dashboard", navSub: "Tổng quan", name: "Dashboard",
      sub: "Tổng quan công việc theo đúng quyền của tài khoản." },
    schedule: { navName: "Lịch & Công việc", navSub: "Nhắc việc, bảo trì", name: "Lịch & Công việc",
      sub: "Quản lý lịch hẹn, công việc hiện trường và bảo trì." },
    nhansu: { navName: "Nhân sự & Nhân công", navSub: "Quản lý nhân sự", name: "Nhân sự & Nhân công",
      sub: "Quản lý nhân sự, năng suất và phân việc theo KTV." },
    import: { navName: "Nhập liệu & Rà soát", navSub: "Import, Scan, Rà soát", name: "Nhập liệu & Rà soát",
      sub: "Import dữ liệu, quét hồ sơ, đối chiếu và rà soát dữ liệu thiếu." },
    template: { navName: "Cấu hình & Danh mục", navSub: "Thiết lập hệ thống", name: "Cấu hình & Danh mục",
      sub: "Thiết lập danh mục, biểu mẫu và thông số vận hành hệ thống." },
  };
  PAGES.forEach((p) => { if (L[p.id]) Object.assign(p, L[p.id]); });
}

/* ==== WO-22: badge đỏ trên nav — CHỈ từ nguồn live, nguồn nào lỗi/không quyền thì ẩn.
   congty = tổng bước treo (cong_ty_board) · import = mục cần rà soát (ra_soat)
   · schedule = hàng chờ xếp lịch (cho_xep_lich). Không hardcode số. ==== */
async function loadNavBadges() {
  if (!ME) return;
  const setBadge = (id, n) => {
    const b = document.querySelector(`.nav-badge[data-badge="${id}"]`);
    if (!b) return;
    const v = Number(n || 0);
    b.textContent = v > 99 ? "99+" : String(v);
    b.classList.toggle("show", v > 0);
  };
  if (MENU_ROLES.congty.includes(ME.role)) {
    apiGet("cong_ty_board").then((d) => setBadge("congty", d.tong.buoc_treo)).catch(() => {});
  }
  if (MENU_ROLES.rasoat.includes(ME.role)) {
    apiGet("ra_soat").then((d) => setBadge("import", d.tong_can_xu_ly)).catch(() => {});
  }
  apiGet("cho_xep_lich").then((d) =>
    setBadge("schedule", (d.bao_gia || []).length + (d.moc_den_han || []).length)).catch(() => {});
  // WO-34B: badge "Công trình" = tổng VO chờ duyệt toàn hệ — chỉ có nguồn live cho GĐ/QT
  // (ct_dashboard_gd), role khác không có endpoint liệt kê nên KHÔNG hardcode/ẩn badge.
  if (["Giam doc", "Quan tri he thong"].includes(ME.role)) {
    apiGet("ct_dashboard_gd").then((d) =>
      setBadge("cong_trinh", (d.rows || []).reduce((s, r) => s + (r.vo_cho_duyet || 0), 0))).catch(() => {});
  }
}
const MENU_ROLES = {
  congty: ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"],
  dashboard: ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong", "Ky thuat vien", "Thu kho", "Quan tri he thong"],
  viec_cua_toi: ["Ky thuat truong"],
  viec_hom_nay: ["Ky thuat vien"],
  template: ["Giam doc", "Ke toan", "Quan tri he thong"],
  import: ["Giam doc", "Ke toan", "Quan tri he thong"],
  audit: ["Giam doc", "Quan tri he thong"],
  done: ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"],
  rasoat: ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"],
  // WO-38: Blueprint chỉ GĐ/QT (dùng cau_hinh_tong_hop — 403 role khác)
  blueprint: ["Giam doc", "Quan tri he thong"],
  // 2026-07-10 tham khao FastCon (F4): rollup toan cong ty — chi GD/QT (PERMS_PROFIT backend)
  gd_tong_quan: ["Giam doc", "Quan tri he thong"],
  pricing: ["Giam doc", "Ke toan", "Thu kho", "Quan tri he thong"],
  nhansu: ["Giam doc", "Quan tri he thong"],
};
const _buildNav0 = buildNav;
buildNav = function () {
  _buildNav0();
  if (!ME) return;
  const extra = NAV_ROLE_EXTRA[ME.role] || [];
  document.querySelectorAll(".nav-btn").forEach((b) => {
    const need = MENU_ROLES[b.dataset.id];
    if (need && !need.includes(ME.role)) { b.style.display = "none"; return; }
    // WO-19 P7: chi hien nav chinh; trang chung tu -> drill-down tu bang cong ty
    if (!NAV_MAIN.includes(b.dataset.id) && !extra.includes(b.dataset.id)) b.style.display = "none";
  });
  // an luon tieu de nhom rong (moi nut trong nhom deu bi an)
  document.querySelectorAll(".nav-group").forEach((g) => {
    let sib = g.nextElementSibling, visible = false;
    while (sib && !sib.classList.contains("nav-group")) {
      if (sib.classList.contains("nav-btn") && sib.style.display !== "none") visible = true;
      sib = sib.nextElementSibling;
    }
    if (!visible) g.style.display = "none";
  });
  loadNavBadges();
};
// WO-22: cập nhật badge sau mỗi lần chuyển trang (số liệu đổi sau thao tác ghi)
window.addEventListener("hashchange", () => { setTimeout(loadNavBadges, 500); });

/* ---- 2. Modal + toast + form helpers ------------------------------------ */
function toast(msg, ok = true) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = ok ? "show ok" : "show err";
  setTimeout(() => { t.className = ""; }, 3500);
}
function closeModal() { const m = $("#modal-wrap"); if (m) m.remove(); }
function openModal(title, bodyHtml, onSubmit, submitLabel = "Lưu") {
  closeModal();
  const returnFocus = document.activeElement;
  const w = document.createElement("div");
  w.id = "modal-wrap";
  const titleId = `modal-title-${Date.now()}`;
  w.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}"><div class="modal-head"><b id="${titleId}">${esc(title)}</b>
    <button class="modal-x" type="button">✕</button></div>
    <form class="modal-body" id="modal-form">${bodyHtml}
    <div class="modal-foot"><span id="modal-err" class="modal-err"></span>
    <button type="button" class="btn ghost" id="modal-cancel">Hủy</button>
    <button type="submit" class="btn primary">${esc(submitLabel)}</button></div></form></div>`;
  document.body.appendChild(w);
  const close = () => { closeModal(); if (returnFocus && returnFocus.focus) returnFocus.focus(); };
  $(".modal-x", w).onclick = $("#modal-cancel", w).onclick = close;
  w.addEventListener("click", (e) => { if (e.target === w) close(); });
  associateFormLabels(w);
  const focusable = () => Array.from(w.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])"));
  w.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const nodes = focusable(); if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  $("#modal-form", w).addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", w); btn.disabled = true;
    $("#modal-err", w).textContent = "";
    try { await onSubmit(new FormData(e.target), w); }
    catch (err) { const error = $("#modal-err", w); error.textContent = err.message || "Lỗi";
      error.setAttribute("role", "alert"); error.setAttribute("tabindex", "-1"); error.focus(); btn.disabled = false; }
  });
  setTimeout(() => { const nodes = focusable(); if (nodes[0]) nodes[0].focus(); }, 0);
  return w;
}
let _formControlSeq = 0;
function associateFormLabels(root) {
  (root || document).querySelectorAll("label:not([for])").forEach((label) => {
    const control = label.querySelector("input,select,textarea") || label.parentElement?.querySelector(":scope > input,:scope > select,:scope > textarea");
    if (!control || label.contains(control)) return;
    if (!control.id) control.id = `field-${++_formControlSeq}`;
    label.htmlFor = control.id;
  });
}
function fI(name, label, type = "text", attrs = "") {
  const id = `f-${String(name).replace(/[^a-zA-Z0-9_-]/g, "-")}-${++_formControlSeq}`;
  return `<div class="f"><label for="${id}">${esc(label)}</label><input id="${id}" name="${name}" type="${type}" ${attrs}></div>`;
}
/* option: chuoi "X" hoac cap [gia_tri, nhan hien thi] — gia tri gui server giu nguyen */
function fS(name, label, options, attrs = "") {
  const id = `f-${String(name).replace(/[^a-zA-Z0-9_-]/g, "-")}-${++_formControlSeq}`;
  return `<div class="f"><label for="${id}">${esc(label)}</label><select id="${id}" name="${name}" ${attrs}>
    ${options.map((o) => Array.isArray(o)
      ? `<option value="${esc(o[0])}">${esc(o[1])}</option>`
      : `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select></div>`;
}
function fT(name, label, ph = "") {
  const id = `f-${String(name).replace(/[^a-zA-Z0-9_-]/g, "-")}-${++_formControlSeq}`;
  return `<div class="f wide"><label for="${id}">${esc(label)}</label><textarea id="${id}" name="${name}" rows="2" placeholder="${esc(ph)}"></textarea></div>`;
}
let _KH_CACHE = null;
async function khDatalist() {
  if (!_KH_CACHE) _KH_CACHE = await apiGet("customers");
  return `<div class="f"><label>Khách hàng *</label>
    <input name="_kh" list="dl-kh" placeholder="Gõ để tìm..." required autocomplete="off">
    <datalist id="dl-kh">${_KH_CACHE.map((c) => `<option value="${esc(c.customer_name)}">`).join("")}</datalist></div>`;
}
function khId(fd) {
  const name = (fd.get("_kh") || "").trim();
  const hit = (_KH_CACHE || []).find((c) => c.customer_name === name);
  if (!hit) throw new Error("Chọn khách hàng từ danh sách gợi ý.");
  return hit.id;
}
let _NS_CACHE = null;
async function nsOptions() {
  try { if (!_NS_CACHE) _NS_CACHE = (await apiGet("nhan_su")).rows; } catch (e) { _NS_CACHE = []; }
  return _NS_CACHE.filter((n) => n.trang_thai === "Dang lam");
}
const VAT_OPTS = [10, 8, 5, 0];
const LOAI_BG = ["Bán hàng hóa/thiết bị", "Thi công lắp đặt", "Vật tư + nhân công",
  "Nhân công riêng", "Bảo trì định kỳ", "Sửa chữa phát sinh", "Báo giá phát sinh công trình",
  "Báo giá quyết toán/bổ sung", "Báo giá tổng hợp công trình", "Báo giá liên danh"];
// Loai nao bat che do TACH vat tu / nhan cong (WO-16 §4)
const LOAI_BG_TACH = new Set(["Thi công lắp đặt", "Vật tư + nhân công",
  "Báo giá phát sinh công trình", "Báo giá tổng hợp công trình", "Báo giá liên danh"]);

function _itemRow(i, cfg) {
  const af = cfg.autofill ? `list="dl-mh" class="af-ten" autocomplete="off"` : "";
  const tenCell = `<td><input name="it_ten_${i}" data-i="${i}" ${af} placeholder="${cfg.autofill ? "Gõ tên máy/vật tư để gợi ý…" : "Hạng mục"}">
    <input type="hidden" name="it_ng_${i}"><div class="af-src" data-src="${i}"></div></td>`;
  const vatCell = cfg.vat ? `<td><select name="it_vat_${i}" style="width:70px">${VAT_OPTS.map((v) =>
    `<option value="${v}" ${v === 10 ? "selected" : ""}>${v}%</option>`).join("")}</select></td>` : "";
  // nut xoa dong (don dong rac tu import/nhap thua) — itemsFrom bo qua index thieu nen an toan
  const delCell = `<td class="ie-del-td"><button type="button" class="ie-del" title="Xóa dòng này">✕</button></td>`;
  if (cfg.tach) {
    return `<tr>${tenCell}
      <td><input name="it_sl_${i}" type="number" step="any" style="width:56px" placeholder="1">
          <input name="it_dvt_${i}" style="width:56px" placeholder="ĐVT"></td>
      <td><input name="it_slvt_${i}" type="number" step="any" style="width:56px" placeholder="SL">
          <input name="it_dgvt_${i}" type="number" step="any" style="width:96px" placeholder="đ.giá VT"></td>
      <td><input name="it_klnc_${i}" type="number" step="any" style="width:56px" placeholder="KL">
          <input name="it_dgnc_${i}" type="number" step="any" style="width:96px" placeholder="đ.giá NC"></td>
      <td><input name="it_cp_${i}" type="number" step="any" style="width:86px" placeholder="0"></td>
      ${vatCell}${delCell}</tr>`;
  }
  return `<tr>${tenCell}
    <td><input name="it_sl_${i}" type="number" step="any" style="width:64px" placeholder="1"></td>
    <td><input name="it_dvt_${i}" style="width:64px" placeholder="Bộ"></td>
    <td><input name="it_dg_${i}" type="number" step="any" style="width:110px" placeholder="0"></td>
    ${vatCell}${delCell}</tr>`;
}
function itemRowsEditor(n = 3, opts = {}) {
  const cfg = { vat: !!opts.vat, tach: !!opts.tach, autofill: !!opts.autofill };
  let rows = "";
  for (let i = 0; i < n; i++) rows += _itemRow(i, cfg);
  const head = cfg.tach
    ? `<th>Tên</th><th>SL·ĐVT</th><th>Vật tư (SL×ĐG)</th><th>Nhân công (KL×ĐG)</th><th>CP phụ</th>${cfg.vat ? "<th>Thuế</th>" : ""}<th></th>`
    : `<th>Tên</th><th>SL</th><th>ĐVT</th><th>Đơn giá</th>${cfg.vat ? "<th>Thuế</th>" : ""}<th></th>`;
  return `<div class="f wide" id="ie-wrap"><label>Dòng hạng mục ${cfg.tach ? "(tách vật tư / nhân công — để tính lãi lỗ sau)" : ""}</label>
    <table class="item-editor" data-vat="${cfg.vat ? 1 : 0}" data-tach="${cfg.tach ? 1 : 0}" data-af="${cfg.autofill ? 1 : 0}" data-next="${n}">
      <thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    <datalist id="dl-mh"></datalist>
    <div class="ie-foot">
      <button type="button" class="btn ghost btn-sm ie-add">+ Thêm dòng</button>
      ${cfg.autofill ? `<span class="ie-vat-all">Bộ mẫu:
        <button type="button" class="btn ghost btn-sm ie-mau" data-m="Lắp đặt">Lắp đặt</button>
        <button type="button" class="btn ghost btn-sm ie-mau" data-m="Sửa chữa">Sửa chữa</button>
        <button type="button" class="btn ghost btn-sm ie-mau" data-m="Bảo trì">Bảo trì</button></span>` : ""}
      ${cfg.vat ? `<span class="ie-vat-all">Thuế cả bảng:
        ${VAT_OPTS.map((v) => `<button type="button" class="btn ghost btn-sm ie-vat-set" data-v="${v}">${v}%</button>`).join("")}</span>` : ""}
      <span class="ie-total muted"></span>
    </div></div>`;
}
let _AF_MAP = {};  // ten mat hang -> {don_gia, dvt, nguon_gia}
function bindItemEditor(w) {
  const tbl = $(".item-editor", w);
  if (!tbl) return;
  const cfg = { vat: tbl.dataset.vat === "1", tach: tbl.dataset.tach === "1",
    autofill: tbl.dataset.af === "1" };
  const recalc = () => {
    let truoc = 0, v8 = 0, v10 = 0, thue = 0;
    tbl.querySelectorAll("tbody tr").forEach((tr) => {
      const g = (s) => tr.querySelector(s);
      const val = (s) => Number((g(s) || {}).value || 0);
      if (!((g('input[name^="it_ten_"]') || {}).value || "").trim()) return;
      let tt;
      if (cfg.tach && (val('input[name^="it_slvt_"]') || val('input[name^="it_klnc_"]') || val('input[name^="it_cp_"]'))) {
        tt = val('input[name^="it_slvt_"]') * val('input[name^="it_dgvt_"]') +
             val('input[name^="it_klnc_"]') * val('input[name^="it_dgnc_"]') +
             val('input[name^="it_cp_"]');
      } else {
        tt = (val('input[name^="it_sl_"]') || 1) * val('input[name^="it_dg_"]');
      }
      truoc += tt;
      if (cfg.vat) {
        const p = Number((g('select[name^="it_vat_"]') || {}).value || 0);
        const t = tt * p / 100;
        thue += t;
        if (p === 8) v8 += t; else if (p === 10) v10 += t;
      }
    });
    const el = $(".ie-total", w);
    if (el) el.textContent = truoc ? (cfg.vat
      ? `Trước thuế ${vnd(truoc)} · VAT 8%: ${vnd(Math.round(v8))} · VAT 10%: ${vnd(Math.round(v10))} · TỔNG ${vnd(Math.round(truoc + thue))}`
      : `Tổng ${vnd(truoc)}`) : "";
  };
  const addRow = () => {
    const i = Number(tbl.dataset.next);
    tbl.dataset.next = i + 1;
    tbl.querySelector("tbody").insertAdjacentHTML("beforeend", _itemRow(i, cfg));
    return i;
  };
  $(".ie-add", w).addEventListener("click", () => { addRow(); recalc(); });
  // xoa dong rac: delegation tren bang — dong them sau van co nut; recalc tong ngay
  tbl.addEventListener("click", (e) => {
    const b = e.target.closest(".ie-del");
    if (!b) return;
    b.closest("tr").remove();
    recalc();
  });
  w.querySelectorAll(".ie-vat-set").forEach((b) => b.addEventListener("click", () => {
    tbl.querySelectorAll('select[name^="it_vat_"]').forEach((s) => { s.value = b.dataset.v; });
    recalc();
  }));
  // WO-15: bo hang muc mau theo loai viec
  w.querySelectorAll(".ie-mau").forEach((b) => b.addEventListener("click", async () => {
    const d = await apiGet("bo_hang_muc_mau", { loai_viec: b.dataset.m });
    d.rows.forEach((r) => {
      const i = addRow();
      const tr = tbl.querySelector("tbody tr:last-child");
      tr.querySelector(`input[name="it_ten_${i}"]`).value = r.hang_muc;
      const dvtInp = tr.querySelector(`input[name="it_dvt_${i}"]`);
      if (dvtInp) dvtInp.value = r.dvt || "";
    });
    toast("Đã chèn bộ mẫu " + b.dataset.m + " — chỉnh SL/đơn giá theo thực tế.");
    recalc();
  }));
  // WO-15: autofill — go ten -> goi y tu lich su; chon -> dien gia dung khach
  if (cfg.autofill) {
    let timer = null;
    const cid = () => { try { return khId(new FormData($("#modal-form", w))); } catch (e) { return null; } };
    w.addEventListener("input", (e) => {
      if (!e.target.classList.contains("af-ten")) return;
      clearTimeout(timer);
      const q = e.target.value;
      timer = setTimeout(async () => {
        if (q.trim().length < 2) return;
        try {
          const d = await apiGet("goi_y_mat_hang", { q, customer_id: cid() || "" });
          _AF_MAP = {};
          $("#dl-mh", w).innerHTML = d.rows.map((r) => {
            _AF_MAP[r.ten] = r;
            return `<option value="${esc(r.ten)}">${esc(r.nguon_gia)} · ${vnd(r.don_gia)}</option>`;
          }).join("");
        } catch (err) { /* bo qua */ }
      }, 250);
    });
    w.addEventListener("change", async (e) => {
      if (!e.target.classList.contains("af-ten")) return;
      const hit = _AF_MAP[e.target.value];
      const i = e.target.dataset.i;
      if (!hit) return;
      // uu tien gia dung khach (goi API gia_theo_khach cho chac) — B7 tra them gia_von/ncc/margin cho role cost
      let g = hit;
      try {
        const r = await apiGet("gia_theo_khach", { customer_id: cid() || "", ten_hang: e.target.value });
        if (r.don_gia != null) g = r;
      } catch (err) { /* dung gia goi y chung */ }
      const tr = e.target.closest("tr");
      const dg = tr.querySelector(`input[name="it_dg_${i}"]`) || tr.querySelector(`input[name="it_dgvt_${i}"]`);
      if (dg && !dg.value) dg.value = g.don_gia || "";
      const dvt = tr.querySelector(`input[name="it_dvt_${i}"]`);
      if (dvt && !dvt.value) dvt.value = g.dvt || "";
      tr.querySelector(`input[name="it_ng_${i}"]`).value = g.nguon_gia || "";
      // WO-23 §2c: lưu giá vốn/giá bán gợi ý vào row để tính lại margin khi sửa đơn giá
      tr.dataset.giaVon = g.gia_von_gan_nhat != null ? g.gia_von_gan_nhat : "";
      tr.dataset.nccVon = g.ncc || "";
      tr.dataset.giaBan = g.don_gia != null ? g.don_gia : "";
      tr.dataset.nguonBan = g.nguon_gia || "";
      tr.dataset.ngayBan = g.ngay || "";
      updateCostHint(tr, i);
      recalc();
    });
  }
  // WO-23 §2c: dưới ô đơn giá hiện Giá vốn + Giá bán gần nhất + Margin (theo role §7).
  // Kinh doanh: CHỈ giá bán (backend không trả giá vốn → không có gì để lộ). KTV/KTT: không thấy khối này.
  function updateCostHint(tr, i) {
    const src = tr.querySelector(`.af-src[data-src="${i}"]`);
    if (!src) return;
    const dgEl = tr.querySelector(`input[name="it_dg_${i}"]`) || tr.querySelector(`input[name="it_dgvt_${i}"]`);
    const donGia = Number((dgEl || {}).value || 0);
    const giaVon = tr.dataset.giaVon !== "" && tr.dataset.giaVon != null ? Number(tr.dataset.giaVon) : null;
    const giaBan = tr.dataset.giaBan !== "" && tr.dataset.giaBan != null ? Number(tr.dataset.giaBan) : null;
    const parts = [];
    if (canSellPrice() && giaBan != null) {
      parts.push(`Giá bán gần nhất: <b>${vnd(giaBan)}</b>` +
        (tr.dataset.nguonBan ? ` <span class="muted">(${esc(tr.dataset.nguonBan)}${tr.dataset.ngayBan ? " · " + fmtDate(tr.dataset.ngayBan) : ""})</span>` : ""));
    }
    if (canCost() && giaVon != null) {
      parts.push(`Giá vốn gần nhất: <b>${vnd(giaVon)}</b>` + (tr.dataset.nccVon ? ` <span class="muted">(${esc(tr.dataset.nccVon)})</span>` : ""));
      if (canProfit() && donGia && giaVon) parts.push(marginBadge((donGia - giaVon) * 100 / donGia));
    } else if (canCost() && tr.dataset.giaBan !== "") {
      parts.push(`<span class="muted">Chưa có giá vốn cho mặt hàng này (nhập HĐ đầu vào để hiện margin)</span>`);
    }
    src.innerHTML = parts.length ? parts.join(" · ") : (tr.dataset.nguonBan ? `<span class="muted">nguồn: ${esc(tr.dataset.nguonBan)} (sửa tay được)</span>` : "");
  }
  // sửa đơn giá tay → tính lại margin (không gọi API)
  $("#modal-form", w).addEventListener("input", (e) => {
    if (/^it_dg_|^it_dgvt_/.test(e.target.name || "")) {
      const m = String(e.target.name).match(/_(\d+)$/);
      if (m) updateCostHint(e.target.closest("tr"), m[1]);
    }
    recalc();
  });
}
function itemsFrom(fd, n = 100) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const raw = fd.get("it_ten_" + i);
    if (raw == null) continue;
    const ten = String(raw).trim();
    if (!ten) continue;
    const it = { hang_muc: ten, so_luong: Number(fd.get("it_sl_" + i) || 1),
      dvt: fd.get("it_dvt_" + i) || "", don_gia: Number(fd.get("it_dg_" + i) || 0) };
    const vat = fd.get("it_vat_" + i);
    if (vat != null) it.thue_suat = Number(vat);
    const ng = fd.get("it_ng_" + i);
    if (ng) it.nguon_gia = ng;
    // che do tach vat tu / nhan cong (WO-16)
    for (const [f, k] of [["it_slvt_", "sl_vat_tu"], ["it_dgvt_", "dg_vat_tu"],
                          ["it_klnc_", "kl_nhan_cong"], ["it_dgnc_", "dg_nhan_cong"],
                          ["it_cp_", "chi_phi_phu"]]) {
      const v = fd.get(f + i);
      if (v != null && v !== "") it[k] = Number(v);
    }
    items.push(it);
  }
  return items;
}
function toolbar(btns) {
  return `<div class="toolbar">${btns.map(([id, label, cls]) =>
    `<button class="btn ${cls || "primary"}" id="${id}">${esc(label)}</button>`).join("")}</div>`;
}
/* Nut hanh dong cap TRANG dat o topbar (top-actions — bam mockup), khong chen vao content.
   route() xoa #page-actions truoc moi lan render nen goi lai bao nhieu lan cung khong nhan doi. */
function pageActions(btns) {
  const slot = $("#page-actions");
  if (slot) slot.innerHTML = btns.map(([id, label, cls]) =>
    `<button class="btn ${cls || "primary"}" id="${id}">${esc(label)}</button>`).join("");
}
/* Tab trong modal: markup <div class="mtabs"> + cac <div class="msec"> — field an van submit binh thuong.
   Truong required nam o tab dang an ma invalid -> tu nhay ve tab do de nguoi dung thay loi. */
function mTabs(tabs) {
  return `<div class="mtabs">${tabs.map(([key, label], i) =>
    `<button type="button" class="mtab ${i === 0 ? "active" : ""}" data-t="${esc(key)}">${esc(label)}</button>`).join("")}</div>`
    + tabs.map(([key, , inner], i) => `<div class="msec ${i === 0 ? "active" : ""}" data-t="${esc(key)}">${inner}</div>`).join("");
}
function bindMTabs(w) {
  const show = (key) => {
    w.querySelectorAll(".mtab").forEach((b) => b.classList.toggle("active", b.dataset.t === key));
    w.querySelectorAll(".msec").forEach((s) => s.classList.toggle("active", s.dataset.t === key));
  };
  w.querySelectorAll(".mtab").forEach((b) => b.addEventListener("click", () => show(b.dataset.t)));
  $("#modal-form", w).addEventListener("invalid", (e) => {
    const sec = e.target.closest(".msec");
    if (sec && !sec.classList.contains("active")) show(sec.dataset.t);
  }, true);
}

/* ---- 3. Foot: doi mat khau (idempotent) ---------------------------------- */
setInterval(() => {
  const foot = $("#foot");
  if (foot && !$("#pw-btn", foot) && ME) {
    const b = document.createElement("button");
    b.id = "pw-btn"; b.className = "logout-btn"; b.style.marginTop = "6px";
    b.textContent = "🔑 Đổi mật khẩu";
    b.onclick = () => openModal("Đổi mật khẩu",
      fI("old", "Mật khẩu hiện tại", "password", "required") +
      fI("new", "Mật khẩu mới (≥6 ký tự)", "password", "required minlength=6"),
      async (fd) => {
        await apiPost("write/password", { old: fd.get("old"), new: fd.get("new") });
        closeModal(); toast("Đã đổi mật khẩu. Dùng mật khẩu mới từ lần đăng nhập sau.");
      });
    const logout = $("#logout", foot);
    logout.parentNode.insertBefore(b, logout.nextSibling);
  }
}, 800);

/* ---- 3b. P0: tai khoan bi ep doi mat khau -> mo form doi ngay (1 lan) -------
   Server da chan cung MOI route tru /api/write/password khi must_change=1, nen
   cac trang chi hien "phai doi mat khau". Chu dong bat form de nguoi dung doi
   duoc ngay; doi xong reload de bo gate. Van con nut "Doi mat khau" o foot neu
   nguoi dung dong form. */
let _pwForced = false;
setInterval(() => {
  if (_pwForced || !ME || !ME.must_change) return;
  _pwForced = true;
  openModal("Đổi mật khẩu trước khi dùng hệ thống",
    `<p class="muted" style="margin:0 0 10px">Tài khoản của bạn đang dùng mật khẩu khởi tạo. ` +
    `Vui lòng đặt mật khẩu mới để tiếp tục.</p>` +
    fI("old", "Mật khẩu hiện tại (được cấp)", "password", "required") +
    fI("new", "Mật khẩu mới (≥6 ký tự)", "password", "required minlength=6"),
    async (fd) => {
      await apiPost("write/password", { old: fd.get("old"), new: fd.get("new") });
      toast("Đã đổi mật khẩu. Đang tải lại…");
      setTimeout(() => location.reload(), 700);
    });
}, 500);

/* ---- 4a. Dashboard: "Viec can hoan thanh" vao cot phai (mockup WO-22) ------ */
const _dash0 = RENDER.dashboard;
RENDER.dashboard = async function (el) {
  await _dash0(el);
  const hideMoney = ME && ["Ky thuat vien", "Thu kho"].includes(ME.role);
  try {
    const v = await apiGet("viec_dang_do");
    // KTV/Thu kho: bo nhom co so tien / cong no (khong hien tien cho role hien truong)
    const nhom = v.nhom.filter((g) => !hideMoney || !["bg_chua_lich", "no_qua_han"].includes(g.key));
    const html = `<section class="panel prio"><div class="panel-head">
      <h2 class="panel-title">📌 Việc cần hoàn thành</h2></div><div class="panel-body">
      <div class="prio-grid">${nhom.map((g) => `
        <div class="prio-card ${g.muc}" data-page="${esc(g.page)}">
          <div class="prio-head"><span>${esc(g.ten)}</span><b class="prio-count">${g.so}</b></div>
          ${g.dong.map((d) => `<div class="prio-row"><span>${esc(d[0])}</span><span class="muted">${hideMoney && /đ$/.test(String(d[1] || "").trim()) ? "" : esc(d[1])}</span></div>`).join("")}
          ${g.so > g.dong.length ? `<div class="muted" style="font-size:11px">… và ${g.so - g.dong.length} mục nữa</div>` : ""}
        </div>`).join("")}</div></div></section>`;
    const slot = $("#dash-prio", el);
    if (slot) slot.innerHTML = html;
    else el.insertAdjacentHTML("afterbegin", html);
    el.querySelectorAll(".prio-card").forEach((c) =>
      c.addEventListener("click", () => { location.hash = "#" + c.dataset.page; }));
  } catch (e) {
    const slot = $("#dash-prio", el);
    if (slot) slot.innerHTML = panel("Việc cần hoàn thành", `<div class="empty">Không tải được danh sách ưu tiên.</div>`);
  }
  // Cong viec theo 3 moc thoi gian (co so tien) — duoi cung, an voi role hien truong
  if (!hideMoney) try {
    const m = await apiGet("viec_theo_moc");
    const icons = { tuan: "📅", thang: "🗓️", sau_thang: "📆" };
    const mocHtml = `<section class="panel" style="margin-top:14px"><div class="panel-head">
      <h2 class="panel-title">🕐 Công việc theo mốc thời gian (theo ngày lập báo giá)</h2></div>
      <div class="panel-body"><div class="moc-grid">${m.moc.map((b) => `
        <div class="moc-col">
          <div class="moc-head">
            <span>${icons[b.key] || "📅"} ${esc(b.ten)} <span class="muted" style="font-weight:400">(${fmtDate(b.tu_ngay)} → ${fmtDate(b.den_ngay)})</span></span>
            <b class="moc-count">${b.so}</b>
          </div>
          <div class="moc-sum muted">Tổng giá trị: <b class="money">${vnd(b.tong_tien)}</b></div>
          ${b.rows.length ? b.rows.map((r) => `
            <div class="moc-row" data-page="quotation" title="${esc(r.customer_name || "")}">
              <span class="moc-code">${esc(r.code)}</span>
              <span class="moc-kh">${esc((r.customer_name || "—"))}</span>
              <span class="moc-tien money">${vnd(r.grand_total)}</span>
              ${chip(r.hien_tt)}
            </div>`).join("") : `<div class="empty" style="padding:14px">Không có báo giá trong khoảng này.</div>`}
          ${b.con_lai ? `<div class="muted" style="font-size:11px;margin-top:4px">… và ${b.con_lai} báo giá nữa — xem trang Báo giá</div>` : ""}
        </div>`).join("")}</div></div></section>`;
    const legacy = $("#dash-legacy", el);
    if (legacy) legacy.innerHTML = mocHtml;
    else el.insertAdjacentHTML("afterbegin", mocHtml);
    el.querySelectorAll(".moc-row").forEach((r) =>
      r.addEventListener("click", () => { location.hash = "#quotation"; }));
  } catch (e) { /* role khong xem duoc — bo qua */ }
  try {
    const rs = await apiGet("ra_soat");
    if (rs.tong_can_xu_ly > 0) {
      el.insertAdjacentHTML("afterbegin",
        `<div class="rs-banner" onclick="location.hash='#rasoat'">🧹 <b>${rs.tong_can_xu_ly}</b> mục dữ liệu cần rà soát
         (${rs.A.so} thiếu phân loại · ${rs.B.so} thiếu MST · ${rs.C.so} chưa đối chiếu · ${rs.D.so} gán KTV · ${rs.E.so} HĐBT thiếu chu kỳ) — bấm để xử lý</div>`);
    }
  } catch (e) { /* role khong xem duoc */ }
};

/* ---- 4b. Customer: + Khach moi + tab Chua khop --------------------------- */
const _cust0 = RENDER.customer;
RENDER.customer = async function (el) {
  await _cust0(el);
  let chuaKhop = 0;
  try { chuaKhop = (await apiGet("import_status")).khach_chua_khop; } catch (e) {}
  pageActions([
    ["btn-kh-new", "+ Khách hàng mới"],
    ["btn-kh-edit", "✏️ Sửa khách", "ghost"],
    ["btn-kh-chuakhop", `Chưa khớp folder (${chuaKhop})`, "ghost"],
  ]);
  $("#btn-kh-edit").onclick = async () => {
    await khDatalist();
    const w = openModal("Sửa / chuẩn hóa thông tin khách",
      `<div class="f wide"><label>Chọn khách cần sửa</label>
        <input name="_kh" list="dl-kh" placeholder="Gõ tên khách..." required autocomplete="off">
        <datalist id="dl-kh">${_KH_CACHE.map((c) => `<option value="${esc(c.customer_name)}">`).join("")}</datalist></div>
       <div id="kh-edit-form" class="f wide"><span class="muted">Chọn khách để hiện form sửa…</span></div>`,
      async (fd) => {
        const cid = Number($("#kh-edit-form", w).dataset.cid || 0);
        if (!cid) throw new Error("Chọn khách trước.");
        const body = { id: cid };
        ["customer_name", "phan_loai", "tax_id", "khu_vuc", "dia_chi", "nguoi_lien_he",
         "dien_thoai", "email", "so_tk", "ngan_hang", "ghi_chu"].forEach((k) => {
          const inp = w.querySelector(`[name="e_${k}"]`);
          if (inp) body[k] = inp.value;
        });
        await apiPost("write/customer_update", body);
        closeModal(); _KH_CACHE = null; toast("Đã cập nhật thông tin khách."); RENDER.customer(el);
      }, "Lưu thay đổi");
    $("input[name=_kh]", w).addEventListener("change", async (e) => {
      const cid = (_KH_CACHE.find((c) => c.customer_name === e.target.value.trim()) || {}).id;
      const box = $("#kh-edit-form", w);
      if (!cid) { box.innerHTML = `<span class="muted" style="color:var(--danger)">Chọn khách từ gợi ý.</span>`; return; }
      const c = await apiGet("customer_one", { id: cid });
      box.dataset.cid = cid;
      const opt = (v, list) => list.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("");
      box.innerHTML = `<div class="form-grid cols-2" style="width:100%">
        <div class="f wide"><label>Tên khách</label><input name="e_customer_name" value="${esc(c.customer_name || "")}"></div>
        <div class="f"><label>Phân loại</label><select name="e_phan_loai">${opt(c.phan_loai, ["", "Công ty", "Cá nhân", "Công ty nhà nước", "Công ty nước ngoài", "Công trình lớn"])}</select></div>
        <div class="f"><label>Mã số thuế (để trống = xóa)</label><input name="e_tax_id" value="${esc(c.tax_id || "")}"></div>
        <div class="f"><label>Khu vực</label><input name="e_khu_vuc" value="${esc(c.khu_vuc || "")}"></div>
        <div class="f"><label>Người liên hệ</label><input name="e_nguoi_lien_he" value="${esc(c.nguoi_lien_he || "")}"></div>
        <div class="f"><label>SĐT</label><input name="e_dien_thoai" value="${esc(c.dien_thoai || "")}"></div>
        <div class="f"><label>Email</label><input name="e_email" value="${esc(c.email || "")}"></div>
        <div class="f wide"><label>Địa chỉ</label><input name="e_dia_chi" value="${esc(c.dia_chi || "")}"></div>
        <div class="f"><label>Số TK ngân hàng (khớp sao kê)</label><input name="e_so_tk" value="${esc(c.so_tk || "")}"></div>
        <div class="f"><label>Ngân hàng</label><input name="e_ngan_hang" value="${esc(c.ngan_hang || "")}"></div>
        <div class="f wide"><label>Ghi chú</label><textarea name="e_ghi_chu" rows="2">${esc(c.ghi_chu || "")}</textarea></div>
      </div>`;
    });
  };
  $("#btn-kh-new").onclick = () => {
    const w = openModal("Thêm khách hàng mới",
      mTabs([
        ["chinh", "Thông tin chính",
          fI("customer_name", "Tên khách hàng *", "text", "required") +
          fS("phan_loai", "Phân loại * (quyết định sinh folder)",
            ["Công ty", "Cá nhân", "Công ty nhà nước", "Công ty nước ngoài", "Công trình lớn"]) +
          fI("tax_id", "Mã số thuế") + fI("khu_vuc", "Khu vực")],
        ["lienhe", "Liên hệ",
          fI("nguoi_lien_he", "Người liên hệ") + fI("dien_thoai", "SĐT") +
          fI("email", "Email") + fI("dia_chi", "Địa chỉ")],
        ["ghichu", "Ghi chú", fT("ghi_chu", "Ghi chú")],
      ]),
      async (fd) => {
        const r = await apiPost("write/customer", Object.fromEntries(fd.entries()));
        closeModal(); _KH_CACHE = null;
        toast("Đã tạo " + r.code + (r.folder.ok ? " + folder: " + r.folder.root : " (folder lỗi: " + (r.folder.error || "") + ")"));
        if (r.goi_y_ho_so_9_giai_doan) toast("Gợi ý: khách nhóm này thường cần Hồ sơ đầy đủ 9 giai đoạn.", true);
        RENDER.customer(el);
      });
    bindMTabs(w);
  };
  $("#btn-kh-chuakhop").onclick = async () => {
    const d = await apiGet("khach_chua_khop");
    await khDatalist(); // nap cache
    openModal("Folder chưa khớp khách master — gán tay",
      `<div class="f wide"><label>Folder (khách tạm từ quét)</label>
        <select name="folder_id">${d.rows.map((r) =>
          `<option value="${r.id}">${esc(r.customer_name)} (${r.so_tai_lieu} tài liệu)</option>`).join("")}</select></div>` +
      `<div class="f wide"><label>Gán vào khách master</label>
        <input name="_kh" list="dl-kh" placeholder="Gõ để tìm..." required>
        <datalist id="dl-kh">${_KH_CACHE.map((c) => `<option value="${esc(c.customer_name)}">`).join("")}</datalist></div>`,
      async (fd) => {
        await apiPost("write/gan_folder", { folder_id: Number(fd.get("folder_id")), master_id: khId(fd) });
        closeModal(); _KH_CACHE = null; toast("Đã gộp folder vào khách master."); RENDER.customer(el);
      }, "Gộp");
  };
};

/* ---- 4c. Quotation: + Lap bao gia + thao tac tren ban ghi ---------------- */
// Sua noi dung bao gia — CHI sua duoc ban dang Nhap va CHUA co phien ban con (server tu
// chan + bao loi ro neu vi pham, xem quotation_update_items). Muon giu lich su (V1/V2/V3...)
// thi bam "Tao phien ban moi (V+1)" TRUOC roi moi "Sua dong hang muc" tren ban moi.
function openEditItemsModal(q, el) {
  const items = q.items || [];
  const tach = items.some((it) => it.sl_vat_tu != null || it.kl_nhan_cong != null || it.chi_phi_phu != null);
  const w = openModal(`Sửa dòng hạng mục — ${q.code} · ${q.customer_name}`,
    itemRowsEditor(Math.max(items.length, 1), { vat: true, tach, autofill: true }),
    async (fd) => {
      const its = itemsFrom(fd);
      if (!its.length) throw new Error("Phải còn ít nhất 1 dòng hạng mục.");
      const r = await apiPost("write/quotation_items", { id: q.id, items: its });
      closeModal();
      toast(`Đã lưu ${q.code} — tổng mới ${vnd(r.grand_total)}.`);
      RENDER.quotation(el);
    }, "Lưu");
  w.querySelector(".modal").classList.add("xl");
  bindItemEditor(w);
  items.forEach((it, i) => {
    const set = (nm, v) => { const inp = w.querySelector(`[name="${nm}${i}"]`); if (inp && v != null) inp.value = v; };
    set("it_ten_", it.hang_muc); set("it_sl_", it.so_luong); set("it_dvt_", it.dvt);
    if (tach) {
      set("it_slvt_", it.sl_vat_tu); set("it_dgvt_", it.dg_vat_tu);
      set("it_klnc_", it.kl_nhan_cong); set("it_dgnc_", it.dg_nhan_cong); set("it_cp_", it.chi_phi_phu);
    } else {
      set("it_dg_", it.don_gia);
    }
    set("it_vat_", it.thue_suat);
  });
}
const _quo0 = RENDER.quotation;
RENDER.quotation = async function (el) {
  await _quo0(el);
  pageActions([
    ["btn-bg-new", "+ Lập báo giá"],
    ["btn-bg-thaotac", "Thao tác trên báo giá…", "ghost"],
    ["btn-bg-doichieu", "Đối chiếu hóa đơn", "ghost"],
  ]);
  $("#btn-bg-new").onclick = async () => {
    const khHtml = await khDatalist();
    const build = (tach) => khHtml +
      fS("loai_bao_gia", "Loại báo giá (đổi layout bảng)", LOAI_BG) +
      fI("hieu_luc_den", "Hiệu lực đến", "date") +
      fI("dieu_kien_thanh_toan", "Điều kiện thanh toán") +
      fI("thoi_han_bao_hanh", "Bảo hành") +
      itemRowsEditor(4, { vat: true, tach, autofill: true }) +
      fT("ghi_chu_noi_bo", "Ghi chú nội bộ (khách KHÔNG thấy)");
    const submit = async (fd) => {
      const items = itemsFrom(fd);
      if (!items.length) throw new Error("Nhập ít nhất 1 dòng hạng mục.");
      const r = await apiPost("write/quotation", {
        customer_id: khId(fd), loai_bao_gia: fd.get("loai_bao_gia"),
        nhom_dich_vu: fd.get("loai_bao_gia"), hieu_luc_den: fd.get("hieu_luc_den"),
        dieu_kien_thanh_toan: fd.get("dieu_kien_thanh_toan"),
        thoi_han_bao_hanh: fd.get("thoi_han_bao_hanh"),
        ghi_chu_noi_bo: fd.get("ghi_chu_noi_bo"), items });
      closeModal();
      toast(`Đã lập ${r.code} — trước thuế ${vnd(r.tong_truoc_thue)} + VAT8 ${vnd(r.vat_8)} + VAT10 ${vnd(r.vat_10)} = ${vnd(r.grand_total)}`);
      RENDER.quotation(el);
    };
    const w = openModal("Lập báo giá mới (1 form thông minh — WO-16)", build(false), submit);
    w.querySelector(".modal").classList.add("xl");
    bindItemEditor(w);
    // doi loai -> doi layout bang dong (giu thong tin header)
    w.querySelector('select[name="loai_bao_gia"]').addEventListener("change", (e) => {
      const tach = LOAI_BG_TACH.has(e.target.value);
      const cur = $(".item-editor", w);
      if ((cur.dataset.tach === "1") === tach) return;
      const keep = {};
      new FormData($("#modal-form", w)).forEach((v, k) => { if (!k.startsWith("it_")) keep[k] = v; });
      $("#modal-form", w).querySelector("#ie-wrap").outerHTML =
        itemRowsEditor(4, { vat: true, tach, autofill: true });
      Object.entries(keep).forEach(([k, v]) => {
        const inp = w.querySelector(`[name="${k}"]`);
        if (inp) inp.value = v;
      });
      bindItemEditor(w);
      toast(tach ? "Chế độ TÁCH vật tư/nhân công (tính lãi lỗ được)." : "Chế độ bảng đơn giản.");
    });
  };
  $("#btn-bg-thaotac").onclick = async () => {
    const list = await apiGet("quotations");
    openModal("Thao tác trên báo giá",
      `<div class="f wide"><label>Chọn báo giá</label><select name="qid">${list.map((q) =>
        `<option value="${q.id}">${esc(q.code)} · ${esc(q.customer_name)} · ${vnd(q.grand_total)} · ${esc(viStatus(q.status))}</option>`).join("")}</select></div>` +
      fS("act", "Hành động", [
        "Sửa dòng hạng mục",
        ["Chuyển: Da gui", "Chuyển sang: Đã gửi"], ["Chuyển: Cho khach", "Chuyển sang: Chờ khách"],
        ["Chuyển: Da duyet", "Chuyển sang: Đã duyệt"], ["Chuyển: Huy", "Chuyển sang: Hủy"],
        "Tạo phiên bản mới (V+1)", "Sinh bộ 7 chứng từ", "Xuất Excel", "Xuất Word", "Xem vòng đời"]),
      async (fd, w) => {
        const qid = Number(fd.get("qid")), act = fd.get("act");
        if (act === "Sửa dòng hạng mục") {
          const q = await apiGet("quotation", { id: qid });
          closeModal();
          openEditItemsModal(q, el);
        } else if (act.startsWith("Chuyển: ")) {
          await apiPost("write/quotation_status", { id: qid, status: act.slice(8) });
          closeModal(); toast("Đã chuyển trạng thái."); RENDER.quotation(el);
        } else if (act.startsWith("Tạo phiên bản")) {
          const r = await apiPost("write/quotation_version", { id: qid });
          closeModal(); toast("Đã tạo " + r.code + " (bản cũ tự khóa) — chọn 'Sửa dòng hạng mục' trên bản mới để sửa nội dung."); RENDER.quotation(el);
        } else if (act.startsWith("Sinh bộ")) {
          const r = await apiPost("write/sinh_bo_chung_tu", { quotation_id: qid });
          closeModal();
          toast(`Đã sinh ${Object.keys(r.chung_tu).length} chứng từ NHÁP từ ${r.bao_gia}` +
            (r.so_file ? ` và xuất ${r.so_file} file vào folder:\n${r.folder}` : "") +
            (r.loi_xuat && r.loi_xuat.length ? `\n(lỗi xuất: ${r.loi_xuat.join("; ")})` : ""), true);
        } else if (act === "Xuất Excel") { window.open(`/api/export?loai=quotation&id=${qid}&fmt=xlsx`);
        } else if (act === "Xuất Word") { window.open(`/api/export?loai=quotation&id=${qid}&fmt=docx`);
        } else {
          const lc = await apiGet("lifecycle", { id: qid });
          $("#modal-err", w).innerHTML = `<div class="lifebar">${lc.moc.map((m) =>
            `<span class="life ${m.tt}">${esc(m.ten)}</span>`).join("")}</div>`;
          $("button[type=submit]", w).disabled = false;
        }
      }, "Thực hiện");
  };
  $("#btn-bg-doichieu").onclick = async () => {
    const d = await apiGet("doi_chieu_view");
    const rows = d.rows.map((r) => [esc(r.code), esc(r.customer_name), vnd(r.grand_total),
      r.trang_thai_doi_chieu === "xong" ? chip("Đã xuất hóa đơn — XONG")
        : r.trang_thai_doi_chieu === "can_xac_nhan" ? chip("Cần xác nhận")
        : chip("Chưa có hóa đơn"),
      r.hd_ma ? esc(r.hd_ma) + " · " + fmtDate(r.hd_ngay) : "—"]);
    openModal("Đối chiếu báo giá ↔ hóa đơn",
      `<div class="f wide">${table(["Báo giá", "Khách", "Tổng", "Đối chiếu", "Hóa đơn khớp"], rows)}</div>`,
      async () => closeModal(), "Đóng");
  };
};

/* ---- 4d. BBNT: + Lap BBNT + doi trang thai -------------------------------- */
const _bbnt0 = RENDER.bbnt;
RENDER.bbnt = async function (el) {
  await _bbnt0(el);
  // WO-22: KTV/Thủ kho là vai trò hiện trường — ẩn nút tạo/đổi trạng thái/XUẤT FILE
  // (Xuất Excel/Word gọi /api/export chứa đơn giá·thành tiền). CHỐT CHẶN THẬT là backend:
  // /api/export hiện KHÔNG kiểm quyền — xem "endpoint cần sửa".
  const fieldRole = ME && ["Ky thuat vien", "Thu kho"].includes(ME.role);
  if (fieldRole) { pageActions([]); return; }
  pageActions([
    ["btn-nt-new", "+ Lập BBNT"], ["btn-nt-status", "Chuyển trạng thái / Xuất file…", "ghost"],
  ]);
  $("#btn-nt-new").onclick = async () => { const w = openModal("Lập Biên bản nghiệm thu",
    (await khDatalist()) + fI("ngay_nghiem_thu", "Ngày nghiệm thu", "date") +
    fI("dia_diem", "Địa điểm / công trình") + fI("dai_dien_a", "Đại diện bên A (khách)") +
    fS("ket_luan", "Kết luận *", ["Đạt", "Đạt có điều kiện", "Không đạt"]) +
    fT("ton_dong", "Tồn đọng / yêu cầu khắc phục", "BẮT BUỘC khi 'Đạt có điều kiện'") +
    itemRowsEditor(4),
    async (fd) => {
      const items = itemsFrom(fd).map((it) => ({ hang_muc: it.hang_muc,
        kl_hop_dong: it.so_luong + " " + it.dvt, kl_thuc_te: it.so_luong + " " + it.dvt,
        don_gia: it.don_gia, thanh_tien: it.don_gia * it.so_luong, ket_qua: "Đạt" }));
      const r = await apiPost("write/bbnt", {
        customer_id: khId(fd), ngay_nghiem_thu: fd.get("ngay_nghiem_thu"),
        dia_diem: fd.get("dia_diem"), dai_dien_a: fd.get("dai_dien_a"),
        ket_luan: fd.get("ket_luan"), ton_dong: fd.get("ton_dong"), items });
      closeModal(); toast("Đã lập " + r.code); RENDER.bbnt(el);
    });
    bindItemEditor(w);
  };
  $("#btn-nt-status").onclick = async () => {
    const list = await apiGet("bbnt");
    openModal("BBNT — chuyển trạng thái / xuất file",
      `<div class="f wide"><label>Chọn BBNT</label><select name="id">${list.map((b) =>
        `<option value="${b.id}">${esc(b.code)} · ${esc(b.customer_name)} · ${esc(viStatus(b.trang_thai))}</option>`).join("")}</select></div>` +
      fS("act", "Hành động", [
        ["Chuyển: Cho khach ky", "Chuyển sang: Chờ khách ký"],
        ["Chuyển: Da nghiem thu (KHÓA)", "Chuyển sang: Đã nghiệm thu (KHÓA sửa/xóa)"],
        "Xuất Excel", "Xuất Word"]),
      async (fd) => {
        const id = Number(fd.get("id")), act = fd.get("act");
        if (act === "Xuất Excel") { window.open(`/api/export?loai=bbnt&id=${id}&fmt=xlsx`); return; }
        if (act === "Xuất Word") { window.open(`/api/export?loai=bbnt&id=${id}&fmt=docx`); return; }
        await apiPost("write/bbnt_status", { id, status: act.includes("KHÓA") ? "Da nghiem thu" : "Cho khach ky" });
        closeModal(); toast("Đã chuyển trạng thái."); RENDER.bbnt(el);
      }, "Thực hiện");
  };
};

/* ---- 4e. Technician: + Giao viec + cap nhat trang thai -------------------- */
async function giaoViecModal(prefill, after) {
  const ns = await nsOptions();
  const nsOpts = ns.map((n) => `<option value="${n.id}">${esc(n.ho_ten)} (${esc(n.loai)})</option>`).join("");
  openModal("Giao việc — anh tự chọn ngày, giờ, thợ (hệ không tự đặt)",
    (await khDatalist()) +
    fS("loai_viec", "Loại việc", ["Lắp đặt", "Bảo trì định kỳ", "Sửa chữa", "Khảo sát"]) +
    fI("ngay_hen", "Ngày hẹn *", "date", "required") + fI("gio_hen", "Giờ bắt đầu", "time") +
    `<div class="f"><label>KTV chính *</label><select name="ktv_id" required>${nsOpts}</select></div>` +
    `<div class="f"><label>KTV phụ</label><select name="ktv_phu_id"><option value="">—</option>${nsOpts}</select></div>` +
    fI("khu_vuc", "Khu vực") + fT("ghi_chu", "Ghi chú (vd: mang máy xịt, gas R32)"),
    async (fd) => {
      const ktvPhu = fd.get("ktv_phu_id");
      const body = { customer_id: khId(fd), loai_viec: fd.get("loai_viec"),
        ngay_hen: fd.get("ngay_hen"), gio_hen: fd.get("gio_hen"),
        ktv_id: Number(fd.get("ktv_id")), ktv_phu_id: ktvPhu ? Number(ktvPhu) : null,
        khu_vuc: fd.get("khu_vuc"), ghi_chu: fd.get("ghi_chu"), ...prefill };
      const r = await apiPost("write/cong_viec", body);
      closeModal(); toast("Đã giao việc " + r.code); if (after) after();
    }, "Giao việc");
  if (prefill && prefill._khach) {
    const inp = $("#modal-form input[name=_kh]");
    if (inp) inp.value = prefill._khach;
  }
}
/* ==== WO-25: tạo công việc ĐỘC LẬP (không cần báo giá) + SỬA công việc ==== */
const CAN_CREATE_JOB = ["Giam doc", "Ky thuat truong", "Quan tri he thong"];      // write/cong_viec
const CAN_EDIT_JOB = ["Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"]; // sua_cong_viec (KTV chỉ việc mình — server chặn)
const LOAI_VIEC = ["Khảo sát", "Lắp đặt", "Sửa chữa", "Bảo trì định kỳ", "Khác"];
const canCreateJob = () => !!ME && CAN_CREATE_JOB.includes(ME.role);
const canEditJob = () => !!ME && CAN_EDIT_JOB.includes(ME.role);
// cv: {} khi tạo · bản ghi khi sửa (cần id, customer_name, loai_viec, ngay_hen, gio_hen, khu_vuc, dia_diem, ghi_chu, ktv_chinh, trang_thai)
async function congViecModal(mode, cv, after) {
  cv = cv || {};
  const isSua = mode === "sua";
  const laKtv = ME && ME.role === "Ky thuat vien";
  const ns = await nsOptions();
  const nsSel = (selId, selName) => `<select name="ktv_id"><option value="">${isSua ? "— giữ nguyên —" : "— chọn KTV —"}</option>${
    ns.map((n) => { const on = (selId && String(selId) === String(n.id)) || (!selId && selName && n.ho_ten === selName);
      return `<option value="${n.id}" ${on ? "selected" : ""}>${esc(n.ho_ten)} (${esc(n.loai)})</option>`; }).join("")}</select>`;
  const loaiSel = (cur) => `<select name="loai_viec">${LOAI_VIEC.map((l) =>
    `<option value="${esc(l)}" ${cur === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const at = (v) => `value="${esc(v || "")}"`;
  // phần khách: tạo = tab (có sẵn / cá nhân mới); sửa = chỉ hiện tên (backend không đổi khách)
  const khPart = isSua
    ? `<div class="f wide"><label>Khách / Công trình</label><div class="form-value">${esc(cv.customer_name || "—")}</div></div>`
    : mTabs([
        ["cosan", "Khách có sẵn", await khDatalist()],
        ["moi", "＋ Khách cá nhân mới", fI("km_ten", "Tên khách *") + fI("km_sdt", "SĐT")],
      ]);
  const body = khPart +
    `<div class="f"><label>Loại việc</label>${loaiSel(cv.loai_viec)}</div>` +
    fI("ngay_hen", "Ngày hẹn *", "date", at(cv.ngay_hen) + " required") +
    fI("gio_hen", "Giờ", "time", at(cv.gio_hen)) +
    (laKtv && isSua ? "" : `<div class="f"><label>KTV phụ trách</label>${nsSel(cv.ktv_id, cv.ktv_chinh)}</div>`) +
    fI("khu_vuc", "Khu vực", "text", at(cv.khu_vuc)) +
    fI("dia_diem", "Địa điểm cụ thể", "text", at(cv.dia_diem)) +
    fT("ghi_chu", "Ghi chú (vd: mang máy xịt, gas R32)");
  const w = openModal(isSua ? ("✏️ Sửa công việc " + (cv.code || "")) : "➕ Tạo công việc ĐỘC LẬP (không cần báo giá)",
    body,
    async (fd) => {
      const base = { loai_viec: fd.get("loai_viec"), ngay_hen: fd.get("ngay_hen"),
        gio_hen: fd.get("gio_hen") || null, khu_vuc: fd.get("khu_vuc") || null,
        dia_diem: fd.get("dia_diem") || null, ghi_chu: fd.get("ghi_chu") || null };
      const kid = fd.get("ktv_id");
      if (kid) base.ktv_id = Number(kid);
      if (isSua) {
        await apiPost("write/sua_cong_viec", { id: cv.id, ...base });
        closeModal(); toast("Đã cập nhật công việc " + (cv.code || "")); if (after) after();
        return;
      }
      // tạo: xác định khách theo tab đang mở
      const tab = (w.querySelector(".mtab.active") || {}).dataset ? w.querySelector(".mtab.active").dataset.t : "cosan";
      if (tab === "moi") {
        const ten = (fd.get("km_ten") || "").trim();
        if (!ten) throw new Error("Nhập tên khách cá nhân mới.");
        base.khach_moi = { ten, sdt: (fd.get("km_sdt") || "").trim(), phan_loai: "Cá nhân" };
      } else {
        base.customer_id = khId(fd); // ném lỗi nếu chưa chọn từ gợi ý
      }
      const r = await apiPost("write/tao_cong_viec", base);
      closeModal(); _KH_CACHE = null; toast("Đã tạo công việc " + r.code + " (việc độc lập)."); if (after) after();
    }, isSua ? "Lưu thay đổi" : "Tạo công việc");
  if (!isSua) bindMTabs(w);
}

const _tech0 = RENDER.technician;
RENDER.technician = async function (el) {
  await _tech0(el);
  pageActions([
    ["btn-cv-new", "+ Giao việc"], ["btn-cv-status", "Cập nhật trạng thái việc…", "ghost"],
  ]);
  $("#btn-cv-new").onclick = () => giaoViecModal({ nguon_lich: "khac" }, () => RENDER.technician(el));
  $("#btn-cv-status").onclick = async () => {
    const t = await apiGet("technician");
    const all = (t.rows || []).filter((r) => r.trang_thai !== "Hoan thanh");
    const FLOW = ["Moi tao", "Da giao KTV", "KTV da nhan", "Dang thuc hien", "Cho vat tu", "Hoan thanh"];
    openModal("Cập nhật trạng thái công việc (đi đúng luồng)",
      `<div class="f wide"><label>Việc</label><select name="code">${all.map((r) =>
        `<option value="${esc(r.code)}">${esc(r.code)} · ${esc(r.customer_name || "")} · ${esc(viStatus(r.trang_thai))}</option>`).join("")}</select></div>` +
      fS("status", "Trạng thái mới", FLOW.slice(1).map((s) => [s, viStatus(s)])),
      async (fd) => {
        const row = all.find((r) => r.code === fd.get("code"));
        await apiPost("write/cv_status", { id: row.id, status: fd.get("status") });
        closeModal(); toast("Đã cập nhật."); RENDER.technician(el);
      }, "Cập nhật");
  };
};

/* ---- 4f. Maintenance: + HDBT nhieu diem chu ky rieng ---------------------- */
const _maint0 = RENDER.maintenance;
RENDER.maintenance = async function (el) {
  await _maint0(el);
  pageActions([
    ["btn-hdbt-new", "+ Hợp đồng bảo trì (nhiều điểm, chu kỳ riêng)"],
    ["btn-moc-sinh", "Sinh mốc cả năm", "ghost"],
    ["btn-moc-xem", "Xem điểm & chu kỳ", "ghost"],
  ]);
  $("#btn-hdbt-new").onclick = async () => openModal("Tạo HĐ bảo trì — mỗi điểm 1 chu kỳ riêng",
    (await khDatalist()) + fI("ten_hop_dong", "Tên hợp đồng *", "text", "required") +
    fI("ngay_bat_dau", "Ngày bắt đầu", "date") + fI("ngay_ket_thuc", "Ngày kết thúc", "date") +
    `<div class="f wide"><label>Các điểm bảo trì (VD Sonadezi: BH2 2 tháng, Gò Dầu 3 tháng)</label>
     <table class="item-editor"><thead><tr><th>Tên điểm</th><th>Chu kỳ (tháng)</th><th>Số máy</th><th>Bắt đầu</th></tr></thead><tbody>
     ${[0, 1, 2].map((i) => `<tr><td><input name="d_ten_${i}" placeholder="VD: BH2"></td>
       <td><input name="d_ck_${i}" type="number" min="1" max="12" style="width:70px" placeholder="2"></td>
       <td><input name="d_may_${i}" type="number" style="width:70px" placeholder="0"></td>
       <td><input name="d_bd_${i}" type="date"></td></tr>`).join("")}</tbody></table></div>`,
    async (fd) => {
      const diem = [];
      for (let i = 0; i < 3; i++) {
        const ten = (fd.get("d_ten_" + i) || "").trim();
        if (!ten) continue;
        diem.push({ ten_diem: ten, chu_ky_thang: Number(fd.get("d_ck_" + i) || 1),
          so_may: Number(fd.get("d_may_" + i) || 0), ngay_bat_dau: fd.get("d_bd_" + i) || fd.get("ngay_bat_dau") });
      }
      const r = await apiPost("write/hdbt", { customer_id: khId(fd),
        ten_hop_dong: fd.get("ten_hop_dong"), ngay_bat_dau: fd.get("ngay_bat_dau"),
        ngay_ket_thuc: fd.get("ngay_ket_thuc"), diem });
      closeModal(); toast("Đã tạo " + r.code + (diem.length ? " + sinh mốc theo chu kỳ." : ""));
      RENDER.maintenance(el);
    });
  $("#btn-moc-sinh").onclick = async () => {
    const r = await apiPost("write/sinh_moc", {});
    toast("Đã sinh " + r.sinh_moi + " mốc mới (chạy lại không nhân đôi).");
  };
  $("#btn-moc-xem").onclick = async () => {
    const d = await apiGet("moc_bao_tri");
    openModal("Điểm bảo trì & chu kỳ riêng",
      `<div class="f wide">${table(["Khách", "Hợp đồng", "Điểm", "Chu kỳ", "Số máy", "Mốc (xong/tổng)"],
        d.rows.map((r) => [esc(r.customer_name), esc(r.ten_hop_dong), esc(r.ten_diem),
          r.chu_ky_thang + " tháng/lần", String(r.so_may || 0), `${r.xong}/${r.so_moc}`]))}</div>`,
      async () => closeModal(), "Đóng");
  };
};

/* ---- 4g. Receivable: hoa don that + UNC + nhac no ------------------------- */
const _recv0 = RENDER.receivable;
RENDER.receivable = async function (el) {
  await _recv0(el);
  let hd = { rows: [], tong_cong: 0, tong_da_thu: 0, con_no: 0 };
  try { hd = await apiGet("hoa_don"); } catch (e) {}
  const owing = hd.rows.filter((r) => (r.tong_cong - r.da_thu) > 0.5);
  pageActions([
    ["btn-unc", "💵 Ghi nhận thanh toán (UNC)"],
    ["btn-nhacno", "Ghi nhắc nợ", "ghost"],
    ["btn-noquahan", "Nợ quá hạn 🔴", "ghost"],
  ]);
  el.insertAdjacentHTML("afterbegin", panel("Hóa đơn thật (từ import) — còn nợ " + vnd(hd.con_no),
    table(["Mã HĐ", "Ngày", "Khách", "Tổng", "Đã thu", "Còn nợ"],
      owing.slice(0, 30).map((r) => [esc(r.ma_hd), fmtDate(r.ngay),
        esc(r.customer_name || r.ten_don_vi), `<span class="money">${vnd(r.tong_cong)}</span>`,
        `<span class="money">${vnd(r.da_thu)}</span>`,
        `<b class="money">${vnd(r.tong_cong - r.da_thu)}</b>`]),
      { empty: "Không còn hóa đơn nợ — sạch nợ 🎉" })));
  $("#btn-unc").onclick = () => openModal("Ghi nhận thanh toán / Ủy nhiệm chi",
    `<div class="f wide"><label>Hóa đơn</label><select name="hoa_don_id">${owing.map((r) =>
      `<option value="${r.id}">${esc(r.ma_hd)} · ${esc(r.customer_name || r.ten_don_vi)} · còn ${vnd(r.tong_cong - r.da_thu)}</option>`).join("")}</select></div>` +
    fI("so_tien", "Số tiền thực nhận *", "number", "required step=any") +
    fI("ngay", "Ngày nhận", "date") + fI("ma_gd", "Mã giao dịch / UNC") +
    fI("ngan_hang", "Ngân hàng") + fT("ghi_chu", "Ghi chú"),
    async (fd) => {
      await apiPost("write/thanh_toan", { hoa_don_id: Number(fd.get("hoa_don_id")),
        so_tien: Number(fd.get("so_tien")), ngay: fd.get("ngay"), ma_gd: fd.get("ma_gd"),
        ngan_hang: fd.get("ngan_hang"), ghi_chu: fd.get("ghi_chu") });
      closeModal(); toast("Đã ghi nhận. Công nợ tự tính lại."); RENDER.receivable(el);
    });
  $("#btn-nhacno").onclick = async () => openModal("Ghi 1 lần nhắc nợ",
    (await khDatalist()) + fS("kenh", "Kênh", ["Gọi điện", "Zalo", "Email", "Gặp trực tiếp"]) +
    fI("so_tien_cam_ket", "Số tiền cam kết", "number", "step=any") +
    fI("ngay_hen_thanh_toan", "Ngày hẹn trả", "date") + fT("ket_qua", "Kết quả / ghi chú"),
    async (fd) => {
      await apiPost("write/nhac_no", { customer_id: khId(fd), kenh: fd.get("kenh"),
        so_tien_cam_ket: fd.get("so_tien_cam_ket"), ngay_hen_thanh_toan: fd.get("ngay_hen_thanh_toan"),
        ket_qua: fd.get("ket_qua") });
      closeModal(); toast("Đã ghi nhắc nợ."); RENDER.receivable(el);
    });
  $("#btn-noquahan").onclick = async () => {
    const d = await apiGet("no_qua_han");
    openModal(`Khách nợ quá ${d.so_ngay} ngày — cần DCCN / đề nghị thanh toán`,
      `<div class="f wide">${table(["Khách", "Số HĐ", "Còn nợ", "HĐ cũ nhất"],
        d.rows.map((r) => [`🔴 ${esc(r.customer_name)}`, String(r.so_hd), vnd(r.con_no), fmtDate(r.hd_cu_nhat)]),
        { empty: "Không có nợ quá hạn." })}
       <div class="muted" style="margin-top:8px">→ Dùng nút "Sinh bộ 7 chứng từ" trên trang Báo giá để lập DCCN + thư đề nghị TT điền sẵn.</div></div>`,
      async () => closeModal(), "Đóng");
  };
};

/* ---- Import trọn bộ hồ sơ công trình: preview -> xác nhận -> commit -------- */
const PROJECT_PROFILE_ROLES = ["Giam doc", "Ke toan", "Quan tri he thong"];
const canProjectProfile = () => !!ME && PROJECT_PROFILE_ROLES.includes(ME.role);

/** Định dạng số kiểu VN (dấu chấm ngăn nghìn) — bảng dày / sandbox, không bắt buộc " đ". */
function fmtNumVi(v, opts) {
  if (v == null || v === "" || v === "—") return "—";
  const o = opts || { maximumFractionDigits: 2 };
  if (typeof v === "number") {
    return Number.isFinite(v) ? v.toLocaleString("vi-VN", o) : "—";
  }
  const t = String(v).trim();
  if (!t || t === "—") return "—";
  // nhãn phân tầng / text không phải tiền
  if (/[a-zA-Zàáạảãâăèéêìíòóôơùúưỳýđ]/i.test(t) && !/^[\d\s.,\-]+$/.test(t)) return esc(t);
  let s = t.replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(/,/g, ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return esc(t);
  return n.toLocaleString("vi-VN", o);
}
function fmtMoneyVi(v) {
  return fmtNumVi(v, { maximumFractionDigits: 0 });
}
function fmtQtyVi(v) {
  return fmtNumVi(v, { maximumFractionDigits: 4 });
}

function closeNormalizationSandbox() {
  const wrap = document.getElementById("normalization-sandbox");
  const appShell = document.getElementById("app");
  if (appShell) appShell.inert = false;
  if (wrap && typeof wrap._sandboxCleanup === "function") wrap._sandboxCleanup();
  if (wrap) wrap.remove();
  document.body.classList.remove("sandbox-open");
}

function openNormalizationSandbox(pv, options = {}) {
  closeNormalizationSandbox();
  const activeBeforeOpen = document.activeElement;
  const previouslyFocused = options.returnFocus && options.returnFocus.isConnected
    ? options.returnFocus
    : (activeBeforeOpen && activeBeforeOpen !== document.body ? activeBeforeOpen : null);
  const quote = pv.quote || {};
  const audit = quote.normalization_audit || {};
  const checks = audit.row_checks || [];
  const issues = (audit.blocking_issues || []).map((issue, index) => ({ ...issue, index }));
  const issueByRow = new Map();
  issues.forEach((issue) => {
    const key = Number(issue.row || 0);
    if (!issueByRow.has(key)) issueByRow.set(key, []);
    issueByRow.get(key).push(issue);
  });
  const cells = (row, side) => {
    const fields = row.fields || {};
    const value = (name) => (fields[name] || {})[side] ?? "—";
    const bad = (name) => ((fields[name] || {}).within_tolerance === false ? " audit-cell-error" : "");
    const rowIssues = issueByRow.get(Number(row.source_row)) || [];
    const stageBad = rowIssues.some((issue) => /STAGE|ALLOCATION/.test(issue.code || ""));
    return `<tr class="audit-row${rowIssues.length ? " audit-row-error" : ""}" data-audit-row="${Number(row.source_row)}">
      <td>${Number(row.source_row)}</td><td class="audit-name">${esc(row.item_name || "—")}</td>
      <td class="${bad("quantity")} money">${fmtQtyVi(value("quantity"))}</td>
      <td class="${bad("unit_price")} money">${fmtMoneyVi(value("unit_price"))}</td>
      <td class="${bad("amount")} money">${fmtMoneyVi(value("amount"))}</td>
      <td class="${stageBad ? "audit-cell-error" : ""}">${esc(row.stage_status || "—")}</td></tr>`;
  };
  const candidateOptions = (quote.candidate_sheets || []).map((candidate) =>
    `<option value="${esc(candidate.sheet_name)}" ${candidate.sheet_name === quote.sheet_name ? "selected" : ""}>${esc(candidate.sheet_name)} · ${Number(candidate.detail_count || 0)} dòng</option>`).join("");
  const wrap = document.createElement("div");
  wrap.id = "normalization-sandbox";
  wrap.className = "normalization-sandbox";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-labelledby", "sandbox-title");
  wrap.tabIndex = -1;
  const modeLabel = (pv.project && pv.project.mode === "update_in_place")
    ? "Cập nhật tại chỗ (revision BG/BOQ — không tạo CT mới)"
    : "Tạo công trình mới";
  const counts = quote.counts || {};
  wrap.innerHTML = `<div class="sandbox-head">
    <div><div class="sandbox-kicker">SANDBOX ĐỐI CHIẾU NGUỒN ↔ HỆ THỐNG · KHÔNG PHẢI MÀN SỬA</div>
      <h2 id="sandbox-title">${esc((pv.project && pv.project.project_name) || "Hồ sơ import")}</h2>
      <div class="muted">${esc(quote.document_kind || "—")} · SHA256 ${esc(quote.sha256_prefix || "—")} · ${esc(modeLabel)}</div>
      <div class="notice info sandbox-edit-hint" style="margin-top:8px">
        <b>Trái = file Excel · Phải = hệ thống sẽ lưu.</b>
        Khi chip <b>0 sai lệch / Đã khớp</b> thì hai cột <b>giống nhau là đúng</b> — không phải lỗi.
        Màn này <b>không cho sửa ô</b>. Muốn đổi SL/đơn giá/VAT: sửa file Excel rồi bấm lại
        <b>Import revision báo giá/BOQ</b> (tab Khối lượng), hoặc chỉnh trên Excel rồi import lại.
      </div></div>
    <div class="sandbox-head-actions"><span class="chip ${issues.length ? "danger" : "ok"}" id="sandbox-issue-count">${issues.length} sai lệch</span>
      <button class="btn ghost" id="sandbox-close">Đóng</button></div>
  </div>
  <div class="sandbox-toolbar">
    <label>Sheet <select class="field" id="sandbox-sheet">${candidateOptions}</select></label>
    <button class="btn ghost btn-sm" id="sandbox-reload-sheet" ${candidateOptions ? "" : "disabled"}>Đọc lại sheet</button>
    <label>Lọc <select class="field" id="sandbox-filter"><option value="all">Tất cả dòng</option><option value="errors">Chỉ dòng sai lệch</option></select></label>
    <button class="btn ghost btn-sm" id="sandbox-prev" ${issues.length ? "" : "disabled"}>← Trước</button>
    <button class="btn primary btn-sm" id="sandbox-next" ${issues.length ? "" : "disabled"}>Tiếp theo →</button>
    <strong id="sandbox-position">${issues.length ? "0/" + issues.length : "Đã khớp toàn bộ"}</strong>
    <span class="sandbox-tolerance">Ngưỡng tiền ±${esc(audit.money_tolerance_percent || "0.02")}%</span>
  </div>
  <div class="sandbox-mobile-tabs"><button class="active" data-sandbox-pane="source">Nguồn gốc</button><button data-sandbox-pane="normalized">Đã chuẩn hóa</button></div>
  <div class="sandbox-compare">
    <section class="sandbox-pane source active" data-pane="source"><h3>File gốc · ${esc(quote.sheet_name || "—")}</h3>
      <div class="sandbox-table-wrap"><table><thead><tr><th>Dòng</th><th>Tên hàng hóa/hạng mục</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th><th>Phân tầng</th></tr></thead><tbody>${checks.map((row) => cells(row, "source")).join("")}</tbody></table></div></section>
    <section class="sandbox-pane normalized" data-pane="normalized"><h3>Dữ liệu chuẩn hóa của hệ thống</h3>
      <div class="sandbox-table-wrap"><table><thead><tr><th>Dòng</th><th>Tên hàng hóa/hạng mục</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th><th>Phân tầng</th></tr></thead><tbody>${checks.map((row) => cells(row, "normalized")).join("")}</tbody></table></div></section>
  </div>
  <div class="sandbox-foot"><div><b>${issues.length ? `Còn ${issues.length} lỗi chặn ghi chính thức` : "Dữ liệu đã khớp nguồn — hai cột giống nhau là bình thường"}</b>
    <div class="muted">${issues.length ? "Bấm Tiếp theo để đi lần lượt tới từng dòng cần xử lý." : "Bấm Xác nhận import để ghi revision lên CT (thay KPI dự toán theo file này). Không sửa từng ô tại đây."}
      ${counts.detail_count != null ? ` · ${Number(counts.detail_count)} dòng chi tiết · ${Number(counts.heading_count || 0)} tiêu đề · ${Number(counts.stage_allocation_count || 0)} phân tầng` : ""}</div></div>
    <div><button class="btn ghost" id="sandbox-back">Quay lại</button>
      <button class="btn primary" id="sandbox-confirm" ${quote.can_commit_official ? "" : "disabled"}>Xác nhận import</button></div></div>`;
  document.body.appendChild(wrap);
  const appShell = document.getElementById("app");
  if (appShell) appShell.inert = true;
  document.body.classList.add("sandbox-open");
  const onSandboxKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeNormalizationSandbox();
    }
  };
  document.addEventListener("keydown", onSandboxKeydown);
  wrap._sandboxCleanup = () => {
    document.removeEventListener("keydown", onSandboxKeydown);
    if (previouslyFocused && typeof previouslyFocused.focus === "function" && previouslyFocused.isConnected) {
      previouslyFocused.focus();
    }
  };
  $("#sandbox-close", wrap).onclick = closeNormalizationSandbox;
  $("#sandbox-back", wrap).onclick = closeNormalizationSandbox;
  $("#sandbox-confirm", wrap).onclick = () => {
    if (!quote.can_commit_official) return;
    closeNormalizationSandbox();
    if (options.onConfirm) options.onConfirm();
  };
  $("#sandbox-reload-sheet", wrap).onclick = async () => {
    const selected = $("#sandbox-sheet", wrap).value;
    if (selected && options.onSelectSheet) await options.onSelectSheet(selected);
  };
  let cursor = -1;
  const focusIssue = (direction) => {
    if (!issues.length) return;
    cursor = (cursor + direction + issues.length) % issues.length;
    const issue = issues[cursor];
    wrap.querySelectorAll(".audit-row-current").forEach((row) => row.classList.remove("audit-row-current"));
    const targets = wrap.querySelectorAll(`[data-audit-row="${Number(issue.row || 0)}"]`);
    targets.forEach((row) => row.classList.add("audit-row-current"));
    if (targets[0]) targets[0].scrollIntoView({ behavior: "smooth", block: "center" });
    $("#sandbox-position", wrap).textContent = `${cursor + 1}/${issues.length} · ${issue.code || "SAI_LECH"}${issue.field ? " · " + issue.field : ""}`;
  };
  $("#sandbox-next", wrap).onclick = () => focusIssue(1);
  $("#sandbox-prev", wrap).onclick = () => focusIssue(-1);
  $("#sandbox-filter", wrap).onchange = (event) => {
    wrap.classList.toggle("show-errors-only", event.target.value === "errors");
  };
  wrap.querySelectorAll("[data-sandbox-pane]").forEach((button) => button.onclick = () => {
    wrap.querySelectorAll("[data-sandbox-pane]").forEach((node) => node.classList.toggle("active", node === button));
    wrap.querySelectorAll("[data-pane]").forEach((pane) => pane.classList.toggle("active", pane.dataset.pane === button.dataset.sandboxPane));
  });
  $("#sandbox-close", wrap).focus();
  if (issues.length) focusIssue(1);
}

function projectProfileImportPanel() {
  if (!canProjectProfile()) return "";
  return `<section class="panel project-profile-card" id="project-profile-import" data-ui-scope="import-card-only">
    <div class="panel-head project-profile-card-head"><h2 class="panel-title">
      <svg class="project-profile-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 2.5h5.5L13 6v7.5H4V2.5zM9 2.5V6h3.5" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      Tạo/cập nhật hồ sơ công trình từ bộ hồ sơ</h2>
      <span class="project-profile-hint">2 pha: xem trước → xác nhận</span></div>
    <div class="panel-body" id="project-profile-import-body">
      <div class="empty">⏳ Đang tải danh sách công trình và khách hàng…</div>
    </div></section>`;
}

async function mountProjectProfileImport(root) {
  const host = $("#project-profile-import-body", root);
  if (!host || !canProjectProfile()) return;
  let ctx;
  try {
    ctx = await apiGet("project_profile_context");
  } catch (e) {
    host.innerHTML = `<div class="empty">❌ Không tải được ngữ cảnh import: ${esc(e.message || "Lỗi")}</div>`;
    return;
  }
  const projects = ctx.projects || [];
  const customers = ctx.customers || [];
  const profileLabels = {
    INSTALLATION_STANDARD: "Thi công lắp đặt tiêu chuẩn",
    EQUIPMENT_SUPPLY: "Cung cấp thiết bị",
    MAINTENANCE_PERIODIC: "Bảo trì định kỳ",
    REPAIR_SERVICE: "Sửa chữa / dịch vụ",
    VARIATION_WORK: "Công việc phát sinh",
    FINAL_ACCOUNT_CLOSEOUT: "Quyết toán / đóng hồ sơ",
  };
  const profileOptions = (ctx.template_profiles || ["INSTALLATION_STANDARD"]).map((code) =>
    `<option value="${esc(code)}">${esc(profileLabels[code] || code)}</option>`).join("");
  const projectOptions = projects.map((p) =>
    `<option value="${Number(p.id)}">${esc((p.code ? p.code + " · " : "") + p.project_name)} — ${esc(p.customer_name || "")}</option>`).join("");
  const customerOptions = customers.map((c) =>
    `<option value="${Number(c.id)}">${esc((c.code ? c.code + " · " : "") + c.customer_name)}</option>`).join("");
  const sourcePicker = (key, label, accept, required) => `<div class="ppi-field ppi-source" data-profile-source="${key}">
    <label class="ppi-label">${esc(label)}${required ? ' <span class="ppi-required">*</span>' : ""}</label>
    <div class="ppi-source-picker">
      <div class="ppi-file-row">
        <label class="btn ghost btn-sm ppi-file-button">Chọn file
          <input class="ppi-file-input" type="file" id="ppi-${key}-file" accept="${accept}"></label>
        <span class="ppi-file-name" id="ppi-${key}-name">Chưa chọn file</span>
      </div>
      <div class="ppi-path-row"><span>Hoặc dán đường dẫn file</span>
        <input class="field" type="text" id="ppi-${key}-path" placeholder="D:\\Hoso\\${key.toUpperCase()}\\..."></div>
      <span class="ppi-help">Chọn một trong hai cách: upload file hoặc nhập đường dẫn local.</span>
    </div>
  </div>`;
  host.innerHTML = `
    <p class="project-profile-note">Hệ thống giữ nguyên project/hợp đồng/workflow cũ, tạo revision báo giá chính thức và BOQ đúng từng tầng. Bước xem trước không ghi DB.</p>
    <div class="project-profile-grid">
      <div class="ppi-field"><label class="ppi-label">Công trình <span class="ppi-required">*</span></label><select class="field" id="ppi-project">
        <option value="">— Chọn công trình hoặc chế độ tạo mới —</option>
        <option value="new">＋ Tạo công trình mới</option>${projectOptions}</select></div>
      <div class="ppi-field"><label class="ppi-label">Tên công trình <span class="ppi-required">*</span></label><input class="field" id="ppi-project-name" autocomplete="off" placeholder="Tên hiển thị trên hồ sơ"></div>
      <div class="ppi-field"><label class="ppi-label">Khách hàng <span class="ppi-required">*</span></label><select class="field" id="ppi-customer"><option value="">— Chọn khách hàng —</option>${customerOptions}</select></div>
      <div class="ppi-field"><label class="ppi-label">Loại hồ sơ V3.1 <span class="ppi-required">*</span></label><select class="field" id="ppi-template-profile">${profileOptions}</select><span class="ppi-help">Hệ thống tự áp checklist bắt buộc/điều kiện theo loại hồ sơ đã chọn.</span></div>
      ${sourcePicker("quote", "Báo giá chính thức", ".xls,.xlsx,.xlsm,.xlsb", true)}
      ${sourcePicker("contract", "Hợp đồng (tùy chọn)", ".doc,.docx,.pdf", false)}
      ${sourcePicker("personnel", "Danh sách nhân sự thi công (tùy chọn)", ".xlsx,.xlsm", false)}
      <div class="ppi-field ppi-auto-template"><label class="ppi-check"><input type="checkbox" id="ppi-auto-template" checked> <span>Tự sinh hồ sơ nhân sự từ template sau khi import</span></label></div>
    </div>
    <div class="project-profile-actions">
      <button class="btn primary" id="ppi-preview">Xem trước bộ hồ sơ</button>
      <button class="btn ghost" id="ppi-commit" disabled>Xác nhận import</button>
    </div>
    <div id="ppi-out" style="margin-top:10px"></div>`;

  const projectSel = $("#ppi-project", host);
  const projectName = $("#ppi-project-name", host);
  const customerSel = $("#ppi-customer", host);
  const templateProfileSel = $("#ppi-template-profile", host);
  const previewBtn = $("#ppi-preview", host);
  const commitBtn = $("#ppi-commit", host);
  const out = $("#ppi-out", host);
  let confirmToken = null;
  let lastPreviewPayload = null;

  const invalidate = () => {
    confirmToken = null;
    commitBtn.disabled = true;
    if (out.dataset.hasPreview === "1") {
      out.innerHTML = `<div class="muted">Dữ liệu đã thay đổi — hãy xem trước lại.</div>`;
      out.dataset.hasPreview = "0";
    }
  };
  const syncProject = () => {
    const value = projectSel.value;
    const selected = projects.find((p) => String(p.id) === value);
    if (selected) {
      projectName.value = selected.project_name || "";
      projectName.readOnly = true;
      customerSel.value = String(selected.customer_id || "");
      customerSel.disabled = true;
      templateProfileSel.value = selected.template_profile || "INSTALLATION_STANDARD";
    } else {
      projectName.readOnly = false;
      customerSel.disabled = false;
      projectName.value = "";
      customerSel.value = "";
      templateProfileSel.value = "INSTALLATION_STANDARD";
    }
  };
  projectSel.addEventListener("change", () => { invalidate(); syncProject(); });
  syncProject();
  ["quote", "contract", "personnel"].forEach((key) => {
    const fileInput = $(`#ppi-${key}-file`, host);
    const pathInput = $(`#ppi-${key}-path`, host);
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) pathInput.value = "";
      $(`#ppi-${key}-name`, host).textContent = file ? `${file.name} · ${Math.ceil(file.size / 1024)} KB` : "Chưa chọn file";
      invalidate();
    });
    pathInput.addEventListener("input", () => {
      if ((pathInput.value || "").trim() && fileInput.value) {
        fileInput.value = "";
        $(`#ppi-${key}-name`, host).textContent = "Chưa chọn file";
      }
      invalidate();
    });
  });
  host.querySelectorAll("input:not([type=file]), select:not(#ppi-project)").forEach((input) =>
    input.addEventListener("change", invalidate));

  const attachSource = async (payload, key, required) => {
    const fileInput = $(`#ppi-${key}-file`, host);
    const file = fileInput.files && fileInput.files[0];
    const path = ($(`#ppi-${key}-path`, host).value || "").trim();
    if (file && path) throw new Error(`Chỉ chọn file hoặc đường dẫn cho ${key}, không dùng cả hai.`);
    if (!file && !path && required) throw new Error("Báo giá chính thức là bắt buộc.");
    if (file) {
      payload[key + "_filename"] = file.name;
      payload[key + "_b64"] = await fileToB64(file);
    } else if (path) {
      payload[key + "_path"] = path;
    }
  };
  const previewHtml = (pv) => {
    const q = pv.quote || {};
    const c = q.counts || {};
    const warningRows = Object.entries(pv.warning_counts || {});
    const stageHtml = (q.stages || []).length
      ? (q.stages || []).map((s) => `<span class="chip info">${esc(s)}</span>`).join(" ")
      : `<span class="muted">Không nhận diện được tầng.</span>`;
    return `<div class="panel" style="box-shadow:none"><div class="panel-body">
      ${formGrid([
        ["Chế độ", pv.project && pv.project.mode === "update_in_place" ? "Cập nhật tại chỗ" : "Tạo công trình mới"],
        ["Công trình", (pv.project && pv.project.project_name) || "—"],
        ["Sheet báo giá", q.sheet_name || "—"],
        ["Dòng giữ nguyên", String(c.line_count ?? 0)],
        ["Tiêu đề / hạng mục", `${c.heading_count ?? 0} / ${c.detail_count ?? 0}`],
        ["Phân bổ theo tầng", String(c.stage_allocation_count ?? 0)],
        ["Nhân sự", String((pv.personnel && pv.personnel.count) || 0)],
        ["Hiệu lực preview", `${pv.expires_in_seconds || 0} giây`],
      ], 2)}
      <div style="margin-top:10px"><b>Tầng/giai đoạn nhận diện:</b><div style="margin-top:6px">${stageHtml}</div></div>
      <div style="margin-top:10px"><b>Cảnh báo:</b> ${warningRows.length
        ? warningRows.map(([code, n]) => `<span class="chip warn">${esc(code)}: ${Number(n)}</span>`).join(" ")
        : `<span class="chip ok">Không có</span>`}</div>
      <div class="muted" style="font-size:11px;margin-top:8px">Mã kiểm tra file: ${esc(q.sha256_prefix || "—")}. Chưa ghi bắt kỳ dữ liệu nào.</div>
    </div></div>`;
  };

  const showSandbox = (pv) => {
    openNormalizationSandbox(pv, {
      returnFocus: previewBtn,
      onConfirm: () => commitBtn.click(),
      onSelectSheet: async (sheetName) => {
        if (!lastPreviewPayload) return;
        const nextPayload = { ...lastPreviewPayload, quote_sheet_name: sheetName };
        try {
          const nextPreview = await apiPost("write/project_profile_preview", nextPayload);
          lastPreviewPayload = nextPayload;
          confirmToken = nextPreview.confirm_token;
          commitBtn.disabled = !confirmToken || !nextPreview.quote?.can_commit_official;
          out.innerHTML = `<div class="muted">Đã chuẩn hóa sheet <b>${esc(nextPreview.quote?.sheet_name || sheetName)}</b> · ${Number(nextPreview.quote?.normalization_audit?.blocking_issues?.length || 0)} sai lệch.</div>`;
          showSandbox(nextPreview);
        } catch (e) {
          toast(e.message || "Không đọc lại được sheet.");
        }
      },
    });
  };

  previewBtn.onclick = async () => {
    previewBtn.disabled = true;
    commitBtn.disabled = true;
    out.dataset.hasPreview = "0";
    out.innerHTML = `<div class="empty">⏳ Đang đọc và kiểm tra bộ hồ sơ…</div>`;
    try {
      if (!projectSel.value) throw new Error("Hãy chọn công trình hiện có hoặc chế độ tạo mới.");
      const payload = {
        auto_generate_templates: $("#ppi-auto-template", host).checked,
        template_profile: $("#ppi-template-profile", host).value,
      };
      const selected = projects.find((p) => String(p.id) === projectSel.value);
      if (selected) {
        payload.project_id = Number(selected.id);
        payload.project_name = selected.project_name;
        payload.customer_id = Number(selected.customer_id);
      } else {
        payload.project_name = (projectName.value || "").trim();
        payload.customer_id = Number(customerSel.value) || null;
        if (!payload.project_name) throw new Error("Nhập tên công trình mới.");
        if (!payload.customer_id) throw new Error("Chọn khách hàng cho công trình mới.");
      }
      await Promise.all([
        attachSource(payload, "quote", true), attachSource(payload, "contract", false),
        attachSource(payload, "personnel", false),
      ]);
      const pv = await apiPost("write/project_profile_preview", payload);
      lastPreviewPayload = payload;
      confirmToken = pv.confirm_token;
      const mismatchCount = Number(pv.quote?.normalization_audit?.blocking_issues?.length || 0);
      out.innerHTML = `<div class="muted">Đã mở sandbox toàn màn hình · <b>${Number(pv.quote?.counts?.detail_count || 0)}</b> hạng mục · <b>${mismatchCount}</b> sai lệch. Không có dữ liệu nào được ghi ở bước này.</div>`;
      out.dataset.hasPreview = "1";
      commitBtn.disabled = !confirmToken || !pv.quote?.can_commit_official;
      showSandbox(pv);
      toast("Xem trước xong — CHƯA ghi DB.");
    } catch (e) {
      confirmToken = null;
      out.innerHTML = `<div class="empty">❌ ${esc(e.message || "Không xem trước được")}</div>`;
    } finally {
      previewBtn.disabled = false;
    }
  };
  commitBtn.onclick = async () => {
    if (!confirmToken) return;
    if (!window.confirm("Xác nhận ghi bộ hồ sơ đã xem trước vào hệ thống?")) return;
    commitBtn.disabled = true;
    previewBtn.disabled = true;
    try {
      const result = await apiPost("write/project_profile_commit", { confirm_token: confirmToken });
      confirmToken = null;
      const counts = result.counts || {};
      const generationWarnings = result.generation_warnings || [];
      const warningHtml = generationWarnings.length
        ? `<div style="margin-top:10px;padding:10px;border:1px solid var(--warn);border-radius:8px;text-align:left">
            <b>⚠ Import đã ghi xong nhưng có ${generationWarnings.length} cảnh báo sinh hồ sơ:</b>
            <ul style="margin:6px 0 0;padding-left:20px">${generationWarnings.map((warning) => `<li>${esc(warning)}</li>`).join("")}</ul>
          </div>` : "";
      out.innerHTML = `<div class="empty">✅ ${result.idempotent ? "Bộ hồ sơ đã được import trước đó; không tạo bản trùng." : "Đã import bộ hồ sơ chính thức."}<br>
        <span class="muted">Báo giá ${esc(result.quotation_code || result.quotation_id || "—")} · ${Number(counts.details || 0)} hạng mục · ${Number(counts.stage_allocations || 0)} phân bổ tầng · ${Number(counts.personnel_linked || 0)} nhân sự</span><br>
        ${warningHtml}
        <button class="btn primary btn-sm" id="ppi-open-project" style="margin-top:10px">Mở hồ sơ công trình →</button></div>`;
      $("#ppi-open-project", out).onclick = () => { location.hash = "#cong_trinh?project_id=" + Number(result.project_id); };
      toast(generationWarnings.length
        ? `Import hoàn tất nhưng có ${generationWarnings.length} cảnh báo sinh hồ sơ.`
        : "Import hồ sơ công trình hoàn tất.", !generationWarnings.length);
      loadNavBadges();
    } catch (e) {
      out.innerHTML += `<div class="empty">❌ ${esc(e.message || "Import thất bại")}</div>`;
      commitBtn.disabled = false;
    } finally {
      previewBtn.disabled = false;
    }
  };
}

/* ---- 5a. IMPORT page (WO-22: căn mockup "Nhập liệu & Rà soát") -------------- */
RENDER.import = async function (el) {
  const st = await apiGet("import_status");
  const [scan, rs, sk, dcc] = await Promise.all([
    apiGet("scan_status").catch(() => null),
    apiGet("ra_soat").catch(() => null),
    apiGet("sao_ke_cho_duyet").catch(() => null),
    apiGet("doi_chieu_cong_no").catch(() => null),
  ]);
  // "Import & Rà soát" = 1 muc nav — trang Ra soat mo tu day
  if (MENU_ROLES.rasoat.includes(ME.role)) {
    pageActions([["btn-goto-rasoat", "🔎 Rà soát dữ liệu", "ghost"]]);
    $("#btn-goto-rasoat").onclick = () => { location.hash = "#rasoat"; };
  }
  const card = (id, title, desc, commitLabel) => `
    <div class="panel"><div class="panel-head"><h2 class="panel-title">${esc(title)}</h2></div>
    <div class="panel-body"><div class="muted" style="margin-bottom:8px">${esc(desc)}</div>
    <div class="toolbar"><button class="btn ghost" id="${id}-prev">Xem trước</button>
    <button class="btn primary" id="${id}-go">${esc(commitLabel)}</button></div>
    <pre class="import-out" id="${id}-out"></pre></div></div>`;

  // Nguồn nhập liệu — trạng thái live từng nguồn ("Tệp gần nhất/số dòng" chưa có nguồn → —)
  Object.assign(VI_STATUS, { "Da import": "Đã import", "Chua co": "Chưa có", "Da quet": "Đã quét",
    "Da khop het": "Đã khớp hết", "Trung binh": "Trung bình", "Thap": "Thấp" });
  const srcRows = [
    ["📇 Danh sách khách hàng", "Master", `<b>${st.khach}</b> khách`, st.khach ? chip("Da import") : chip("Chua co")],
    ["🧾 Hóa đơn bán ra (Invoice*.xlsx)", "Hóa đơn", `<b>${st.hoa_don_ban_ra}</b> HĐ`, st.hoa_don_ban_ra ? chip("Da import") : chip("Chua co")],
    ["📥 Hóa đơn đầu vào (giá vốn)", "Hóa đơn", `<b>${st.hoa_don_mua_vao || 0}</b> HĐ`, st.hoa_don_mua_vao ? chip("Da import") : chip("Chua co")],
    ["🏦 Sao kê ngân hàng (ACB/VCB)", "Sao kê", sk ? `<b>${sk.da_khop.n}</b> đã khớp · <b>${sk.tk.tong}</b> chờ` : `<span class="muted">—</span>`, sk ? (sk.tk.tong ? chip("Cho duyet") : chip("Da khop het")) : chip("Chua co")],
    ["📁 Scan hồ sơ " + esc((scan && scan.source_dir) || "D:\\2026"), "Hồ sơ scan", scan && scan.has_scan ? `<b>${scan.documents}</b> tài liệu` : `<span class="muted">chưa quét</span>`, scan && scan.has_scan ? chip("Da quet") : chip("Chua co")],
  ];

  // Hàng chờ rà soát — toàn bộ từ nguồn live; nhóm nào 0 thì không hiện
  const rq = [];
  if (st.khach_chua_khop) rq.push(["Tên công ty gần giống / folder chưa gộp", `${st.khach_chua_khop} folder từ quét chưa khớp khách master`, "Cao", "#customer", "Rà soát"]);
  if (rs && rs.C && rs.C.so) rq.push(["Báo giá chưa ghép hóa đơn", `${rs.C.so} báo giá chưa đối chiếu`, "Cao", "#rasoat", "Ghép ngay"]);
  if (sk && sk.tk.tong) rq.push(["Sao kê chưa khớp", `${sk.tk.tong} giao dịch (${vnd(sk.tk.tong_tien)}) chờ duyệt`, "Cao", "#done", "Đối chiếu"]);
  if (rs && rs.B && rs.B.so) rq.push(["Thiếu MST", `${rs.B.so} khách chưa có mã số thuế`, "Trung binh", "#rasoat", "Bổ sung"]);
  if (rs && rs.D && rs.D.so) rq.push(["Gán KTV chưa chuẩn", `${rs.D.so} việc gán theo text`, "Trung binh", "#rasoat", "Map"]);
  if (rs && rs.A && rs.A.so) rq.push(["Thiếu phân loại khách", `${rs.A.so} khách chưa phân loại`, "Thap", "#rasoat", "Xác nhận"]);
  const rqHtml = rq.length ? rq.map((r) => `
    <div class="rq-row"><span><b>${esc(r[0])}</b><span class="muted">${esc(r[1])}</span></span>
      <span class="chip ${r[2] === "Cao" ? "danger" : r[2] === "Trung binh" ? "warn" : "neutral"}">${esc(viStatus(r[2]))}</span>
      <button class="btn ghost btn-sm" data-go3="${esc(r[3])}">${esc(r[4])}</button></div>`).join("")
    : `<div class="empty">✅ Không còn mục chờ rà soát${rs ? "" : " (vai trò này không xem được rà soát)"}.</div>`;

  // Thiếu dữ liệu cần bổ sung (đếm live từ ra_soat)
  const thieu = rs ? [
    ["Khách hàng chưa có MST", rs.B ? rs.B.so : 0],
    ["Khách chưa phân loại", rs.A ? rs.A.so : 0],
    ["Báo giá chưa ghép hóa đơn", rs.C ? rs.C.so : 0],
    ["Việc chưa gán KTV chuẩn", rs.D ? rs.D.so : 0],
    ["HĐ bảo trì thiếu chu kỳ", rs.E ? rs.E.so : 0],
    ["Khách thiếu SĐT", rs.G ? rs.G.thieu_sdt : 0],
  ].filter((r) => r[1] > 0) : [];
  const thieuHtml = rs ? (thieu.length ? thieu.map((r) => `
      <div class="rq-row"><span><b>${esc(r[0])}</b></span><b>${r[1]}</b>
        <button class="btn ghost btn-sm" data-go3="#rasoat">Xem chi tiết</button></div>`).join("")
      : `<div class="empty">✅ Dữ liệu đã đầy đủ.</div>`)
    : `<div class="empty">Vai trò này không xem được rà soát dữ liệu.</div>`;

  // Đối chiếu sao kê & công nợ (live từ sao_ke_cho_duyet + doi_chieu_cong_no)
  const dcHtml = (sk || dcc) ? `
    <div class="tiles-3">
      <div class="tile ok">Đã ghép tự động<b>${sk ? sk.da_khop.n : "—"}</b></div>
      <div class="tile warn">Chờ xác nhận<b>${sk ? sk.tk.tong : "—"}</b></div>
      <div class="tile danger">Khách chưa đối chiếu<b>${dcc ? dcc.chua_dc : "—"}</b></div>
    </div>
    ${sk && sk.rows.length ? table(["Ngày GD", "Số tiền", "Nội dung", "Đối tượng (đoán)"],
      sk.rows.slice(0, 3).map((r) => [esc(fmtDate(r.ngay)), `<span class="money">${vnd(r.so_tien)}</span>`,
        `<span class="muted" style="font-size:11.5px">${esc(String(r.noi_dung || "").slice(0, 42))}</span>`,
        esc(r.customer_name || "CHƯA RÕ")])) : ""}
    <div class="toolbar" style="margin:10px 0 0"><button class="btn primary" data-go3="#done" style="width:100%">Mở đối chiếu</button></div>`
    : `<div class="empty">Vai trò này không xem được sao kê / công nợ.</div>`;

  el.innerHTML = `
    ${projectProfileImportPanel()}
    ${metrics([
      ["Khách hàng trong DB", String(st.khach), "", "info", "people"],
      ["Hóa đơn bán ra đã import", String(st.hoa_don_ban_ra), "", "ok", "doc"],
      ["Tài liệu đã quét", scan && scan.has_scan ? String(scan.documents) : "—", scan && scan.has_scan ? "từ " + (scan.source_dir || "") : "chưa quét nguồn", "info", "db"],
      ["Công ty chờ rà soát", String(st.khach_chua_khop || 0), "folder chưa khớp master", st.khach_chua_khop ? "warn" : "ok", "company"],
      ["Mục cần rà soát", rs ? String(rs.tong_can_xu_ly) : "—", "nhóm A–E", rs && rs.tong_can_xu_ly ? "danger" : "ok", "alert"],
      ["Sao kê chưa ghép", sk ? String(sk.tk.tong) : "—", sk && sk.tk.tong ? vnd(sk.tk.tong_tien) : "", sk && sk.tk.tong ? "warn" : "ok", "bank"]])}
    <div class="grid cols-2" style="margin-top:14px">
      ${panel("Nguồn nhập liệu", table(["Nguồn", "Loại", "Dữ liệu hiện có", "Trạng thái"], srcRows))}
      <section class="panel"><div class="panel-head"><h2 class="panel-title">Hàng chờ rà soát</h2>
        <button class="btn ghost btn-sm" data-go3="#rasoat">Xem tất cả →</button></div>
      <div class="panel-body">${rqHtml}</div></section>
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      ${panel("Thiếu dữ liệu cần bổ sung", thieuHtml)}
      ${panel("Đối chiếu sao kê & công nợ", dcHtml)}
    </div>
    ${canCost() ? `<div class="section-name">Hóa đơn ĐẦU VÀO (giá vốn) — WO-23</div>
    <div class="grid cols-2">
      <div class="panel"><div class="panel-head"><h2 class="panel-title">📥 Nạp hóa đơn đầu vào (file mẫu chuẩn)</h2>
        <span class="chip info">2 pha: xem trước → duyệt → ghi</span></div>
        <div class="panel-body">
          <div class="muted" style="margin-bottom:8px">Gom theo (Số HĐ · ngày · MST NCC); tự phân loại thiết bị/vật tư/chi phí + khớp giá vốn. Dòng mập mờ đưa vào duyệt — không tự đoán.</div>
          <div class="toolbar"><label class="btn primary" style="cursor:pointer">📤 Chọn file hóa đơn đầu vào
            <input type="file" id="hdmv-file" accept=".xlsx,.xls" style="display:none"></label>
            <button class="btn ghost" id="hdmv-clear" style="display:none">Xóa xem trước</button></div>
          <div id="hdmv-out"></div>
        </div></div>
      <div class="panel"><div class="panel-head"><h2 class="panel-title">🧩 Import LINH HOẠT (file NCC/khách không chuẩn mẫu)</h2>
        <span class="chip warn">bản đồ cột</span></div>
        <div class="panel-body">
          <div class="muted" style="margin-bottom:8px">File Excel cột lung tung → xem lưới thô → gán vai trò từng cột → hệ nhớ để tự áp lần sau. Mời thầu khách → tạo báo giá nháp thẳng (WO-16).</div>
          <div class="toolbar"><label class="btn primary" style="cursor:pointer">📤 Chọn file bất kỳ
            <input type="file" id="flex-file" accept=".xlsx,.xls,.csv" style="display:none"></label></div>
          <div id="flex-out"></div>
        </div></div>
    </div>` : `<div class="empty" style="margin:14px 0">🔒 Nhập hóa đơn đầu vào (giá vốn) chỉ dành cho Giám đốc / Kế toán / Quản trị.</div>`}
    <div class="section-name">Thao tác import — ghi thật vào DB (xem trước không ghi)</div>
    <div class="grid cols-2">
      ${card("imp-kh", "1) Danh bạ khách — Customer data.xlsx", "Danh sách khách chuẩn, MST chống trùng. Cập nhật thông tin thiếu, không ghi đè tên.", "Import (ghi thật)")}
      ${card("imp-hd", "2) Hóa đơn BÁN RA — file Invoice*.xlsx", "Gom theo Mã HĐ, chống trùng (import lại không nhân đôi), tự tạo khách từ HĐ.", "Import (ghi thật)")}
      <div class="panel"><div class="panel-head"><h2 class="panel-title">4) Đối chiếu báo giá ↔ hóa đơn</h2></div>
        <div class="panel-body"><div class="muted" style="margin-bottom:8px">"Báo giá có hóa đơn khớp = việc ĐÃ XONG." Khớp theo MST + số tiền ±15% + ngày. Khớp mờ → cần anh xác nhận.</div>
        <div class="toolbar"><button class="btn primary" id="btn-doichieu">Chạy đối chiếu</button></div>
        <pre class="import-out" id="dc-out">${esc(JSON.stringify(st.doi_chieu))}</pre></div></div>
      <div class="panel"><div class="panel-head"><h2 class="panel-title">5) Sao kê ngân hàng — ACB (.xlsx) / VCB (.xls)</h2></div>
        <div class="panel-body"><div class="muted" style="margin-bottom:8px">
          Nạp sao kê → hệ tự lọc tiền khách trả (loại lãi, lương, chuyển giữa 2 TK của mình) và ĐOÁN SẴN khách/hóa đơn kèm lý do + độ tin cậy. Anh duyệt ở trang <b>"Đã hoàn thành"</b> — hệ không tự chốt.</div>
          <div class="toolbar">
            <button class="btn primary" id="sk-quet">Quét thư mục sao kê (D:\\2026\\Sao kê 2025-2026)</button>
            <label class="btn ghost" style="cursor:pointer">📤 Upload file sao kê tháng mới
              <input type="file" id="sk-file" accept=".xls,.xlsx" multiple style="display:none"></label>
            <button class="btn ghost" id="sk-duyet">→ Duyệt khớp</button>
          </div>
          <pre class="import-out" id="sk-out"></pre></div></div>
    </div>
    <div style="margin-top:14px">${panel("Liên kết hệ thống",
      `<div class="muted" style="font-size:12px;margin-bottom:10px">Dữ liệu sau khi import và rà soát sẽ được sử dụng trong các phân hệ liên quan để đảm bảo luồng dữ liệu thống nhất.</div>
      <div class="quick-grid">
        <button class="quick-card" data-go3="#congty"><span class="qc-ico">${ICO.board}</span><b>HĐQT & Công ty</b><span>Bảng điều khiển theo Công ty</span></button>
        <button class="quick-card info" data-go3="#quotation"><span class="qc-ico">${ICO.doc}</span><b>Báo giá & Hợp đồng</b><span>Báo giá, chứng từ, công trình</span></button>
        <button class="quick-card ok" data-go3="#done"><span class="qc-ico">${ICO.bank}</span><b>Đối chiếu tài chính</b><span>Công nợ, thanh toán, sao kê</span></button>
        <button class="quick-card purple" data-go3="#documents"><span class="qc-ico">${ICO.folder}</span><b>Hồ sơ & Lưu trữ</b><span>Hồ sơ pháp lý, chứng từ, file scan</span></button>
      </div>`)}</div>`;
  mountProjectProfileImport(el);
  el.querySelectorAll("[data-go3]").forEach((b) =>
    b.addEventListener("click", () => { location.hash = b.dataset.go3; }));
  const run = async (outId, body) => {
    const out = $(outId, el); out.textContent = "⏳ Đang chạy…";
    try {
      const r = await apiPost("import_run", body);
      out.textContent = JSON.stringify(r.ket_qua.stats || r.ket_qua, null, 1);
      toast(body.commit ? "Đã ghi vào DB." : "Xem trước — CHƯA ghi.");
    } catch (e) { out.textContent = "❌ " + e.message; }
  };
  $("#imp-kh-prev", el).onclick = () => run("#imp-kh-out", { loai: "customers" });
  $("#imp-kh-go", el).onclick = () => run("#imp-kh-out", { loai: "customers", commit: true });
  $("#imp-hd-prev", el).onclick = () => run("#imp-hd-out", { loai: "invoices" });
  $("#imp-hd-go", el).onclick = () => run("#imp-hd-out", { loai: "invoices", commit: true });
  if (canCost()) { mountHdDauVao(el); mountImportFlex(el); }
  $("#btn-doichieu", el).onclick = async () => {
    const out = $("#dc-out", el); out.textContent = "⏳…";
    try { const r = await apiPost("import_run", { loai: "doichieu" });
      out.textContent = JSON.stringify(r.ket_qua); toast("Đối chiếu xong.");
    } catch (e) { out.textContent = "❌ " + e.message; }
  };
  // --- WO-18: sao ke ---
  $("#sk-quet", el).onclick = async () => {
    const out = $("#sk-out", el); out.textContent = "⏳ Đang quét + khớp…";
    try {
      const r = await apiPost("import_run", { loai: "sao_ke", commit: true });
      out.textContent = JSON.stringify(r.ket_qua, null, 1);
      toast("Đã nạp sao kê — vào 'Đã hoàn thành' để duyệt khớp.");
    } catch (e) { out.textContent = "❌ " + e.message; }
  };
  $("#sk-file", el).addEventListener("change", async (e) => {
    const out = $("#sk-out", el);
    for (const f of e.target.files) {
      out.textContent = "⏳ Đang upload " + f.name + "…";
      try {
        const b64 = await new Promise((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(String(rd.result).split(",")[1]);
          rd.onerror = rej;
          rd.readAsDataURL(f);
        });
        const r = await apiPost("sao_ke_upload", { filename: f.name, data_b64: b64 });
        out.textContent = f.name + " ✓\n" + JSON.stringify(r.ket_qua, null, 1);
        toast("Đã nhận " + f.name + " — hệ tự nhận diện ACB/VCB và khớp sẵn.");
      } catch (err) { out.textContent = "❌ " + f.name + ": " + err.message; }
    }
    e.target.value = "";
  });
  $("#sk-duyet", el).onclick = () => { location.hash = "#done"; };
};

/* ==== WO-24: Upload hồ sơ vào folder khách + Mở folder (backend upload_ho_so/open_folder ĐÃ SẴN SÀNG) ==== */
// doc_type theo §2 (chiều tài liệu). supplier_name chỉ hiện khi doc_type = bao_gia_dau_vao.
const DOC_TYPES = [
  ["bao_gia", "Báo giá mình xuất (→ thư mục Báo giá)"],
  ["moi_thau", "Mời thầu khách (→ Hồ sơ công trình)"],
  ["bao_gia_dau_vao", "Báo giá NCC gửi mình (→ Báo giá đầu vào)"],
  ["hop_dong", "Hợp đồng (→ Hợp đồng)"],
  ["bbnt", "Biên bản nghiệm thu (→ BBNT)"],
  ["bqt", "Bảng quyết toán (→ BQT)"],
  ["de_nghi_tt", "Thư đề nghị thanh toán"],
  ["ho_so_cong_trinh", "Hồ sơ công trình (9 giai đoạn)"],
  ["ban_ve", "Bản vẽ"],
  ["khac", "Khác (→ Hồ sơ công trình)"]];
function uploadHoSoModal(cid, khName, after) {
  const w = openModal("📤 Upload hồ sơ — " + (khName || "khách"),
    fS("doc_type", "Loại tài liệu (quyết định thư mục đích)", DOC_TYPES.map((d) => [d[0], d[1]])) +
    `<div class="f" id="sup-wrap" style="display:none"><label>Tên nhà cung cấp (NCC)</label><input name="supplier_name" placeholder="vd: Lucas"></div>` +
    fI("project_id", "Mã dự án (tùy chọn)", "text") +
    `<div class="f wide"><label>Chọn file (.pdf/.xlsx/.xls/.docx/.jpg/.png — tối đa ~15MB)</label>
      <input type="file" name="file" accept=".pdf,.xlsx,.xls,.docx,.jpg,.jpeg,.png" required></div>
     <div class="f wide muted" style="font-size:12px">File sẽ được cất vào đúng <b>folder công ty trên đĩa</b> (D:\\&lt;năm&gt;\\...) rồi index ngay — app không giữ kho file riêng.</div>`,
    async (fd) => {
      const f = fd.get("file");
      if (!f || !f.name) throw new Error("Chọn 1 file để upload.");
      if (f.size > 15 * 1024 * 1024) throw new Error("File quá 15MB.");
      const b64 = await fileToB64(f);
      const r = await apiPost("write/upload_ho_so", {
        customer_id: cid, project_id: fd.get("project_id") || null,
        doc_type: fd.get("doc_type"), supplier_name: fd.get("supplier_name") || null,
        filename: f.name, file_b64: b64 });
      closeModal();
      toast("Đã lưu vào " + (r.rel_path || "folder khách") + " — đã index.");
      if (after) after();
    }, "Upload");
  // hiện ô NCC khi chọn báo giá đầu vào
  const sel = $('#modal-form select[name="doc_type"]', w);
  const toggle = () => { $("#sup-wrap", w).style.display = sel.value === "bao_gia_dau_vao" ? "" : "none"; };
  if (sel) { sel.addEventListener("change", toggle); toggle(); }
}
async function openFolderHoSo(cid) {
  try {
    await apiPost("open_folder", { customer_id: cid });
    toast("Đã mở folder hồ sơ khách trên máy.");
  } catch (e) {
    toast(e.message || "Lỗi", false);
  }
}
function bindHoSoButtons(root, cid, khName, after) {
  const up = $("#btn-upload-hoso", root), of = $("#btn-open-folder", root);
  if (up) up.onclick = () => uploadHoSoModal(cid, khName, after);
  if (of) of.onclick = () => openFolderHoSo(cid);
}

/* ==== WO-23 §2a: luồng "Hóa đơn đầu vào" — preview 2 khối + popup duyệt + commit 2 pha ==== */
const COST_TYPES = [
  ["thiet_bi", "Thiết bị"], ["vat_tu", "Vật tư"], ["nhan_cong_thue_ngoai", "Nhân công / thuê ngoài"],
  ["van_chuyen", "Vận chuyển"], ["dich_vu", "Dịch vụ"], ["chi_phi_phu", "Chi phí phụ"], ["khac", "Khác"]];
const COST_TYPE_LABEL = Object.fromEntries(COST_TYPES);
function costTypeChip(ct) {
  const kind = ct === "thiet_bi" ? "info" : ct === "vat_tu" ? "purple"
    : ct === "nhan_cong_thue_ngoai" ? "warn" : "neutral";
  return `<span class="chip ${kind}">${esc(COST_TYPE_LABEL[ct] || ct || "—")}</span>`;
}
function matchStatusChip(s) {
  const map = { auto: ["ok", "Tự khớp"], pending: ["warn", "Cần duyệt"], unmatched: ["neutral", "Chưa khớp"],
    confirmed: ["ok", "Đã duyệt"] };
  const m = map[s] || ["neutral", s || "—"];
  return `<span class="chip ${m[0]}">${esc(m[1])}</span>`;
}
// đọc file -> base64 (không phần header data:)
function fileToB64(f) {
  return new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onload = () => res(String(rd.result).split(",")[1]);
    rd.onerror = rej;
    rd.readAsDataURL(f);
  });
}

function mountHdDauVao(root) {
  const inp = $("#hdmv-file", root), out = $("#hdmv-out", root), clr = $("#hdmv-clear", root);
  if (!inp) return;
  let PV = null;                 // preview trả về
  const overrides = {};          // "so_hd|ten" -> {so_hd,ten,cost_type,item_key,stock_impact,match_status:"confirmed"}
  const key = (soHd, ten) => soHd + "|" + ten;

  const draw = () => {
    if (!PV) { out.innerHTML = ""; clr.style.display = "none"; return; }
    clr.style.display = "";
    const s = PV.summary || {};
    const conLai = (PV.dong || []).filter((d) => {
      const ov = overrides[key(d.so_hd, d.ten_hang_hoa)];
      const st = ov ? "confirmed" : d.match_status;
      return st === "pending" || st === "unmatched";
    }).length;
    const hdRows = (PV.hoa_don || []).map((h) => [
      `<span class="code">${esc(h.ma_hd)}</span>`, esc(fmtDate(h.ngay)), esc(h.ncc),
      esc(h.mst || "—"), String(h.so_dong), `<span class="money">${vnd(h.tong)}</span>`,
      h.trung ? chip("Trùng — bỏ qua") : chip("Mới")]);
    const dongRows = (PV.dong || []).map((d, i) => {
      const ov = overrides[key(d.so_hd, d.ten_hang_hoa)];
      const ct = ov ? ov.cost_type : d.cost_type;
      const st = ov ? "confirmed" : d.match_status;
      const stock = ov ? ov.stock_impact : d.stock_impact;
      return [`<span class="muted">${esc(d.so_hd)}</span>`,
        `<div style="max-width:280px">${esc(d.ten_hang_hoa)}</div>`,
        esc(d.dvt || "—"), Number(d.so_luong || 0).toLocaleString("vi-VN"),
        `<span class="money">${vnd(d.don_gia)}</span>`, costTypeChip(ct),
        stock ? '<span title="Vào tồn kho">📦</span>' : '<span class="muted">—</span>',
        matchStatusChip(st),
        (st === "confirmed" || st === "auto") ? "" :
          `<button class="btn ghost btn-sm hdmv-fix" data-i="${i}">Duyệt</button>`];
    });
    out.innerHTML = `
      <div class="tiles-3" style="margin:10px 0">
        <div class="tile info">Hóa đơn<b>${s.hoa_don || 0}</b></div>
        <div class="tile ok">Dòng tự khớp<b>${s.auto || 0}</b></div>
        <div class="tile ${conLai ? "warn" : "ok"}">Dòng cần duyệt<b>${conLai}</b></div>
      </div>
      ${PV.so_trung ? `<div class="muted" style="font-size:12px;margin-bottom:8px">⚠️ ${PV.so_trung} hóa đơn đã có trong hệ (trùng) sẽ được bỏ qua khi ghi.</div>` : ""}
      ${panel("Hóa đơn (" + (PV.hoa_don || []).length + ")", table(
        ["Mã HĐ", "Ngày", "Nhà cung cấp", "MST", "Số dòng", "Tổng", "Trạng thái"], hdRows, { empty: "Không đọc được hóa đơn nào." }))}
      <div style="margin-top:12px">${panel("Dòng hàng (" + (PV.dong || []).length + ")", table(
        ["Số HĐ", "Tên hàng", "ĐVT", "SL", "Đơn giá", "Loại chi phí", "Kho", "Khớp", ""], dongRows,
        { empty: "Không có dòng hàng." }))}</div>
      <div class="toolbar" style="margin-top:12px">
        ${conLai ? `<button class="btn primary" id="hdmv-review">Duyệt ${conLai} dòng mập mờ</button>` : ""}
        <button class="btn primary" id="hdmv-commit" ${conLai ? "disabled title='Duyệt hết dòng mập mờ trước khi ghi'" : ""}>Ghi vào hệ thống</button>
        <span class="muted" style="font-size:11.5px">${conLai ? "Còn " + conLai + " dòng chưa duyệt — chưa ghi được." : "✓ Sẵn sàng ghi"}</span>
      </div>`;
    // wire duyệt từng dòng + duyệt loạt
    out.querySelectorAll(".hdmv-fix").forEach((b) => b.addEventListener("click", () => fixLine(Number(b.dataset.i))));
    const rv = $("#hdmv-review", out); if (rv) rv.onclick = reviewAll;
    const cm = $("#hdmv-commit", out); if (cm) cm.onclick = commit;
  };

  const fixLine = (i) => {
    const d = PV.dong[i];
    const cur = overrides[key(d.so_hd, d.ten_hang_hoa)] || d;
    openModal(`Duyệt dòng: ${d.ten_hang_hoa}`.slice(0, 60),
      `<div class="f wide"><label>Tên hàng (từ file)</label><div class="form-value">${esc(d.ten_hang_hoa)}</div></div>` +
      fS("cost_type", "Loại chi phí *", COST_TYPES.map((c) => [c[0], c[1]])) +
      fI("item_key", "Mã quy chuẩn (item_key) — để trống nếu chưa chuẩn hóa", "text", `value="${esc(cur.item_key || "")}"`) +
      `<div class="f"><label>Vào tồn kho?</label><select name="stock_impact"><option value="1">Có (thiết bị/vật tư)</option><option value="0">Không (chi phí)</option></select></div>`,
      async (fd) => {
        const ct = fd.get("cost_type");
        overrides[key(d.so_hd, d.ten_hang_hoa)] = {
          so_hd: d.so_hd, ten: d.ten_hang_hoa, cost_type: ct,
          item_key: (fd.get("item_key") || "").trim() || d.item_key,
          stock_impact: Number(fd.get("stock_impact")), match_status: "confirmed" };
        closeModal(); toast("Đã duyệt dòng — chưa ghi DB."); draw();
      }, "Xác nhận dòng");
    // preset cost_type + stock theo dòng hiện tại
    const sel = document.querySelector('#modal-form select[name="cost_type"]');
    if (sel) sel.value = cur.cost_type || "khac";
    const ss = document.querySelector('#modal-form select[name="stock_impact"]');
    if (ss) ss.value = String(cur.stock_impact != null ? cur.stock_impact : (cur.cost_type === "thiet_bi" || cur.cost_type === "vat_tu" ? 1 : 0));
  };
  const reviewAll = () => {
    const pend = PV.dong.map((d, i) => ({ d, i })).filter(({ d }) => {
      const ov = overrides[key(d.so_hd, d.ten_hang_hoa)];
      const st = ov ? "confirmed" : d.match_status;
      return st === "pending" || st === "unmatched";
    });
    if (pend.length) fixLine(pend[0].i);
  };
  const commit = async () => {
    const btn = $("#hdmv-commit", out); btn.disabled = true; btn.textContent = "Đang ghi…";
    try {
      const r = await apiPost("import_hd_dauvao_commit", {
        confirm_token: PV.confirm_token, overrides: Object.values(overrides) });
      toast(`Đã ghi: ${r.hoa_don_moi || 0} HĐ · ${r.dong || 0} dòng · ${r.cost_rows || 0} giá vốn · ${r.stock_rows || 0} tồn kho.`);
      PV = null; inp.value = ""; draw();
    } catch (e) {
      btn.disabled = false; btn.textContent = "Ghi vào hệ thống";
      toast("Lỗi ghi: " + (e.message || ""), false);
    }
  };

  inp.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    out.innerHTML = `<div class="loading">Đang đọc & phân loại ${esc(f.name)}…</div>`;
    clr.style.display = "";
    try {
      const b64 = await fileToB64(f);
      PV = await apiPost("import_hd_dauvao_preview", { filename: f.name, file_b64: b64 });
      if (PV.ok === false) { out.innerHTML = `<div class="empty">❌ ${esc(PV.error || "Không đọc được file")}</div>`; PV = null; return; }
      Object.keys(overrides).forEach((k) => delete overrides[k]);
      draw();
    } catch (err) { out.innerHTML = `<div class="empty">❌ ${esc(err.message || "Lỗi đọc file")}</div>`; PV = null; }
  });
  clr.addEventListener("click", () => { PV = null; inp.value = ""; Object.keys(overrides).forEach((k) => delete overrides[k]); draw(); });
}

/* ==== WO-23 §5b / §2e + WO-29: Import LINH HOẠT — lưới thô → bản đồ cột → preview → ghi
   thật (giá NCC / hóa đơn đầu vào / báo giá / BBNT / PXK). Backend import_flex_* ĐÃ SẴN
   SÀNG (WO-23 B9) — 5 scope đều ghi thật, không còn 404. */
const FLEX_ROLES = [
  ["", "— Bỏ qua —"], ["ten_hang", "Tên hàng"], ["model", "Model"], ["quy_cach", "Quy cách"],
  ["so_luong", "Số lượng"], ["dvt", "ĐVT"], ["don_gia", "Đơn giá"],
  ["thanh_tien", "Thành tiền"], ["thue_suat", "Thuế suất"]];
// WO-29 Phase 1: BBNT/PXK có hình dạng dòng KHÁC hẳn hàng hoá — vai trò cột riêng.
const FLEX_ROLES_BBNT = [
  ["", "— Bỏ qua —"], ["ten_hang", "Hạng mục"], ["don_gia", "Đơn giá"], ["thanh_tien", "Thành tiền"],
  ["kl_hop_dong", "KL hợp đồng"], ["kl_thuc_te", "KL thực tế"], ["ket_qua", "Kết quả"], ["ghi_chu", "Ghi chú"]];
const FLEX_ROLES_PXK = [
  ["", "— Bỏ qua —"], ["ten_hang", "Tên hàng"], ["model", "Model"], ["dvt", "ĐVT"],
  ["so_luong", "Số lượng"], ["ghi_chu", "Ghi chú"]];
function rolesForFlexScope(scope) {
  if (scope === "bbnt_cu") return FLEX_ROLES_BBNT;
  if (scope === "pxk_cu") return FLEX_ROLES_PXK;
  return FLEX_ROLES;
}
// scope nào cần chọn KHÁCH HÀNG thật (dùng lại khDatalist()/khId() — KHÔNG tự chế control mới)
const WO29_NEEDS_CUSTOMER = new Set(["moi_thau_khach", "bbnt_cu", "pxk_cu"]);
// màu vai trò trên lưới (dùng data-role + CSS token); ten_hang gộp được nhiều cột
const FLEX_MERGEABLE = new Set(["ten_hang"]);
function mountImportFlex(root) {
  const inp = $("#flex-file", root), out = $("#flex-out", root);
  if (!inp) return;
  let PV = null, fileB64 = null, fileName = null;
  // state bản đồ cột — tương tác trực tiếp trên lưới
  let colRoles = {};          // ci -> role
  let selCols = new Set();    // chọn cả CỘT (Excel-style)
  let anchor = null, dragging = false;
  let selRect = null;         // chọn VÙNG Ô: {r1,c1,r2,c2}
  let cellAnchor = null, cellDragging = false;
  let headerRow = 0, dataStart = 1;
  const rectNorm = (a, b) => ({ r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r), c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c) });

  const draw = () => {
    if (!PV) { out.innerHTML = ""; return; }
    const sheets = PV.sheets || [];
    const gp = PV.profile_goi_y || null;
    // khởi tạo state từ mẫu đã lưu (nếu có)
    colRoles = {}; selCols = new Set(); anchor = null;
    headerRow = gp ? (gp.header_row || 0) : 0;
    dataStart = gp ? (gp.data_start_row != null ? gp.data_start_row : headerRow + 1) : 1;
    if (gp && gp.col_map) Object.entries(gp.col_map).forEach(([role, idx]) => {
      (Array.isArray(idx) ? idx : [idx]).forEach((c) => { colRoles[c] = role; });
    });
    out.innerHTML = `
      ${gp ? `<div class="chip ok" style="margin:8px 0">Đã nhận diện mẫu đã lưu: ${esc(gp.ten_profile || "")} — bản đồ cột điền sẵn, sửa nếu cần.</div>` : ""}
      <div class="flex-help muted">👉 <b>Kéo trong lưới</b> để chọn vùng ô (như Excel — hợp file có 2 bảng chồng nhau), hoặc <b>bấm ô đầu cột</b> để chọn cả cột (Shift/Ctrl chọn nhiều). Chọn xong <b>bấm chuột phải → chọn vai trò</b> (Tên hàng / Model / Đơn giá / ĐVT…), hoặc dùng thanh gán bên dưới. <b>Bấm số dòng</b> để đặt dòng tiêu đề.</div>
      <div class="flex-legend" id="flex-legend">${legendHtml("bao_gia_ncc")}</div>
      <div id="flex-zone">
        <div class="flex-zone-bar">
          <button type="button" class="btn ghost btn-sm" id="flex-zoom">⛶ Phóng to lưới</button>
          <button type="button" class="btn ghost btn-sm" id="flex-zoom-close" style="display:none">✕ Thu nhỏ</button>
          <span class="muted" style="font-size:11px" id="flex-sel-hint"></span>
        </div>
        <div id="flex-selbar" class="flex-selbar" style="display:none"></div>
        <div id="flex-grid-wrap"></div>
      </div>
      <div class="form-grid cols-3" style="margin-top:10px">
        <div class="f"><label>Sheet</label><select id="flex-sheet">${sheets.map((s, si) =>
          `<option value="${esc(s)}" ${si === 0 ? "selected" : ""}>${esc(s)}</option>`).join("") || "<option>(sheet 1)</option>"}</select></div>
        <div class="f"><label>Dòng tiêu đề (header)</label><input type="number" id="flex-hdr" min="0" value="${headerRow}" style="width:90px"></div>
        <div class="f"><label>Dòng bắt đầu dữ liệu</label><input type="number" id="flex-data" min="0" value="${dataStart}" style="width:90px"></div>
      </div>
      <div class="form-grid cols-3" style="margin-top:8px">
        <div class="f"><label>Loại nguồn (scope)</label><select id="flex-scope">
          <option value="bao_gia_ncc">Báo giá NCC (giá vốn)</option>
          <option value="moi_thau_khach">Mời thầu khách → tạo báo giá</option>
          <option value="hoa_don_dau_vao">Hóa đơn đầu vào (chưa chuẩn)</option>
          <option value="bbnt_cu">BBNT cũ / không chuẩn</option>
          <option value="pxk_cu">Phiếu xuất kho cũ / không chuẩn</option></select></div>
        <div id="flex-partner-cell"><div class="f"><label>Đối tác (NCC)</label><input id="flex-doitac" placeholder="Tên NCC hoặc khách"></div></div>
        <div class="f"><label><input type="checkbox" id="flex-save"> Lưu bản đồ này</label>
          <input id="flex-name" placeholder="Tên mẫu (vd: Báo giá Lucas)" style="margin-top:4px"></div>
      </div>
      <div class="form-grid cols-3" id="flex-scope-extra" style="margin-top:8px"></div>
      <div class="toolbar" style="margin-top:10px">
        <button class="btn primary" id="flex-map">Đọc theo bản đồ → xem trước dòng</button></div>
      <div id="flex-lines"></div>`;
    buildGrid();
    renderScopeExtra($("#flex-scope", out).value);
    // đồng bộ ô số ↔ lưới
    $("#flex-hdr", out).addEventListener("input", (e) => { headerRow = Number(e.target.value) || 0; dataStart = headerRow + 1; $("#flex-data", out).value = dataStart; paintRows(); });
    $("#flex-data", out).addEventListener("input", (e) => { dataStart = Number(e.target.value) || 0; paintRows(); });
    $("#flex-map", out).onclick = doMap;
    // đổi scope: vai trò cột (BBNT/PXK khác hẳn hàng hoá) + ô đối tác (khách/NCC) + field phụ
    $("#flex-scope", out).addEventListener("change", async (e) => {
      colRoles = {}; clearSel();
      const cell = $("#flex-partner-cell", out);
      cell.innerHTML = WO29_NEEDS_CUSTOMER.has(e.target.value)
        ? await khDatalist()
        : `<div class="f"><label>Đối tác (NCC)</label><input id="flex-doitac" placeholder="Tên NCC hoặc khách"></div>`;
      renderScopeExtra(e.target.value);
      $("#flex-legend", out).innerHTML = legendHtml(e.target.value);
      buildGrid();      // dung lai grid da tai — chi doi lai option vai tro tren dau cot
    });
    // phóng to / thu nhỏ lưới
    const zone = $("#flex-zone", out);
    $("#flex-zoom", out).onclick = () => { zone.classList.add("flex-zoomed"); $("#flex-zoom", out).style.display = "none"; $("#flex-zoom-close", out).style.display = ""; };
    $("#flex-zoom-close", out).onclick = () => { zone.classList.remove("flex-zoomed"); $("#flex-zoom", out).style.display = ""; $("#flex-zoom-close", out).style.display = "none"; };
  };
  // WO-29: field phụ theo scope (Mã HĐ/MST cho hóa đơn đầu vào; Kết luận/Tồn đọng cho BBNT;
  // Kho/Người nhận cho PXK) — container riêng, không lẫn vào ô "đối tác".
  const renderScopeExtra = (scope) => {
    const box = $("#flex-scope-extra", out);
    if (!box) return;
    if (scope === "hoa_don_dau_vao") {
      box.innerHTML = `<div class="f"><label>Mã hóa đơn (tuỳ chọn)</label><input id="flex-ma-hd" placeholder="Để trống tự sinh FLEX-..."></div>
        <div class="f"><label>MST NCC (tuỳ chọn)</label><input id="flex-mst" placeholder="Mã số thuế NCC"></div>`;
    } else if (scope === "bbnt_cu") {
      box.innerHTML = `<div class="f"><label>Kết luận nghiệm thu *</label><select id="flex-ket-luan">
          <option value="">— Chọn —</option><option>Đạt</option><option>Đạt có điều kiện</option><option>Không đạt</option></select></div>
        <div class="f wide"><label>Tồn đọng (bắt buộc nếu "Đạt có điều kiện")</label><input id="flex-ton-dong" placeholder="Mô tả tồn đọng / yêu cầu khắc phục"></div>`;
    } else if (scope === "pxk_cu") {
      box.innerHTML = `<div class="f"><label>Kho (tuỳ chọn)</label><input id="flex-kho" placeholder="Tên kho"></div>
        <div class="f"><label>Người nhận (tuỳ chọn)</label><input id="flex-nguoinhan" placeholder="Tên người nhận"></div>`;
    } else {
      box.innerHTML = "";
    }
  };

  const curScope = () => ($("#flex-scope", out) || {}).value || "bao_gia_ncc";
  const legendHtml = (scope) => `${rolesForFlexScope(scope).filter((r) => r[0]).map((r) =>
      `<span class="flex-lg" data-role="${r[0]}"><i></i>${esc(r[1])}</span>`).join("")}
    <span class="flex-lg flex-lg-hdr"><i></i>Dòng tiêu đề</span>
    <span class="flex-lg flex-lg-data"><i></i>Dòng dữ liệu</span>`;

  // ---- dựng lưới thô 1 lần; tương tác sau đó chỉ tô lại class (mượt, không render lại) ----
  const buildGrid = () => {
    const grid = PV.grid || [];
    const ncol = grid.reduce((m, r) => Math.max(m, r.length), 0);
    const roleOpts = (ci) => rolesForFlexScope(curScope()).map((v) =>
      `<option value="${esc(v[0])}" ${(colRoles[ci] || "") === v[0] ? "selected" : ""}>${esc(v[1])}</option>`).join("");
    const head = `<tr class="flex-head">
      <th class="flex-corner">#</th>${Array.from({ length: ncol }, (_, ci) => `
        <th class="flex-colhead" data-c="${ci}" title="Bấm để chọn cột (kéo/Shift/Ctrl chọn nhiều)">
          <div class="flex-cn">Cột ${ci}</div>
          <select class="flex-col-sel" data-c="${ci}">${roleOpts(ci)}</select>
        </th>`).join("")}</tr>`;
    const body = grid.slice(0, 30).map((r, ri) => `
      <tr data-r="${ri}"><td class="flex-rownum" data-r="${ri}" title="Bấm: đặt làm dòng tiêu đề">${ri}</td>${
      Array.from({ length: ncol }, (_, ci) =>
        `<td data-r="${ri}" data-c="${ci}">${esc(String(r[ci] == null ? "" : r[ci]).slice(0, 40))}</td>`).join("")}</tr>`).join("");
    $("#flex-grid-wrap", out).innerHTML = `<div class="table-scroll flex-grid"><table class="flex-grid-tbl"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    wireGrid();
    paintRoles(); paintRows(); paintSelection();
  };

  const colsBetween = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); const s = new Set(); for (let i = lo; i <= hi; i++) s.add(i); return s; };
  const rangeCols = (rc) => { const a = []; for (let i = rc.c1; i <= rc.c2; i++) a.push(i); return a; };
  const clearSel = () => { selCols = new Set(); anchor = null; selRect = null; cellAnchor = null; paintSelection(); };
  // gán vai trò cho phần đang chọn — vùng ô HOẶC cột
  const assignRole = (role) => {
    const cols = selRect ? rangeCols(selRect) : [...selCols];
    if (!cols.length) return;
    cols.forEach((ci) => { colRoles[ci] = role; const s = out.querySelector(`.flex-col-sel[data-c="${ci}"]`); if (s) s.value = role; });
    // chọn theo VÙNG Ô → suy dòng dữ liệu từ vùng (tiện file có 2 bảng chồng nhau)
    if (selRect && role) {
      dataStart = selRect.r1;
      if (headerRow >= dataStart) headerRow = Math.max(0, dataStart - 1);
      const hi = $("#flex-hdr", out), di = $("#flex-data", out);
      if (hi) hi.value = headerRow; if (di) di.value = dataStart;
      paintRows();
    }
    paintRoles();
    // cột đơn-vai-trò: bỏ chọn sau khi gán; giữ chọn nếu là "Tên hàng" gộp nhiều cột
    if (FLEX_MERGEABLE.has(role) && !selRect) paintSelection(); else clearSel();
  };
  const paintSelection = () => {
    out.querySelectorAll(".flex-grid th.flex-colhead").forEach((el) => el.classList.toggle("flex-c-sel", selCols.has(Number(el.dataset.c))));
    out.querySelectorAll(".flex-grid td[data-c]").forEach((el) => {
      const c = Number(el.dataset.c), r = Number(el.dataset.r);
      el.classList.toggle("flex-c-sel", selCols.has(c));
      el.classList.toggle("flex-cell-sel", !!(selRect && r >= selRect.r1 && r <= selRect.r2 && c >= selRect.c1 && c <= selRect.c2));
    });
    const bar = $("#flex-selbar", out), hint = $("#flex-sel-hint", out);
    if (!selCols.size && !selRect) { bar.style.display = "none"; if (hint) hint.textContent = ""; return; }
    bar.style.display = "";
    const desc = selRect ? `vùng: dòng ${selRect.r1}–${selRect.r2} × cột ${selRect.c1}–${selRect.c2}` : `${selCols.size} cột`;
    if (hint) hint.textContent = "Đã chọn " + desc + " — bấm chuột phải để gán vai trò.";
    bar.innerHTML = `<b>Đã chọn ${esc(desc)}</b> → gán vai trò:
      <select id="flex-bulk">${rolesForFlexScope(curScope()).map((v) => `<option value="${esc(v[0])}">${esc(v[1])}</option>`).join("")}</select>
      <span class="muted" style="font-size:11.5px">(Tên hàng gộp được nhiều cột)</span>
      <button class="btn ghost btn-sm" id="flex-clearsel">Bỏ chọn</button>`;
    $("#flex-bulk", bar).onchange = (e) => assignRole(e.target.value);
    $("#flex-clearsel", bar).onclick = clearSel;
  };
  // menu chuột phải gán vai trò
  let roleMenuEl = null;
  const hideRoleMenu = () => { if (roleMenuEl) { roleMenuEl.remove(); roleMenuEl = null; } };
  const showRoleMenu = (x, y) => {
    hideRoleMenu();
    roleMenuEl = document.createElement("div");
    roleMenuEl.className = "flex-ctx";
    roleMenuEl.innerHTML = `<div class="flex-ctx-h">Gán vai trò cho vùng chọn</div>` +
      rolesForFlexScope(curScope()).map((v) => `<button type="button" class="flex-ctx-i" data-role="${esc(v[0])}"><i class="flex-sw" data-role="${esc(v[0])}"></i>${esc(v[1])}</button>`).join("");
    document.body.appendChild(roleMenuEl);
    roleMenuEl.style.left = Math.min(x, window.innerWidth - roleMenuEl.offsetWidth - 8) + "px";
    roleMenuEl.style.top = Math.min(y, window.innerHeight - roleMenuEl.offsetHeight - 8) + "px";
    roleMenuEl.querySelectorAll(".flex-ctx-i").forEach((b) => b.onclick = () => { assignRole(b.dataset.role); hideRoleMenu(); });
  };
  if (!mountImportFlex._menuWired) { mountImportFlex._menuWired = true; document.addEventListener("click", () => { const m = document.querySelector(".flex-ctx"); if (m) m.remove(); }); }
  const paintRoles = () => {
    const ncol = out.querySelectorAll(".flex-colhead").length;
    for (let ci = 0; ci < ncol; ci++) {
      const role = colRoles[ci] || "";
      out.querySelectorAll(`.flex-grid [data-c="${ci}"]`).forEach((el) => { if (el.dataset.r != null || el.classList.contains("flex-colhead")) el.dataset.role = role; });
      const th = out.querySelector(`.flex-colhead[data-c="${ci}"]`);
      if (th) th.dataset.role = role;
    }
  };
  const paintRows = () => {
    out.querySelectorAll(".flex-grid tbody tr").forEach((tr) => {
      const ri = Number(tr.dataset.r);
      tr.classList.toggle("flex-row-hdr", ri === headerRow);
      tr.classList.toggle("flex-row-data", ri >= dataStart);
      tr.classList.toggle("flex-row-skip", ri < headerRow);
    });
  };
  const wireGrid = () => {
    // chọn CỘT: mousedown đầu cột (kéo để mở rộng), Shift/Ctrl để chọn nhiều
    out.querySelectorAll(".flex-colhead").forEach((th) => {
      const ci = Number(th.dataset.c);
      th.addEventListener("mousedown", (e) => {
        if (e.target.closest(".flex-col-sel")) return; // bấm vào dropdown thì thôi
        if (e.button === 2) return;                    // chuột phải để menu xử lý
        e.preventDefault();
        selRect = null; cellAnchor = null;             // đổi sang chế độ chọn cột
        if (e.shiftKey && anchor != null) selCols = colsBetween(anchor, ci);
        else if (e.ctrlKey || e.metaKey) { if (selCols.has(ci)) selCols.delete(ci); else selCols.add(ci); anchor = ci; }
        else { selCols = new Set([ci]); anchor = ci; }
        dragging = true; paintSelection();
      });
      th.addEventListener("mouseenter", () => { if (dragging && anchor != null) { selCols = colsBetween(anchor, ci); paintSelection(); } });
    });
    // chọn VÙNG Ô: kéo trong thân lưới (như Excel — hợp file 2 bảng chồng nhau)
    out.querySelectorAll(".flex-grid td[data-c][data-r]").forEach((td) => {
      const r = Number(td.dataset.r), c = Number(td.dataset.c);
      td.addEventListener("mousedown", (e) => {
        if (e.button === 2) return;
        e.preventDefault();
        selCols = new Set(); anchor = null;            // đổi sang chế độ chọn ô
        cellAnchor = { r, c }; selRect = rectNorm(cellAnchor, { r, c });
        cellDragging = true; paintSelection();
      });
      td.addEventListener("mouseenter", () => { if (cellDragging && cellAnchor) { selRect = rectNorm(cellAnchor, { r, c }); paintSelection(); } });
    });
    // gán vai trò trực tiếp trên đầu cột
    out.querySelectorAll(".flex-col-sel").forEach((s) => s.addEventListener("change", (e) => {
      colRoles[Number(s.dataset.c)] = e.target.value; paintRoles();
    }));
    // bấm số dòng → đặt dòng tiêu đề, dữ liệu bắt đầu ngay dưới
    out.querySelectorAll(".flex-rownum").forEach((td) => td.addEventListener("click", () => {
      headerRow = Number(td.dataset.r); dataStart = headerRow + 1;
      $("#flex-hdr", out).value = headerRow; $("#flex-data", out).value = dataStart; paintRows();
    }));
    // CHUỘT PHẢI → menu gán vai trò cho vùng/cột đang chọn
    $("#flex-grid-wrap", out).addEventListener("contextmenu", (e) => {
      const cell = e.target.closest("td[data-c][data-r]");
      if (!selCols.size && !selRect && cell) {
        const rr = Number(cell.dataset.r), cc = Number(cell.dataset.c);
        selRect = rectNorm({ r: rr, c: cc }, { r: rr, c: cc }); paintSelection();
      }
      if (!selCols.size && !selRect) return;
      e.preventDefault();
      showRoleMenu(e.clientX, e.clientY);
    });
  };
  // kết thúc kéo ở bất kỳ đâu — bind lại closure hiện tại (tránh giữ closure cũ khi re-render)
  if (mountImportFlex._upHandler) document.removeEventListener("mouseup", mountImportFlex._upHandler);
  mountImportFlex._upHandler = () => { dragging = false; cellDragging = false; };
  document.addEventListener("mouseup", mountImportFlex._upHandler);

  // WO-29: 1 resolver khách hàng DÙNG CHUNG cho mọi scope cần khách (moi_thau_khach/bbnt_cu/
  // pxk_cu) — tái dùng khId()/khDatalist() có sẵn (KHÔNG tự chế control mới), ném lỗi rõ nếu
  // chưa chọn đúng khách trong danh sách gợi ý.
  const resolveFlexKhach = () => {
    const fd = new FormData();
    fd.set("_kh", ($("input[name='_kh']", out) || {}).value || "");
    return khId(fd);
  };
  const renderFlexLines = (scope, r) => {
    const rows0 = r.lines || [];
    if (scope === "bbnt_cu") {
      const rows = rows0.map((l) => [esc(l.hang_muc || l.ten_hang), `<span class="money">${vnd(l.don_gia)}</span>`,
        `<span class="money">${vnd(l.thanh_tien)}</span>`, esc(l.kl_hop_dong || "—"), esc(l.kl_thuc_te || "—"),
        esc(l.ket_qua || "—"), esc(l.ghi_chu || "—")]);
      return panel("Dòng đọc được (" + rows0.length + ")",
        table(["Hạng mục", "Đơn giá", "Thành tiền", "KL hợp đồng", "KL thực tế", "Kết quả", "Ghi chú"],
          rows, { empty: "Không đọc được dòng nào — kiểm lại dòng header/data." }));
    }
    if (scope === "pxk_cu") {
      const rows = rows0.map((l) => [esc(l.ten_hang), esc(l.model || "—"), esc(l.dvt || "—"),
        Number(l.so_luong || 0).toLocaleString("vi-VN"), esc(l.ghi_chu || "—")]);
      return panel("Dòng đọc được (" + rows0.length + ")",
        table(["Tên hàng", "Model", "ĐVT", "SL", "Ghi chú"], rows,
          { empty: "Không đọc được dòng nào — kiểm lại dòng header/data." }));
    }
    const rows = rows0.map((l) => [esc(l.ten_hang), esc(l.model || "—"), esc(l.dvt || "—"),
      Number(l.so_luong || 0).toLocaleString("vi-VN"), `<span class="money">${vnd(l.don_gia)}</span>`,
      costTypeChip(l.cost_type), matchStatusChip(l.match_status)]);
    return panel("Dòng đọc được (" + rows0.length + ")",
      table(["Tên hàng", "Model", "ĐVT", "SL", "Đơn giá", "Loại", "Khớp"], rows,
        { empty: "Không đọc được dòng nào — kiểm lại dòng header/data." }));
  };
  const FLEX_ACTION_BTN = {   // scope -> [id nút, nhãn]
    moi_thau_khach: ["flex-tobaogia", "Tạo báo giá nháp từ danh sách →"],
    bao_gia_ncc: ["flex-luungcc", "💰 Lưu giá NCC"],
    hoa_don_dau_vao: ["flex-luuhd", "🧾 Lưu hóa đơn đầu vào"],
    bbnt_cu: ["flex-luubbnt", "📋 Lưu biên bản nghiệm thu"],
    pxk_cu: ["flex-luupxk", "📦 Lưu phiếu xuất kho"],
  };
  const actionToolbarHtml = (scope) => {
    const b = FLEX_ACTION_BTN[scope];
    return b ? `<div class="toolbar" style="margin-top:10px"><button class="btn primary" id="${b[0]}">${b[1]}</button></div>` : "";
  };
  const daXongBtn = (btn, nhan) => { btn.disabled = true; btn.textContent = "✅ " + nhan; };
  const wireFlexAction = (scope, r, lines) => {
    if (scope === "moi_thau_khach") {
      const tb = $("#" + FLEX_ACTION_BTN[scope][0], lines);
      if (!tb) return;
      tb.onclick = async () => {
        let customer_id; try { customer_id = resolveFlexKhach(); } catch (e) { toast(e.message, false); return; }
        try {
          const q = await apiPost("write/tao_bao_gia_tu_list",
            { confirm_token: r.confirm_token, loai_bao_gia: "Bán hàng hóa/thiết bị", customer_id });
          toast("Đã tạo báo giá nháp — mở form để chỉnh + Sinh bộ 7 chứng từ.");
          location.hash = "#quotation?id=" + q.quotation_id;
        } catch (e) { toast(flexErr(e), false); }
      };
    } else if (scope === "bao_gia_ncc" || scope === "hoa_don_dau_vao") {
      const btn = $("#" + FLEX_ACTION_BTN[scope][0], lines);
      if (!btn) return;
      btn.onclick = async () => {
        try {
          // Nguoi dung da xem bang "Dong doc duoc" (cot Loai/Khop) truoc khi bam nut nay —
          // coi day la buoc XAC NHAN (giong 2 pha preview/commit) nen gui overrides cho MOI
          // dong (ke ca dang "cho duyet"/"chua khop") de duoc ghi that, khong bi am tham bo
          // qua (neu khong se ra "Đã lưu" nhung cost_rows=0 cho item lan dau chua co lich su).
          const overrides = (r.lines || []).map((l) => ({ ten_hang: l.ten_hang, item_key: l.item_key,
            cost_type: l.cost_type, stock_impact: l.stock_impact }));
          const res = await apiPost("import_flex_commit", { confirm_token: r.confirm_token, overrides });
          const kq = res.ket_qua || {};
          toast(scope === "bao_gia_ncc"
            ? `Đã lưu giá NCC: ${kq.cost_rows || 0} dòng giá vốn.`
            : `Đã ghi hóa đơn đầu vào: ${kq.hoa_don || 0} hóa đơn, ${kq.cost_rows || 0} dòng giá vốn cập nhật.`);
          daXongBtn(btn, "Đã lưu");
        } catch (e) { toast(flexErr(e), false); }
      };
    } else if (scope === "bbnt_cu") {
      const btn = $("#" + FLEX_ACTION_BTN[scope][0], lines);
      if (!btn) return;
      btn.onclick = async () => {
        let customer_id; try { customer_id = resolveFlexKhach(); } catch (e) { toast(e.message, false); return; }
        const ket_luan = ($("#flex-ket-luan", out) || {}).value || "";
        const ton_dong = ($("#flex-ton-dong", out) || {}).value || "";
        try {
          const res = await apiPost("write/tao_bbnt_tu_list",
            { confirm_token: r.confirm_token, customer_id, ket_luan, ton_dong });
          toast("Đã lưu BBNT " + res.code + " (" + res.so_dong + " dòng, trạng thái Nháp).");
          daXongBtn(btn, "Đã lưu " + res.code);
        } catch (e) { toast(flexErr(e), false); }
      };
    } else if (scope === "pxk_cu") {
      const btn = $("#" + FLEX_ACTION_BTN[scope][0], lines);
      if (!btn) return;
      btn.onclick = async () => {
        let customer_id; try { customer_id = resolveFlexKhach(); } catch (e) { toast(e.message, false); return; }
        const kho = ($("#flex-kho", out) || {}).value || "";
        const nguoi_nhan = ($("#flex-nguoinhan", out) || {}).value || "";
        try {
          const res = await apiPost("write/tao_pxk_tu_list",
            { confirm_token: r.confirm_token, customer_id, kho, nguoi_nhan });
          toast("Đã lưu phiếu xuất kho " + res.code + " (" + res.so_dong + " dòng, trạng thái Nháp).");
          daXongBtn(btn, "Đã lưu " + res.code);
        } catch (e) { toast(flexErr(e), false); }
      };
    }
  };
  const doMap = async () => {
    // gom cột theo vai trò: 1 cột -> int; nhiều cột (ten_hang/hạng mục gộp) -> mảng
    const byRole = {};
    Object.entries(colRoles).forEach(([ci, role]) => { if (role) (byRole[role] = byRole[role] || []).push(Number(ci)); });
    const col_map = {};
    Object.entries(byRole).forEach(([role, cols]) => { cols.sort((a, b) => a - b); col_map[role] = cols.length === 1 ? cols[0] : cols; });
    const scope = $("#flex-scope", out).value;
    const lines = $("#flex-lines", out);
    let target;
    if (WO29_NEEDS_CUSTOMER.has(scope)) {
      try { target = { customer_id: resolveFlexKhach(), supplier_name: null }; }
      catch (e) { lines.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    } else {
      target = { supplier_name: $("#flex-doitac", out).value, customer_id: null,
                mst: ($("#flex-mst", out) || {}).value || null,
                ma_hd: ($("#flex-ma-hd", out) || {}).value || null };
    }
    const body = {
      file_b64: fileB64, filename: fileName, sheet: $("#flex-sheet", out).value,
      header_row: Number($("#flex-hdr", out).value), data_start_row: Number($("#flex-data", out).value),
      col_map, scope, target,
      save_profile: $("#flex-save", out).checked, ten_profile: $("#flex-name", out).value };
    if (col_map.ten_hang == null) {
      lines.innerHTML = `<div class="empty">Chọn ít nhất 1 cột làm <b>${scope === "bbnt_cu" ? "Hạng mục" : "Tên hàng"}</b> trước khi đọc.</div>`;
      return;
    }
    lines.innerHTML = `<div class="loading">Đang đọc theo bản đồ…</div>`;
    try {
      const r = await apiPost("import_flex_map", body);
      lines.innerHTML = renderFlexLines(scope, r) + actionToolbarHtml(scope);
      wireFlexAction(scope, r, lines);
    } catch (e) { lines.innerHTML = `<div class="empty">${esc(flexErr(e))}</div>`; }
  };
  const flexErr = (e) => (e.data && e.data.permission_denied)
    ? "Vai trò của bạn không có quyền thực hiện thao tác này."
    : (e.message || "Lỗi");
  inp.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    out.innerHTML = `<div class="loading">Đang đọc lưới thô ${esc(f.name)}…</div>`;
    try {
      fileB64 = await fileToB64(f); fileName = f.name;
      PV = await apiPost("import_flex_preview", { filename: f.name, file_b64: fileB64 });
      draw();
    } catch (err) { out.innerHTML = `<div class="empty">${esc(flexErr(err))}</div>`; PV = null; }
  });
}

/* ---- 5b. DONE page (kho hoan thanh) --------------------------------------- */
RENDER.done = async function (el) {
  const [dc, sk] = await Promise.all([
    apiGet("doi_chieu_cong_no"),
    apiGet("sao_ke_cho_duyet").catch(() => ({ rows: [], tk: { tong: 0, tong_tien: 0 }, da_khop: { n: 0, tien: 0 } })),
  ]);
  const tinChip = (t) => t === "Chac" ? chip("Chắc chắn") : t === "Kha" ? chip("Khá") : chip("Cần xem");
  let filter = "all";
  const coChip = (r) => r.co === "Da hoan thanh" ? chip("Đã hoàn thành")
    : r.co === "Con no" ? chip(r.qua_han ? "Quá hạn " + r.qua_han_ngay + " ngày" : "Còn nợ")
    : chip("Chưa đối chiếu");
  const draw = () => {
    const rows = dc.rows.filter((r) => filter === "all" ? true
      : filter === "xong" ? r.co === "Da hoan thanh"
      : filter === "no" ? r.co === "Con no" : r.co === "Chua doi chieu");
    $("#done-body", el).innerHTML = table(
      ["Khách", "Số HĐ", "Tổng hóa đơn", "Đã nhận (sao kê + UNC)", "Còn nợ", "GD sao kê", "Trạng thái"],
      rows.map((r) => [esc(r.customer_name), String(r.so_hd),
        `<span class="money">${vnd(r.tong_hd)}</span>`, `<span class="money">${vnd(r.da_nhan)}</span>`,
        `<b class="money">${vnd(r.con_no)}</b>`, String(r.so_gd_sao_ke), coChip(r)]),
      { empty: "Chưa có khách nào xuất hóa đơn." });
  };

  // nap danh sach khach (1 lan) de sua tay + datalist dung chung
  const khList = await apiGet("customers");
  const khByName = {}, khById = {};
  khList.forEach((c) => { khByName[c.customer_name] = c.id; khById[c.id] = c.customer_name; });
  const khDl = `<datalist id="dl-kh-sk">${khList.map((c) =>
    `<option value="${esc(c.customer_name)}">`).join("")}</datalist>`;

  // Khu duyet sao ke (§4b): he da doan san — anh SUA TAY khach/hoa don cho sai roi xac nhan
  const hdOptions = (r, uv) =>
    `${r.hoa_don_id && !uv.some((u) => u.hoa_don_id === r.hoa_don_id)
       ? `<option value="${r.hoa_don_id}" selected>${esc(r.hd_ma || "HĐ đã đoán")}</option>` : ""}
     ${uv.map((u) => `<option value="${u.hoa_don_id}" ${u.hoa_don_id === r.hoa_don_id ? "selected" : ""}>${esc(u.label)}</option>`).join("")}
     <option value="" ${!r.hoa_don_id ? "selected" : ""}>— tự phân bổ (FIFO) —</option>`;
  const skRows = sk.rows.map((r) => {
    const uv = (r.ung_vien || []);
    return `<tr data-row="${r.id}">
      <td><input type="checkbox" class="sk-tick" data-id="${r.id}" ${r.goi_y_tin_cay !== "Mo" && r.khach_id ? "checked" : ""}></td>
      <td style="white-space:nowrap">${fmtDate(r.ngay)}<br><span class="muted">${esc(r.ngan_hang)}</span></td>
      <td class="money" style="text-align:right">${vnd(r.so_tien)}</td>
      <td style="max-width:230px"><div style="font-size:11.5px" title="${esc(r.noi_dung)}">${esc((r.noi_dung || "").slice(0, 58))}</div></td>
      <td><input class="sk-kh" data-id="${r.id}" data-khid="${r.khach_id || ""}" list="dl-kh-sk"
             value="${esc(r.customer_name || "")}" placeholder="Gõ tên khách để sửa…"
             style="width:190px;font-size:11.5px"></td>
      <td><select class="sk-hd" data-id="${r.id}" style="font-size:11.5px;max-width:190px">${hdOptions(r, uv)}</select></td>
      <td>${tinChip(r.goi_y_tin_cay)}<div class="muted" style="font-size:10.5px;max-width:170px">${esc(r.goi_y_ly_do || "")}</div></td>
      <td><button class="btn ghost btn-sm sk-skip" data-id="${r.id}">Bỏ qua</button></td></tr>`;
  }).join("");

  el.innerHTML = metrics([
    ["Đã hoàn thành", String(dc.hoan_thanh), "trả đủ tiền", "ok"],
    ["Còn nợ", String(dc.con_no), "đã nhận 1 phần", "warn"],
    ["Chưa đối chiếu", String(dc.chua_dc), "chưa thấy tiền về", "danger"],
    ["Sao kê chờ duyệt", String(sk.tk.tong), vnd(sk.tk.tong_tien || 0), sk.tk.tong ? "warn" : "ok"]]) +
    (sk.rows.length ? `
    <section class="panel"><div class="panel-head">
      <h2 class="panel-title">🏦 Duyệt khớp sao kê (${sk.tk.tong}) — hệ đã đoán sẵn, anh chỉ sửa chỗ sai</h2>
      <div class="toolbar" style="margin:0">
        <button class="btn ghost btn-sm" id="sk-tick-chac">Tick Chắc + Khá</button>
        <button class="btn primary btn-sm" id="sk-accept">✔ Xác nhận các dòng đã tick</button></div></div>
      <div class="panel-body">${khDl}<div style="overflow-x:auto"><table>
        <thead><tr><th></th><th>Ngày/NH</th><th>Số tiền</th><th>Nội dung GD</th><th>Khách (gõ để sửa)</th><th>Hóa đơn (chọn/tự phân bổ)</th><th>Vì sao đoán vậy</th><th></th></tr></thead>
        <tbody>${skRows}</tbody></table></div>
      <div class="muted" style="font-size:11.5px;margin-top:6px">Đã khớp trước đó: ${sk.da_khop.n} giao dịch = ${vnd(sk.da_khop.tien)}. Xác nhận xong, tiền tự cộng vào cột "Đã nhận" bên dưới.</div>
      </div></section>` : "") +
    toolbar([["f-all", "Tất cả", "ghost"], ["f-xong", "Đã hoàn thành", "ghost"],
             ["f-no", "Còn nợ", "ghost"], ["f-chuadc", "Chưa đối chiếu", "ghost"]]) +
    `<div id="done-body"></div>
     <div class="muted" style="font-size:11.5px;margin-top:8px">Khách nợ quá ${dc.nqh} ngày → dùng "Sinh bộ 7 chứng từ" (trang Báo giá) để lập DCCN + thư đề nghị thanh toán điền sẵn.</div>`;
  draw();
  $("#f-all", el).onclick = () => { filter = "all"; draw(); };
  $("#f-xong", el).onclick = () => { filter = "xong"; draw(); };
  $("#f-no", el).onclick = () => { filter = "no"; draw(); };
  $("#f-chuadc", el).onclick = () => { filter = "chuadc"; draw(); };
  const tickChac = $("#sk-tick-chac", el);
  if (tickChac) tickChac.onclick = () => {
    sk.rows.forEach((r) => {
      const cb = el.querySelector(`.sk-tick[data-id="${r.id}"]`);
      if (cb) cb.checked = r.goi_y_tin_cay !== "Mo" && !!r.khach_id;
    });
  };
  // SUA TAY khach: go/chon ten khac -> cap nhat khach_id + nap hoa don chua thu cua khach do
  el.querySelectorAll(".sk-kh").forEach((inp) => inp.addEventListener("change", async () => {
    const id = inp.dataset.id;
    const khid = khByName[inp.value.trim()];
    const sel = el.querySelector(`.sk-hd[data-id="${id}"]`);
    if (!khid) {  // ten khong khop danh sach
      inp.dataset.khid = "";
      inp.style.borderColor = "var(--danger)";
      return;
    }
    inp.dataset.khid = khid;
    inp.style.borderColor = "";
    // tu tick dong nay (anh da xac dinh khach)
    const cb = el.querySelector(`.sk-tick[data-id="${id}"]`);
    if (cb) cb.checked = true;
    // nap hoa don chua thu cua khach vua chon
    try {
      const hd = await apiGet("hoa_don_khach", { customer_id: khid });
      sel.innerHTML = hd.rows.map((u) => `<option value="${u.hoa_don_id}">${esc(u.label)}</option>`).join("") +
        `<option value="" selected>— tự phân bổ (FIFO) —</option>`;
    } catch (e) { /* giu nguyen */ }
  }));
  const accept = $("#sk-accept", el);
  if (accept) accept.onclick = async () => {
    const items = [];
    let ten_khong_khop = 0;
    el.querySelectorAll(".sk-tick:checked").forEach((cb) => {
      const id = Number(cb.dataset.id);
      const inp = el.querySelector(`.sk-kh[data-id="${id}"]`);
      const sel = el.querySelector(`.sk-hd[data-id="${id}"]`);
      // khach: uu tien ten anh go/chon; neu go ten khong khop danh sach -> canh bao
      let khid = inp && inp.value.trim() ? khByName[inp.value.trim()] : null;
      if (inp && inp.value.trim() && !khid) { ten_khong_khop++; return; }
      const it = { id };
      if (khid) it.khach_id = khid;
      it.hoa_don_id = (sel && sel.value) ? Number(sel.value) : null;
      items.push(it);
    });
    if (ten_khong_khop) { toast(`${ten_khong_khop} dòng có tên khách không khớp danh sách — chọn từ gợi ý.`, false); return; }
    if (!items.length) { toast("Chưa tick dòng nào.", false); return; }
    if (!confirm(`Xác nhận ${items.length} giao dịch? Tiền sẽ cộng vào công nợ từng khách (có audit).`)) return;
    accept.disabled = true;
    try {
      // GĐ: 2 pha acting accounting (preview token → commit mới ghi da_thu).
      // KT/QT: 1 pha ghi thẳng.
      let r = await apiPost("write/sao_ke_xac_nhan", {
        items,
        acting_phase: (ME && ME.role === "Giam doc") ? "preview" : undefined,
      });
      if (r.acting_accounting || r.phase === "acting_preview") {
        const ok2 = confirm(
          (r.message || "Giám đốc đang làm nghiệp vụ kế toán.") +
          `\n\nXÁC NHẬN LẦN 2: cộng ${items.length} giao dịch vào hóa đơn / công nợ?\n` +
          "(Chưa bấm OK lần này thì tiền CHƯA vào sổ.)");
        if (!ok2) {
          toast("Đã hủy — chưa cộng tiền vào công nợ.", false);
          accept.disabled = false;
          return;
        }
        r = await apiPost("write/sao_ke_xac_nhan", {
          items,
          acting_phase: "commit",
          acting_confirm_token: r.confirm_token,
        });
      }
      const n = Number(r.da_khop || 0);
      if (!n && !(r.loi && r.loi.length)) {
        toast("Chưa ghi được giao dịch nào — kiểm tra khách/hóa đơn trên từng dòng.", false);
        accept.disabled = false;
        return;
      }
      toast(`Đã khớp ${n} giao dịch — tiền đã cộng vào «Đã nhận» / giảm công nợ.` +
        (r.loi && r.loi.length ? " Lỗi: " + r.loi.join("; ") : ""));
      RENDER.done(el);
    } catch (e) {
      toast(e.message || "Không xác nhận được sao kê", false);
      accept.disabled = false;
    }
  };
  el.querySelectorAll(".sk-skip").forEach((b) => b.addEventListener("click", async () => {
    await apiPost("write/sao_ke_bo_qua", { id: Number(b.dataset.id) });
    toast("Đã bỏ qua (không tính là khách trả)."); RENDER.done(el);
  }));
};

/* ---- 5c. SCHEDULE page (WO-22: căn mockup "Lịch & Công việc") ---------------
   KPI 6 ô + lịch (năm/tháng/tuần) + agenda theo ngày + bảng công việc có lọc
   + phân công KTV + việc quá hạn. Hàng chờ xếp lịch giữ nguyên (WO-12). */
RENDER.schedule = async function (el) {
  const nam = new Date().getFullYear();
  const hideMoney = ME && ["Ky thuat vien", "Thu kho"].includes(ME.role);
  const [cal, queue, tech, dash] = await Promise.all([
    apiGet("calendar", { nam }), apiGet("cho_xep_lich"),
    apiGet("technician").catch(() => null), apiGet("dashboard").catch(() => null),
  ]);
  const byDay = {};
  cal.events.forEach((e) => (byDay[e.ngay] = byDay[e.ngay] || []).push(e));
  const todayIso = new Date().toISOString().slice(0, 10);
  let mode = "thang", curM = new Date().getMonth() + 1, selDay = todayIso;
  const legend = `<div class="cal-legend"><span class="lg new">Việc mới (từ báo giá)</span>
    <span class="lg doclap">Việc độc lập</span>
    <span class="lg maint">Bảo trì định kỳ</span><span class="lg overdue">Quá hạn</span><span class="lg done">Đã xong</span></div>`;
  // báo giá đã tạo (Q1) — chỉ role được xem báo giá
  const canQuote = ME && ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"].includes(ME.role);
  const quotes = canQuote ? await apiGet("quotations").catch(() => []) : [];

  // KPI — toàn bộ từ nguồn live; ô nào không có nguồn (role 403) hiện "—"
  const tm = (i) => (tech && tech.metrics && tech.metrics[i] ? String(tech.metrics[i][1]) : "—");
  const choXep = (queue.bao_gia || []).length + (queue.moc_den_han || []).length;
  const kpi = [
    ["Công việc hôm nay", tm(0), "", "info", "cal"],
    ["Đang thực hiện", tm(1), "", "warn", "play"],
    ["Chờ vật tư", tm(2), "", "warn", "clock"],
    ["Hoàn thành", tm(3), "tuần này", "ok", "doc"],
    ["Quá hạn", dash ? String(dash.kpi.cv_qua_han || 0) : "—", "", dash && dash.kpi.cv_qua_han ? "danger" : "ok", "alert"],
    ["Chờ xếp lịch", String(choXep), "báo giá + mốc bảo trì", choXep ? "purple" : "ok", "wrench"],
  ];

  const drawMonth = (m) => {
    const first = new Date(nam, m - 1, 1);
    const startDow = (first.getDay() + 6) % 7; // Thu 2 = 0
    const dim = new Date(nam, m, 0).getDate();
    let cells = "";
    for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= dim; d++) {
      const iso = `${nam}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const evs = byDay[iso] || [];
      cells += `<div class="cal-cell ${iso === selDay ? "sel" : ""}" data-d="${iso}"><div class="cal-day">${d}</div>
        ${evs.slice(0, 3).map((e) => `<div class="ev ${e.mau}" title="${esc(e.viec || "")} · ${esc(e.khach || "")}">
          ${e.gio ? esc(e.gio) + " " : ""}${esc((e.khach || e.code || "").slice(0, 14))}</div>`).join("")}
        ${evs.length > 3 ? `<div class="muted" style="font-size:10px">+${evs.length - 3}</div>` : ""}</div>`;
    }
    return `<div class="cal-head-row">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => `<div>${d}</div>`).join("")}</div>
      <div class="cal-grid">${cells}</div>`;
  };
  const drawYear = () => `<div class="year-grid">${Array.from({ length: 12 }, (_, i) => {
    const m = i + 1, pre = `${nam}-${String(m).padStart(2, "0")}`;
    const evs = cal.events.filter((e) => e.ngay && e.ngay.startsWith(pre));
    const c = (mau) => evs.filter((e) => e.mau === mau).length;
    return `<div class="year-cell" data-m="${m}"><b>Tháng ${m}</b>
      <div class="year-dots">${c("new") ? `<span class="dot new">${c("new")}</span>` : ""}
      ${c("maint") ? `<span class="dot maint">${c("maint")}</span>` : ""}
      ${c("overdue") ? `<span class="dot overdue">${c("overdue")}</span>` : ""}
      ${c("done") ? `<span class="dot done">${c("done")}</span>` : ""}</div>
      <div class="muted" style="font-size:11px">${evs.length} việc/mốc</div></div>`;
  }).join("")}</div>`;
  const drawWeek = () => {
    const today = new Date();
    const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    let html = `<div class="week-grid">`;
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const evs = byDay[iso] || [];
      html += `<div class="week-col"><div class="week-head">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i]} ${d.getDate()}/${d.getMonth() + 1}</div>
        ${evs.map((e) => `<div class="ev ${e.mau}">${e.gio ? esc(e.gio) + " · " : ""}${esc(e.khach || e.code)}<br>
          <span class="muted" style="font-size:10px">${esc(e.ktv || "")}</span></div>`).join("") || `<div class="muted" style="font-size:11px">—</div>`}</div>`;
    }
    return html + "</div>";
  };
  const drawAgenda = () => {
    const evs = (byDay[selDay] || []).slice()
      .sort((a, b) => String(a.gio || "99:99").localeCompare(String(b.gio || "99:99")));
    const t = $("#agenda-title", el);
    if (t) t.textContent = "Lịch & công việc ngày " + fmtDate(selDay);
    const body = $("#agenda-body", el);
    const editable = canEditJob();
    if (body) body.innerHTML = evs.length ? `<div class="agenda">${evs.map((e) => `
      <div class="agenda-row">
        <span class="agenda-time">${esc(e.gio || "—")}</span>
        <span class="agenda-dot ${esc(e.mau)}"></span>
        <span class="agenda-main"><b>${esc(e.khach || e.code || "")}</b>
          <span class="muted">${esc(e.viec || "")}${e.ktv ? " · " + esc(e.ktv) : ""}</span>${chip(e.tt)}</span>
        ${editable && e.loai === "viec" && e.tt !== "Hoan thanh" && e.tt !== "Huy"
          ? `<button class="btn ghost btn-sm cv-edit-ag" data-id="${e.id}">✏️</button>` : ""}
      </div>`).join("")}</div>`
      : `<div class="empty">Không có việc / mốc trong ngày này — bấm một ô ngày trên lịch để xem.</div>`;
    if (editable && body) body.querySelectorAll(".cv-edit-ag").forEach((b) => b.addEventListener("click", () => {
      const r = ((tech && tech.rows) || []).find((x) => String(x.id) === b.dataset.id)
        || (byDay[selDay] || []).map((e) => ({ id: e.id, code: e.code, customer_name: e.khach, loai_viec: e.viec, ngay_hen: e.ngay, gio_hen: e.gio, ktv_chinh: e.ktv, trang_thai: e.tt })).find((x) => String(x.id) === b.dataset.id);
      if (r) congViecModal("sua", r, () => RENDER.schedule(el));
    }));
  };
  const draw = () => {
    $("#cal-body", el).innerHTML = mode === "nam" ? drawYear() : mode === "tuan" ? drawWeek() : drawMonth(curM);
    $("#cal-title", el).textContent = mode === "nam" ? `Năm ${nam}` : mode === "tuan" ? "Tuần này" : `Lịch công việc tháng ${String(curM).padStart(2, "0")}/${nam}`;
    if (mode === "nam") el.querySelectorAll(".year-cell").forEach((c) =>
      c.addEventListener("click", () => { mode = "thang"; curM = Number(c.dataset.m); draw(); }));
    if (mode === "thang") el.querySelectorAll(".cal-cell[data-d]").forEach((c) =>
      c.addEventListener("click", () => { selDay = c.dataset.d; draw(); }));
    drawAgenda();
  };

  // bảng công việc + lọc client trên dữ liệu thật
  const rows = (tech && tech.rows) || [];
  const open = rows.filter((r) => !["Hoan thanh", "Huy"].includes(r.trang_thai));
  let fLoai = "", fTt = "";
  const drawJobs = () => {
    const list = rows.filter((r) => (!fLoai || r.loai_viec === fLoai) && (!fTt || r.trang_thai === fTt));
    const cnt = $("#job-count", el);
    if (cnt) cnt.textContent = `${Math.min(30, list.length)} / ${list.length} công việc`;
    const body = $("#job-body", el);
    const editable = canEditJob();
    if (body) body.innerHTML = table(
      ["Mã việc", "Công ty / Công trình", "Loại việc", "Ngày hẹn", "Trạng thái", "KTV phụ trách"].concat(editable ? [""] : []),
      list.slice(0, 30).map((r) => [
        `<span class="code">${esc(r.code)}</span>`,
        esc(r.customer_name || "—") + (r.khu_vuc ? `<br><span class="muted" style="font-size:11px">${esc(r.khu_vuc)}</span>` : ""),
        chip(r.loai_viec), esc(fmtDate(r.ngay_hen)) + (r.gio_hen ? " " + esc(r.gio_hen) : ""),
        chip(r.trang_thai), esc(r.ktv_chinh || "—")].concat(editable
          ? [`<button class="btn ghost btn-sm cv-edit" data-id="${r.id}">✏️ Sửa</button>`] : [])),
      { empty: "Không có công việc khớp bộ lọc." });
    if (editable) body.querySelectorAll(".cv-edit").forEach((b) => b.addEventListener("click", () => {
      const r = rows.find((x) => String(x.id) === b.dataset.id);
      if (r) congViecModal("sua", r, () => RENDER.schedule(el));
    }));
  };
  const loaiOpts = [...new Set(rows.map((r) => r.loai_viec).filter(Boolean))].sort();
  const ttOpts = [...new Set(rows.map((r) => r.trang_thai).filter(Boolean))];

  // phân công KTV (việc đang mở) + việc quá hạn — từ cong_viec_ktv thật
  const byKtv = {};
  open.forEach((r) => { const k = r.ktv_chinh || "Chưa gán KTV"; byKtv[k] = (byKtv[k] || 0) + 1; });
  const ktvArr = Object.entries(byKtv).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxK = Math.max(...ktvArr.map((x) => x[1]), 1);
  const ktvHtml = ktvArr.length ? `<div class="ktv-load">${ktvArr.map(([ten, n]) => `
      <div class="ktv-row"><span>${esc(ten)}</span><span class="muted">${n} công việc</span>
        <div class="ktv-bar"><div class="ktv-fill" style="width:${Math.round(n * 100 / maxK)}%"></div></div></div>`).join("")}</div>
    <div class="muted" style="font-size:11.5px;margin-top:8px">Tổng cộng: <b>${open.length} công việc</b> đang mở</div>`
    : `<div class="empty">Chưa có việc đang mở.</div>`;
  const overdue = open.filter((r) => r.ngay_hen && r.ngay_hen < todayIso)
    .sort((a, b) => String(a.ngay_hen).localeCompare(String(b.ngay_hen))).slice(0, 5);
  const odHtml = overdue.length ? overdue.map((r) => `
      <div class="queue-row"><span><b>${esc(r.loai_viec || "Việc")}</b> · ${esc(r.customer_name || r.code)}<br>
        <span class="muted" style="font-size:11px">${esc(r.code)} · ${esc(r.ktv_chinh || "chưa gán")}</span></span>
        <span style="color:var(--danger);font-weight:700;white-space:nowrap">Hạn: ${esc(fmtDate(r.ngay_hen))}</span></div>`).join("")
    : `<div class="empty">Không có việc quá hạn 🎉</div>`;

  el.innerHTML = `
    ${metrics(kpi)}
    ${panel("⏳ Chờ xếp lịch — anh tự đặt ngày/giờ + chọn thợ",
      `<div class="grid cols-2">
        <div><b style="font-size:13px">Báo giá sau ${fmtDate(queue.start)} chưa giao việc (${queue.bao_gia.length})</b>
          ${queue.bao_gia.map((q) => `<div class="queue-row"><span>${esc(q.code)} · ${esc(q.customer_name)}${hideMoney ? "" : " · " + vnd(q.grand_total)}</span>
            <button class="btn primary btn-sm q-xep" data-qid="${q.id}" data-cid="${q.customer_id}" data-kh="${esc(q.customer_name)}">Xếp lịch</button></div>`).join("") || `<div class="empty">Không có báo giá chờ.</div>`}</div>
        <div><b style="font-size:13px">Mốc bảo trì đến hạn (${queue.moc_den_han.length})</b>
          ${queue.moc_den_han.map((m) => `<div class="queue-row"><span>${esc(m.ten_diem)} · ${esc(m.customer_name)} · hạn ${fmtDate(m.ngay_du_kien)} (${m.chu_ky_thang} th/lần)</span>
            <button class="btn primary btn-sm m-xep" data-moc="${m.lich_moc_id}" data-hdbt="${m.hdbt_id}" data-cid="${m.customer_id}" data-kh="${esc(m.customer_name)}">Xếp lịch</button></div>`).join("") || `<div class="empty">Không có mốc đến hạn.</div>`}</div>
      </div>`)}
    <div class="sched-split">
      <section class="panel"><div class="panel-head"><h2 class="panel-title" id="cal-title"></h2>
        <div class="toolbar" style="margin:0">
          <button class="btn ghost btn-sm" id="v-nam">Năm</button>
          <button class="btn primary btn-sm" id="v-thang">Tháng</button>
          <button class="btn ghost btn-sm" id="v-tuan">Tuần</button>
          <button class="btn ghost btn-sm" id="m-prev">◀</button>
          <button class="btn ghost btn-sm" id="m-next">▶</button></div></div>
        <div class="panel-body">${legend}<div id="cal-body"></div></div></section>
      <div class="grid" style="gap:14px">
        <section class="panel"><div class="panel-head"><h2 class="panel-title" id="agenda-title">Lịch trong ngày</h2></div>
          <div class="panel-body" id="agenda-body"></div></section>
        ${panel("Phân công KTV (việc đang mở)", ktvHtml)}
      </div>
    </div>
    <div class="sched-split">
      <section class="panel"><div class="panel-head"><h2 class="panel-title">Danh sách công việc</h2>
        <div class="toolbar" style="margin:0">
          <select id="job-f-loai" class="field" style="min-height:30px;padding:3px 8px">
            <option value="">Tất cả loại việc</option>
            ${loaiOpts.map((o) => `<option value="${esc(o)}">${esc(viStatus(o))}</option>`).join("")}</select>
          <select id="job-f-tt" class="field" style="min-height:30px;padding:3px 8px">
            <option value="">Tất cả trạng thái</option>
            ${ttOpts.map((o) => `<option value="${esc(o)}">${esc(viStatus(o))}</option>`).join("")}</select>
          <span class="muted" id="job-count" style="font-size:11.5px"></span></div></div>
        <div class="panel-body" id="job-body"></div></section>
      <div class="grid" style="gap:14px">
        ${panel("Việc quá hạn cần xử lý", odHtml)}
      </div>
    </div>
    ${canQuote ? `<div style="margin-top:14px"><section class="panel"><div class="panel-head">
      <h2 class="panel-title">Báo giá đã tạo (${quotes.length})</h2>
      <span class="muted" style="font-size:11.5px">bấm để mở chi tiết</span></div>
      <div class="panel-body" id="quote-list">${table(
        ["Số báo giá", "Khách", "Nhóm DV", "Tổng", "Trạng thái"],
        quotes.map((q) => [`<span class="code">${esc(q.code)}</span>`, esc(q.customer_name || "—"),
          chip(q.nhom_dich_vu), `<span class="money">${vnd(q.grand_total)}</span>`, chip(q.status)]),
        { onClick: true, empty: "Chưa có báo giá nào — lập ở trang Báo giá hoặc từ Bảng công ty." })}</div></section></div>` : ""}`;
  draw();
  drawJobs();
  // Q1: bấm dòng báo giá → mở chi tiết (drill-down trang Báo giá)
  if (canQuote) bindRows($("#quote-list", el), "tbody tr.clickable", (i) => {
    const q = quotes[i]; if (q) location.hash = "#quotation?id=" + q.id;
  });
  if (canCreateJob()) {
    pageActions([["btn-cv-create", "➕ Tạo công việc"]]);
    $("#btn-cv-create").onclick = () => congViecModal("tao", {}, () => RENDER.schedule(el));
  }
  $("#v-nam", el).onclick = () => { mode = "nam"; draw(); };
  $("#v-thang", el).onclick = () => { mode = "thang"; draw(); };
  $("#v-tuan", el).onclick = () => { mode = "tuan"; draw(); };
  $("#m-prev", el).onclick = () => { if (mode === "thang" && curM > 1) { curM--; draw(); } };
  $("#m-next", el).onclick = () => { if (mode === "thang" && curM < 12) { curM++; draw(); } };
  $("#job-f-loai", el).onchange = (ev) => { fLoai = ev.target.value; drawJobs(); };
  $("#job-f-tt", el).onchange = (ev) => { fTt = ev.target.value; drawJobs(); };
  el.querySelectorAll(".q-xep").forEach((b) => b.addEventListener("click", () =>
    giaoViecModal({ quotation_id: Number(b.dataset.qid), customer_id: Number(b.dataset.cid),
      nguon_lich: "tu_bao_gia", _khach: b.dataset.kh }, () => RENDER.schedule(el))));
  el.querySelectorAll(".m-xep").forEach((b) => b.addEventListener("click", () =>
    giaoViecModal({ lich_moc_id: Number(b.dataset.moc), hdbt_id: Number(b.dataset.hdbt),
      customer_id: Number(b.dataset.cid), nguon_lich: "bao_tri_dinh_ky",
      loai_viec: "Bảo trì định kỳ", _khach: b.dataset.kh }, () => RENDER.schedule(el))));
};

/* ---- 5d. NHAN SU page (WO-22: căn mockup "Nhân sự & Nhân công") -------------- */
RENDER.nhansu = async function (el) {
  const [ns, kpi, dash, accts] = await Promise.all([
    apiGet("nhan_su"), apiGet("nang_suat"), apiGet("dashboard").catch(() => null),
    apiGet("app_users").catch(() => null)]);
  const rows = ns.rows || [];
  const rank = (kpi.xep_hang || (kpi.mot_nguoi ? [kpi.mot_nguoi] : [])).filter(Boolean);
  const kpiById = {};
  rank.forEach((r) => { kpiById[r.id] = r; });
  const maxXong = Math.max(...rank.map((r) => r.xong), 1);
  const canSeeWage = ME && ["Giam doc", "Quan tri he thong"].includes(ME.role);
  const adminProvisionsAccounts = ME && ME.role === "Quan tri he thong";
  // các con số suy trực tiếp từ dữ liệu thật (không bịa)
  const ktvHd = rows.filter((r) => r.loai === "KTV" && r.trang_thai === "Dang lam").length;
  const tyLes = rank.map((r) => r.ty_le_dung_hen).filter((v) => v != null);
  const nsTb = tyLes.length ? Math.round(tyLes.reduce((s, v) => s + v, 0) / tyLes.length) + "%" : "—";
  const canRaSoat = rows.filter((r) => !r.sdt || !r.khu_vuc).length;
  pageActions([["btn-ns-new", adminProvisionsAccounts
    ? "+ Thêm nhân sự + tài khoản" : "+ Thêm nhân sự"]]);
  const hieuSuat = (r) => {
    const k = kpiById[r.id];
    if (!k || k.ty_le_dung_hen == null) return `<span class="muted">—</span>`;
    return `<span style="display:inline-flex;align-items:center;gap:6px">${k.ty_le_dung_hen}%
      <span class="rank-bar" style="display:inline-block;width:56px;height:8px"><span class="rank-fill" style="display:block;width:${Math.min(100, k.ty_le_dung_hen)}%;height:100%"></span></span></span>`;
  };
  const cols = ["Mã NS", "Họ tên", "Chức vụ", "Khu vực", "Trạng thái",
    "Tài khoản", "SĐT", "Hiệu suất"];
  if (canSeeWage) cols.push("Đơn giá công");
  if (canSeeWage) cols.push("Sửa");
  // WO32 rank7: panel quan ly tai khoan tam (thau phu) — thu hoi/mo lai. Chi GD/QT.
  const canManageAccounts = ME && ["Giam doc", "Quan tri he thong"].includes(ME.role);
  const acctRows = (accts && accts.rows) || [];
  const acctPanel = canManageAccounts ? `<div style="margin-top:14px">${panel(
    "Quản lý tài khoản đăng nhập · thu hồi / mở lại",
    table(["Tài khoản", "Vai trò", "Trạng thái", "Thao tác"],
      acctRows.map((a) => {
        const prot = a.username === "admin" || a.role === "Giam doc"
          || (ME && a.username === ME.username);
        const badge = a.active ? `<span class="chip ok">Đang hoạt động</span>`
          : `<span class="chip danger">Đã thu hồi</span>`;
        const btn = prot ? `<span class="muted" style="font-size:12px">— (được bảo vệ)</span>`
          : (a.active
            ? `<button class="btn ghost btn-sm" data-acct-toggle="${esc(a.username)}" data-acct-active="0">Thu hồi</button>`
            : `<button class="btn primary btn-sm" data-acct-toggle="${esc(a.username)}" data-acct-active="1">Mở lại</button>`);
        return [`<b class="code">${esc(a.username)}</b>${a.nhan_su_ten ? `<br><span class="muted">${esc(a.nhan_su_ten)}</span>` : ""}`,
          esc(a.role), badge, btn];
      }),
      { empty: "Chưa có tài khoản." })
    + `<div class="muted" style="font-size:12px;margin-top:6px">Thu hồi = chặn đăng nhập <b>và cắt phiên đang mở ngay lập tức</b>. Tài khoản admin/Giám đốc được bảo vệ. Dùng cho tài khoản tạm của nhà thầu theo công trình — hết công trình thì thu hồi.</div>`)}</div>` : "";
  // WO32+: cap tai khoan cho nhan su DA CO SAN (chua co tai khoan). Chi Quan tri he thong.
  const accountlessNs = rows.filter((r) => !r.app_user_id);
  const provisionPanel = (adminProvisionsAccounts && accountlessNs.length) ? `<div style="margin-top:14px">${panel(
    `Cấp tài khoản đăng nhập cho nhân sự chưa có (${accountlessNs.length})`,
    table(["Mã NS", "Họ tên", "Chức vụ", "Thao tác"],
      accountlessNs.map((r) => [
        `<span class="code">NS-${String(r.id).padStart(4, "0")}</span>`,
        `<b>${esc(r.ho_ten)}</b>`, chip(r.loai || "—"),
        `<button class="btn primary btn-sm" data-provision-ns="${r.id}" data-provision-name="${esc(r.ho_ten)}">Cấp tài khoản</button>`]),
      { empty: "Mọi nhân sự đã có tài khoản." })
    + `<div class="muted" style="font-size:12px;margin-top:6px">Hệ thống tự sinh username + <b>mật khẩu tạm</b> theo chức vụ (Thợ/CTV/KTV → Kỹ thuật viên); giao cho nhân sự, họ đổi khi đăng nhập lần đầu.</div>`)}</div>` : "";
  el.innerHTML = `
    ${metrics([
      ["Tổng nhân sự", String(rows.length), "", "info", "people"],
      ["KTV đang hoạt động", String(ktvHd), "", "ok", "wrench"],
      ["Thợ + CTV", String(rows.filter((r) => r.loai === "Tho" || r.loai === "CTV").length), "", "purple", "people"],
      ["Công việc hôm nay", dash ? String(dash.kpi.cv_hom_nay || 0) : "—", "", "warn", "cal"],
      ["Năng suất trung bình", nsTb, "tỷ lệ đúng hẹn", "ok", "dash"],
      ["Nhân sự cần rà soát", String(canRaSoat), "thiếu SĐT / khu vực", canRaSoat ? "danger" : "ok", "alert"]])}
    <div class="sched-split">
      ${panel("Danh sách nhân sự", table(cols,
        rows.map((r) => {
          const row = [`<span class="code">NS-${String(r.id).padStart(4, "0")}</span>`,
            `<b>${esc(r.ho_ten)}</b>${r.ky_nang ? `<br><span class="muted" style="font-size:11px">${esc(r.ky_nang)}</span>` : ""}`,
            chip(r.loai), esc(r.khu_vuc || "—"), chip(r.trang_thai),
            r.username ? `<b class="code">${esc(r.username)}</b><br><span class="muted">${esc(r.account_role || "")}${r.account_must_change ? " · chờ đổi mật khẩu" : ""}</span>`
              : `<span class="muted">Chưa có</span>`,
            esc(r.sdt || "—"), hieuSuat(r)];
          if (canSeeWage) row.push(r.don_gia_cong != null ? `<span class="money">${vnd(r.don_gia_cong)}</span>` : `<span class="muted">—</span>`);
          if (canSeeWage) row.push(`<button class="btn ghost btn-sm" data-edit-ns="${r.id}">✏️ Sửa</button>`);
          return row;
        }),
        { empty: "Chưa có nhân sự — bấm + Thêm nhân sự." }))}
      <div class="grid" style="gap:14px">
        ${panel("Đơn giá nhân công áp dụng",
          `<div class="empty">Chưa có nguồn dữ liệu <b>bảng đơn giá nhân công</b> (loại nhân công · ĐVT · đơn giá · hiệu lực) trong hệ.<br>
           <span class="muted">Cần backend bổ sung — xem "Danh sách field còn thiếu".</span></div>`)}
        ${panel("Cảnh báo & rà soát", `
          <div class="prio-row"><span>🔴 Thiếu SĐT</span><b>${rows.filter((r) => !r.sdt).length}</b></div>
          <div class="prio-row"><span>🟠 Thiếu khu vực phụ trách</span><b>${rows.filter((r) => !r.khu_vuc).length}</b></div>
          <div class="prio-row"><span>🟡 Chưa có folder cá nhân</span><b>${rows.filter((r) => !r.duong_dan_folder).length}</b></div>
          <div class="prio-row"><span>⚪ Tạm nghỉ</span><b>${rows.filter((r) => r.trang_thai !== "Dang lam").length}</b></div>
          <div class="prio-row"><span>🔵 Chưa gắn tài khoản đăng nhập</span><b>${rows.filter((r) => !r.app_user_id).length}</b></div>`)}
        ${panel("Tác vụ nhanh", `<div class="quick-grid">
          <button class="quick-card" data-go2="#schedule"><span class="qc-ico">${ICO.cal}</span><b>Phân việc / xếp lịch</b><span>Giao việc cho KTV theo ngày</span></button>
          <button class="quick-card info" data-go2="#technician"><span class="qc-ico">${ICO.wrench}</span><b>Công việc KTV</b><span>Kanban hiện trường</span></button>
        </div>`)}
      </div>
    </div>
    ${provisionPanel}
    ${acctPanel}
    <div style="margin-top:14px">
    ${panel("Năng suất theo nhân sự " + (kpi.nam || ""), rank.length ? `
      <div class="rank-list">${rank.map((r) => `
        <div class="rank-row"><span class="rank-name">${esc(r.ho_ten)} <span class="muted">(${esc(r.loai)})</span></span>
          <div class="rank-bar"><div class="rank-fill" style="width:${Math.round(r.xong * 100 / maxXong)}%"></div></div>
          <span class="rank-nums">✅ ${r.xong} xong · 🔄 ${r.dang_lam} · 🔴 ${r.qua_han} quá hạn ${r.ty_le_dung_hen != null ? "· ⏱ " + r.ty_le_dung_hen + "%" : ""}</span>
        </div>
        <div class="mini-chart rank-chart">${r.theo_thang.map((v, i) => {
          const h = Math.max(6, Math.round(v * 100 / Math.max(...r.theo_thang, 1)));
          return `<div class="bar" style="height:${h}%" title="T${i + 1}: ${v} việc"><span>T${i + 1}</span></div>`;
        }).join("")}</div>`).join("")}</div>
      <div class="muted" style="font-size:11.5px;margin-top:6px">Mockup có "Năng suất theo đội (HCM/HN/ĐN)" — hệ chưa có khái niệm ĐỘI, đang hiển thị theo từng nhân sự (dữ liệu thật).</div>`
      : `<div class="empty">Chưa có dữ liệu việc để tính năng suất.</div>`)}</div>`;
  el.querySelectorAll("[data-go2]").forEach((b) =>
    b.addEventListener("click", () => { location.hash = b.dataset.go2; }));
  if (canManageAccounts) {
    el.querySelectorAll("[data-acct-toggle]").forEach((b) =>
      b.addEventListener("click", async () => {
        const username = b.dataset.acctToggle;
        const toActive = b.dataset.acctActive === "1";
        const verb = toActive ? "mở lại" : "thu hồi";
        if (!confirm(`Xác nhận ${verb} tài khoản "${username}"?`)) return;
        try {
          const r = await apiPost("write/account_set_active",
            { username, active: toActive ? 1 : 0 });
          toast(`Đã ${verb} tài khoản "${username}".`
            + (r.so_phien_da_cat ? ` Đã cắt ${r.so_phien_da_cat} phiên đang mở.` : ""));
          await RENDER.nhansu(el);
        } catch (e) { toast(e.message || "Không thực hiện được.", false); }
      }));
  }
  if (canSeeWage) {
    el.querySelectorAll("[data-edit-ns]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = rows.find((x) => String(x.id) === b.dataset.editNs);
        if (!r) return;
        const v = (x) => `value="${esc(x == null ? "" : x)}"`;
        const loaiOpts = [["KTV", "KTV"], ["Tho", "Thợ"], ["CTV", "CTV"], ["KTT", "Kỹ thuật trưởng"],
          ["Ke toan", "Kế toán"], ["Kinh doanh", "Kinh doanh"], ["Thu kho", "Thủ kho"]];
        const loaiSel = `<div class="f"><label>Chức vụ</label><select name="loai">${
          loaiOpts.map((o) => `<option value="${esc(o[0])}" ${o[0] === r.loai ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select></div>`;
        openModal(`Sửa nhân sự · ${esc(r.ho_ten)}`,
          `<div class="f"><label>Họ tên *</label><input name="ho_ten" required ${v(r.ho_ten)}></div>`
          + loaiSel
          + fI("cccd", "CCCD (bắt buộc để thêm vào công trình)", "text", v(r.cccd))
          + fI("sdt", "SĐT", "text", v(r.sdt))
          + fI("ngay_sinh", "Ngày sinh", "date", v(r.ngay_sinh))
          + fI("ngay_vao", "Ngày vào làm", "date", v(r.ngay_vao))
          + fI("khu_vuc", "Khu vực phụ trách", "text", v(r.khu_vuc))
          + fI("ky_nang", "Kỹ năng", "text", v(r.ky_nang))
          + (ME.role === "Giam doc" || ME.role === "Quan tri he thong"
            ? fI("don_gia_cong", "Đơn giá công", "number", v(r.don_gia_cong) + " step=any") : "")
          + `<div class="f wide"><label>Địa chỉ</label><textarea name="dia_chi" rows="2">${esc(r.dia_chi || "")}</textarea></div>`,
          async (fd) => {
            const body = Object.fromEntries(fd.entries());
            body.id = r.id;
            await apiPost("write/nhan_su_update", body);
            closeModal(); _NS_CACHE = null;
            toast(`Đã cập nhật nhân sự "${r.ho_ten}".`);
            await RENDER.nhansu(el);
          }, "Lưu");
      }));
  }
  if (adminProvisionsAccounts) {
    el.querySelectorAll("[data-provision-ns]").forEach((b) =>
      b.addEventListener("click", async () => {
        const nid = Number(b.dataset.provisionNs);
        const name = b.dataset.provisionName;
        if (!confirm(`Cấp tài khoản đăng nhập cho "${name}"?`)) return;
        try {
          const r = await apiPost("write/provision_account", { nhan_su_id: nid });
          const c = r.account || {};
          openModal("Tài khoản đã tạo · chỉ hiển thị một lần", `
            <div class="form-error-summary"><b>Hãy bàn giao an toàn.</b> Nhân sự sẽ bị bắt đổi mật khẩu lần đầu.</div>
            ${table(["Họ tên", "Tài khoản", "Mật khẩu khởi tạo", "Vai trò"],
              [[esc(c.full_name || name), `<code>${esc(c.username)}</code>`,
                `<code>${esc(c.initial_password)}</code>`, esc(c.role)]])}`,
            async () => { closeModal(); _NS_CACHE = null; await RENDER.nhansu(el); }, "Tôi đã lưu");
        } catch (e) { toast(e.message || "Không cấp được tài khoản.", false); }
      }));
  }
  $("#btn-ns-new").onclick = () => {
    const w = openModal(adminProvisionsAccounts
      ? "Thêm nhân sự · tự động cấp tài khoản"
      : "Thêm nhân sự",
      fI("ho_ten", "Họ tên *", "text", "required") +
      fS("loai", "Chức vụ *", [["KTV", "KTV"], ["Tho", "Thợ"], ["CTV", "CTV"],
        ["KTT", "Kỹ thuật trưởng"], ["Ke toan", "Kế toán"],
        ["Kinh doanh", "Kinh doanh"], ["Thu kho", "Thủ kho"],
        ["Quan tri he thong", "Quản trị hệ thống"]]) +
      (adminProvisionsAccounts ? `<div class="f wide muted">Tài khoản sẽ được tạo và gắn tự động theo chức vụ. Không có lựa chọn Giám đốc.</div>
        <div class="f wide" id="ns-admin-confirm" style="display:none"><label>
          <input type="checkbox" name="confirm_privileged_account" value="yes">
          Tôi xác nhận đang cấp thêm quyền Quản trị hệ thống
        </label></div>` : "") +
      fI("sdt", "SĐT") + fI("cccd", "CCCD") + fI("ngay_vao", "Ngày vào làm", "date") +
      fI("khu_vuc", "Khu vực phụ trách") + fI("ky_nang", "Kỹ năng (máy lạnh/kho lạnh/điện...)") +
      (ME.role === "Giam doc" || ME.role === "Quan tri he thong"
        ? fI("don_gia_cong", "Đơn giá công (chỉ GĐ thấy)", "number", "step=any") : "") +
      fT("dia_chi", "Địa chỉ"),
      async (fd) => {
        const body = Object.fromEntries(fd.entries());
        body.confirm_privileged_account = fd.get("confirm_privileged_account") === "yes";
        const r = await apiPost("write/nhan_su", body);
        closeModal(); _NS_CACHE = null;
        await RENDER.nhansu(el);
        if (r.account) {
          openModal("Tài khoản đã tạo · chỉ hiển một lần", `
            <div class="f wide"><label>Tài khoản</label><code>${esc(r.account.username)}</code></div>
            <div class="f wide"><label>Mật khẩu khởi tạo</label><code>${esc(r.account.initial_password)}</code></div>
            <div class="f wide"><label>Vai trò</label><b>${esc(r.account.role)}</b></div>
            <div class="f wide muted">Hãy bàn giao an toàn. Người dùng bắt buộc đổi mật khẩu khi đăng nhập lần đầu.</div>`,
            async () => closeModal(), "Tôi đã lưu");
        } else {
          toast("Đã thêm nhân sự" + (r.folder_ok ? " + folder: " + r.folder : " (folder lỗi)"));
        }
      });
    const roleSelect = $('select[name="loai"]', w);
    const confirmBox = $("#ns-admin-confirm", w);
    if (roleSelect && confirmBox) {
      const toggle = () => {
        confirmBox.style.display = roleSelect.value === "Quan tri he thong" ? "block" : "none";
      };
      roleSelect.addEventListener("change", toggle);
      toggle();
    }
  };
};

/* ---- NUT XOA — "tao duoc thi xoa duoc" (chu chot 2026-07-08) ----------------- */
function xoaModal(loai, rows, after, ghiChu, tieuDe) {
  if (!rows.length) { toast("Không có bản ghi nào xóa được (bản đã chốt/đang chạy không xóa).", false); return; }
  openModal("🗑 " + (tieuDe || "Xóa " + loai.replace(/_/g, " ")) + " — chỉ xóa được bản chưa chốt",
    `<div class="f wide"><label>Chọn bản ghi</label><select name="id">${rows.map((r) =>
      `<option value="${r.id}">${esc(r.label)}</option>`).join("")}</select></div>
     <div class="f wide muted" style="font-size:12px">${esc(ghiChu || "Xóa có ghi nhật ký (audit). Bản đã chốt/đã nghiệm thu/đang thi công sẽ bị từ chối ở server.")}</div>`,
    async (fd) => {
      if (!confirm("Chắc chắn xóa? Hành động này ghi vào nhật ký hệ thống.")) return;
      const r = await apiPost("write/xoa", { loai, id: Number(fd.get("id")) });
      closeModal();
      toast(r.soft ? r.ghi_chu : "Đã xóa (có audit).");
      if (after) after();
    }, "Xóa vĩnh viễn");
}
const _wrapXoa = (pageId, btnLabel, getRows, loai, ghiChu) => {
  const orig = RENDER[pageId];
  RENDER[pageId] = async function (el) {
    await orig(el);
    // nut xoa nam cung hang top-actions (topbar); trang chua co pageActions thi dung toolbar dau content
    const tb = ($("#page-actions") && $("#page-actions").children.length) ? $("#page-actions") : el.querySelector(".toolbar") || $("#page-actions");
    if (!tb || $(".btn-xoa-" + pageId, tb)) return;
    tb.insertAdjacentHTML("beforeend",
      `<button class="btn ghost danger btn-xoa-${pageId}">🗑 ${esc(btnLabel)}</button>`);
    $(".btn-xoa-" + pageId, tb).onclick = async () =>
      xoaModal(loai, await getRows(), () => RENDER[pageId](el), ghiChu, btnLabel);
  };
};
_wrapXoa("quotation", "Xóa báo giá", async () => {
  const list = await apiGet("quotations");
  return list.filter((q) => ["Nhap", "Huy", "Tu choi"].includes(q.status))
    .map((q) => ({ id: q.id, label: `${q.code} · ${q.customer_name} · ${vnd(q.grand_total)} · ${q.status}` }));
}, "quotation", "Chỉ báo giá Nháp/Hủy/Từ chối. Báo giá đã sinh chứng từ/việc phải xóa chứng từ trước.");
_wrapXoa("bbnt", "Xóa BBNT", async () => {
  const list = await apiGet("bbnt");
  return list.filter((b) => b.trang_thai !== "Da nghiem thu")
    .map((b) => ({ id: b.id, label: `${b.code} · ${b.customer_name} · ${b.trang_thai}` }));
}, "bbnt", "BBNT đã nghiệm thu là chứng từ khóa — không xóa được.");
_wrapXoa("technician", "Xóa việc", async () => {
  const t = await apiGet("technician");
  return (t.rows || []).filter((r) => ["Moi tao", "Da giao KTV"].includes(r.trang_thai))
    .map((r) => ({ id: r.id, label: `${r.code} · ${r.customer_name || ""} · ${r.trang_thai}` }));
}, "cong_viec", "Việc đã vào thi công không xóa — chuyển trạng thái thay thế. Mốc bảo trì gắn việc sẽ tự về hàng chờ.");
_wrapXoa("maintenance", "Xóa HĐ bảo trì", async () => {
  const m = await apiGet("maintenance");
  return (m.hop_dong || m.hd || []).map((r) => ({ id: r.id, label: `${r.code} · ${r.customer_name} · ${r.ten_hop_dong}` }));
}, "hdbt", "HĐ có việc KTV gắn vào sẽ bị từ chối. Mốc bảo trì của HĐ xóa theo.");
_wrapXoa("nhansu", "Xóa nhân sự", async () => {
  const ns = await apiGet("nhan_su");
  return (ns.rows || []).map((r) => ({ id: r.id, label: `${r.ho_ten} (${r.loai}) · ${r.trang_thai}` }));
}, "nhan_su", "Nhân sự có việc lịch sử sẽ chuyển NGHỈ (giữ thống kê), không xóa cứng.");
_wrapXoa("customer", "Xóa khách", async () => {
  const list = await apiGet("customers");
  return list.map((c) => ({ id: c.id, label: `${c.customer_name} (${c.so_tai_lieu || 0} tài liệu)` }));
}, "customer", "Khách đã có hóa đơn/báo giá/BBNT sẽ bị từ chối — dùng Gộp nếu là bản trùng.");
_wrapXoa("receivable", "Xóa nhắc nợ / UNC", async () => {
  const [rv, tt] = await Promise.all([apiGet("receivable"), apiGet("thanh_toan_list").catch(() => ({ rows: [] }))]);
  const nk = (rv.nhac_no || []).map((r) => ({ id: "nk-" + r.id, label: `[Nhắc nợ] ${r.code} · ${r.customer_name} · ${fmtDate(r.ngay)}` }));
  const un = (tt.rows || []).map((r) => ({ id: "tt-" + r.id, label: `[UNC] ${vnd(r.so_tien)} · ${r.customer_name || r.ma_hd || ""} · ${fmtDate(r.ngay)} (hoàn lại công nợ)` }));
  return nk.concat(un);
}, "nhac_no_hoac_unc");
// receivable can 2 loai — override hanh vi submit rieng
{
  const origRecv = RENDER.receivable;
  RENDER.receivable = async function (el) {
    await origRecv(el);
    const btn = $(".btn-xoa-receivable");
    if (btn) btn.onclick = async () => {
      const [rv, tt] = await Promise.all([apiGet("receivable"), apiGet("thanh_toan_list").catch(() => ({ rows: [] }))]);
      const rows = (rv.nhac_no || []).map((r) => ({ id: "nk-" + r.id, label: `[Nhắc nợ] ${r.code} · ${r.customer_name} · ${fmtDate(r.ngay)}` }))
        .concat((tt.rows || []).map((r) => ({ id: "tt-" + r.id, label: `[UNC] ${vnd(r.so_tien)} · ${r.customer_name || r.ma_hd || ""} · ${fmtDate(r.ngay)}` })));
      if (!rows.length) { toast("Chưa có nhắc nợ/UNC nào.", false); return; }
      openModal("🗑 Xóa nhắc nợ / ghi nhận thanh toán",
        `<div class="f wide"><label>Chọn</label><select name="id">${rows.map((r) =>
          `<option value="${r.id}">${esc(r.label)}</option>`).join("")}</select></div>
         <div class="f wide muted" style="font-size:12px">Xóa UNC sẽ HOÀN LẠI số đã thu vào công nợ (chỉ Giám đốc/Quản trị).</div>`,
        async (fd) => {
          if (!confirm("Chắc chắn xóa?")) return;
          const v = String(fd.get("id"));
          const loai = v.startsWith("tt-") ? "thanh_toan" : "nhac_no";
          await apiPost("write/xoa", { loai, id: Number(v.slice(3)) });
          closeModal(); toast("Đã xóa (có audit)."); RENDER.receivable(el);
        }, "Xóa vĩnh viễn");
    };
  };
}

/* ---- 5e. RA SOAT DU LIEU page (WO-14) --------------------------------------- */
RENDER.rasoat = async function (el) {
  const d = await apiGet("ra_soat");
  const rs = async (body, msg) => {
    const r = await apiPost("write/ra_soat", body);
    toast(msg + (r.so_ap_dung != null ? " (" + r.so_ap_dung + ")" : r.da_map != null ? " (" + r.da_map + ")" : ""));
    RENDER.rasoat(el);
    return r;
  };
  const PL = ["Công ty", "Cá nhân", "Công ty nhà nước", "Công ty nước ngoài", "Công trình lớn"];
  const plSel = (id, goiY) => `<select class="rs-pl" data-id="${id}">${PL.map((p) =>
    `<option ${p === goiY ? "selected" : ""}>${p}</option>`).join("")}</select>`;

  el.innerHTML = `
    ${metrics([["Tổng mục cần xử lý", String(d.tong_can_xu_ly), "nhóm A-E", d.tong_can_xu_ly ? "danger" : "ok"],
      ["A. Thiếu phân loại", String(d.A.so), "", d.A.so ? "warn" : "ok"],
      ["B. Thiếu MST", String(d.B.so), d.B.rac_nghi_ngo.length + " nghi là rác", d.B.so ? "warn" : "ok"],
      ["F. UNC đã ghi", d.F.so_unc + "/" + d.F.so_hd + " HĐ", "nhập để công nợ đúng", d.F.so_unc ? "info" : "warn"]])}

    ${panel(`A. Thiếu phân loại (${d.A.so}) — gợi ý theo từ khóa, anh quyết`, `
      <div class="toolbar"><button class="btn primary" id="rs-a-all">Áp dụng TẤT CẢ gợi ý (${d.A.so})</button></div>
      ${table(["Khách", "MST", "Chọn phân loại (điền sẵn gợi ý)", ""],
        d.A.rows.slice(0, 25).map((r) => [esc(r.customer_name), esc(r.tax_id || "—"),
          plSel(r.id, r.goi_y), `<button class="btn ghost btn-sm rs-a-one" data-id="${r.id}">Áp dụng</button>`]),
        { empty: "✅ Không còn khách thiếu phân loại." })}
      ${d.A.so > 25 ? `<div class="muted">Hiện 25/${d.A.so} — áp dụng dần hoặc dùng nút tất cả.</div>` : ""}`)}

    ${panel(`B. Folder rác nghi ngờ (${d.B.rac_nghi_ngo.length}) + khách thật thiếu MST (${d.B.khach_that.length})`, `
      <div class="toolbar"><button class="btn primary" id="rs-b-xoarac">Xóa ${d.B.rac_nghi_ngo.length} folder rác (giữ tài liệu)</button></div>
      ${table(["Nghi là rác", "Tài liệu", "BG/HĐ"], d.B.rac_nghi_ngo.map((r) =>
        [esc(r.customer_name), String(r.so_tai_lieu), r.so_bg + "/" + r.so_hd]),
        { empty: "Không có folder rác." })}
      <div class="muted" style="margin:8px 0 4px"><b>Khách thật thiếu MST</b> (nhập qua nút Sửa trên trang Khách hàng — 15 dòng đầu):</div>
      ${table(["Khách", "Nguồn", "Tài liệu"], d.B.khach_that.slice(0, 15).map((r) =>
        [esc(r.customer_name), esc(r.nguon || ""), String(r.so_tai_lieu)]))}`)}

    ${panel(`C. Báo giá chưa đối chiếu (${d.C.so}) — hệ tìm ứng viên, anh xác nhận`, `
      ${d.C.rows.some((r) => r.la_test) ? `<div class="toolbar"><button class="btn primary" id="rs-c-xoatest">🗑 Xóa dữ liệu TEST (Cty Test WO09 + chứng từ + UNC test)</button></div>` : ""}
      ${table(["Báo giá", "Khách", "Tiền", "HĐ ứng viên", ""],
        d.C.rows.map((r, i) => [esc(r.code) + (r.la_test ? " ⚠TEST" : ""), esc(r.customer_name || ""),
          vnd(r.grand_total),
          r.hd_ung_vien.length ? r.hd_ung_vien.map((h) => `${esc(h.ma_hd)} ${fmtDate(h.ngay)} ${vnd(h.tong)}`).join("<br>") : "<span class='muted'>không thấy HĐ gần khớp</span>",
          r.hd_ung_vien.length ? `<button class="btn ghost btn-sm rs-c-ok" data-q="${r.id}" data-h="${r.hd_ung_vien[0].id}">Xác nhận khớp</button>` : ""]),
        { empty: "✅ Không còn báo giá chờ đối chiếu." })}`)}

    ${panel(`D. Gán KTV chưa chuẩn (${d.D.so})${d.D.thieu_nhan_su.length ? " — thiếu nhân sự: " + d.D.thieu_nhan_su.map(esc).join(", ") : ""}`, `
      <div class="toolbar">
        <button class="btn primary" id="rs-d-auto">Tự map theo tên trùng khớp</button>
        ${d.D.thieu_nhan_su.map((t) => `<button class="btn ghost rs-d-taons" data-ten="${esc(t)}">+ Tạo nhân sự "${esc(t)}"</button>`).join("")}
      </div>
      ${table(["Việc", "Tên text", "Khớp nhân sự?", "Map vào", ""],
        d.D.rows.map((r) => [esc(r.code), esc(r.ktv_chinh),
          r.nhan_su_khop ? "✅ " + esc(r.nhan_su_khop.ho_ten) : "❌ chưa có",
          `<select class="rs-d-sel" data-cv="${r.id}">${d.D.nhan_su.map((n) =>
            `<option value="${n.id}" ${r.nhan_su_khop && n.id === r.nhan_su_khop.id ? "selected" : ""}>${esc(n.ho_ten)}</option>`).join("")}</select>`,
          `<button class="btn ghost btn-sm rs-d-map" data-cv="${r.id}">Map</button>`]),
        { empty: "✅ Mọi việc đã gán theo ID nhân sự." })}`)}

    ${panel(`E. HĐ bảo trì chưa có điểm/chu kỳ (${d.E.so})`, `
      ${table(["HĐ", "Khách", "Chu kỳ text cũ", "Gợi ý (tháng)", ""],
        d.E.rows.map((r) => [esc(r.code), esc(r.customer_name), esc(r.chu_ky || "—"),
          `<input class="rs-e-ck" data-hd="${r.id}" type="number" min="1" max="12" value="${r.goi_y_thang}" style="width:60px">`,
          `<button class="btn ghost btn-sm rs-e-add" data-hd="${r.id}" data-ten="${esc(r.customer_name)}">Tạo điểm + sinh mốc</button>`]),
        { empty: "✅ Mọi HĐBT đã có điểm bảo trì với chu kỳ." })}
      <div class="muted">Sonadezi nhiều điểm chu kỳ khác nhau → dùng nút "+ Hợp đồng bảo trì" hoặc thêm điểm ở trang Bảo trì.</div>`)}

    ${panel("F + G. Nhắc việc còn lại", `
      <div class="prio-row"><span>F. Ghi nhận thanh toán (UNC): mới ${d.F.so_unc}/${d.F.so_hd} hóa đơn — nhập ở trang Công nợ để công nợ đúng.</span></div>
      <div class="prio-row"><span>G. Thiếu SĐT: ${d.G.thieu_sdt} · thiếu email: ${d.G.thieu_email} · thiếu khu vực: ${d.G.thieu_khu_vuc} (ít khẩn, sửa dần qua nút Sửa khách)</span></div>`)}`;

  $("#rs-a-all", el).onclick = () => {
    const goiY = {}; d.A.rows.forEach((r) => { goiY[r.id] = r.goi_y; });
    rs({ action: "phan_loai", tat_ca_goi_y: true, goi_y: goiY }, "Đã áp dụng gợi ý phân loại");
  };
  el.querySelectorAll(".rs-a-one").forEach((b) => b.addEventListener("click", () => {
    const sel = el.querySelector(`.rs-pl[data-id="${b.dataset.id}"]`);
    rs({ action: "phan_loai", id: Number(b.dataset.id), value: sel.value }, "Đã phân loại");
  }));
  const btnRac = $("#rs-b-xoarac", el);
  if (btnRac) btnRac.onclick = () => {
    if (!confirm("Xóa " + d.B.rac_nghi_ngo.length + " folder rác khỏi danh sách khách? (Tài liệu vẫn giữ trong Kho hồ sơ)")) return;
    rs({ action: "xoa_rac", ids: d.B.rac_nghi_ngo.map((r) => r.id) }, "Đã xóa folder rác");
  };
  const btnTest = $("#rs-c-xoatest", el);
  if (btnTest) btnTest.onclick = () => {
    if (!confirm("Xóa toàn bộ dữ liệu TEST (khách Test WO09, báo giá, bộ chứng từ, UNC test)?")) return;
    rs({ action: "xoa_du_lieu_test" }, "Đã xóa dữ liệu test");
  };
  el.querySelectorAll(".rs-c-ok").forEach((b) => b.addEventListener("click", () =>
    rs({ action: "doi_chieu_xac_nhan", quotation_id: Number(b.dataset.q), hoa_don_id: Number(b.dataset.h) }, "Đã xác nhận khớp")));
  $("#rs-d-auto", el).onclick = () => rs({ action: "map_ktv_tu_dong" }, "Đã tự map theo tên");
  el.querySelectorAll(".rs-d-taons").forEach((b) => b.addEventListener("click", async () => {
    await apiPost("write/nhan_su", { ho_ten: b.dataset.ten, loai: "KTV" });
    _NS_CACHE = null; toast("Đã tạo nhân sự " + b.dataset.ten + " — giờ bấm 'Tự map'."); RENDER.rasoat(el);
  }));
  el.querySelectorAll(".rs-d-map").forEach((b) => b.addEventListener("click", () => {
    const sel = el.querySelector(`.rs-d-sel[data-cv="${b.dataset.cv}"]`);
    rs({ action: "map_ktv", cv_id: Number(b.dataset.cv), nhan_su_id: Number(sel.value) }, "Đã map");
  }));
  el.querySelectorAll(".rs-e-add").forEach((b) => b.addEventListener("click", () => {
    const ck = el.querySelector(`.rs-e-ck[data-hd="${b.dataset.hd}"]`);
    rs({ action: "them_diem_hdbt", hop_dong_id: Number(b.dataset.hd), ten_diem: b.dataset.ten + " — điểm chính",
        chu_ky_thang: Number(ck.value) }, "Đã tạo điểm + sinh mốc");
  }));
};

/* ---- 5f. AUDIT page --------------------------------------------------------- */
RENDER.audit = async function (el) {
  const d = await apiGet("audit");
  el.innerHTML = panel("Nhật ký thao tác (mới nhất trước, 200 dòng)",
    table(["Lúc", "User", "Vai trò", "Hành động", "Bảng", "ID", "Tóm tắt"],
      d.rows.map((r) => [fmtDateTime(r.thoi_gian), esc(r.user), esc(r.role),
        chip(r.hanh_dong), esc(r.bang), esc(r.ban_ghi_id), esc(r.tom_tat)]),
      { empty: "Chưa có thao tác ghi nào." }));
};

/* ==== WO-19/21B: hub "Bảng điều khiển theo Công ty" — board trái + panel chi tiết bước bên phải.
   Tiêu thụ 3 endpoint theo WO21_COMPANY_BOARD_API_CONTRACT (không bịa key):
   GET cong_ty_board (?q&phan_loai&con_no_only&treo_only&sort) · GET cong_ty_detail?id= · POST write/moc_danh_dau (2 pha). ==== */
const MOC_ICON = { xong: "✓", co: "○", thieu: "□", xong_ngoai: "✓", bo_qua: "⊘" };
const MOC_TT_LABEL = {
  xong: "Xong (tự động từ dữ liệu)", co: "Có dữ liệu, chưa hoàn tất", thieu: "Thiếu — chưa có gì trong app",
  xong_ngoai: "Xong — làm NGOÀI hệ thống", bo_qua: "Bỏ qua — không cần bước này",
};
const NGUON_LABEL = { manual: "Tự xác nhận", external_signed_paper: "Ký giấy ngoài hệ thống",
  external_email: "Qua email", external_zalo: "Qua Zalo", external_scan_folder: "Có scan trong folder" };
// Quyền đánh dấu (hợp đồng §4): GĐ / KT / KTT / Admin; Kinh doanh chỉ xem — server chốt 403.
// Giám đốc (Giam doc) được xác nhận TT mốc ngoài hệ thống như Kế toán.
const MOC_OVERRIDE_ROLES = ["Giam doc", "Ke toan", "Ky thuat truong", "Quan tri he thong"];
function canMocOverride() {
  if (!ME || !ME.role) return false;
  const r = String(ME.role).trim();
  if (MOC_OVERRIDE_ROLES.includes(r)) return true;
  // alias / gõ có dấu (phòng session hiển thị khác mã nội bộ)
  const n = r.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return n === "giam doc" || n.includes("giam doc") || n === "giam doc";
}

// WO-23 §2d: dải lợi nhuận (chỉ role ∈ profit). data_quality nhãn hóa cho người dùng.
function dqBadge(dq) {
  if (!dq) return "";
  const map = { du: ["ok", "đủ dữ liệu"], thieu_gia_von: ["warn", "thiếu giá vốn"], uoc_tinh: ["warn", "ước tính"] };
  const m = map[dq] || ["neutral", dq];
  return `<span class="chip ${m[0]}">${esc(m[1])}</span>`;
}
function profitLine(p) {
  if (!p) return "";
  const gv = p.total_cost != null ? p.total_cost
    : (p.equipment_cost || 0) + (p.material_cost || 0) + (p.labor_cost || 0) + (p.other_cost || 0);
  const ln = p.gross_profit != null ? p.gross_profit : (p.revenue || 0) - gv;
  return `<span class="pf">DT <b class="money">${vnd(p.revenue)}</b></span>
    <span class="pf">Giá vốn <b class="money">${vnd(gv)}</b></span>
    <span class="pf">Lợi nhuận <b class="money ${ln < 0 ? "ct-no" : ""}">${vnd(ln)}</b></span>
    ${marginBadge(p.margin_pct)}
    ${p.data_quality && p.data_quality !== "du" ? dqBadge(p.data_quality) : ""}`;
}

/* Drill-down đúng record (hợp đồng §6): mốc → route + tham số.
   Danh sách BBNT/BQT/Thư TT/DCCN chỉ có customer_name → kèm &kh=<tên> để trang đích tự mở đúng dòng. */
function mocDrillHash(tenMoc, qid, cid, khName) {
  const kh = "&kh=" + encodeURIComponent(khName || "");
  switch (tenMoc) {
    case "Khách hàng": return "#customer?customer_id=" + cid + kh;
    case "Báo giá": case "Hợp đồng": case "Checklist": case "PXK":
      return qid ? "#quotation?id=" + qid : "#quotation";
    case "BBNT": return "#bbnt?quotation_id=" + (qid || "") + "&customer_id=" + cid + kh;
    case "BQT": return "#bqt?quotation_id=" + (qid || "") + "&customer_id=" + cid + kh;
    case "Đề nghị TT": return "#payment?customer_id=" + cid + kh;
    case "DCCN": return "#dccn?customer_id=" + cid + kh;
    case "Thanh toán": return "#done?customer_id=" + cid + kh;
    default: return null; // 9 giai đoạn / giấy tờ đặc biệt → mở Kho hồ sơ lọc theo khách
  }
}

function mocIcon(m, ctx) {
  const tip = MOC_TT_LABEL[m.hien] || m.hien;
  const src = m.hien === "xong_ngoai" ? " (" + (NGUON_LABEL[m.source] || m.source || "") + ")" : "";
  return `<button type="button" class="moc ${m.hien}" data-moc="${esc(m.ten)}" data-ctx="${esc(ctx)}"
    aria-label="${esc(m.ten)}: ${esc(tip)}" title="${esc(m.ten)}: ${esc(tip)}${esc(src)}">${MOC_ICON[m.hien] || "□"}<i>${esc(m.ten)}</i></button>`;
}

/** Ghi nhớ tick TT ngoài (client) — phòng API board chưa trả thanh_toan_override (process cũ). */
const _TT_NGOAI_LOCAL = Object.create(null);
function markTtNgoaiLocal(customerId) {
  _TT_NGOAI_LOCAL[Number(customerId)] = "xong_ngoai";
  try {
    const k = "th_tt_ngoai_" + Number(customerId);
    sessionStorage.setItem(k, "xong_ngoai");
  } catch (e) { /* ignore */ }
}
function readTtNgoaiLocal(customerId) {
  const id = Number(customerId);
  if (_TT_NGOAI_LOCAL[id]) return _TT_NGOAI_LOCAL[id];
  try {
    return sessionStorage.getItem("th_tt_ngoai_" + id) || null;
  } catch (e) { return null; }
}
function patchBoardRowTt(r) {
  if (!r) return r;
  const loc = readTtNgoaiLocal(r.customer_id);
  if (loc && !r.thanh_toan_override) r.thanh_toan_override = loc;
  return r;
}
function ctBoardStatus(r) {
  patchBoardRowTt(r);
  const ttNgoai = r.thanh_toan_override === "xong_ngoai" || r.thanh_toan_override === "bo_qua";
  if (Number(r.con_no) <= 0.5 && !r.so_buoc_treo) return "Hoan thanh";
  // Tick TT ngoài → chip «Đã TT (ngoài)» dù còn nợ sổ (cột tiền vẫn đỏ).
  if (ttNgoai) return Number(r.con_no) > 0.5 ? "Da TT ngoai" : "Hoan thanh";
  if (r.so_buoc_treo) return "Dang thuc hien";
  return "Cho thanh toan";
}

/** Ghi thu 1 HĐ (có acting GĐ 2 pha). Trả so_tien đã ghi. */
async function _ghiThuHoaDonMot(cid, hoaDonId, soTien, ngay, note) {
  const payload = {
    customer_id: cid,
    hoa_don_id: hoaDonId,
    so_tien: soTien,
    ngay,
    ma_gd: "TT-NGOAI",
    ghi_chu: note,
  };
  let r = await apiPost("write/thanh_toan", {
    ...payload,
    acting_phase: (ME && ME.role === "Giam doc") ? "preview" : undefined,
  });
  if (r.acting_accounting || r.phase === "acting_preview") {
    // GĐ: lần 2 gộp — caller đã confirm số tiền tổng; auto-commit acting
    r = await apiPost("write/thanh_toan", {
      ...payload,
      acting_phase: "commit",
      acting_confirm_token: r.confirm_token,
    });
  }
  return r;
}

/** Xác nhận TT ngoài + GHI THU hết công nợ HĐ ban_ra (giảm «Công nợ phải thu»).
 *  Ưu tiên API gói; fallback từng HĐ qua write/thanh_toan (server cũ). */
async function ctQuickConfirmThanhToan(customerId, customerName, btn, onDone) {
  const canMoney = ME && ["Giam doc", "Ke toan", "Quan tri he thong"].includes(ME.role);
  if (!canMocOverride() && !canMoney) {
    toast("Chỉ Giám đốc / Kế toán / Quản trị được xác nhận thanh toán.", false);
    return;
  }
  const ok = window.confirm(
    `Xác nhận đã THANH TOÁN NGOÀI hệ thống cho:\n«${customerName || "công ty"}»?\n\n` +
    `• Đánh dấu mốc «Thanh toán» (audit)\n` +
    `• GHI THU hết phần còn nợ trên hóa đơn bán → GIẢM «Công nợ phải thu»\n` +
    `• Có audit — không hoàn tác tự động`);
  if (!ok) return;
  const old = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Đang ghi…"; }
  const cid = Number(customerId);
  const ngay = new Date().toISOString().slice(0, 10);
  const note = "Xác nhận TT ngoài từ bảng điều khiển công ty";
  const base = { customer_id: cid, settle_debt: true, ngay, ghi_chu: note, nguon: "manual" };

  async function markMocOnly() {
    const preview = await apiPost("write/moc_danh_dau", {
      phase: "preview", customer_id: cid, quotation_id: null,
      ten_moc: "Thanh toán", trang_thai: "xong_ngoai", nguon: "manual",
      ngay, ghi_chu: note,
    });
    await apiPost("write/moc_danh_dau", { phase: "commit", confirm_token: preview.confirm_token });
    markTtNgoaiLocal(cid);
  }

  async function settleLegacyPerInvoice() {
    if (!canMoney) {
      await markMocOnly();
      return { tong_thu: 0, so_hoa_don: 0, legacy: true };
    }
    const hd = await apiGet("hoa_don_khach", { customer_id: cid });
    const rows = (hd.rows || []).filter((x) => Number(x.con_no) > 0.5 || Number(x.hoa_don_id));
    // Ước tổng từ label nếu thiếu con_no (API cũ)
    let plan = [];
    for (const row of (hd.rows || [])) {
      let so = Number(row.con_no);
      if (!(so > 0.5) && row.label) {
        const m = String(row.label).match(/còn\s+([\d.]+)/i);
        // label uses fmt_vnd with dots — skip parse; require con_no
      }
      if (so > 0.5 && row.hoa_don_id) plan.push({ id: row.hoa_don_id, so, ma: row.ma_hd });
    }
    if (!plan.length) {
      // API cũ không trả con_no: lấy từ detail board không có → báo
      await markMocOnly();
      return { tong_thu: 0, so_hoa_don: 0, legacy: true, need_api: true };
    }
    const tong = plan.reduce((s, p) => s + p.so, 0);
    if (ME && ME.role === "Giam doc") {
      if (!confirm(
        `Giám đốc: sẽ ghi thu ${vnd(tong)} trên ${plan.length} hóa đơn của «${customerName || ""}».\n\n` +
        `XÁC NHẬN LẦN 2 để cộng tiền vào sổ?`)) {
        throw new Error("Đã hủy — chưa ghi thu.");
      }
    }
    let thu = 0, n = 0;
    for (const p of plan) {
      await _ghiThuHoaDonMot(cid, p.id, p.so, ngay, `${note} · ${p.ma || p.id}`);
      thu += p.so;
      n += 1;
    }
    try { await markMocOnly(); } catch (e) { /* mốc optional nếu đã xong */ }
    return { tong_thu: thu, so_hoa_don: n, legacy: true };
  }

  try {
    let r;
    try {
      r = await apiPost("write/xac_nhan_tt_ngoai_cong_ty", {
        ...base,
        acting_phase: (ME && ME.role === "Giam doc") ? "preview" : undefined,
      });
    } catch (e0) {
      const m0 = String(e0.message || e0);
      if (/404|API khong ton tai|Unknown|not found|xac_nhan_tt/i.test(m0)) {
        r = null;
        const leg = await settleLegacyPerInvoice();
        markTtNgoaiLocal(cid);
        toast(leg.tong_thu > 0
          ? `Đã ghi thu ${vnd(leg.tong_thu)} (${leg.so_hoa_don} HĐ) — làm mới trang để thấy công nợ giảm.`
          : (leg.need_api
            ? "Chỉ đánh dấu mốc. Restart service ERP (Admin) để ghi thu tự động."
            : "Không còn HĐ nợ / đã đánh dấu mốc."));
        if (onDone) await onDone();
        return;
      }
      throw e0;
    }
    if (r && (r.acting_accounting || r.phase === "acting_preview")) {
      const msg = r.message ||
        `Giám đốc: sẽ ghi thu ${vnd(r.tong_con_no || 0)} (${r.so_hoa_don || 0} HĐ) cho «${customerName || ""}».`;
      if (!confirm(msg + "\n\nXÁC NHẬN LẦN 2 để cộng tiền vào sổ?")) {
        toast("Đã hủy — chưa ghi thu / chưa giảm công nợ.", false);
        if (btn) { btn.disabled = false; btn.textContent = old; }
        return;
      }
      r = await apiPost("write/xac_nhan_tt_ngoai_cong_ty", {
        ...base,
        acting_phase: "commit",
        acting_confirm_token: r.confirm_token,
      });
    }
    markTtNgoaiLocal(cid);
    const thu = Number((r && r.tong_thu) || 0);
    toast(
      thu > 0
        ? `Đã ghi thu ${vnd(thu)} (${(r && r.so_hoa_don) || 0} HĐ) — bấm Làm mới, công nợ phải thu sẽ giảm.`
        : ((r && r.moc_marked)
          ? "Đã đánh dấu mốc TT (không còn HĐ nợ để thu)."
          : "Đã xử lý."),
    );
    if (onDone) await onDone();
  } catch (e) {
    toast(e.message || "Không xác nhận được", false);
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}

RENDER.congty = async function (el) {
  const canOverride = canMocOverride();
  const F = { q: "", phan_loai: "", con_no_only: 0, treo_only: 0, sort: "con_no_desc" };
  let detCache = {};          // cid -> detail (lazy)
  let sel = null;             // moc đang chọn: {cid, qid, ten}
  let plOpts = null;          // option phân loại — chốt từ lần tải đầu (đủ danh sách)

  pageActions([["btn-ct-rasoat", "🔎 Rà soát tên gộp", "ghost"]]);
  if ($("#btn-ct-rasoat")) $("#btn-ct-rasoat").onclick = () => { location.hash = "#rasoat"; };

  // WO-22/38: KPI phụ theo mockup — suy từ nguồn live khác (fail-soft, không bịa số)
  const X = { dangThiCong: null, quaHan: null, baoTriSap: null, hdSapHet: null, hdRows: [], noQuaHan: null, hoSoThieu: null };
  const extras = Promise.all([
    apiGet("kanban").then((kb) => { X.dangThiCong = (kb.data["Dang thi cong"] || []).length; }).catch(() => {}),
    apiGet("dashboard").then((dd) => { X.quaHan = dd.kpi.cv_qua_han; }).catch(() => {}),
    apiGet("cho_xep_lich").then((q) => { X.baoTriSap = (q.moc_den_han || []).length; }).catch(() => {}),
    // WO-38 (3.3): hợp đồng bán sắp hết hạn (endpoint mới) — dùng cho alert bar + stat
    apiGet("hop_dong_sap_het").then((h) => { X.hdSapHet = h.tong; X.hdRows = h.rows || []; }).catch(() => {}),
    apiGet("no_qua_han").then((n) => { X.noQuaHan = (n.rows || []).length; }).catch(() => {}),
  ]);

  el.innerHTML = `
    <div id="ct-alertbar"></div>
    <div id="ct-kpi"></div>
    <div class="toolbar board-filter">
      <input id="ct-q" class="field" style="max-width:280px" placeholder="Tìm theo tên công ty, MST…" aria-label="Tìm công ty">
      <select id="ct-pl" class="field" style="min-height:34px" aria-label="Phân loại công ty">
        <option value="">Phân loại: Tất cả</option>
      </select>
      <button class="btn ghost" id="ct-f-no" aria-pressed="false">Còn nợ</button>
      <button class="btn ghost" id="ct-f-treo" aria-pressed="false">Có bước chờ</button>
      <select id="ct-sort" class="field" style="min-height:34px" aria-label="Sắp xếp">
        <option value="con_no_desc">Nợ nhiều → ít</option>
        <option value="name_asc">Tên A → Z</option>
        <option value="step_desc">Nhiều bước chờ</option>
        <option value="bundle_desc">Nhiều bộ</option>
      </select>
      <span class="muted" id="ct-count" style="font-size:12px"></span>
      <button class="btn primary" id="ct-refresh" style="margin-left:auto">⟳ Làm mới</button>
    </div>
    <div id="ct-banner"></div>
    <div class="board-split">
      <div class="board-left">
        <div class="ct-cols"><span>Công ty (tên chuẩn hóa đơn)</span><span>Phân loại</span><span>Số bộ</span><span>Công nợ (phải thu)</span><span>Bước đang chờ</span><span>Trạng thái</span><span></span></div>
        <div id="ct-list"><div class="loading">Đang tải…</div></div>
      </div>
      <aside class="board-right"><section class="panel" id="moc-panel" aria-live="polite">
        <div class="panel-head"><h2 class="panel-title">Chi tiết bước</h2>
          <button class="btn ghost btn-sm" id="moc-panel-close">✕ Đóng</button></div>
        <div class="panel-body"><div class="empty">Bấm một mốc (✓ ○ □) trong bộ hồ sơ để xem chi tiết
          và đánh dấu "đã làm ngoài hệ thống" khi bước đó không nhập trong app.</div></div>
      </section></aside>
    </div>`;

  /* ---- panel chi tiết bước (cột phải sticky; mobile = drawer) ---- */
  const panelBody = () => $("#moc-panel .panel-body", el);
  const closePanel = () => { el.querySelector(".board-split").classList.remove("has-sel"); sel = null; };
  $("#moc-panel-close", el).onclick = closePanel;

  function drawPanel(det, cid, qid, moc, refresh) {
    sel = { cid, qid, ten: moc.ten };
    el.querySelector(".board-split").classList.add("has-sel");
    const kh = det.customer || det.khach || {};
    const boCode = qid ? ((det.bos || det.bo || []).find((b) => b.quotation_id === qid) || {}).code : null;
    const ov = moc.override;
    const drill = mocDrillHash(moc.ten, qid, cid, kh.customer_name);
    const isAutoDone = moc.auto === "xong";
    panelBody().innerHTML = `
      <div class="form-grid cols-1" style="gap:8px">
        <div class="form-field"><label>Bước</label><div class="form-value">${esc(moc.ten)}
          <span class="muted" style="font-weight:400">· ${boCode ? "bộ " + esc(boCode) : "cấp công ty"} · ${esc(kh.customer_name || "")}</span></div></div>
        <div class="form-field"><label>Trạng thái hiện tại</label>
          <div class="form-value"><span class="moc ${moc.hien}" style="cursor:default">${MOC_ICON[moc.hien]}<i>${esc(MOC_TT_LABEL[moc.hien] || moc.hien)}</i></span></div></div>
        ${ov ? `<div class="form-field"><label>Đánh dấu thủ công (audit)</label><div class="form-value" style="font-weight:400">
            ${esc(NGUON_LABEL[ov.nguon] || ov.nguon || "")}${ov.ngay ? " · ngày " + esc(fmtDate(ov.ngay)) : ""}${ov.nguoi ? " · bởi " + esc(ov.nguoi) : ""}
            ${ov.ghi_chu ? `<br><span class="muted">${esc(ov.ghi_chu)}</span>` : ""}</div></div>` : ""}
      </div>
      ${isAutoDone ? `<p class="muted" style="font-size:12px">Bước này ĐÃ XONG theo dữ liệu thật trong app — không cần (và không được) đánh dấu đè.</p>` : ""}
      ${!isAutoDone && canOverride ? `
        <div class="section-name">Đánh dấu thủ công</div>
        <form id="moc-form" class="form-grid cols-1" style="gap:8px">
          <div class="form-field"><label>Đánh dấu là</label>
            <select name="trang_thai" class="field">
              <option value="xong_ngoai">✓ Đã làm NGOÀI hệ thống</option>
              <option value="bo_qua">⊘ Bỏ qua — không cần bước này</option>
            </select></div>
          <div class="form-field"><label>Làm bằng cách nào (để audit)</label>
            <select name="nguon" class="field">
              <option value="external_signed_paper">Ký giấy ngoài hệ thống</option>
              <option value="manual">Tự xác nhận</option>
              <option value="external_email">Qua email</option>
              <option value="external_zalo">Qua Zalo</option>
              <option value="external_scan_folder">Có scan trong folder</option>
            </select></div>
          <div class="form-field"><label>Ngày làm</label><input type="date" name="ngay" class="field"></div>
          <div class="form-field"><label>Ghi chú</label><textarea name="ghi_chu" rows="2" class="field"
            placeholder="vd: BQT ký giấy 05/07, lưu tủ hồ sơ"></textarea></div>
          <div id="moc-preview"></div>
          <div class="toolbar" style="margin:0">
            <button type="submit" class="btn primary" id="moc-submit">Xem trước & xác nhận</button>
            ${ov ? `<button type="button" class="btn ghost danger" id="moc-del">🗑 Xóa đánh dấu</button>` : ""}
          </div>
          <div class="modal-err" id="moc-err"></div>
        </form>` : ""}
      ${!isAutoDone && !canOverride ? `<p class="muted" style="font-size:12px">🔒 Vai trò của bạn chỉ xem — đánh dấu thủ công dành cho Giám đốc / Kế toán / KTT / Quản trị.</p>` : ""}
      <div class="toolbar" style="margin:10px 0 0">
        ${drill ? `<button class="btn ghost" id="moc-open">Mở chứng từ →</button>` : ""}
        ${!drill ? `<button class="btn ghost" id="moc-open-doc">Mở kho hồ sơ →</button>` : ""}
      </div>`;
    if ($("#moc-open", el)) $("#moc-open", el).onclick = () => { location.hash = drill; };
    if ($("#moc-open-doc", el)) $("#moc-open-doc", el).onclick = () => {
      location.hash = "#documents?q=" + encodeURIComponent(kh.customer_name || "");
    };
    const form = $("#moc-form", el);
    if (form) {
      let confirmTok = null;
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const err = $("#moc-err", el); err.textContent = "";
        const fd = new FormData(form);
        const btn = $("#moc-submit", el); btn.disabled = true;
        try {
          if (!confirmTok) {
            // PHA 1 — preview: server trả tóm tắt + token, CHƯA ghi gì
            const r = await apiPost("write/moc_danh_dau", { phase: "preview",
              customer_id: cid, quotation_id: qid, ten_moc: moc.ten,
              trang_thai: fd.get("trang_thai"), nguon: fd.get("nguon"),
              ngay: fd.get("ngay"), ghi_chu: fd.get("ghi_chu") });
            confirmTok = r.confirm_token;
            const s = r.summary || {};
            $("#moc-preview", el).innerHTML = `<div class="moc-preview">
              Sắp ghi: <b>${esc(s.ten_moc || moc.ten)}</b> ${s.bundle ? "(bộ " + esc(s.bundle) + ")" : "(cấp công ty)"}
              — ${esc(MOC_TT_LABEL[s.old_state] || s.old_state)} → <b>${esc(MOC_TT_LABEL[s.new_state] || s.new_state)}</b>
              · nguồn: ${esc(NGUON_LABEL[s.nguon] || s.nguon || "")}<br>
              <span class="muted">Chưa ghi gì — bấm "Xác nhận ghi thật" để hoàn tất (có audit).</span></div>`;
            btn.textContent = "✔ Xác nhận ghi thật";
          } else {
            // PHA 2 — commit bằng token
            await apiPost("write/moc_danh_dau", { phase: "commit", confirm_token: confirmTok });
            confirmTok = null;
            toast(`Đã đánh dấu "${moc.ten}" (có audit).`);
            await refresh(moc.ten);
          }
        } catch (e2) {
          err.textContent = e2.message || "Lỗi";
          confirmTok = null; btn.textContent = "Xem trước & xác nhận";
        }
        btn.disabled = false;
      });
      // sửa form sau khi preview -> hủy token, quay về pha 1
      form.addEventListener("input", () => {
        if (confirmTok) { confirmTok = null; $("#moc-preview", el).innerHTML = "";
          $("#moc-submit", el).textContent = "Xem trước & xác nhận"; }
      });
      const del = $("#moc-del", el);
      if (del) del.onclick = async () => {
        if (!confirm(`Xóa đánh dấu thủ công của bước "${moc.ten}"? (có audit)`)) return;
        try {
          await apiPost("write/moc_danh_dau", { action: "xoa", customer_id: cid,
            quotation_id: qid, ten_moc: moc.ten });
          toast("Đã xóa đánh dấu (có audit)."); await refresh(moc.ten);
        } catch (e3) { $("#moc-err", el).textContent = e3.message || "Lỗi"; }
      };
    }
  }

  /* ---- vẽ chi tiết 1 công ty (accordion body) ---- */
  function drawDet(cid) {
    const det = detCache[cid];
    const body = $("#ct-body-" + cid, el);
    if (!det || !body) return;
    const khName = (det.customer || det.khach || {}).customer_name || "";
    const bos = det.bos || det.bo || [];
    const gd9 = det.giai_doan || det.giai_doan_9 || [];
    const qa = (hash, label) => `<button class="btn ghost btn-sm" data-go="${esc(hash)}">${esc(label)}</button>`;
    const mocTT = (det.moc_cong_ty || []).find((m) => m.ten === "Thanh toán");
    // Local session sau bấm Xác nhận — kể cả khi API detail vẫn trả ○ (process cũ).
    if (readTtNgoaiLocal(cid) === "xong_ngoai" && mocTT && mocTT.hien !== "xong") {
      mocTT.hien = "xong_ngoai";
      mocTT.source = mocTT.source || "manual";
    }
    if (mocTT && mocTT.hien === "xong_ngoai") markTtNgoaiLocal(cid);
    const ttDone = !!(mocTT && (mocTT.hien === "xong" || mocTT.hien === "xong_ngoai"))
      || readTtNgoaiLocal(cid) === "xong_ngoai";
    // Còn công nợ sổ → luôn cho GĐ/KT bấm ghi thu (kể cả đã tick mốc trước đó).
    const canQuickTT = (canOverride || (ME && ["Giam doc", "Ke toan", "Quan tri he thong"].includes(ME.role)))
      && Number(det.con_no) > 0.5;
    body.innerHTML = `
      <div class="ct-sec"><b>Mốc cấp CÔNG TY</b> <span class="muted">(DCCN & Thanh toán tính cả công ty — không gán bừa cho từng bộ)</span>
        <div class="moc-strip" style="align-items:center;flex-wrap:wrap;gap:8px">
          ${det.moc_cong_ty.map((m) => mocIcon(m, "ct")).join("")}
        </div>
        ${canQuickTT ? `<div class="toolbar" style="margin:10px 0 6px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn primary ct-quick-tt" data-cid="${cid}"
            style="font-weight:600;min-height:36px;padding:8px 14px"
            title="Ghi thu hết công nợ HĐ + đánh dấu mốc TT ngoài (audit).">
            ✔ Xác nhận TT &amp; ghi thu công nợ</button>
          <span class="muted" style="font-size:12px">Sẽ giảm cột «Công nợ phải thu» theo HĐ còn nợ · GĐ xác nhận 2 lần</span>
        </div>` : ""}
        ${ttDone
          ? `<div style="margin:8px 0"><span class="chip ok">Mốc TT: ${esc(MOC_TT_LABEL[(mocTT && mocTT.hien) || "xong_ngoai"])}</span>
            ${Number(det.con_no) > 0.5 ? `<span class="chip warn">Sổ vẫn còn nợ ${vnd(det.con_no)} — bấm ghi thu ở trên</span>` : ""}</div>` : ""}
        <span class="muted" style="font-size:11.5px">Tổng HĐ <span class="money">${vnd(det.tong_hd)}</span> · đã thu <span class="money">${vnd(det.da_thu)}</span> · còn nợ <b class="money ${det.con_no > 0.5 ? "ct-no" : ""}">${vnd(det.con_no)}</b> · ${det.so_lan_thu} lần thu</span></div>
      ${canProfit() && det._profit_ct ? `<div class="ct-sec"><b>Lợi nhuận công ty</b> <span class="muted">(ước tính từ giá vốn đã khớp)</span>
        <div class="profit-strip">${profitLine(det._profit_ct)}</div></div>` : ""}
      ${det.pr_chua_ghep.length ? `<div class="ct-sec"><b>Thư đề nghị TT cấp công ty — chưa xác định thuộc bộ nào (ghép tay):</b>
        ${det.pr_chua_ghep.map((p) => `<div class="queue-row"><span>${esc(p.code)} · <span class="money">${vnd(p.grand_total)}</span> · ${chip(p.status)}</span>
          <span><select class="pr-ghep-sel field" style="min-height:28px;padding:2px 6px" data-pr="${p.id}"><option value="">— chọn bộ —</option>
            ${bos.map((b) => `<option value="${b.quotation_id}">${esc(b.code)}</option>`).join("")}</select>
          <button class="btn ghost btn-sm pr-ghep" data-pr="${p.id}">Ghép</button></span></div>`).join("")}</div>` : ""}
      <div class="ct-sec"><b>Các bộ hồ sơ (${bos.length})</b> <span class="muted">1 bộ = 1 báo giá — bấm mốc để xem/đánh dấu</span>
        ${bos.length ? bos.map((b) => `
          <div class="bo-row">
            <div class="bo-info">
              <span class="code">${esc(b.code)}</span> ${b.loai_bao_gia ? chip(b.loai_bao_gia) : ""} ${chip(b.status)}
              <span class="muted">${fmtDate(b.ngay_lap)}</span> · <span class="money">${vnd(b.grand_total)}</span>
              ${b.hd_ma ? `· HĐ ${esc(b.hd_ma)} ${b.con_no != null ? (b.con_no > 0.5 ? `· <b class="ct-no money">còn ${vnd(b.con_no)}</b>` : "· ✓ thu đủ") : ""}` : `· <span class="muted">chưa ghép hóa đơn</span>`}
              ${b.thieu ? `· <span class="muted">${b.thieu} bước thiếu</span>` : ""}
              ${(b.pr_da_ghep || []).length ? `· <span class="muted">${b.pr_da_ghep.length} thư TT đã ghép</span>` : ""}
            </div>
            ${canProfit() && b._profit ? `<div class="bo-profit profit-strip">${profitLine(b._profit)}</div>` : ""}
            <div class="moc-strip">${b.moc.map((m) => mocIcon(m, "bo:" + b.quotation_id)).join("")}</div>
          </div>`).join("") : `<div class="empty">Chưa có báo giá cho công ty này — bấm [+ Lập báo giá] bên dưới.</div>`}</div>
      ${gd9.length ? `<div class="ct-sec"><b>Hồ sơ 9 giai đoạn</b> <span class="muted">(tự ✓ khi folder giai đoạn có file trên ổ D — nhóm ${esc((det.customer || det.khach || {}).phan_loai || "hồ sơ nặng")})</span>
        <div class="moc-strip">${gd9.map((g) => mocIcon({ ten: g.ten, hien: g.hien, auto: g.so_file ? "xong" : "thieu", source: g.source, override: g.hien === "xong_ngoai" || g.hien === "bo_qua" ? { nguon: g.source } : null }, "ct")).join("")}</div></div>` : ""}
      ${det.giay_to_dac_biet.length ? `<div class="ct-sec"><b>Giấy tờ đặc biệt của công ty này</b> <span class="muted">(theo GIAY_TO_DAC_BIET_2026)</span>
        <div class="moc-strip">${det.giay_to_dac_biet.map((g) => mocIcon({ ten: g.ten, hien: g.hien, auto: "thieu", source: g.source, override: g.hien === "xong_ngoai" || g.hien === "bo_qua" ? { nguon: g.source } : null }, "ct")).join("")}</div></div>` : ""}
      ${det.bao_tri.length ? `<div class="ct-sec"><b>Bảo trì định kỳ</b>: ${det.bao_tri.map((m) =>
        esc(m.ten_diem) + " (" + m.chu_ky_thang + " th/lần — " + m.xong + "/" + m.tong + " mốc xong)").join(" · ")}
        ${qa("#maintenance", "Mở bảo trì")}</div>` : ""}
      <div class="ct-sec toolbar" style="margin:0;border-bottom:0;flex-wrap:wrap;gap:8px" id="ct-actions-${cid}">
        ${canQuickTT ? `<button type="button" class="btn primary ct-quick-tt" data-cid="${cid}">✔ Xác nhận TT &amp; ghi thu công nợ</button>` : ""}
        ${qa("#quotation", "+ Lập báo giá")}
        ${qa("#dccn?customer_id=" + cid + "&kh=" + encodeURIComponent(khName), "Lập DCCN")}
        ${qa("#payment?customer_id=" + cid + "&kh=" + encodeURIComponent(khName), "Lập đề nghị TT")}
        ${qa("#customer?customer_id=" + cid + "&kh=" + encodeURIComponent(khName), "Hồ sơ khách 360°")}
        ${qa("#done?customer_id=" + cid + "&kh=" + encodeURIComponent(khName), "Đối chiếu công nợ")}
        <button class="btn ghost" id="ct-upload-${cid}">📤 Upload hồ sơ</button>
        <button class="btn ghost" id="ct-folder-${cid}">📂 Mở folder</button>
      </div>`;
    body.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.go; }));
    const upB = $("#ct-upload-" + cid, body), foB = $("#ct-folder-" + cid, body);
    if (upB) upB.onclick = () => uploadHoSoModal(cid, khName, () => location.hash = "#documents?q=" + encodeURIComponent(khName));
    if (foB) foB.onclick = () => openFolderHoSo(cid);
    // bấm mốc -> panel phải (không mở modal — WO-21B 2a MilestoneDetailPanel)
    const refresh = async (tenMoc) => {
      const old = detCache[cid];
      const d2 = await apiGet("cong_ty_detail", { customer_id: cid });
      // giữ lại lợi nhuận đã tải (đánh dấu mốc không đổi giá vốn/doanh thu)
      if (old) {
        if (old._profit_ct) d2._profit_ct = old._profit_ct;
        const oldBos = old.bos || old.bo || [];
        (d2.bos || d2.bo || []).forEach((b) => {
          const o = oldBos.find((x) => x.quotation_id === b.quotation_id);
          if (o && o._profit) b._profit = o._profit;
        });
      }
      detCache[cid] = d2; drawDet(cid);
      if (tenMoc) {
        const again = findMoc(d2, sel && sel.qid, tenMoc);
        if (again) drawPanel(d2, cid, sel && sel.qid, again, refresh);
      }
      loadBoard(true); // cập nhật chip trạng thái (Đã TT ngoài) + danh sách
    };
    body.querySelectorAll(".ct-quick-tt").forEach((qtt) => {
      qtt.onclick = (e) => {
        e.stopPropagation();
        ctQuickConfirmThanhToan(cid, khName, qtt, () => refresh("Thanh toán"));
      };
    });
    body.querySelectorAll(".moc").forEach((mEl) => mEl.addEventListener("click", () => {
      const ctx = mEl.dataset.ctx;
      const qid = ctx.indexOf("bo:") === 0 ? Number(ctx.slice(3)) : null;
      const moc = findMoc(det, qid, mEl.dataset.moc);
      if (moc) drawPanel(det, cid, qid, moc, refresh);
    }));
    body.querySelectorAll(".pr-ghep").forEach((btn) => btn.addEventListener("click", async () => {
      const s = body.querySelector(`.pr-ghep-sel[data-pr="${btn.dataset.pr}"]`);
      if (!s.value) { toast("Chọn bộ trước.", false); return; }
      try {
        await apiPost("write/ghep_payment", { payment_id: Number(btn.dataset.pr), quotation_id: Number(s.value) });
        toast("Đã ghép thư đề nghị TT vào bộ (có audit)."); await refresh();
      } catch (e) { toast(e.message || "Lỗi", false); }
    }));
  }

  function findMoc(det, qid, ten) {
    const bos = det.bos || det.bo || [];
    if (qid) { const b = bos.find((x) => x.quotation_id === qid); return b && b.moc.find((m) => m.ten === ten); }
    const gd9 = det.giai_doan || det.giai_doan_9 || [];
    return det.moc_cong_ty.find((m) => m.ten === ten)
      || gd9.map((g) => ({ ten: g.ten, hien: g.hien, auto: g.so_file ? "xong" : "thieu", source: g.source, override: g.hien === "xong_ngoai" || g.hien === "bo_qua" ? { nguon: g.source } : null })).find((m) => m.ten === ten)
      || det.giay_to_dac_biet.map((g) => ({ ten: g.ten, hien: g.hien, auto: "thieu", source: g.source, override: g.hien === "xong_ngoai" || g.hien === "bo_qua" ? { nguon: g.source } : null })).find((m) => m.ten === ten);
  }

  /* ---- danh sách công ty (filter/sort ở server — hợp đồng §2) ---- */
  async function loadBoard(redrawList = true) {
    const params = {};
    if (F.q) params.q = F.q;
    if (F.phan_loai) params.phan_loai = F.phan_loai;
    if (F.con_no_only) params.con_no_only = 1;
    if (F.treo_only) params.treo_only = 1;
    if (F.sort !== "con_no_desc") params.sort = F.sort;
    const d = await apiGet("cong_ty_board", params);
    await extras; // KPI phụ (kanban / quá hạn / bảo trì / hợp đồng sắp hết) — đã fail-soft
    // WO-38 (3.3): alert bar theo mockup — công nợ quá hạn · HĐ sắp hết hạn · rà soát tên gộp
    const alerts = [];
    if (X.noQuaHan) alerts.push(`⚠️ <b>${X.noQuaHan}</b> khách có công nợ quá hạn`);
    if (X.hdSapHet) alerts.push(`⏰ <b>${X.hdSapHet}</b> hợp đồng bán sắp hết hạn (30 ngày)`);
    if (d.can_ra_soat_gom_ten) alerts.push(`🔎 <b>${d.can_ra_soat_gom_ten}</b> tên công ty chưa gộp về tên chuẩn`);
    $("#ct-alertbar", el).innerHTML = alerts.length
      ? `<div class="ct-alert-bar">${alerts.map((a) => `<span>${a}</span>`).join("")}</div>` : "";
    $("#ct-kpi", el).innerHTML = metrics([
      ["Tổng số Công ty", String(d.tong.cong_ty), "có báo giá / hóa đơn", "info", "company"],
      ["Tổng số Bộ/Hợp đồng", String(d.tong.so_bo), "1 bộ = 1 báo giá", "info", "folder"],
      ["Công nợ phải thu", vnd(d.tong.con_no), "", d.tong.con_no > 0.5 ? "danger" : "ok", "money"],
      ["Bộ đang thực hiện", X.dangThiCong == null ? "—" : String(X.dangThiCong), "công trình đang thi công", "info", "play"],
      ["Hợp đồng sắp đến hạn", X.hdSapHet == null ? "—" : String(X.hdSapHet), "trong 30 ngày tới", X.hdSapHet ? "warn" : "ok", "doc"],
      ["Bảo trì sắp tới", X.baoTriSap == null ? "—" : String(X.baoTriSap), "mốc đến hạn chưa giao", "ok", "wrench"]]);
    // option phân loại: chốt từ lần tải đầy đủ đầu tiên (dữ liệu thật, không bịa nhóm)
    if (!plOpts) {
      plOpts = [...new Set(d.rows.map((r) => r.phan_loai).filter(Boolean))].sort();
      const sel2 = $("#ct-pl", el);
      if (sel2) sel2.innerHTML = `<option value="">Phân loại: Tất cả</option>` +
        plOpts.map((p) => `<option value="${esc(p)}">${esc(viStatus(p))}</option>`).join("");
    }
    $("#ct-banner", el).innerHTML = d.can_ra_soat_gom_ten ? `<div class="rs-banner" id="ct-rs-banner">
      🔎 ${d.can_ra_soat_gom_ten} tên công ty từ folder chưa gộp về tên chuẩn hóa đơn — bấm để rà soát (hệ không tự gộp ca mờ)</div>` : "";
    const bn = $("#ct-rs-banner", el);
    if (bn) bn.onclick = () => { location.hash = "#rasoat"; };
    $("#ct-count", el).textContent = d.rows.length + " công ty" + (F.q || F.phan_loai || F.con_no_only || F.treo_only ? " (đang lọc)" : "");
    if (!redrawList) return;
    // Trạng thái: công nợ sổ + bước treo + tick TT ngoài (API hoặc session local sau bấm Xác nhận).
    // Cột tiền vẫn hiện con_no — tick ngoài KHÔNG xóa nợ sổ.
    d.rows.forEach((r) => {
      if (r.thanh_toan_override === "xong_ngoai" || r.thanh_toan_override === "bo_qua") {
        markTtNgoaiLocal(r.customer_id);
      }
      patchBoardRowTt(r);
    });
    $("#ct-list", el).innerHTML = d.rows.length ? d.rows.map((r) => {
      const st = ctBoardStatus(r);
      const ttDone = r.thanh_toan_override === "xong_ngoai" || r.thanh_toan_override === "bo_qua";
      return `
      <div class="ct-card" data-id="${r.customer_id}">
        <div class="ct-head cols" data-id="${r.customer_id}" role="button" tabindex="0" aria-expanded="false">
          <span class="ct-main"><span class="ct-caret">▸</span>
            <span style="min-width:0"><span class="ct-name">${esc(r.customer_name)}</span><br>
              <span class="ct-mst">${r.tax_id ? "MST " + esc(r.tax_id) : "Chưa có MST"}${r.ho_so_nang ? " · hồ sơ 9 giai đoạn" : ""}</span></span></span>
          <span>${r.phan_loai ? chip(r.phan_loai) : `<span class="muted">—</span>`}</span>
          <span class="ct-num">${r.so_bo}</span>
          <span class="ct-cell-money ${r.con_no > 0.5 ? "ct-no" : ""}" title="${r.con_no > 0.5 ? "Còn nợ trên sổ hóa đơn (không bị xóa bởi đánh dấu mốc)" : "Hết nợ sổ"}">${r.con_no > 0.5 ? vnd(r.con_no) : "0 đ"}</span>
          <span>${r.so_buoc_treo ? `<span class="chip warn">${r.so_buoc_treo} bước chờ</span>` : `<span class="muted">Không có</span>`}</span>
          <span class="ct-status-cell" style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;max-width:240px"
            title="${ttDone ? "Đã đánh dấu Thanh toán ngoài hệ thống (audit)" : (r.con_no > 0.5 ? "Còn nợ sổ — bấm Xác nhận TT để chốt mốc" : "")}">
            ${chip(st)}
            ${canOverride && Number(r.con_no) > 0.5
              ? `<button type="button" class="btn primary btn-sm ct-row-confirm-tt" data-cid="${r.customer_id}"
                  data-name="${esc(r.customer_name)}"
                  style="white-space:nowrap"
                  title="Ghi thu hết công nợ HĐ + mốc TT ngoài (audit)">Xác nhận TT</button>`
              : ""}
          </span>
          <span class="muted">⌄</span>
        </div>
        <div class="ct-body" id="ct-body-${r.customer_id}"></div>
      </div>`;
    }).join("")
      : `<div class="empty">Không có công ty khớp bộ lọc — xóa ô tìm / bỏ lọc để xem tất cả.</div>`;
    const toggle = async (h) => {
      const cid = Number(h.dataset.id);
      const card = h.closest(".ct-card");
      const body = $("#ct-body-" + cid, el);
      if (card.classList.contains("open")) {
        card.classList.remove("open"); h.setAttribute("aria-expanded", "false"); body.innerHTML = ""; return;
      }
      card.classList.add("open"); h.setAttribute("aria-expanded", "true");
      body.innerHTML = `<div class="loading">Đang tải…</div>`;
      try {
        const det = await apiGet("cong_ty_detail", { customer_id: cid });
        // WO-23 §2d: lợi nhuận theo Bộ + tổng công ty — CHỈ role ∈ profit; backend 403/thiếu field → bỏ qua êm
        if (canProfit()) {
          const bos = det.bos || det.bo || [];
          const [ctProfit, boProfits] = await Promise.all([
            apiGet("profit_by_customer", { customer_id: cid }).catch(() => null),
            Promise.all(bos.map((b) => apiGet("profit_by_quotation", { quotation_id: b.quotation_id }).catch(() => null))),
          ]);
          det._profit_ct = ctProfit;
          bos.forEach((b, i) => { b._profit = boProfits[i]; });
        }
        detCache[cid] = det;
        drawDet(cid);
      } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message || "Không tải được")}</div>`; }
    };
    el.querySelectorAll(".ct-head").forEach((h) => {
      h.addEventListener("click", (ev) => {
        if (ev.target.closest(".ct-row-confirm-tt, button, a")) return;
        toggle(h);
      });
      h.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          if (ev.target.closest(".ct-row-confirm-tt, button, a")) return;
          ev.preventDefault();
          toggle(h);
        }
      });
    });
    el.querySelectorAll(".ct-row-confirm-tt").forEach((b) => {
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const cid = Number(b.dataset.cid);
        const name = b.dataset.name || "";
        ctQuickConfirmThanhToan(cid, name, b, async () => {
          // Làm mới board + nếu accordion đang mở thì vẽ lại chi tiết
          await loadBoard(true);
          const card = el.querySelector(`.ct-card[data-id="${cid}"]`);
          if (card && card.classList.contains("open")) {
            const head = card.querySelector(".ct-head");
            if (head) {
              card.classList.remove("open");
              await toggle(head);
            }
          }
        });
      });
    });
  }

  let qTimer = null;
  $("#ct-q", el).addEventListener("input", (ev) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { F.q = ev.target.value.trim(); loadBoard(); }, 300);
  });
  const flip = (btn, key) => {
    F[key] = F[key] ? 0 : 1;
    btn.classList.toggle("primary", !!F[key]);
    btn.classList.toggle("ghost", !F[key]);
    btn.setAttribute("aria-pressed", F[key] ? "true" : "false");
    loadBoard();
  };
  $("#ct-f-no", el).onclick = () => flip($("#ct-f-no", el), "con_no_only");
  $("#ct-f-treo", el).onclick = () => flip($("#ct-f-treo", el), "treo_only");
  $("#ct-sort", el).onchange = (ev) => { F.sort = ev.target.value; loadBoard(); };
  $("#ct-pl", el).onchange = (ev) => { F.phan_loai = ev.target.value; loadBoard(); };
  $("#ct-refresh", el).onclick = () => { detCache = {}; loadBoard(); };

  await loadBoard();
};

/* ==== WO-19 P6 / WO-21B 2d: drill-down — trang chứng từ tự mở đúng dòng theo tham số hash ==== */
/* Bảng danh sách các trang này chỉ có customer_name → khớp theo &kh=<tên>; quotation khớp theo id. */
function autoOpenRow(el, list, match) {
  const i = list.findIndex(match);
  if (i < 0) return false;
  const tr = el.querySelectorAll("tbody tr.clickable")[i];
  if (tr) { tr.click(); tr.scrollIntoView({ block: "center" }); return true; }
  return false;
}
{
  const _quoDrill = RENDER.quotation;
  RENDER.quotation = async function (el) {
    await _quoDrill(el);
    const qid = Number((window.ROUTE_Q || {}).id);
    if (qid) {
      try {
        const list = await apiGet("quotations");
        autoOpenRow(el, list, (q) => q.id === qid);
      } catch (e) { /* bo qua */ }
      window.ROUTE_Q = {};
    }
  };
}
// bbnt / bqt / payment / dccn: mở đúng dòng của khách được truyền qua &kh=
for (const [pageId, api] of [["bbnt", "bbnt"], ["bqt", "bqt"], ["payment", "payment"], ["dccn", "dccn"]]) {
  const orig = RENDER[pageId];
  RENDER[pageId] = async function (el) {
    await orig(el);
    const kh = (window.ROUTE_Q || {}).kh;
    if (kh) {
      try {
        const list = await apiGet(api);
        if (!autoOpenRow(el, list, (r) => r.customer_name === kh))
          toast(`${kh}: chưa có ${pageId.toUpperCase()} trong app — dùng nút tạo/Sinh bộ 7 chứng từ.`, false);
      } catch (e) { /* bo qua */ }
      window.ROUTE_Q = {};
    }
  };
}
// customer: mở hồ sơ 360° đúng khách
{
  const orig = RENDER.customer;
  RENDER.customer = async function (el) {
    await orig(el);
    const kh = (window.ROUTE_Q || {}).kh;
    if (kh) {
      try {
        const list = await apiGet("customers");
        autoOpenRow(el, list, (c) => c.customer_name === kh);
      } catch (e) { /* bo qua */ }
      window.ROUTE_Q = {};
    }
  };
}
// done: cuộn tới + tô sáng đúng khách (bảng done không clickable)
{
  const orig = RENDER.done;
  RENDER.done = async function (el) {
    await orig(el);
    const kh = (window.ROUTE_Q || {}).kh;
    if (kh) {
      const cell = Array.from(el.querySelectorAll("tbody td")).find((td) => td.textContent.trim() === kh);
      if (cell) {
        cell.closest("tr").classList.add("row-hilite");
        cell.scrollIntoView({ block: "center" });
      }
      window.ROUTE_Q = {};
    }
  };
}
// documents: nhận ?q=<tên khách> từ hub (lọc kho hồ sơ theo khách)
{
  const orig = RENDER.documents;
  RENDER.documents = async function (el, query) {
    const q = (window.ROUTE_Q || {}).q;
    if (!query && q) { window.ROUTE_Q = {}; return orig(el, { q }); }
    return orig(el, query);
  };
}

/* ==== WO-22: trang "Cấu hình & Danh mục" (id template) — căn mockup.
   Danh mục = ĐẾM LIVE từ API sẵn có; khối chưa có nguồn (loại máy, quy trình tự động,
   toggle quy tắc, phiên bản mẫu) = EMPTY-STATE, không bịa số. ==== */
RENDER.template = async function (el) {
  const d = await apiGet("template");
  const c = d.cfg || {};
  const [tax, pricing, ns, ist, custs, audit, cth] = await Promise.all([
    apiGet("tax").catch(() => null),
    apiGet("pricing").catch(() => null),
    apiGet("nhan_su").catch(() => null),
    apiGet("import_status").catch(() => null),
    apiGet("customers").catch(() => null),
    apiGet("audit").catch(() => null),
    apiGet("cau_hinh_tong_hop").catch(() => null),  // WO-38 (3.4): ma trận quyền THẬT + 00-09 + audit hôm nay
  ]);
  const nsRows = (ns && ns.rows) || [];
  const nhomKh = custs ? [...new Set(custs.map((x) => x.phan_loai).filter(Boolean))].length : null;
  const isAdmin = ME && ["Giam doc", "Quan tri he thong"].includes(ME.role);
  const acts = [["btn-cfg-edit", "✎ Thông tin công ty"], ["btn-letterhead", "Xem letterhead", "ghost"]];
  if (isAdmin) acts.push(["btn-goto-audit", "📜 Nhật ký hệ thống", "ghost"]);
  pageActions(acts);

  // danh mục hệ thống — nguồn live + link mở trang tương ứng
  Object.assign(VI_STATUS, { "Dang dung": "Đang dùng" });
  const cats = [
    ["👥 Khách hàng", custs ? custs.length : (ist ? ist.khach : null), "#customer"],
    ["📦 Vật tư / mặt hàng (từ hóa đơn)", ist ? ist.mat_hang : null, "#pricing"],
    ["🧰 Nhân sự (Thợ / KTV / CTV)", nsRows.length || null, "#nhansu"],
    ["🧾 Mẫu in chứng từ", (d.mau_in || []).length, null],
    ["💰 Phiếu import giá NCC", pricing ? pricing.imports.length : null, "#pricing"],
    ["📈 Lịch sử giá vật tư", pricing ? pricing.history.length : null, "#pricing"],
    ["🏛️ Quy tắc Thuế / VAT", tax ? tax.rows.length : null, "#tax"],
  ];
  const catRows = cats.map(([ten, so, go]) => [esc(ten),
    so == null ? `<span class="muted">—</span>` : `<b>${so}</b>`,
    so ? chip("Dang dung") : chip("Chua co"),
    go ? `<span class="cat-actions"><button class="btn ghost btn-sm" data-go4="${esc(go)}">Mở</button></span>` : ""]);

  // phân quyền hiển thị nav (đúng cấu hình client MENU_ROLES đang chạy; server vẫn chốt 403)
  const ROLE_LIST = ["Giam doc", "Ke toan", "Kinh doanh", "Ky thuat truong", "Ky thuat vien", "Thu kho", "Quan tri he thong"];
  const navNameOf = (id) => { const p = PAGES.find((x) => x.id === id); return p ? (p.navName || p.name) : id; };
  const permRows = ROLE_LIST.map((r) => {
    const visible = NAV_MAIN.filter((id) => !MENU_ROLES[id] || MENU_ROLES[id].includes(r))
      .concat(NAV_ROLE_EXTRA[r] || []);
    return [esc(r), [...new Set(visible)].map((id) => `<span class="chip ${r === "Ky thuat vien" || r === "Thu kho" ? "neutral" : "info"}" style="margin:1px">${esc(navNameOf(id))}</span>`).join(" ")];
  });

  // lịch sử cấu hình = audit lọc bảng cau_hinh (chỉ GĐ/Quản trị gọi được audit)
  const cfgLog = audit ? (audit.rows || []).filter((r) => r.bang === "cau_hinh").slice(0, 6) : null;
  const cfgLogHtml = cfgLog === null
    ? `<div class="empty">Nhật ký cấu hình: chỉ Giám đốc / Quản trị xem được.</div>`
    : (cfgLog.length ? `<div class="act-list">${cfgLog.map((r) => `
        <div class="act-row"><div><b>${esc(r.user)}</b><div class="muted">${esc(r.tom_tat || "")}</div></div>
        <div class="act-time">${esc(fmtDateTime(r.thoi_gian))}</div></div>`).join("")}</div>`
      : `<div class="empty">Chưa có thay đổi cấu hình nào được ghi nhận.</div>`);

  // WO-38 (3.4): 6 stat theo mockup Cấu hình — số THẬT từ cau_hinh_tong_hop
  const wfN = cth && cth.workflow ? cth.workflow.tong : null;
  const ct09N = cth && cth.ct_00_09 ? cth.ct_00_09.tong_mau : (d.mau_in || []).length;
  el.innerHTML = `
    ${metrics([
      ["Tổng vai trò", cth ? String(cth.tong_vai_tro) : "7", "vai trò hệ thống", "info", "people"],
      ["Tổng workflow", wfN == null ? "—" : String(wfN), "quy trình đã seed", "purple", "gear"],
      ["Mẫu biểu chuẩn (00-09)", String(ct09N), "mã tài liệu công trình", "warn", "doc"],
      ["Danh mục vật tư", ist ? String(ist.mat_hang) : "—", "mặt hàng từ hóa đơn", "info", "db"],
      ["Cảnh báo hệ thống", ist && ist.khach_chua_khop ? String(ist.khach_chua_khop) : "0", "cần rà soát", ist && ist.khach_chua_khop ? "danger" : "ok", "alert"],
      ["Audit log hôm nay", cth ? String(cth.audit_hom_nay) : "—", "thao tác ghi trong ngày", "ok", "bank"]])}
    <div class="grid cols-2" style="margin-top:14px">
      ${panel("Danh mục hệ thống", table(["Danh mục", "Số lượng", "Trạng thái", "Thao tác"], catRows)
        + `<div class="muted" style="font-size:11.5px;margin-top:6px">Chưa có nguồn: nhà cung cấp, nhóm vật tư, đơn vị tính, loại máy/thiết bị, bảng đơn giá nhân công — xem "field còn thiếu".</div>`)}
      ${panel("Thiết lập nhanh", `<div class="quick-grid">
        <button class="quick-card" id="qk-cfg"><span class="qc-ico">${ICO.company}</span><b>Thông tin công ty</b><span>Tên, MST, địa chỉ, hotline in trên chứng từ</span></button>
        <button class="quick-card info" data-go4="#quotation"><span class="qc-ico">${ICO.doc}</span><b>Cấu hình báo giá</b><span>Lập / phiên bản / sinh bộ chứng từ</span></button>
        <button class="quick-card ok" data-go4="#bbnt"><span class="qc-ico">${ICO.doc}</span><b>Mẫu BBNT</b><span>Biên bản nghiệm thu công trình</span></button>
        <button class="quick-card ok" data-go4="#bqt"><span class="qc-ico">${ICO.doc}</span><b>Mẫu BQT</b><span>Bảng quyết toán công trình</span></button>
        <button class="quick-card warn" data-go4="#payment"><span class="qc-ico">${ICO.doc}</span><b>Mẫu Thư đề nghị TT</b><span>Thư đề nghị thanh toán theo đợt</span></button>
        <button class="quick-card purple" data-go4="#pricing"><span class="qc-ico">${ICO.db}</span><b>Danh mục vật tư</b><span>Giá NCC, lịch sử giá bất biến</span></button>
        <button class="quick-card" data-go4="#nhansu"><span class="qc-ico">${ICO.people}</span><b>Danh mục nhân sự</b><span>Thợ / KTV / CTV, năng suất</span></button>
        <button class="quick-card info" data-go4="#import"><span class="qc-ico">${ICO.bank}</span><b>Tích hợp sao kê</b><span>Nạp sao kê ACB / VCB, khớp tự động</span></button>
        ${isAdmin ? `<button class="quick-card warn" data-go4="#audit"><span class="qc-ico">${ICO.gear}</span><b>Nhật ký hệ thống</b><span>Audit mọi thao tác ghi</span></button>` : ""}
      </div>`)}
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      ${panel("Mẫu chứng từ & biểu mẫu", table(["Tên mẫu", "Dùng khi", "Phiên bản", "Cập nhật gần nhất", "Trạng thái"],
        (d.mau_in || []).map((m) => [esc(viStatus(m.ten)), esc(viStatus(m.dung_khi)),
          `<span class="muted">—</span>`, `<span class="muted">—</span>`, chip(m.trang_thai)]))
        + `<div class="muted" style="font-size:11.5px;margin-top:6px">Phiên bản / ngày cập nhật mẫu: hệ chưa lưu — cần backend bổ sung.</div>`)}
      ${panel("Cấu hình quy tắc vận hành",
        `<div class="empty">Các quy tắc (tự sinh mã chứng từ, tự nhắc công nợ quá hạn, cảnh báo thiếu hồ sơ, khóa sửa sau duyệt…)
         hiện chạy CỐ ĐỊNH trong backend — chưa có API đọc / bật-tắt.<br>
         <span class="muted">Cần backend: GET/POST cấu hình vận hành (nhac_truoc_ngay, no_qua_han_ngay, lich_bat_dau_tu, các toggle) — xem "field còn thiếu".</span></div>`)}
    </div>
    ${cth && cth.read_permissions ? `<div style="margin-top:14px">${panel("Ma trận quyền truy cập theo vai trò (từ PERMS backend)",
      table(["Module"].concat((cth.roles || []).map((r) => r.replace("Ky thuat ", "KT ").replace("Kinh doanh", "KD").replace("Ke toan", "KT.toán").replace("Quan tri he thong", "QT").replace("Giam doc", "GĐ").replace("Thu kho", "Kho"))),
        cth.read_permissions.map((m) => [esc(m.module)].concat((cth.roles || []).map((r) => m.roles[r]
          ? `<span style="color:var(--ok);font-size:15px">●</span>` : `<span class="muted">○</span>`))))
      + `<div class="muted" style="font-size:11.5px;margin-top:6px">● = có quyền xem · ○ = không. Đây là PERMS THẬT ở server (${cth.read_permissions.length} module × ${(cth.roles || []).length} vai trò), không phải suy từ nav.</div>`)}</div>` : ""}
    <div class="grid cols-2" style="margin-top:14px">
      ${panel("Phân quyền nav (đang áp dụng phía client)", table(["Vai trò", "Menu được thấy"], permRows)
        + `<div class="muted" style="font-size:11.5px;margin-top:6px">Gating nav client (MENU_ROLES); server luôn chặn 403 độc lập.</div>`)}
      ${panel("Lịch sử cấu hình gần đây", cfgLogHtml)}
    </div>
    ${cth && cth.ct_00_09 ? `<div style="margin-top:14px">${panel("Bộ template chuẩn 00-09 (" + cth.ct_00_09.tong_mau + " mã)",
      `<div class="hs-grid">${cth.ct_00_09.rows.map((r) => `<div class="hs-card"><div class="hs-code">${esc(r.ma_mau)}</div><div class="hs-title">${esc(r.title)}</div></div>`).join("")}</div>`)}</div>` : ""}
    <div class="grid cols-2" style="margin-top:14px">
      ${panel("Thông tin in trên chứng từ", formGrid([
        ["Tên công ty", c.ten_cong_ty || "—"], ["Mã số thuế", c.ma_so_thue || "—"], ["Địa chỉ", c.dia_chi || "—"],
        ["Điện thoại", c.dien_thoai || "—"], ["Website", c.website || "—"], ["Hotline KT", c.hotline_kt || "—"],
      ], 2))}
      ${panel("Liên kết chức năng", `<div class="quick-grid">
        <button class="quick-card warn" data-go4="#quotation"><span class="qc-ico">${ICO.money}</span><b>Báo giá</b><span>Lập báo giá mới</span></button>
        <button class="quick-card" data-go4="#congty"><span class="qc-ico">${ICO.board}</span><b>Bảng điều khiển theo Công ty</b><span>Hub công việc</span></button>
        <button class="quick-card ok" data-go4="#import"><span class="qc-ico">${ICO.db}</span><b>Import dữ liệu</b><span>Nhập liệu & rà soát</span></button>
        <button class="quick-card purple" data-go4="#documents"><span class="qc-ico">${ICO.folder}</span><b>Hồ sơ công trình</b><span>Kho hồ sơ D:\\2026</span></button>
      </div>`)}
    </div>`;

  el.querySelectorAll("[data-go4]").forEach((b) =>
    b.addEventListener("click", () => { location.hash = b.dataset.go4; }));
  if ($("#btn-goto-audit")) $("#btn-goto-audit").onclick = () => { location.hash = "#audit"; };
  if ($("#btn-cfg-edit")) $("#btn-cfg-edit").onclick = () => {
    const w = openModal("Sửa thông tin công ty (in trên chứng từ)",
      fI("ten_cong_ty", "Tên công ty") + fI("ma_so_thue", "Mã số thuế") +
      fI("dia_chi", "Địa chỉ") + fI("dien_thoai", "Điện thoại") +
      fI("website", "Website") + fI("hotline_kt", "Hotline kỹ thuật"),
      async (fd) => {
        const body = {};
        ["ten_cong_ty", "ma_so_thue", "dia_chi", "dien_thoai", "website", "hotline_kt"].forEach((k) => {
          const v = fd.get(k);
          if (v !== null && String(v).trim() !== "") body[k] = v;
        });
        await apiPost("write/cau_hinh", body);
        closeModal(); toast("Đã lưu thông tin công ty (có audit).");
        CFG = Object.assign({}, CFG, body);
        RENDER.template(el);
      });
    ["ten_cong_ty", "ma_so_thue", "dia_chi", "dien_thoai", "website", "hotline_kt"].forEach((k) => {
      const inp = w.querySelector(`[name="${k}"]`);
      if (inp) inp.value = c[k] || "";
    });
  };
  if ($("#qk-cfg")) $("#qk-cfg").onclick = () => { const b = $("#btn-cfg-edit"); if (b) b.click(); };
  if ($("#btn-letterhead")) $("#btn-letterhead").onclick = () => openModal("Letterhead mẫu in (xem trước)",
    `<div class="f wide">${docPreview(c, "Mẫu letterhead chứng từ", [], [], [], null, "Khách hàng", "Cơ điện lạnh Thanh Hoài")}</div>`,
    async () => closeModal(), "Đóng");
};

/* ==== WO31 (FIND-004): Gộp khách trùng — BẮT BUỘC 2 bước preview -> commit.
   Trước WO31, KHÔNG có UI nào gọi write/gop_khach (đã xác nhận bằng grep) — server
   chỉ có nhánh legacy phase=None (giờ đã bị chặn hẳn, xem api_write.gop_khach).
   Tái dùng đúng pattern preview/commit-token của moc_danh_dau (state confirmTok
   giữ trong closure của handler submit): bấm lần 1 -> phase=preview (server CHƯA
   ghi gì, trả tóm tắt + cảnh báo không-thể-hoàn-tác + confirm_token); bấm lần 2
   (label đổi thành "Xác nhận GỘP") -> phase=commit bằng confirm_token đó. ==== */
{
  const orig = RENDER.customer;
  RENDER.customer = async function (el) {
    await orig(el);
    const tb = $("#page-actions");
    if (!tb || $("#btn-kh-gop", tb)) return;
    tb.insertAdjacentHTML("beforeend",
      `<button class="btn ghost danger" id="btn-kh-gop">🔗 Gộp khách trùng</button>`);
    $("#btn-kh-gop", tb).onclick = async () => {
      await khDatalist(); // nạp/refresh _KH_CACHE dùng chung datalist bên dưới
      let confirmTok = null;
      const w = openModal("🔗 Gộp khách trùng (2 bước — không thể hoàn tác)",
        `<div class="f wide"><label>Khách GIỮ LẠI (keep)</label>
          <input name="_keep" list="dl-kh-gop" placeholder="Gõ tên khách..." required autocomplete="off"></div>
         <div class="f wide"><label>Khách BỊ GỘP/XÓA (drop)</label>
          <input name="_drop" list="dl-kh-gop" placeholder="Gõ tên khách..." required autocomplete="off"></div>
         <datalist id="dl-kh-gop">${_KH_CACHE.map((c) => `<option value="${esc(c.customer_name)}">`).join("")}</datalist>
         <div class="f wide"><label><input type="checkbox" name="move_files"> Di chuyển file thật (folder khách bị gộp → folder khách giữ lại)</label></div>
         <div id="gop-kh-preview"></div>`,
        async (fd) => {
          if (!confirmTok) {
            // PHA 1 — preview: server CHƯA ghi gì, chỉ trả tóm tắt + confirm_token.
            const keepName = (fd.get("_keep") || "").trim();
            const dropName = (fd.get("_drop") || "").trim();
            const keep = (_KH_CACHE.find((c) => c.customer_name === keepName) || {}).id;
            const drop = (_KH_CACHE.find((c) => c.customer_name === dropName) || {}).id;
            if (!keep || !drop) throw new Error("Chọn đúng 2 khách từ danh sách gợi ý.");
            if (keep === drop) throw new Error("Không thể gộp khách với chính nó.");
            const r = await apiPost("write/gop_khach", { phase: "preview", keep_id: keep, drop_id: drop,
              move_files: !!fd.get("move_files") });
            confirmTok = r.confirm_token;
            const s = r.summary || {};
            const repoint = Object.entries(s.repointed || {}).map(([k2, v2]) => `${k2}: ${v2}`).join(", ");
            $("#gop-kh-preview", w).innerHTML = `<div class="moc-preview">
              Sẽ GIỮ <b>${esc(s.customer_name || "")}</b> (MST ${esc(s.tax_id || "—")}) —
              XÓA khách <b>${esc(s.drop_customer_name || "")}</b>.<br>
              Bản ghi được cập nhật (re-point): ${esc(repoint || "không có bản ghi liên quan")}.<br>
              ${s.move_files ? "Sẽ di chuyển file thật giữa 2 folder khách." : "Không di chuyển file."}<br>
              <b style="color:var(--danger)">⚠️ ${esc(s.canh_bao || "Thao tác XÓA VĨNH VIỄN, không thể hoàn tác.")}</b>
              <div class="muted" style="margin-top:4px">Bấm "Xác nhận GỘP" để hoàn tất (có audit). Sửa lại lựa chọn ở trên sẽ hủy bước xem trước này.</div></div>`;
            const btn = $("button[type=submit]", w);
            btn.textContent = "✔ Xác nhận GỘP (không thể hoàn tác)";
            btn.disabled = false; // openModal chỉ tự bật lại nút khi có lỗi — pha preview thành công vẫn cần mở lại nút cho pha commit
          } else {
            // PHA 2 — commit bằng token đã có từ preview.
            await apiPost("write/gop_khach", { phase: "commit", confirm_token: confirmTok });
            confirmTok = null; _KH_CACHE = null;
            closeModal();
            toast("Đã gộp khách (có audit).");
            RENDER.customer(el);
          }
        }, "Xem trước & xác nhận");
      // sửa lựa chọn sau khi đã preview -> hủy token, quay về pha 1 (khớp hành vi moc_danh_dau)
      $("#modal-form", w).addEventListener("input", () => {
        if (confirmTok) {
          confirmTok = null;
          $("#gop-kh-preview", w).innerHTML = "";
          $("button[type=submit]", w).textContent = "Xem trước & xác nhận";
        }
      });
    };
  };
}

/* ==== WO-34B: module "Công trình & Hiện trường" ==========================
   Hợp đồng API: docs/work_orders/WO34A_CONG_TRINH_HIEN_TRUONG_BACKEND.md mục 5.
   GAP THẬT (báo ra, không tự chế): KHÔNG có endpoint GET nào (project_kanban/
   customer_360/technician/cong_ty_detail) trả project.id cho vai trò khác
   Giám đốc/Quản trị (ct_dashboard_gd là nguồn id DUY NHẤT, và chỉ 2 role đó
   gọi được). Vì vậy KTT/KTV/Thủ kho/Kế toán/Kinh doanh phải NHẬP TAY project_id
   để mở trang chi tiết — xem ô nhập ở ctRenderList(). ==== */
Object.assign(VI_STATUS, {
  "Cho_duyet": "Chờ duyệt", "Da_duyet": "Đã duyệt", "Da_ky": "Đã ký", "Thieu": "Thiếu",
  "Dang_soan": "Đang soạn", "Khong_ap_dung": "Không áp dụng", "Chua_giao": "Chưa giao",
  "Da_giao": "Đã giao",
});
const CT_HO_SO_LABEL = {
  Thieu: "Thiếu", Dang_soan: "Đang soạn", Cho_duyet: "Chờ duyệt",
  Da_duyet: "Đã duyệt", Da_ky: "Đã ký", Khong_ap_dung: "Không áp dụng",
};
const CT_HO_SO_CHIP = {
  Thieu: "danger", Dang_soan: "warn", Cho_duyet: "warn", Da_duyet: "ok", Da_ky: "ok", Khong_ap_dung: "neutral",
};
function ctHoSoChip(tt) {
  return `<span class="chip ${CT_HO_SO_CHIP[tt] || "neutral"}">${esc(CT_HO_SO_LABEL[tt] || tt)}</span>`;
}
const CT_DOSSIER_ROLE_KEY = {
  "Giam doc": "giamdoc", "Ke toan": "ketoan", "Kinh doanh": "kinhdoanh",
  "Ky thuat truong": "ktt", "Ky thuat vien": "ktv", "Thu kho": "thukho"
};
function ctDossierCanEdit(h) {
  if (!ME) return false;
  if (typeof h.can_update === "boolean") return h.can_update;
  if (ME.role === "Quan tri he thong") return true;
  const key = CT_DOSSIER_ROLE_KEY[ME.role];
  return !!key && [h.owner_role, h.reviewer_role, h.approver_role].includes(key);
}
// mirror PERMS_WRITE["ct_*"] thật ở api_write.py — UI ẩn theo đây, server luôn là chốt chặn 403.
const CT_WRITE = {
  nhat_ky: ["Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
  phat_sinh: ["Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
  hinh_anh: ["Giam doc", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
  vat_tu_kho: ["Giam doc", "Ky thuat truong", "Thu kho", "Quan tri he thong"],
  tien_do: ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
  duyet: ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
  sinh_ho_so: ["Giam doc", "Ke toan", "Ky thuat truong", "Ky thuat vien", "Quan tri he thong"],
  // 2026-07-10 tham khao FastCon: dinh muc vat tu (F1, bang co san cong_trinh_dinh_muc_vat_tu)
  // — mirror PERMS_WRITE["ct_vat_tu_thuc_te"] that o api_write.py (thieu tu truoc, nut nhap/sua/
  // tu dong dien dinh muc bi an voi MOI vai tro cho toi khi phat hien qua test UI that).
  ct_vat_tu_thuc_te: ["Giam doc", "Ky thuat truong", "Thu kho", "Quan tri he thong"],
  // phieu vat tu (F3) — mirror PERMS_WRITE thật ở api_write.py
  vat_tu_ct: ["Giam doc", "Ky thuat truong", "Thu kho", "Quan tri he thong"],
  vat_tu_ct_duyet: ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
  boq_actual: ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
  boq_stage_assignment: ["Giam doc", "Ky thuat truong", "Quan tri he thong"],
};
const ctCan = (key) => !!ME && (CT_WRITE[key] || []).includes(ME.role);

let CT_POLL_TIMER = null;
function ctStopPoll() { if (CT_POLL_TIMER) { clearInterval(CT_POLL_TIMER); CT_POLL_TIMER = null; } }
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#cong_trinh")) ctStopPoll(); });

RENDER.cong_trinh = async function (el) {
  ctStopPoll();
  pageActions([]);
  const pid = Number((window.ROUTE_Q || {}).project_id) || null;
  if (pid) return ctRenderDetail(el, pid);
  return ctRenderList(el);
};

/* ---- 1. Danh sách công trình (nav landing) ------------------------------- */
async function ctRenderList(el) {
  const isGD = ME && ["Giam doc", "Quan tri he thong"].includes(ME.role);
  if (!isGD) {
    el.innerHTML = `<div id="ct-list-body"><div class="loading">Đang tải công trình được phép xem…</div></div>`;
    const drawOperational = async () => {
      const q = ($("#ct-project-q", el) || {}).value || "";
      const status = ($("#ct-project-status", el) || {}).value || "";
      const progress = ($("#ct-project-progress", el) || {}).value || "";
      const [d, nav, ux] = await Promise.all([
        apiGet("ct_projects", { status, progress, q }), apiGet("project_navigation"),
        apiGet("user_experience", { view_key: "projects" })]);
      const rows = d.rows || [];
      const savedViews = ux.saved_views || [];
      const favIds = new Set((nav.favorites || []).map((r) => Number(r.project_id)));
      const shortcut = `<div class="ct-project-shortcuts">
        ${panel("★ Đã ghim", kttProjectShortcuts(nav.favorites, "Chưa ghim công trình nào."))}
        ${panel("Gần đây", kttProjectShortcuts(nav.recent, "Chưa mở công trình nào."))}</div>`;
      $("#ct-list-body", el).innerHTML = shortcut + panel("Công trình được phép truy cập",
        `<div class="saved-view-bar"><label for="ct-saved-view">Bộ lọc đã lưu</label>
          <select id="ct-saved-view" class="field"><option value="">— Chọn bộ lọc —</option>${savedViews.map((v) =>
            `<option value="${v.id}">${esc(v.name)}${v.is_default ? " · mặc định" : ""}</option>`).join("")}</select>
          <button type="button" class="btn ghost btn-sm" id="ct-save-view">Lưu bộ lọc hiện tại</button>
          <button type="button" class="btn ghost btn-sm" id="ct-delete-view" disabled>Xóa</button></div>
        <div class="toolbar"><input id="ct-project-q" class="field" placeholder="Tìm mã CT, tên công trình…" value="${esc(q)}">
         <select id="ct-project-status" class="field"><option value="">Mọi trạng thái</option><option value="Open">Đang mở</option><option value="Completed">Hoàn thành</option></select>
         <select id="ct-project-progress" class="field"><option value="">Mọi tiến độ</option><option value="late">⚠ Chậm tiến độ</option><option value="active">Đang thi công</option><option value="complete">Đã hoàn thành</option></select></div>` +
        `<div class="ct-list-head"><span>Công trình</span><span>Trạng thái</span><span>Tiến độ</span><span>Hồ sơ thiếu</span><span>Cảnh báo</span></div>` +
        (rows.length ? rows.map((r) => `<div class="ct-list-row" data-pid="${r.project_id}">
          <span class="ct-name-cell"><b><button type="button" class="ct-fav-btn ${favIds.has(Number(r.project_id)) ? "on" : ""}" data-pid="${r.project_id}" data-fav="${favIds.has(Number(r.project_id)) ? 1 : 0}" aria-label="Ghim công trình">★</button>${esc(r.project_name)}</b><span class="muted">${esc(r.code)} · ${esc(r.customer_name)}</span></span>
          <span>${chip(r.status)}</span><span>${Math.round(r.percent_complete || 0)}%</span>
          <span>${r.ho_so_thieu ? `<span class="chip warn">${r.ho_so_thieu} thiếu</span>` : `<span class="chip ok">Đủ</span>`}</span>
          <span>${r.cham_tien_do ? `<span class="chip danger">⚠ Chậm ${r.cham_tien_do} mục</span>` : `<span class="chip ok">Đúng tiến độ</span>`}</span>
        </div>`).join("") : `<div class="empty">Không có công trình phù hợp quyền/bộ lọc.</div>`));
      $("#ct-project-status", el).value = status; $("#ct-project-progress", el).value = progress;
      $("#ct-project-q", el).oninput = () => { clearTimeout($("#ct-project-q", el)._t); $("#ct-project-q", el)._t = setTimeout(drawOperational, 250); };
      $("#ct-project-status", el).onchange = drawOperational;
      $("#ct-project-progress", el).onchange = drawOperational;
      const savedSelect = $("#ct-saved-view", el);
      const deleteSaved = $("#ct-delete-view", el);
      savedSelect.onchange = () => {
        const selected = savedViews.find((v) => Number(v.id) === Number(savedSelect.value));
        deleteSaved.disabled = !selected;
        if (!selected) return;
        const filters = selected.filters || {};
        $("#ct-project-q", el).value = filters.q || "";
        $("#ct-project-status", el).value = filters.status || "";
        $("#ct-project-progress", el).value = filters.progress || "";
        drawOperational();
      };
      $("#ct-save-view", el).onclick = async () => {
        const name = prompt("Tên bộ lọc công trình:");
        if (!name || !name.trim()) return;
        try {
          await apiPost("write/saved_view_upsert", { view_key: "projects", name: name.trim(),
            filters: { q: $("#ct-project-q", el).value, status: $("#ct-project-status", el).value,
              progress: $("#ct-project-progress", el).value },
            columns: ["project", "status", "progress"] });
          toast("Đã lưu bộ lọc cho tài khoản này."); await drawOperational();
        } catch (err) { toast(err.message || "Không lưu được bộ lọc.", false); }
      };
      deleteSaved.onclick = async () => {
        const selected = savedViews.find((v) => Number(v.id) === Number(savedSelect.value));
        if (!selected || !confirm(`Xóa bộ lọc "${selected.name}"?`)) return;
        try { await apiPost("write/saved_view_delete", { id: selected.id, expected_version: selected.version });
          toast("Đã xóa bộ lọc."); await drawOperational();
        } catch (err) { toast(err.message || "Không xóa được bộ lọc.", false); }
      };
      $("#ct-list-body", el).querySelectorAll(".ct-list-row").forEach((row) =>
        row.onclick = () => { location.hash = "#cong_trinh?project_id=" + row.dataset.pid; });
      $("#ct-list-body", el).querySelectorAll(".ktt-project-link").forEach((b) =>
        b.onclick = () => { location.hash = b.dataset.route; });
      $("#ct-list-body", el).querySelectorAll(".ct-fav-btn").forEach((b) => b.onclick = async (e) => {
        e.stopPropagation();
        try {
          await apiPost("write/project_state", { project_id: Number(b.dataset.pid), favorite: b.dataset.fav !== "1" });
          await drawOperational();
        } catch (err) { toast(err.message || "Không cập nhật được ghim.", false); }
      });
    };
    await drawOperational();
    return;
  }
  // GĐ/QT: danh sách thật từ ct_dashboard_gd + polling 45s + badge chuông đếm thay đổi
  el.innerHTML = `<div id="ct-list-body"><div class="loading">Đang tải…</div></div>`;
  let prevSnap = {};
  const draw = async (first) => {
    let d;
    try { d = await apiGet("ct_dashboard_gd"); }
    catch (e) {
      $("#ct-list-body", el).innerHTML = `<div class="empty">Không tải được danh sách công trình: ${esc(e.message || "")}</div>`;
      return;
    }
    const rows = d.rows || [];
    let changed = 0;
    rows.forEach((r) => {
      const cur = (r.vo_cho_duyet || 0) + (r.nhat_ky_hom_nay || 0);
      const prev = prevSnap[r.project_id];
      if (!first && (prev == null || cur > prev)) changed++;
      prevSnap[r.project_id] = cur;
    });
    $("#ct-list-body", el).innerHTML =
      panel(`Danh sách công trình${changed ? ` <span class="ct-bell">🔔<span class="bell-dot show">${changed}</span></span>` : ""}`,
        `<div class="ct-list-head"><span>Công trình</span><span>Trạng thái</span><span>Tiến độ</span><span>VO chờ duyệt</span><span>Nhật ký hôm nay</span></div>` +
        (rows.length ? rows.map((r) => `
          <div class="ct-list-row" data-pid="${r.project_id}">
            <span class="ct-name-cell"><b>${esc(r.project_name)}</b><span class="muted">${esc(r.code)} · ${esc(r.customer_name)}</span></span>
            <span>${chip(r.status)}</span>
            <span>${Math.round(r.tien_do_pct || 0)}%</span>
            <span>${r.vo_cho_duyet ? `<span class="chip warn">${r.vo_cho_duyet} · ${vnd(r.vo_gia_tri_cho_duyet)}</span>` : `<span class="muted">—</span>`}</span>
            <span>${r.nhat_ky_hom_nay ? `<span class="chip info">${r.nhat_ky_hom_nay}</span>` : `<span class="muted">—</span>`}</span>
          </div>`).join("") : `<div class="empty">Chưa có công trình nào (project + customer).</div>`))
      + `<div class="muted" style="font-size:11px;margin-top:8px">Tự làm mới mỗi 45 giây.</div>`;
    $("#ct-list-body", el).querySelectorAll(".ct-list-row").forEach((r) =>
      r.addEventListener("click", () => { location.hash = "#cong_trinh?project_id=" + r.dataset.pid; }));
  };
  await draw(true);
  CT_POLL_TIMER = setInterval(() => draw(false), 45000);
}

/* ---- 2. Trang chi tiết 1 công trình (tabbed) ------------------------------ */
const CT_TABS = [
  ["tong_quan", "Tổng quan"], ["nhan_su", "Nhân sự"], ["nhat_ky", "Nhật ký công trình"], ["khoi_luong", "Khối lượng & Phát sinh"],
  ["vat_tu", "Vật tư & CO-CQ"], ["diem_danh", "Điểm danh"], ["nghiem_thu", "Nghiệm thu"],
  ["hoan_cong", "Hoàn công & BQT"],
  ["tai_lieu", "Tài liệu"],
];
async function ctRenderDetail(el, pid) {
  el.innerHTML = `<div class="loading">Đang tải công trình…</div>`;
  let overview;
  try { overview = await apiGet("ct_tong_quan", { project_id: pid }); }
  catch (e) {
    el.innerHTML = (e.status === 403 || (e.data && e.data.permission_denied))
      ? `<div class="empty">🔒 ${esc(e.message)}<br><span class="muted">Vai trò hiện tại: ${esc(ME.role)}</span></div>`
      : `<div class="empty">Không mở được công trình #${pid}: ${esc(e.message || "")}</div>`;
    return;
  }
  const proj = overview.project;
  const routeCtx = window.ROUTE_Q || {};
  const visibleTabs = CT_TABS.filter(([key]) => key !== "nhan_su"
    || ["Giam doc", "Ky thuat truong", "Quan tri he thong"].includes(ME.role));
  const firstTab = CT_TABS.some(([k]) => k === routeCtx.tab) ? routeCtx.tab : "tong_quan";
  const contextLabel = visibleTabs.find(([k]) => k === firstTab)?.[1] || "Tổng quan";
  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:6px">
      <button class="btn ghost btn-sm" id="ct-back">← Danh sách công trình</button>
      <span class="muted" style="font-size:12.5px">${esc(proj.code)} · <b>${esc(proj.project_name)}</b> · ${esc(proj.customer_name)}</span>
    </div>
    <div class="ct-context-bar" id="ct-context-bar">
      <span><b>${esc(proj.code)}</b> · ${esc(proj.project_name)}</span><span>›</span>
      <span>${esc(routeCtx.stage || proj.status || "Đang thi công")}</span><span>›</span>
      <span id="ct-context-tab">${esc(contextLabel)}</span>
      ${routeCtx.record_id ? `<span class="chip info">Bản ghi #${esc(routeCtx.record_id)}</span>` : ""}
      <button type="button" class="ct-fav-btn" id="ct-detail-fav" aria-label="Ghim công trình">★</button>
    </div>
    <div class="ct-tabs" id="ct-tabs">${visibleTabs.map(([k, l]) =>
      `<button class="tab ${k === firstTab ? "active" : ""}" data-t="${k}">${esc(l)}</button>`).join("")}</div>
    <div id="ct-tab-body"></div>`;
  $("#ct-back", el).onclick = () => { location.hash = "#cong_trinh"; };
  const TAB_FN = { tong_quan: ctTabTongQuan, nhan_su: ctTabNhanSu,
    nhat_ky: ctTabNhatKy, khoi_luong: ctTabKhoiLuong,
    vat_tu: ctTabVatTu, diem_danh: ctTabDiemDanh, nghiem_thu: ctTabNghiemThu,
    hoan_cong: ctTabHoanCong, tai_lieu: ctTabTaiLieu };
  const showTab = async (key) => {
    el.querySelectorAll(".ct-tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.t === key));
    const body = $("#ct-tab-body", el);
    const label = visibleTabs.find(([k]) => k === key)?.[1] || key;
    $("#ct-context-tab", el).textContent = label;
    const params = new URLSearchParams({ project_id: String(pid), tab: key });
    if (routeCtx.stage) params.set("stage", routeCtx.stage);
    if (routeCtx.record_type && key === firstTab) params.set("record_type", routeCtx.record_type);
    if (routeCtx.record_id && key === firstTab) params.set("record_id", routeCtx.record_id);
    history.replaceState(null, "", `${location.pathname}${location.search}#cong_trinh?${params.toString()}`);
    apiPost("write/project_state", { project_id: pid, touch: true, tab: key,
      stage: routeCtx.stage || null,
      record_type: key === firstTab ? routeCtx.record_type || null : null,
      record_id: key === firstTab ? Number(routeCtx.record_id) || null : null }).catch(() => {});
    body.innerHTML = `<div class="loading">Đang tải…</div>`;
    try { await TAB_FN[key](body, pid, proj); }
    catch (e) {
      body.innerHTML = (e.status === 403 || (e.data && e.data.permission_denied))
        ? `<div class="empty">🔒 ${esc(e.message)}</div>`
        : `<div class="empty">Không tải được: ${esc(e.message || "")}</div>`;
    }
  };
  el.querySelectorAll(".ct-tabs .tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.t)));
  try {
    const nav = await apiGet("project_navigation");
    const on = (nav.favorites || []).some((r) => Number(r.project_id) === Number(pid));
    const fav = $("#ct-detail-fav", el); fav.classList.toggle("on", on); fav.dataset.fav = on ? "1" : "0";
    fav.onclick = async () => {
      const next = fav.dataset.fav !== "1";
      await apiPost("write/project_state", { project_id: pid, favorite: next });
      fav.dataset.fav = next ? "1" : "0"; fav.classList.toggle("on", next);
    };
  } catch (e) { /* context van hoat dong neu preference API loi */ }
  await showTab(firstTab);
}

/* ---- Tab: Tổng quan ---- */
async function ctTabTongQuan(body, pid, proj) {
  const d = await apiGet("ct_tong_quan", { project_id: pid });
  const k = d.kpi;
  const requiredDossierCount = (d.ho_so_00_09 || []).filter((h) => h.requirement === "REQUIRED").length;
  const conditionalDossierCount = (d.ho_so_00_09 || []).filter((h) => h.requirement === "ACTIVE_CONDITIONAL").length;
  const dossierRuleSummary = `<div class="notice info" style="margin-bottom:12px">Checklist V3.1: <b>${requiredDossierCount} mã bắt buộc</b>, ${conditionalDossierCount} mã theo điều kiện. Các mã còn lại là tùy chọn; chúng không làm dự án bị báo thiếu.</div>`;
  // WO-38 (3.6): thêm chi phí thực tế + panel mới từ field WO37 — tiền server strip → "—"
  const kpis = [
    ["Giá trị dự toán", k.du_toan == null ? "—" : vnd(k.du_toan), "", "info", "money"],
    ["Chi phí thực tế", k.chi_phi_thuc_te == null ? "—" : vnd(k.chi_phi_thuc_te), "vật tư + nhân công + phát sinh", "warn", "bank"],
    ["Phát sinh chờ duyệt", String(k.phat_sinh_cho_duyet || 0), "", k.phat_sinh_cho_duyet ? "warn" : "ok", "clock"],
    ["Tiến độ công trình", (k.tien_do_pct || 0) + "%", k.so_hang_muc_tien_do + " hạng mục", "info", "dash"],
    ["Nhân sự hôm nay", String((d.nhan_su_hom_nay || []).length), "", "info", "people"],
    ["Hồ sơ thiếu", String(k.ho_so_thieu || 0), "/ " + d.ho_so_00_09.length + " mã", k.ho_so_thieu ? "danger" : "ok", "folder"],
  ];
  const groups = {};
  d.ho_so_00_09.forEach((h) => { const g = h.ma_mau.split("-")[1]; (groups[g] = groups[g] || []).push(h); });
  const hsHtml = Object.keys(groups).sort().map((g) => `
    <div class="hs-grid-group"><b>Nhóm ${esc(g)}</b><div class="hs-grid">
      ${groups[g].map((h) => {
        const hasFile = !!h.evidence_source_document_id;
        return `<div class="hs-card" data-ma="${esc(h.ma_mau)}">
        <div class="hs-code">${esc(h.ma_mau)}</div><div class="hs-title">${esc(h.title)}</div>
        ${h.requirement === "REQUIRED" ? `<span class="chip danger">Bắt buộc</span>` : h.requirement === "ACTIVE_CONDITIONAL" ? `<span class="chip warn">Điều kiện đang áp dụng</span>` : h.requirement === "INACTIVE_CONDITIONAL" ? `<span class="chip neutral">Điều kiện chưa kích hoạt</span>` : `<span class="chip neutral">Tùy chọn</span>`}
        ${ctHoSoChip(h.trang_thai)}
        <div class="hs-card-actions" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${ctExportBtnHtml(h)}
          ${hasFile ? `<a class="btn ghost btn-sm" href="/api/document_download?source_document_id=${Number(h.evidence_source_document_id)}" onclick="event.stopPropagation()">Tải file</a>` : ""}
        </div></div>`;
      }).join("")}
    </div></div>`).join("");
  const nsRows = (d.nhan_su_hom_nay || []).map((n) =>
    [esc(n.ktv_chinh || "—") + (n.ktv_phu ? `<br><span class="muted" style="font-size:11px">phụ: ${esc(n.ktv_phu)}</span>` : ""),
      esc(n.gio_hen || "—"), chip(n.loai_viec),
      n.da_check_in ? `<span class="chip ok">✓ ${esc((n.gio_check_in || "").slice(11, 16) || "đã check-in")}</span>` : `<span class="chip neutral">Chưa check-in</span>`,
      chip(n.trang_thai)]);
  // việc cần xử lý (phát sinh chờ duyệt / nhật ký chưa xác nhận / chậm tiến độ)
  const vcxl = (d.viec_can_xu_ly || []);
  const vcxlHtml = vcxl.length ? vcxl.slice(0, 8).map((v) => `
      <div class="queue-row"><span>${v.loai === "phat_sinh" ? "⚠️" : v.loai === "nhat_ky" ? "📘" : "⏰"}
        <b>${esc(String(v.noi_dung || "").slice(0, 48))}</b><br>
        <span class="muted" style="font-size:11px">${esc(String(v.ma || ""))}</span></span>${chip(v.trang_thai)}</div>`).join("")
    : `<div class="empty">✅ Không có mục chờ xử lý.</div>`;
  // mốc sắp tới từ tiến độ kế hoạch
  const mocHtml = (d.moc_sap_toi || []).length ? d.moc_sap_toi.map((m) => `
      <div class="queue-row"><span>${esc(m.hang_muc)}${m.khu_vuc ? ` <span class="muted">(${esc(m.khu_vuc)})</span>` : ""}</span>
        <span class="muted">${esc(fmtDate(m.ngay_kt_ke_hoach))} · ${(m.phan_tram_hoan_thanh || 0).toFixed(0)}%</span></div>`).join("")
    : `<div class="empty">Chưa có mốc kế hoạch sắp tới.</div>`;
  // vật tư thực tế (8 dòng đầu) + donut chi phí (server strip cho role không xem tiền)
  const vtRows = (d.vat_tu_thuc_te || []).map((r) => [esc(r.ten_vat_tu), esc(r.dvt || "—"),
    String(r.kl_du_toan ?? "—"), String(r.kl_xuat_kho ?? "—"), String(r.kl_thuc_te ?? "—"),
    r.chenh_du_toan > 0 ? `<b style="color:var(--danger)">+${r.chenh_du_toan}</b>` : String(r.chenh_du_toan ?? "—")]);
  const donutCp = (d.chi_phi_donut || []).length
    ? svgDonut(d.chi_phi_donut.map((c) => [c.nhom === "vat_tu" ? "Vật tư" : c.nhom === "nhan_cong" ? "Nhân công" : "Phát sinh", Math.round(c.gia_tri)]))
    : `<div class="empty">${k.chi_phi_thuc_te == null ? "Vai trò của bạn không xem chi phí." : "Chưa có dữ liệu chi phí (project_pl trống)."}</div>`;
  body.innerHTML = `
    ${dossierRuleSummary}
    ${metrics(kpis)}
    <div class="dash-3">
      <div class="grid" style="gap:14px">
        ${panel("Vật tư thực tế", table(["Vật tư", "ĐVT", "Dự toán", "Đã xuất", "Thực dùng", "Chênh"], vtRows,
          { empty: "Chưa có định mức vật tư — nhập ở tab Khối lượng theo giai đoạn." }))}
        ${panel("Nhật ký / Nhân sự hôm nay", table(["KTV", "Giờ", "Loại việc", "Check-in", "TT"], nsRows,
          { empty: "Không có nhân sự làm việc hôm nay tại công trình này." }))}
      </div>
      <div class="grid" style="gap:14px">
        ${panel("Việc cần xử lý", vcxlHtml)}
        ${panel("Mốc sắp tới", mocHtml)}
      </div>
      <div class="grid" style="gap:14px">
        ${panel("Tổng quan chi phí", donutCp)}
      </div>
    </div>
    <div style="margin-top:14px">${panel("Hồ sơ 00-09 (" + d.ho_so_00_09.length + " mã)",
      `<div class="muted" style="margin-bottom:8px;font-size:12px">Nút <b>Xuất Word/Excel</b> điền mẫu theo CT · HĐ · báo giá chính thức. Mã chưa wiring / BBNT·NK dùng tab chuyên môn.</div>` +
      (hsHtml || `<div class="empty">Chưa có mẫu hồ sơ.</div>`))}</div>`;
  body.querySelectorAll(".hs-card").forEach((c) => c.addEventListener("click", (e) => {
    if (e.target.closest("button, a")) return;
    ctHoSoModal(pid, d.ho_so_00_09.find((h) => h.ma_mau === c.dataset.ma), () => ctTabTongQuan(body, pid, proj));
  }));
  ctWireExportButtons(body, pid, d.ho_so_00_09, () => ctTabTongQuan(body, pid, proj));
}

/* ---- Export hồ sơ từ template (Word/Excel) — checklist / modal / hoàn công ---- */
function ctExportFmtLabel(h) {
  const fmt = String((h && h.format) || "docx").toLowerCase();
  if (fmt === "xlsx" || fmt === "xls") return "Excel";
  return "Word";
}
function ctCanExportHoSo(h) {
  if (!h || !ctCan("sinh_ho_so")) return false;
  if (!h.auto_generate) return false;
  if (h.trang_thai === "Da_ky" || h.trang_thai === "Khong_ap_dung") return false;
  // Card export chỉ khi template fill được từ CT/HĐ/BG; BBNT/NK có gate riêng.
  return true;
}
function ctExportBtnHtml(h, extraClass) {
  if (!ctCanExportHoSo(h)) return "";
  const label = "Xuất " + ctExportFmtLabel(h);
  return `<button type="button" class="btn primary btn-sm ${extraClass || "hs-export-doc"}" data-ma="${esc(h.ma_mau)}">${esc(label)}</button>`;
}
async function ctExportHoSo(pid, h, btn, after) {
  if (!h || !ctCanExportHoSo(h)) {
    toast((h && h.generation_note) || "Mẫu này chưa hỗ trợ xuất tự động.", false);
    return;
  }
  const fmt = ctExportFmtLabel(h);
  if (!window.confirm(
    `Xuất ${h.ma_mau} — ${h.title || ""}?\nFile ${fmt} điền theo công trình / HĐ / báo giá chính thức hiện tại.`)) {
    return;
  }
  const old = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Đang xuất…"; }
  try {
    const r = await apiPost("write/ct_sinh_ho_so", { project_id: pid, ma_mau: h.ma_mau });
    toast("Đã xuất: " + (r.file_name || h.ma_mau));
    if (r.source_document_id) {
      window.location.href = `/api/document_download?source_document_id=${Number(r.source_document_id)}`;
    }
    if (after) after();
  } catch (e) {
    toast(e.message || "Không xuất được hồ sơ", false);
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}
function ctWireExportButtons(root, pid, rows, after, selector) {
  (root || document).querySelectorAll(selector || ".hs-export-doc").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const h = rows.find((x) => x.ma_mau === b.dataset.ma);
      ctExportHoSo(pid, h, b, after);
    });
  });
}

/* ---- Modal: xem/sinh/đổi trạng thái 1 mã hồ sơ ---- */
function ctHoSoModal(pid, h, after) {
  const canDuyet = ctDossierCanEdit(h);
  const canSinh = ctCanExportHoSo(h) && ctDossierCanEdit(h);
  const w = openModal(`${h.ma_mau} — ${h.title}`,
    formGrid([["Trạng thái hiện tại", h.trang_thai, true],
      ["Cập nhật lần cuối", h.updated_at ? fmtDateTime(h.updated_at) : "—"],
      ["Bằng chứng", h.evidence_file_name || "Chưa liên kết"],
      ["Việc tiếp theo", h.next_action || "—"],
      ["Tự động hóa", h.auto_generate ? `Có thể xuất ${ctExportFmtLabel(h)}` : (h.generation_note || "Chưa wiring dữ liệu")]], 1) +
    (canDuyet ? `<div class="f"><label>ID tài liệu bằng chứng</label><input name="evidence_source_document_id" type="number" min="1" value="${esc(h.evidence_source_document_id || "")}" placeholder="Tài liệu đã thuộc công trình"></div>
     <div class="f"><label>Ghi chú bằng chứng</label><input name="evidence_note" value="${esc(h.evidence_note || "")}" maxlength="500"></div>` : "") +
    (canDuyet ? `<div class="f wide"><label>Đổi trạng thái</label><select name="trang_thai">
        ${["Thieu", "Dang_soan", "Cho_duyet", "Da_duyet", "Da_ky", "Khong_ap_dung"].map((s) =>
          `<option value="${s}" ${s === h.trang_thai ? "selected" : ""}>${esc(CT_HO_SO_LABEL[s])}</option>`).join("")}
      </select></div>`
      : `<div class="f wide muted" style="font-size:12px">🔒 Mã hồ sơ này thuộc vai trò khác; backend khóa theo owner/reviewer/approver.</div>`),
    async (fd) => {
      if (!canDuyet) { closeModal(); return; }
      const tt = fd.get("trang_thai");
      const payload = { phase: "preview", project_id: pid, ma_mau: h.ma_mau,
        trang_thai: tt || h.trang_thai,
        evidence_source_document_id: fd.get("evidence_source_document_id") || null,
        evidence_note: fd.get("evidence_note") || "" };
      const preview = await apiPost("write/ct_ho_so_trang_thai", payload);
      if (!window.confirm(`Xác nhận cập nhật ${h.ma_mau}? Hệ thống sẽ kiểm tra lại quyền, version và bằng chứng.`)) return;
      await apiPost("write/ct_ho_so_trang_thai", { phase: "commit", confirm_token: preview.confirm_token });
      closeModal(); toast("Đã cập nhật."); after();
    }, canDuyet ? "Lưu trạng thái" : "Đóng");
  if (canSinh || (h.evidence_source_document_id && ctCan("sinh_ho_so"))) {
    const foot = w.querySelector(".modal-foot");
    if (foot && canSinh) {
      const generateButton = document.createElement("button");
      generateButton.type = "button";
      generateButton.className = "btn primary";
      generateButton.id = "ct-sinh-btn";
      generateButton.textContent = `Xuất ${ctExportFmtLabel(h)}`;
      foot.prepend(generateButton);
      generateButton.onclick = () => ctExportHoSo(pid, h, generateButton, () => { closeModal(); after(); });
    }
  }
}

/* ---- Tab: Nhật ký công trình ---- */
const JOURNAL_MISSING_LABEL = {
  content: "Nội dung", boq_item: "Hạng mục BOQ", quantity: "Khối lượng",
  photo_before: "Ảnh trước", photo_after: "Ảnh sau", materials: "Vật tư",
  recommendation: "Khó khăn/kiến nghị", workforce: "Nhân lực",
  equipment: "Thiết bị thi công", work_hours: "Thời gian làm việc", result: "Kết quả",
  issue_measure: "Biện pháp xử lý", issue_owner: "Người xử lý", issue_deadline: "Hạn xử lý"
};
const JOURNAL_WEATHER_WMO = {
  0: "Trời quang", 1: "Ít mây", 2: "Mây rải rác", 3: "Nhiều mây",
  45: "Sương mù", 48: "Sương mù đóng băng", 51: "Mưa phùn nhẹ",
  53: "Mưa phùn", 55: "Mưa phùn dày", 56: "Mưa phùn đóng băng nhẹ",
  57: "Mưa phùn đóng băng", 61: "Mưa nhỏ", 63: "Mưa vừa", 65: "Mưa to",
  66: "Mưa đóng băng nhẹ", 67: "Mưa đóng băng", 71: "Tuyết nhẹ",
  73: "Tuyết vừa", 75: "Tuyết dày", 77: "Hạt tuyết", 80: "Mưa rào nhẹ",
  81: "Mưa rào", 82: "Mưa rào lớn", 85: "Mưa tuyết nhẹ", 86: "Mưa tuyết dày",
  95: "Dông", 96: "Dông có mưa đá nhẹ", 99: "Dông có mưa đá"
};

function journalWeatherStamp(form, note) {
  const state = $("#nk-weather-state", form);
  if (state) state.textContent = note || "";
}

function journalResetWeatherMetadata(form) {
  ["weather_source", "weather_observed_at", "weather_location_accuracy_m", "weather_is_manual_override"]
    .forEach((name) => { if (form.elements[name]) form.elements[name].value = ""; });
  const field = form.elements.thoi_tiet;
  if (field) delete field.dataset.autoWeather;
  journalWeatherStamp(form, "Bạn có thể nhập tay hoặc dùng thời tiết thực tế tại vị trí hiện trường.");
}

function journalWeatherError(error) {
  if (error && error.code === 1) return "Bạn chưa cho phép vị trí. Vẫn có thể nhập thời tiết thủ công.";
  if (error && error.code === 2) return "Thiết bị chưa xác định được vị trí. Hãy thử lại ngoài trời hoặc nhập thủ công.";
  if (error && error.code === 3) return "Lấy vị trí quá lâu. Hãy thử lại hoặc nhập thủ công.";
  return error?.message || "Không thể tự điền thời tiết. Bạn vẫn có thể nhập thủ công.";
}

async function journalFillWeatherFromDevice(form, button) {
  if (!navigator.geolocation) throw new Error("Trình duyệt này không hỗ trợ định vị.");
  button.disabled = true; button.textContent = "Đang lấy vị trí…";
  try {
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false, timeout: 12000, maximumAge: 600000
    }));
    // Only an approximate location is sent to the public weather provider;
    // exact GPS coordinates never enter the ERP database.
    const latitude = Number(position.coords.latitude.toFixed(2));
    const longitude = Number(position.coords.longitude.toFixed(2));
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code,temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`, { cache: "no-store" });
    if (!response.ok) throw new Error("Dịch vụ thời tiết chưa phản hồi. Hãy thử lại sau.");
    const data = await response.json(); const current = data.current || {};
    if (typeof current.weather_code !== "number") throw new Error("Dịch vụ thời tiết không trả đủ dữ liệu.");
    const temperature = Number(current.temperature_2m);
    const wind = Number(current.wind_speed_10m);
    const summary = [JOURNAL_WEATHER_WMO[current.weather_code] || "Thời tiết thực tế",
      Number.isFinite(temperature) ? `${temperature.toFixed(1)}°C` : "",
      Number.isFinite(wind) ? `gió ${wind.toFixed(0)} km/h` : ""].filter(Boolean).join(", ");
    const weather = form.elements.thoi_tiet;
    weather.value = summary; weather.dataset.autoWeather = summary;
    form.elements.weather_source.value = "open-meteo";
    form.elements.weather_observed_at.value = new Date().toISOString();
    const accuracyM = Number.isFinite(Number(position.coords.accuracy))
      ? Math.round(Number(position.coords.accuracy)) : 0;
    form.elements.weather_location_accuracy_m.value = String(accuracyM);
    form.elements.weather_is_manual_override.value = "0";
    journalWeatherStamp(form, `Tự điền từ Open‑Meteo lúc ${new Date().toLocaleTimeString("vi-VN")} · vị trí gần đúng ±${accuracyM} m. Có thể sửa tay.`);
  } finally {
    button.disabled = false; button.textContent = "Dùng thời tiết thực tế";
  }
}
function journalMaterialRow(options, item = {}) {
  const selected = String(item.stock_ledger_id || "");
  return `<div class="journal-material-row">
    <select class="field nk-material-select" aria-label="Vật tư từ kho công trình"><option value="">— Chọn vật tư từ kho công trình —</option>
      ${options.map((m) => `<option value="${Number(m.stock_ledger_id)}" ${String(m.stock_ledger_id) === selected ? "selected" : ""}>
        ${esc(m.item_name || m.item_key)} · còn ${Number(m.qty_available || 0)}</option>`).join("")}
    </select>
    <input class="field nk-material-received" type="number" min="0" step="any" inputmode="decimal" aria-label="Số lượng thực nhận" placeholder="Thực nhận" value="${esc(item.so_luong_thuc_nhan ?? "")}">
    <input class="field nk-material-used" type="number" min="0" step="any" inputmode="decimal" aria-label="Số lượng đã dùng" placeholder="Đã dùng" value="${esc(item.so_luong_su_dung ?? "")}">
    <input class="field nk-material-uom" aria-label="Đơn vị tính" placeholder="ĐVT" value="${esc(item.dvt || "")}">
    <input class="field nk-material-note" aria-label="Ghi chú vật tư" placeholder="Ghi chú" value="${esc(item.ghi_chu || "")}">
    <button type="button" class="btn ghost btn-sm nk-material-remove" aria-label="Xóa dòng vật tư">×</button>
  </div>`;
}
function journalDecision(body, pid, items, decision, reasonCode = "", note = "") {
  if (!items.length) { toast("Chọn ít nhất một nhật ký.", false); return; }
  apiPost("write/ct_nhat_ky_batch", { phase: "preview", decision, items,
    reason_code: reasonCode, note }).then((preview) => {
    const label = decision === "approve" ? "Xác nhận" : "Trả lại";
    openModal(`${label} ${preview.count} nhật ký`,
      `<div class="approval-preview"><b>Kiểm tra trước khi ghi</b>
       <p>${label} ${preview.count} nhật ký. Hệ thống sẽ kiểm tra lại version, trạng thái và checklist khi commit.</p>
       ${note ? `<p><b>Ghi chú:</b> ${esc(note)}</p>` : ""}</div>`,
      async () => {
        await apiPost("write/ct_nhat_ky_batch", { phase: "commit",
          confirm_token: preview.confirm_token });
        closeModal(); toast(`Đã ${label.toLowerCase()} ${preview.count} nhật ký.`);
        ctTabNhatKy(body, pid, null);
      }, `${label} chính thức`);
  }).catch((e) => toast(e.message || "Không thể xem trước.", false));
}
function ctPeopleCsvValue(value) {
  return `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
}

async function ctPeoplePreview(body, pid, filename, fileB64, refresh) {
  const preview = await apiPost("write/project_personnel_import_preview", {
    project_id: Number(pid), filename, file_b64: fileB64 });
  const allErrors = (preview.parse_errors || []).map((e) => `Dòng ${e.source_row}: ${e.message}`);
  if (preview.duplicate_batch_id) allErrors.push(`File này đã commit ở batch #${preview.duplicate_batch_id}.`);
  const blocked = Number((preview.summary || {}).blocked || 0);
  const rows = preview.rows || [];
  const html = `
    <div class="import-preview-summary">
      ${metrics([
        ["Tổng dòng", String((preview.summary || {}).total_rows || 0), "", "info", "people"],
        ["Tạo hồ sơ", String((preview.summary || {}).create_people || 0), "Admin", "purple", "people"],
        ["Cấp account", String((preview.summary || {}).create_accounts || 0), "Admin", "warn", "lock"],
        ["Bị chặn", String(blocked), blocked ? "phải sửa file" : "sẵn sàng", blocked ? "danger" : "ok", "alert"],
      ])}
    </div>
    ${allErrors.length ? `<div class="form-error-summary"><b>Không thể commit:</b><ul>${allErrors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
    <div class="table-wrap">${table(["Dòng", "Họ tên", "Chức vụ → role", "Nhiệm vụ", "Tài khoản", "Kết quả"],
      rows.map((r) => [r.source_row, `<b>${esc(r.full_name)}</b>`,
        `${esc(r.personnel_type)} → <span class="code">${esc(r.account_role)}</span>`,
        esc(r.project_role || "—"), r.existing_username ? esc(r.existing_username)
          : (r.provision_account ? "Sẽ cấp mới" : "Không tạo"),
        r.blocked_reason ? `<span class="chip danger">🛑 ${esc(r.blocked_reason)}</span>`
          : `<span class="chip ok">✓ ${esc(r.action)}</span>`]))}</div>
    ${preview.requires_privileged_confirmation ? `<label class="danger-confirm"><input type="checkbox" name="confirm_privileged_accounts" value="yes"> Tôi xác nhận file này cấp thêm tài khoản Quản trị hệ thống.</label>` : ""}
    <div class="muted" style="font-size:12px">Preview không ghi DB. Role lấy từ mapping cố định; không có lựa chọn Giám đốc.</div>`;
  openModal("Xem trước gán nhân sự", html, async (fd) => {
    if (blocked) { toast("Còn dòng bị chặn; hãy sửa file và import lại.", false); return; }
    const result = await apiPost("write/project_personnel_import_commit", {
      confirm_token: preview.confirm_token,
      confirm_privileged_accounts: fd.get("confirm_privileged_accounts") === "yes" });
    closeModal(); await refresh();
    const credentials = result.initial_credentials || [];
    if (credentials.length) {
      openModal("Tài khoản mới · chỉ hiển thị một lần", `
        <div class="form-error-summary"><b>Hãy bàn giao an toàn.</b> Tất cả tài khoản bắt buộc đổi mật khẩu lần đầu.</div>
        ${table(["Họ tên", "Tài khoản", "Mật khẩu khởi tạo", "Role"], credentials.map((c) => [
          esc(c.full_name || "—"), `<code>${esc(c.username)}</code>`,
          `<code>${esc(c.initial_password)}</code>`, esc(c.role)]))}`,
        async () => closeModal(), "Tôi đã lưu");
    } else toast(`Đã gán ${result.summary.assigned} nhân sự vào công trình.`);
  }, blocked ? "Còn lỗi · không thể ghi" : "Xác nhận gán");
}

async function ctTabNhanSu(body, pid) {
  const draw = async () => {
    const data = await apiGet("project_people", { project_id: pid });
    const rows = data.rows || [];
    const missingAccount = rows.filter((r) => !r.app_user_id).length;
    const inactiveScope = rows.filter((r) => r.account_role === "Ky thuat vien"
      && !r.project_access_active).length;
    body.innerHTML = `
      ${metrics([
        ["Nhân sự công trình", String(rows.length), "đúng project", "info", "people"],
        ["Chưa có tài khoản", String(missingAccount), "Admin cấp", missingAccount ? "warn" : "ok", "lock"],
        ["Chưa có project scope", String(inactiveScope), "không thể đăng nhập vào CT", inactiveScope ? "danger" : "ok", "alert"],
      ])}
      ${panel("Nhân sự được gán", `
        <div class="toolbar project-people-actions">
          <button class="btn primary btn-sm" id="ct-people-assign">+ Gán nhân sự</button>
          <button class="btn ghost btn-sm" id="ct-people-import">⇩ Import CSV/Excel</button>
          <input type="file" id="ct-people-file" accept=".csv,.xlsx,.xlsm" hidden>
          <span class="muted">Xem trước → xác nhận; role backend không cho custom từ file.</span>
        </div>
        ${table(["Nhân sự", "Chức vụ", "Vai trò công trình", "Tài khoản", "Project scope", "Liên hệ"],
          rows.map((r) => [
            `<b>${esc(r.ho_ten)}</b><br><span class="muted">NS-${String(r.nhan_su_id).padStart(4, "0")}</span>`,
            chip(r.loai), esc(r.project_role || r.site_role || "—"),
            r.username ? `<code>${esc(r.username)}</code><br><span class="muted">${esc(r.account_role)}${r.must_change ? " · chờ đổi mật khẩu" : ""}</span>` : `<span class="chip warn">Chưa có</span>`,
            r.account_role !== "Ky thuat vien" ? `<span class="chip info">Theo role</span>`
              : (r.project_access_active ? `<span class="chip ok">Đã cấp</span>` : `<span class="chip warn">Chưa cấp</span>`),
            esc(r.sdt || "—")],), { empty: "Chưa gán nhân sự. Dùng nút Gán hoặc Import." })}`)}
      ${panel("Lịch sử import", table(["Batch", "File", "Dòng", "Tạo NS", "Tạo account", "Người ghi", "Thời điểm"],
        (data.history || []).map((r) => [`#${r.id}`, esc(r.source_file_name), r.row_count,
          r.created_people, r.created_accounts, esc(r.created_by), fmtDate(r.created_at)]),
        { empty: "Chưa có lịch sử import." }))}`;
    const fileInput = $("#ct-people-file", body);
    $("#ct-people-import", body).onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0]; if (!file) return;
      try { await ctPeoplePreview(body, pid, file.name, await fileToB64(file), draw); }
      catch (e) { toast(e.message || "Không đọc được file nhân sự.", false); }
      fileInput.value = "";
    };
    $("#ct-people-assign", body).onclick = async () => {
      const all = (await apiGet("nhan_su")).rows || [];
      if (!all.length) { toast("Chưa có hồ sơ nhân sự để gán.", false); return; }
      openModal("Gán nhân sự có sẵn", `
        <div class="f wide"><label>Nhân sự *</label><select name="personnel_id" required>${all.map((n) =>
          `<option value="${n.id}">${esc(n.ho_ten)} · ${esc(n.loai)}${n.username ? " · " + esc(n.username) : " · chưa account"}</option>`).join("")}</select></div>
        ${fI("project_role", "Vai trò / nhiệm vụ trong công trình")}
        ${ME.role === "Quan tri he thong" ? `<label class="f wide"><input type="checkbox" name="provision_account" value="yes"> Cấp tài khoản nếu nhân sự chưa có</label>` : ""}`,
        async (fd) => {
          const person = all.find((n) => Number(n.id) === Number(fd.get("personnel_id")));
          const header = ["Họ tên", "Chức vụ", "SĐT", "CCCD", "Vai trò công trình", "Vai trò công trường", "Tạo tài khoản"];
          const values = [person.ho_ten, person.loai, person.sdt || "", person.cccd || "",
            fd.get("project_role") || "", "", fd.get("provision_account") === "yes" ? "Có" : "Không"];
          const csv = "\ufeff" + header.map(ctPeopleCsvValue).join(",") + "\r\n" + values.map(ctPeopleCsvValue).join(",");
          const file = new File([csv], "gan_nhan_su.csv", { type: "text/csv;charset=utf-8" });
          closeModal(); await ctPeoplePreview(body, pid, file.name, await fileToB64(file), draw);
        }, "Xem trước");
    };
  };
  await draw();
}

async function ctTabNhatKy(body, pid, proj) {
  const d = await apiGet("ct_nhat_ky", { project_id: pid });
  const nk = d.kpi || {};
  const boqOptions = (d.boq_options || []).map((q) => `<option value="${Number(q.id)}">
    ${esc(q.stage_name)} · ${esc(q.item_name_raw)} · ${esc(q.uom_raw || "")}</option>`).join("");
  const draftKey = `journal-${pid}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const offlineKey = window.THOfflineDraft ? THOfflineDraft.key(ME && ME.username, pid) : null;
  const rows = d.rows.map((r) => [
    r.can_decide ? `<input type="checkbox" class="nk-select" data-id="${r.id}" data-version="${r.version}" aria-label="Chọn nhật ký ${r.id}">` : "",
    `<b>${esc(fmtDate(r.ngay_ghi))}</b><div class="muted">${esc(r.nguoi || "—")}</div>`,
    `<div>${esc(r.giai_doan_boq || (r.hang_muc_tu_do ? "Nhật ký tổng quát" : "Chưa chọn tầng"))}</div><div class="muted">${esc(r.hang_muc_boq || r.hang_muc_tu_do || "Chưa chọn hạng mục")}</div>`,
    r.khoi_luong_thuc_hien == null ? `<span class="chip danger">Thiếu</span>` : `${Number(r.khoi_luong_thuc_hien)} ${esc(r.dvt_boq || "")}`,
    `<div>${r.materials.length} dòng vật tư</div><div class="muted">${r.photos.length} ảnh</div>`,
    `<div class="journal-missing">${(r.missing || []).length ? (r.missing || []).map((k) => `<span class="chip warn">${esc(JOURNAL_MISSING_LABEL[k] || k)}</span>`).join(" ") : `<span class="chip ok">Đủ checklist</span>`}</div>`,
    `${chip(r.trang_thai)}${r.confirmation_note ? `<div class="muted">${esc(r.confirmation_note)}</div>` : ""}`,
    `<div class="journal-row-actions">
      ${r.can_edit ? `<button class="btn ghost btn-sm nk-edit" data-id="${r.id}">Sửa/tiếp tục</button>` : ""}
      ${r.can_decide ? `<button class="btn primary btn-sm nk-approve" data-id="${r.id}" data-version="${r.version}">Xác nhận</button>
        <button class="btn ghost btn-sm nk-return" data-id="${r.id}" data-version="${r.version}">Trả lại</button>` : ""}
      ${r.can_export ? `<button class="btn ghost btn-sm nk-export" data-id="${r.id}">${r.export_ready ? "Xuất lại mẫu chuẩn" : "Xuất mẫu chuẩn"}</button>` : ""}
      ${r.export_source_document_id ? `<a class="btn ghost btn-sm" href="/api/document_download?source_document_id=${Number(r.export_source_document_id)}">Tải DOCX</a>` : ""}
    </div>`]);
  body.innerHTML = `
    ${metrics([
      ["Nhật ký tuần này", String(nk.tuan_nay || 0), "bản ghi", "info", "doc"],
      ["Chờ KTT xác nhận", String(nk.cho_ktt || 0), "cần xem xét & xác nhận", nk.cho_ktt ? "warn" : "ok", "clock"],
      ["Bản nháp/cần bổ sung", String(nk.ban_nhap || 0), "chưa gửi KTT", nk.ban_nhap ? "info" : "ok", "doc"],
      ["Ảnh hiện trường", String(nk.so_anh || 0), "ảnh của công trình", "ok", "folder"],
      ["Phát sinh từ nhật ký", String(nk.phat_sinh_tu_nhat_ky || 0), "VO gắn nhật ký", nk.phat_sinh_tu_nhat_ky ? "warn" : "ok", "alert"]])}
    ${ctCan("nhat_ky") ? `<section class="panel journal-entry-card">
      <div class="journal-card-head"><h2><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3.5h10M3 8h10M3 12.5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Nhập nhật ký ngày</h2>
        <span class="journal-required-hint">Trường có * là bắt buộc</span></div>
      <div class="journal-card-body"><p class="journal-card-note">Ghi nhận khối lượng, vật tư và ảnh minh chứng theo đúng tầng/BOQ của công trình.</p>
      <form id="ct-nk-form" class="journal-form">
        <input type="hidden" name="id"><input type="hidden" name="version"><input type="hidden" name="client_draft_id" value="${esc(draftKey)}">
        <input type="hidden" name="weather_source"><input type="hidden" name="weather_observed_at">
        <input type="hidden" name="weather_location_accuracy_m"><input type="hidden" name="weather_is_manual_override">
        <div class="journal-reference-grid">
          <div class="journal-field span-4"><label>Ngày thi công <span>*</span></label><input class="field" name="ngay_ghi" type="date" value="${new Date().toLocaleDateString("en-CA")}" required></div>
          <div class="journal-field span-4"><label>Thời tiết</label><div class="journal-weather-control"><input class="field" name="thoi_tiet" type="text" placeholder="VD: Nắng nhẹ, gió Đông"><button class="btn ghost btn-sm" type="button" id="nk-weather-autofill">Dùng thời tiết thực tế</button></div><small id="nk-weather-state">Bạn có thể nhập tay hoặc dùng thời tiết thực tế tại vị trí hiện trường.</small></div>
          <div class="journal-field span-4"><label>Trạng thái nhập</label><div class="journal-context-state"><span></span>Bản nháp hiện trường</div></div>
          <div class="journal-field span-12"><label>Hạng mục theo tầng/BOQ hoặc tổng quát <span>*</span></label><div class="journal-boq-control"><select class="field" name="boq_stage_qty_id" id="nk-boq-select"><option value="">— Chọn tầng và hạng mục —</option><option value="__manual__">— Nhật ký tổng quát / nhập tay —</option>${boqOptions}</select><div id="nk-manual-item-wrap" hidden><input class="field" name="hang_muc_tu_do" maxlength="500" placeholder="VD: Kiểm tra tổng thể hiện trường, họp điều phối, vệ sinh khu vực thi công"></div></div><small>Chọn BOQ để đối chiếu khối lượng theo tầng; chọn “tổng quát” khi nội dung không thuộc một hạng mục BOQ cụ thể.</small></div>
          <div class="journal-field span-6"><label>Khối lượng thực hiện <span>*</span></label><input class="field" name="khoi_luong_thuc_hien" type="number" min="0" step="any" inputmode="decimal" placeholder="Nhập khối lượng"></div>
          <div class="journal-field span-6"><label>Tổng vật tư thực nhận</label><input class="field" name="vat_tu_thuc_nhan" type="number" min="0" step="any" inputmode="decimal" placeholder="Nhập số lượng thực nhận"></div>
          <div class="journal-field span-12"><label>Diễn biến / nội dung thi công <span>*</span></label><textarea class="field" name="noi_dung" rows="3" placeholder="Mô tả công việc, vị trí, phương pháp và kết quả trong ngày"></textarea></div>
          <div class="journal-field span-6"><label>Nhân lực thực hiện <span>*</span></label><input class="field" name="nhan_luc" placeholder="VD: 01 KTT, 04 KTV"></div>
          <div class="journal-field span-6"><label>Thời gian làm việc <span>*</span></label><input class="field" name="thoi_gian_lam_viec" placeholder="VD: 07:30–11:30; 13:00–17:00"></div>
          <div class="journal-field span-12"><label>Thiết bị/dụng cụ thi công <span>*</span></label><input class="field" name="thiet_bi" placeholder="Máy khoan, giàn giáo, thiết bị đo…">
            <label class="check-inline"><input type="checkbox" name="khong_su_dung_thiet_bi"> Không sử dụng thiết bị/dụng cụ</label></div>
          <div class="journal-field span-12"><label>Kết quả trong ngày <span>*</span></label><textarea class="field" name="ket_qua" rows="2" placeholder="Kết quả đã hoàn thành và tình trạng kiểm tra"></textarea></div>
        </div>
        <section class="journal-material-panel" aria-labelledby="journal-material-title"><h3 id="journal-material-title">Vật tư từ kho công trình</h3>
          <div class="journal-material-labels" aria-hidden="true"><span>Vật tư / lô kho</span><span>Thực nhận</span><span>Đã dùng</span><span>ĐVT</span><span>Ghi chú</span><span></span></div>
          <div id="nk-materials">${journalMaterialRow(d.material_options || [])}</div>
          <div class="journal-material-tools"><button type="button" class="btn ghost btn-sm" id="nk-add-material">+ Thêm vật tư</button>
            <label class="check-inline"><input type="checkbox" name="khong_su_dung_vat_tu"> Công việc này không sử dụng vật tư</label></div>
        </section>
        <section class="journal-photo-section" aria-labelledby="journal-photo-title"><h3 id="journal-photo-title">Ảnh minh chứng trước – trong – sau</h3>
          <div class="journal-photo-grid">
            <label class="journal-photo-slot required"><b>Ảnh trước <span>*</span></b><span class="journal-photo-preview"><span class="journal-photo-file-name">Chưa có ảnh</span></span><input class="journal-photo-input" type="file" name="photo_before" accept="image/jpeg,image/png" multiple><span class="btn ghost btn-sm journal-photo-pick">Chọn file</span></label>
            <label class="journal-photo-slot"><b>Ảnh trong</b><span class="journal-photo-preview"><span class="journal-photo-file-name">Chưa có ảnh</span></span><input class="journal-photo-input" type="file" name="photo_during" accept="image/jpeg,image/png" multiple><span class="btn ghost btn-sm journal-photo-pick">Chọn file</span></label>
            <label class="journal-photo-slot required"><b>Ảnh sau <span>*</span></b><span class="journal-photo-preview"><span class="journal-photo-file-name">Chưa có ảnh</span></span><input class="journal-photo-input" type="file" name="photo_after" accept="image/jpeg,image/png" multiple><span class="btn ghost btn-sm journal-photo-pick">Chọn file</span></label>
          </div><div id="nk-upload-progress" class="upload-progress" aria-live="polite"></div>
        </section>
        <div class="journal-reference-grid journal-tail-grid">
          <div class="journal-field span-12"><label>Sự cố / vướng mắc</label><textarea class="field" name="su_co" rows="2" placeholder="Nếu có — mô tả ngắn và ảnh hưởng tiến độ"></textarea></div>
          <div class="journal-field span-6"><label>Biện pháp xử lý khi có sự cố/kiến nghị</label><textarea class="field" name="bien_phap_xu_ly" rows="2"></textarea></div>
          <div class="journal-field span-3"><label>Người phụ trách xử lý</label><input class="field" name="nguoi_phu_trach_xu_ly"></div>
          <div class="journal-field span-3"><label>Hạn xử lý</label><input class="field" name="han_xu_ly" type="date"></div>
          <div class="journal-field span-12"><label>Kế hoạch tiếp theo</label><textarea class="field" name="ke_hoach_tiep" rows="2" placeholder="Công việc dự kiến ca hoặc ngày kế tiếp"></textarea></div>
          <div class="journal-field span-12"><label>Khó khăn / kiến nghị <span>*</span></label><textarea class="field" name="kho_khan_kien_nghi" rows="2" placeholder="Kiến nghị với KTT hoặc ban chỉ huy"></textarea>
            <label class="check-inline"><input type="checkbox" name="khong_co_kien_nghi"> Không có khó khăn/kiến nghị</label></div>
        </div>
        <div id="nk-offline-state" class="offline-state" role="status" aria-live="polite"></div>
        <div id="nk-form-errors" class="form-error-summary" aria-live="assertive"></div>
        <div class="journal-actions"><button class="btn ghost" type="submit" data-action="draft">Lưu nháp</button>
          <button class="btn primary" type="submit" data-action="submit">Gửi nhật ký</button>
          <button class="btn ghost" type="button" id="nk-cancel-edit" hidden>Hủy sửa</button></div>
      </form></div></section>` : ""}
    ${ctCan("duyet") && d.rows.some((r) => r.can_decide) ? `<div class="bulk-action-bar">
      <b>Nhật ký đã chọn: <span id="nk-selected-count">0</span></b>
      <button class="btn primary btn-sm" id="nk-bulk-approve">Xác nhận đã chọn</button>
      <button class="btn ghost btn-sm" id="nk-bulk-return">Trả lại đã chọn</button></div>` : ""}
    ${panel("Lịch sử nhật ký", table(["", "Ngày/người", "Tầng & hạng mục", "Khối lượng", "Vật tư/ảnh", "Checklist", "Trạng thái", "Thao tác"], rows,
      { empty: "Chưa có nhật ký." }))}`;
  const f = $("#ct-nk-form", body);
  const materialBox = f && $("#nk-materials", f);
  const wireMaterialRows = () => materialBox && materialBox.querySelectorAll(".journal-material-row").forEach((row) => {
    const remove = row.querySelector(".nk-material-remove"); if (remove) remove.onclick = () => row.remove();
  });
  if (f) {
    associateFormLabels(f);
    wireMaterialRows();
    f.querySelectorAll(".journal-photo-input").forEach((input) => input.addEventListener("change", () => {
      const files = [...(input.files || [])];
      const name = input.closest(".journal-photo-slot").querySelector(".journal-photo-file-name");
      name.textContent = files.length ? (files.length === 1 ? files[0].name : `${files.length} ảnh đã chọn`) : "Chưa có ảnh";
    }));
    $("#nk-add-material", f).onclick = () => { materialBox.insertAdjacentHTML("beforeend", journalMaterialRow(d.material_options || [])); wireMaterialRows(); };
    const resetForm = () => { f.reset(); f.elements.id.value = ""; f.elements.version.value = "";
      f.elements.client_draft_id.value = `journal-${pid}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      journalResetWeatherMetadata(f);
      syncJournalItemMode();
      f._offlinePhotoFiles = {};
      materialBox.innerHTML = journalMaterialRow(d.material_options || []); wireMaterialRows();
      $("#nk-cancel-edit", f).hidden = true; $("#nk-form-errors", f).innerHTML = ""; };
    $("#nk-cancel-edit", f).onclick = resetForm;
    const boqSelect = $("#nk-boq-select", f);
    const manualItemWrap = $("#nk-manual-item-wrap", f);
    const syncJournalItemMode = () => {
      const isManual = boqSelect?.value === "__manual__";
      if (manualItemWrap) manualItemWrap.hidden = !isManual;
      if (!isManual && f.elements.hang_muc_tu_do) f.elements.hang_muc_tu_do.value = "";
      if (isManual) f.elements.hang_muc_tu_do?.focus({ preventScroll: true });
    };
    boqSelect?.addEventListener("change", syncJournalItemMode);
    syncJournalItemMode();
    const weatherInput = f.elements.thoi_tiet;
    const weatherButton = $("#nk-weather-autofill", f);
    weatherInput?.addEventListener("input", () => {
      if (weatherInput.dataset.autoWeather && weatherInput.value !== weatherInput.dataset.autoWeather) {
        if (!weatherInput.value.trim()) {
          journalResetWeatherMetadata(f);
        } else {
          f.elements.weather_is_manual_override.value = "1";
          journalWeatherStamp(f, "Bạn đã sửa nội dung tự điền. Nguồn và thời điểm lấy vẫn được lưu để truy vết.");
        }
      }
    });
    if (weatherButton) weatherButton.onclick = () => openModal("Dùng thời tiết thực tế", `
      <p>ERP sẽ xin quyền vị trí của thiết bị một lần để lấy thời tiết tại khu vực hiện trường.</p>
      <p>Chỉ vị trí làm tròn (khoảng 1 km) được gửi đến Open‑Meteo; ERP không lưu tọa độ. Hệ thống lưu nguồn, thời điểm lấy và độ chính xác GPS để truy vết. Bạn luôn có thể sửa nội dung thời tiết trước khi lưu nhật ký.</p>`,
      async () => {
        closeModal();
        try { await journalFillWeatherFromDevice(f, weatherButton); }
        catch (error) { journalWeatherStamp(f, journalWeatherError(error)); toast(journalWeatherError(error), false); }
      }, "Cho phép & lấy thời tiết");
    const offlineStatus = $("#nk-offline-state", f);
    const updateNetworkState = () => {
      if (!offlineStatus) return;
      offlineStatus.className = `offline-state ${navigator.onLine ? "online" : "offline"}`;
      offlineStatus.textContent = navigator.onLine
        ? "Đang trực tuyến. Gửi nhật ký và tải ảnh được phép."
        : "Đang ngoại tuyến. Chỉ Lưu nháp trên thiết bị; Gửi nhật ký bị khóa.";
    };
    window.addEventListener("online", updateNetworkState, { once: true });
    window.addEventListener("offline", updateNetworkState, { once: true });
    updateNetworkState();

    const photoFiles = () => {
      const groups = {};
      for (const name of ["photo_before", "photo_during", "photo_after"]) {
        const selected = [...(f.elements[name].files || [])];
        groups[name] = selected.length ? selected : ((f._offlinePhotoFiles || {})[name] || []);
      }
      return groups;
    };
    const saveOffline = async (payload, materials) => {
      if (!offlineKey || !window.THOfflineDraft) throw new Error("Trình duyệt không hỗ trợ kho nháp offline.");
      const fields = { ...payload };
      delete fields.materials;
      await THOfflineDraft.save(offlineKey, fields, materials, photoFiles());
      if (offlineStatus) offlineStatus.textContent = `Đã lưu nháp trên thiết bị lúc ${new Date().toLocaleTimeString("vi-VN")}. Chưa gửi lên ERP.`;
    };
    if (offlineKey && window.THOfflineDraft) THOfflineDraft.load(offlineKey).then((draft) => {
      if (!draft || !draft.fields) return;
      Object.entries(draft.fields).forEach(([name, value]) => {
        const control = f.elements[name];
        if (!control || value == null) return;
        if (control.type === "checkbox") control.checked = Boolean(value);
        else control.value = value;
      });
      if ((draft.materials || []).length) {
        materialBox.innerHTML = draft.materials.map((m) => journalMaterialRow(d.material_options || [], m)).join("");
        wireMaterialRows();
      }
      f._offlinePhotoFiles = {};
      (draft.photos || []).forEach((row) => {
        if (!f._offlinePhotoFiles[row.stage]) f._offlinePhotoFiles[row.stage] = [];
        f._offlinePhotoFiles[row.stage].push(row.file);
      });
      Object.entries(f._offlinePhotoFiles).forEach(([name, files]) => {
        const slot = f.elements[name]?.closest(".journal-photo-slot");
        if (slot) slot.querySelector(".journal-photo-file-name").textContent = `${files.length} ảnh từ bản nháp offline`;
      });
      if (offlineStatus) offlineStatus.textContent = `Đã khôi phục bản nháp trên thiết bị (${new Date(draft.saved_at).toLocaleString("vi-VN")}).`;
    }).catch(() => { /* IndexedDB co the bi chan o che do rieng tu. */ });
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); const action = e.submitter?.dataset.action || "draft"; const fd = new FormData(f);
      const materials = [...materialBox.querySelectorAll(".journal-material-row")].map((row) => {
        const ledgerId = Number(row.querySelector(".nk-material-select").value || 0); if (!ledgerId) return null;
        const option = (d.material_options || []).find((m) => Number(m.stock_ledger_id) === ledgerId) || {};
        return { stock_ledger_id: ledgerId, item_key: option.item_key, ten_vat_tu: option.item_name,
          boq_stage_qty_id: option.boq_stage_qty_id || null, dvt: row.querySelector(".nk-material-uom").value,
          so_luong_thuc_nhan: row.querySelector(".nk-material-received").value,
          so_luong_su_dung: row.querySelector(".nk-material-used").value,
          ghi_chu: row.querySelector(".nk-material-note").value };
      }).filter(Boolean);
      const payload = { id: Number(fd.get("id")) || null, expected_version: Number(fd.get("version")) || null,
        client_draft_id: fd.get("client_draft_id"), project_id: pid, ngay_ghi: fd.get("ngay_ghi"),
        thoi_tiet: fd.get("thoi_tiet"), boq_stage_qty_id: fd.get("boq_stage_qty_id") === "__manual__" ? null : (Number(fd.get("boq_stage_qty_id")) || null),
        hang_muc_tu_do: fd.get("hang_muc_tu_do"),
        weather_source: fd.get("weather_source"), weather_observed_at: fd.get("weather_observed_at"),
        weather_location_accuracy_m: fd.get("weather_location_accuracy_m"),
        weather_is_manual_override: fd.get("weather_is_manual_override") === "1",
        khoi_luong_thuc_hien: fd.get("khoi_luong_thuc_hien"), vat_tu_thuc_nhan: fd.get("vat_tu_thuc_nhan"),
        noi_dung: fd.get("noi_dung"), nhan_luc: fd.get("nhan_luc"), thiet_bi: fd.get("thiet_bi"),
        khong_su_dung_thiet_bi: f.elements.khong_su_dung_thiet_bi.checked,
        thoi_gian_lam_viec: fd.get("thoi_gian_lam_viec"), ket_qua: fd.get("ket_qua"),
        su_co: fd.get("su_co"), bien_phap_xu_ly: fd.get("bien_phap_xu_ly"),
        nguoi_phu_trach_xu_ly: fd.get("nguoi_phu_trach_xu_ly"), han_xu_ly: fd.get("han_xu_ly"),
        ke_hoach_tiep: fd.get("ke_hoach_tiep"),
        kho_khan_kien_nghi: fd.get("kho_khan_kien_nghi"), materials,
        khong_su_dung_vat_tu: f.elements.khong_su_dung_vat_tu.checked,
        khong_co_kien_nghi: f.elements.khong_co_kien_nghi.checked };
      const errBox = $("#nk-form-errors", f); errBox.innerHTML = "";
      try {
        if (!navigator.onLine) {
          await saveOffline(payload, materials);
          if (action === "submit") throw new Error("Gửi nhật ký là thao tác online-only. Bản nháp đã được lưu trên thiết bị.");
          toast("Đã lưu nháp offline trên thiết bị.");
          return;
        }
        const saved = await apiPost("write/ct_nhat_ky", payload);
        const progress = $("#nk-upload-progress", f); const groups = [
          ["photo_before", "Truoc"], ["photo_during", "Trong"], ["photo_after", "Sau"]];
        const retainedPhotos = photoFiles();
        let uploaded = 0; const allFiles = groups.flatMap(([name, stage]) => retainedPhotos[name].map((file) => ({ file, stage })));
        for (const entry of allFiles) {
          progress.innerHTML = `<span class="chip info">Đang tải ${uploaded + 1}/${allFiles.length}: ${esc(entry.file.name)}</span>`;
          const b64 = await fileToB64(entry.file);
          await apiPost("write/ct_hinh_anh", { project_id: pid, nhat_ky_id: saved.id,
            giai_doan_anh: entry.stage, hang_muc: f.elements.boq_stage_qty_id.value === "__manual__"
              ? (f.elements.hang_muc_tu_do.value || "Nhật ký tổng quát")
              : (f.elements.boq_stage_qty_id.selectedOptions[0]?.textContent || ""),
            filename: entry.file.name, file_b64: b64 }); uploaded += 1;
        }
        if (allFiles.length) progress.innerHTML = `<span class="chip ok">Đã đồng bộ ${uploaded}/${allFiles.length} ảnh</span>`;
        if (action === "submit") {
          await apiPost("write/ct_nhat_ky_submit", { id: saved.id, expected_version: saved.version });
          toast("Đã gửi nhật ký chờ KTT xác nhận.");
        } else toast("Đã lưu bản nháp.");
        if (offlineKey && window.THOfflineDraft) await THOfflineDraft.remove(offlineKey).catch(() => {});
        ctTabNhatKy(body, pid, proj);
      } catch (err) {
        if (!navigator.onLine && action === "draft") await saveOffline(payload, materials).catch(() => {});
        const missing = (err.data && err.data.missing) || [];
        errBox.innerHTML = `<b>${esc(err.message || "Không thể lưu")}</b>${missing.length ? `<ul>${missing.map((k) => `<li>${esc(JOURNAL_MISSING_LABEL[k] || k)}</li>`).join("")}</ul>` : ""}`;
        toast(err.message || "Lỗi", false);
      }
    });
  }
  body.querySelectorAll(".nk-edit").forEach((b) => b.onclick = () => {
    const r = d.rows.find((x) => Number(x.id) === Number(b.dataset.id)); if (!r || !f) return;
    for (const name of ["id", "version", "client_draft_id", "ngay_ghi", "thoi_tiet", "boq_stage_qty_id",
      "hang_muc_tu_do",
      "weather_source", "weather_observed_at", "weather_location_accuracy_m", "weather_is_manual_override",
      "khoi_luong_thuc_hien", "vat_tu_thuc_nhan", "noi_dung", "nhan_luc", "thiet_bi",
      "thoi_gian_lam_viec", "ket_qua", "su_co", "bien_phap_xu_ly", "nguoi_phu_trach_xu_ly",
      "han_xu_ly", "ke_hoach_tiep", "kho_khan_kien_nghi"])
      if (f.elements[name]) f.elements[name].value = r[name] ?? "";
    f.elements.khong_su_dung_thiet_bi.checked = Boolean(r.khong_su_dung_thiet_bi);
    f.elements.khong_su_dung_vat_tu.checked = Boolean(r.khong_su_dung_vat_tu);
    f.elements.khong_co_kien_nghi.checked = Boolean(r.khong_co_kien_nghi);
    if (!r.boq_stage_qty_id && r.hang_muc_tu_do) {
      f.elements.boq_stage_qty_id.value = "__manual__";
      f.elements.hang_muc_tu_do.value = r.hang_muc_tu_do;
    }
    syncJournalItemMode();
    if (r.weather_source) {
      f.elements.thoi_tiet.dataset.autoWeather = r.thoi_tiet || "";
      const at = r.weather_observed_at ? new Date(r.weather_observed_at).toLocaleString("vi-VN") : "không rõ thời điểm";
      const precision = r.weather_location_accuracy_m == null ? "" : ` · vị trí gần đúng ±${Math.round(Number(r.weather_location_accuracy_m))} m`;
      journalWeatherStamp(f, `${r.weather_is_manual_override ? "Đã sửa thủ công từ gợi ý" : "Tự điền"} · ${r.weather_source} · ${at}${precision}.`);
    } else journalWeatherStamp(f, "Nội dung thời tiết được nhập thủ công.");
    materialBox.innerHTML = (r.materials || []).length ? (r.materials || []).map((m) => journalMaterialRow(d.material_options || [], m)).join("") : journalMaterialRow(d.material_options || []);
    wireMaterialRows(); $("#nk-cancel-edit", f).hidden = false; f.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  const oneItem = (b) => [{ id: Number(b.dataset.id), expected_version: Number(b.dataset.version) }];
  body.querySelectorAll(".nk-approve").forEach((b) => b.onclick = () => journalDecision(body, pid, oneItem(b), "approve"));
  body.querySelectorAll(".nk-return").forEach((b) => b.onclick = () => {
    openModal("Trả lại nhật ký", `<div class="f wide"><label>Lý do chuẩn *</label><select name="reason_code" required>
      ${(d.return_reason_catalog || []).map((x) => `<option value="${esc(x)}">${esc(x.replaceAll("_", " "))}</option>`).join("")}</select></div>${fT("note", "Ghi chú cho người lập")}`,
      async (fd) => { closeModal(); journalDecision(body, pid, oneItem(b), "return", fd.get("reason_code"), fd.get("note")); }, "Xem trước");
  });
  body.querySelectorAll(".nk-export").forEach((b) => b.onclick = async () => {
    try {
      const result = await apiPost("write/ct_nhat_ky_export", { id: Number(b.dataset.id) });
      toast("Đã sinh nhật ký theo template V3.1.");
      window.location.href = result.download_url;
      ctTabNhatKy(body, pid, proj);
    } catch (e) { toast(e.message || "Không xuất được nhật ký.", false); }
  });
  const selectedItems = () => [...body.querySelectorAll(".nk-select:checked")].map((x) => ({ id: Number(x.dataset.id), expected_version: Number(x.dataset.version) }));
  body.querySelectorAll(".nk-select").forEach((x) => x.onchange = () => { const n = $("#nk-selected-count", body); if (n) n.textContent = selectedItems().length; });
  const bulkApprove = $("#nk-bulk-approve", body); if (bulkApprove) bulkApprove.onclick = () => journalDecision(body, pid, selectedItems(), "approve");
  const bulkReturn = $("#nk-bulk-return", body); if (bulkReturn) bulkReturn.onclick = () => {
    openModal("Trả lại các nhật ký đã chọn", `<div class="f wide"><label>Lý do chuẩn *</label><select name="reason_code" required>
      ${(d.return_reason_catalog || []).map((x) => `<option value="${esc(x)}">${esc(x.replaceAll("_", " "))}</option>`).join("")}</select></div>${fT("note", "Ghi chú chung")}`,
      async (fd) => { closeModal(); journalDecision(body, pid, selectedItems(), "return", fd.get("reason_code"), fd.get("note")); }, "Xem trước");
  };
}

/* 2026-07-10 tham khao FastCon: canh bao 3 nguong tren % XUAT KHO/dinh muc (tin hieu SOM,
   thoi diem duyet phieu xuat — khac chenh_du_toan von la doi chieu THUC DUNG nhap tay sau). */
const CANH_BAO_LABEL = { binh_thuong: "", canh_bao_1: "⚠ Cảnh báo 1", canh_bao_2: "⚠ Cảnh báo 2",
  vuot_dinh_muc: "🔴 Vượt định mức" };
const CANH_BAO_CLS = { canh_bao_1: "warn", canh_bao_2: "warn", vuot_dinh_muc: "danger" };
function canhBaoBadge(r) {
  const l = CANH_BAO_LABEL[r.muc_canh_bao];
  if (!l) return "";
  return `<span class="chip ${CANH_BAO_CLS[r.muc_canh_bao]}" title="Đã xuất kho ${r.pct_xuat_kho}% định mức (${r.kl_xuat_kho}/${r.kl_du_toan} ${esc(r.dvt || "")})">${l}</span>`;
}
function quickProjectQuoteImport(pid, proj, after) {
  const returnFocus = document.activeElement;
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".xls,.xlsx,.xlsm,.xlsb";
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    let payload;
    try {
      payload = { project_id: Number(pid), project_name: proj.project_name,
        customer_id: Number(proj.customer_id), template_profile: proj.template_profile || "INSTALLATION_STANDARD",
        auto_generate_templates: false, quote_filename: file.name, quote_b64: await fileToB64(file) };
      const show = (pv) => openNormalizationSandbox(pv, {
        returnFocus,
        onSelectSheet: async (sheetName) => {
          payload = { ...payload, quote_sheet_name: sheetName };
          show(await apiPost("write/project_profile_preview", payload));
        },
        onConfirm: async () => {
          try {
            const result = await apiPost("write/project_profile_commit", { confirm_token: pv.confirm_token });
            toast(`Đã tạo revision ${result.quotation_code || result.quotation_id} từ file đã chuẩn hóa.`);
            if (after) after();
          } catch (e) { toast(e.message || "Không import được revision.", false); }
        },
      });
      show(await apiPost("write/project_profile_preview", payload));
    } catch (e) { toast(e.message || "Không đọc được file báo giá/BOQ.", false); }
  };
  input.click();
}

function ctExactBoqPanel(vt, selectedStageId) {
  const stages = vt.stages || [];
  const selectedKey = String(selectedStageId || "");
  const selectedStage = stages.find((stage) => String(stage.id) === selectedKey);
  const canAssignStage = !!selectedStage?.is_unallocated && ctCan("boq_stage_assignment");
  const stageOptions = stages.map((stage) => `<option value="${Number(stage.id)}" ${String(stage.id) === selectedKey ? "selected" : ""}>
    ${esc(stage.name || stage.giai_doan || "Tầng không tên")}${stage.is_unallocated ? " (chưa phân tầng)" : ""} · ${Number(stage.so_muc || 0)} mục</option>`).join("");
  const hierarchy = (vt.hierarchy_rows || []).slice().sort((a, b) =>
    Number(a.source_order || 0) - Number(b.source_order || 0));
  const allocationByLine = new Map();
  const ancestorRows = new Set();
  hierarchy.forEach((line) => {
    if (line.line_type !== "detail") return;
    const allocation = (line.allocations || []).find((item) => String(item.stage_id) === selectedKey);
    if (!allocation) return;
    allocationByLine.set(String(line.boq_line_id || line.id), allocation);
    (line.hierarchy_path || []).forEach((parent) => ancestorRows.add(String(parent.source_row)));
  });
  const visible = hierarchy.filter((line) => line.line_type === "detail"
    ? allocationByLine.has(String(line.boq_line_id || line.id))
    : line.line_type === "heading" && ancestorRows.has(String(line.source_row)));
  const rows = visible.map((line) => {
    const stt = esc(line.source_stt_raw || "");
    const name = esc(line.item_name_raw || "");
    if (line.line_type === "heading") {
      const pad = Math.max(0, Number(line.hierarchy_level || 1) - 1) * 14;
      return [`<b>${stt}</b>`, `<div style="padding-left:${pad}px"><b>${name}</b></div>`, "", "", "", "", "", "", ""];
    }
    const allocation = allocationByLine.get(String(line.boq_line_id || line.id));
    const planned = Number(allocation.planned_qty || 0);
    const actual = Number(allocation.actual_qty || 0);
    const returned = Number(allocation.returned_qty || 0);
    const difference = actual - planned;
    const pad = Math.max(0, (line.hierarchy_path || []).length) * 14;
    const technical = line.technical_requirement_raw
      ? `<div class="muted" style="font-size:11px">${esc(line.technical_requirement_raw)}</div>` : "";
    const floorTotal = line.floor_total_qty;
    const plannedHtml = `<b>${planned}</b>${floorTotal != null
      ? `<div class="muted" style="font-size:10.5px" title="Tổng khối lượng cột L của dòng nguồn">Tổng L: ${esc(String(floorTotal))}</div>` : ""}`;
    const differenceHtml = difference > 0
      ? `<b style="color:var(--danger)">+${difference}</b>`
      : difference < 0 ? `<span style="color:var(--warn)">${difference}</span>` : `<span class="chip ok">0</span>`;
    const actions = [];
    if (ctCan("boq_actual")) actions.push(`<label class="check-inline"><input type="checkbox" class="boq-grid-select"
        data-id="${Number(allocation.id)}" data-source-row="${Number(line.source_row)}"
        data-updated-at="${esc(allocation.updated_at || "")}" data-suggested="${Number(allocation.suggested_actual_qty || 0)}"
        data-actual="${actual}" data-returned="${returned}"> Đối chiếu</label>`);
    if (canAssignStage) actions.push(`<label class="check-inline"><input type="checkbox" class="boq-stage-assign-select"
        data-id="${Number(allocation.id)}" data-updated-at="${esc(allocation.updated_at || "")}"> Phân tầng</label>`);
    return [stt, `<div style="padding-left:${pad}px">${name}${technical}</div>`, esc(line.uom_raw || "—"),
      plannedHtml, line.contract_qty == null ? "—" : esc(String(line.contract_qty)), String(actual), String(returned),
      differenceHtml, actions.join("<br>")];
  });
  const source = vt.profile_import || {};
  return panel("Đối chiếu khối lượng dự toán vs thực tế theo từng tầng",
    `<div class="toolbar" style="margin-bottom:10px"><label><b>Tầng/giai đoạn:</b></label>
      <select id="ct-boq-stage" ${stages.length ? "" : "disabled"}>${stageOptions || `<option>Chưa có tầng</option>`}</select>
      <span class="chip info">BOQ chính thức · đúng dòng nguồn</span>
      ${canProjectProfile() ? `<button type="button" class="btn ghost btn-sm" id="boq-import-revision">Import revision báo giá/BOQ</button>` : ""}</div>
    ${table(["STT", "Tên hạng mục", "ĐVT", "KL tầng (D:K)", "KL HĐ (N)", "Thực tế", "Hoàn trả", "Chênh", ""], rows,
      { empty: "Tầng được chọn chưa có dòng khối lượng được phân bổ." })}
    ${ctCan("boq_actual") ? `<div class="boq-grid-tools"><textarea id="boq-grid-paste" class="field" rows="3"
      placeholder="Dán từ Excel: source_row[TAB]thực tế[TAB]hoàn trả"></textarea><div class="toolbar">
      <button type="button" class="btn ghost btn-sm" id="boq-grid-apply-paste">Áp dụng dữ liệu dán</button>
      <button type="button" class="btn ghost btn-sm" id="boq-grid-suggest">Gợi ý từ nhật ký đã duyệt</button>
      <button type="button" class="btn primary btn-sm" id="boq-grid-preview">Xem trước & ghi các dòng chọn</button></div></div>` : ""}
    ${canAssignStage ? `<div class="boq-grid-tools"><div class="toolbar">
      <select id="boq-assign-target" class="field"><option value="">— Chọn tầng/giai đoạn đích —</option>${stages.filter((stage) => !stage.is_unallocated).map((stage) => `<option value="${Number(stage.id)}">${esc(stage.name)}</option>`).join("")}</select>
      <input id="boq-assign-new-stage" class="field" placeholder="Hoặc nhập tên tầng mới">
      <input id="boq-assign-reason" class="field" placeholder="Căn cứ phân tầng (bắt buộc)">
      <button type="button" class="btn primary btn-sm" id="boq-assign-preview">Xem trước & phân tầng</button></div>
      <div class="muted" style="font-size:11px">Chỉ đổi các dòng đã chọn; giữ nguyên source_row, BOQ line và toàn bộ audit.</div></div>` : ""}
    <div class="muted" style="font-size:11px;margin-top:7px">Nguồn: ${esc(source.source_file_name || "báo giá chính thức")} · sheet ${esc(source.source_sheet || "—")}.
      Chỉ hiện hạng mục có phân bổ của tầng đang chọn và các tiêu đề cha theo đúng thứ tự file.</div>`);
}
function ctBoqActualModal(line, allocation, after) {
  const w = openModal("Cập nhật khối lượng thực tế theo tầng",
    `<div class="f wide">${formGrid([
      ["Tầng", allocation.stage_name || "—"], ["STT", line.source_stt_raw || "—"],
      ["Hạng mục", line.item_name_raw || "—"], ["KL dự toán tầng", String(allocation.planned_qty ?? "—")],
    ], 2)}</div>` +
    fI("actual_qty", "Khối lượng thực tế", "number", "step=any min=0 required") +
    fI("returned_qty", "Khối lượng hoàn trả", "number", "step=any min=0 required") +
    fS("status", "Trạng thái", [["Chua_doi_chieu", "Chưa đối chiếu"], ["Cho_doi_chieu", "Chờ đối chiếu"],
      ["Cho_xac_nhan", "Chờ xác nhận"], ["Khop", "Khớp"], ["Vuot_du_toan", "Vượt dự toán"]]) +
    fT("note", "Ghi chú đối chiếu"),
    async (fd) => {
      const saved = await apiPost("write/project_boq_actual", {
        id: Number(allocation.id), actual_qty: fd.get("actual_qty"), returned_qty: fd.get("returned_qty"),
        status: fd.get("status"), note: fd.get("note"), expected_updated_at: allocation.updated_at,
      });
      allocation.updated_at = saved.updated_at || allocation.updated_at;
      closeModal(); toast("Đã cập nhật đúng dòng BOQ/tầng."); await after();
    });
  w.querySelector('[name="actual_qty"]').value = allocation.actual_qty ?? 0;
  w.querySelector('[name="returned_qty"]').value = allocation.returned_qty ?? 0;
  w.querySelector('[name="status"]').value = allocation.status || "Chua_doi_chieu";
  w.querySelector('[name="note"]').value = allocation.note || "";
}
/* ---- Tab: Khối lượng & Phát sinh (ct_tien_do + ct_khoi_luong=VO) ---- */
async function ctTabKhoiLuong(body, pid, proj) {
  const [td, kl, burnup] = await Promise.all([
    apiGet("ct_tien_do", { project_id: pid }), apiGet("ct_khoi_luong", { project_id: pid }),
    apiGet("ct_burnup", { project_id: pid }).catch(() => ({ rows: [], data_quality: null }))]);
  // WO-38 (3.6): bảng LỚN của trang = đối chiếu DT-vs-TT vật tư theo giai đoạn (ct_vat_tu_thuc_te)
  const vt = await apiGet("ct_vat_tu_thuc_te", { project_id: pid }).catch(() => ({ rows: [], theo_giai_doan: [] }));
  const exactBoq = vt.boq_mode === "exact_official_profile";
  const exactStages = vt.stages || [];
  let selectedStageId = body.dataset.boqStageId || "";
  if (!exactStages.some((stage) => String(stage.id) === String(selectedStageId))) {
    selectedStageId = exactStages.length ? String(exactStages[0].id) : "";
    body.dataset.boqStageId = selectedStageId;
  }
  const vtStatusChip = (r) => {
    const c = r.chenh_du_toan;
    if (c == null) return chip("Chua_doi_chieu");
    if (c > 0) return `<span class="chip danger">Vượt +${c}</span>`;
    if (r.trang_thai === "Cho_xac_nhan" || r.trang_thai === "Cho_doi_chieu") return chip("Cho_xac_nhan");
    return `<span class="chip ok">Khớp</span>`;
  };
  const vtRows = (vt.rows || []).map((r) => [esc(r.giai_doan), esc(r.ten_vat_tu), esc(r.dvt || "—"),
    String(r.kl_du_toan ?? "—"), String(r.kl_xuat_kho ?? "—") + " " + canhBaoBadge(r),
    String(r.kl_thuc_te ?? "—"), String(r.kl_hoan_tra ?? "—"),
    r.chenh_lech > 0 ? `<b style="color:var(--danger)">+${r.chenh_lech}</b>` : String(r.chenh_lech ?? "—"),
    vtStatusChip(r), ctCan("ct_vat_tu_thuc_te") ? `<button class="btn ghost btn-sm ct-dm-edit" data-id="${r.id}">Sửa</button>` : ""]);
  const stageRows = (vt.theo_giai_doan || []).map((s) => [`<b>${esc(s.giai_doan)}</b>`,
    String(s.so_muc), String(s.kl_du_toan), String(s.kl_xuat_kho), String(s.kl_thuc_te),
    s.chenh_lech > 0 ? `<b style="color:var(--danger)">+${s.chenh_lech}</b>` : String(s.chenh_lech),
    s.ty_le_thuc_te_pct != null ? s.ty_le_thuc_te_pct + "%" : "—"]);
  const tdRows = td.rows.map((r) => [esc(r.hang_muc), esc(r.khu_vuc || "—"),
    esc(fmtDate(r.ngay_bd_ke_hoach)) + " → " + esc(fmtDate(r.ngay_kt_ke_hoach)),
    (r.ngay_bd_thuc_te || r.ngay_kt_thuc_te) ? esc(fmtDate(r.ngay_bd_thuc_te)) + " → " + esc(fmtDate(r.ngay_kt_thuc_te)) : "—",
    `<div style="display:flex;align-items:center;gap:6px"><div class="rank-bar" style="width:70px;height:8px"><div class="rank-fill" style="width:${Math.min(100, r.phan_tram_hoan_thanh || 0)}%;height:100%"></div></div>${(r.phan_tram_hoan_thanh || 0).toFixed(0)}%</div>`,
    esc(r.ten_phu_trach || "—"), esc(r.rui_ro_vuong_mac || "—"),
    ctCan("tien_do") ? `<button class="btn ghost btn-sm ct-td-edit" data-id="${r.id}">Sửa</button>` : ""]);
  const donutHtml = kl.rows.length ? svgDonut([
    ["Cho_duyet", kl.rows.filter((r) => r.trang_thai === "Cho_duyet").length],
    ["Da_duyet", kl.rows.filter((r) => r.trang_thai === "Da_duyet").length]])
    : `<div class="empty">Chưa có phát sinh.</div>`;
  const klRows = kl.rows.map((r) => [`<span class="code">${esc(r.ma_vo)}</span>`, esc(fmtDate(r.ngay)), esc(r.hang_muc),
    `${esc(r.loai_phat_sinh || "—")}<div class="muted">${esc(String(r.so_luong ?? "—"))} ${esc(r.dvt || "")}</div>`,
    esc(r.ly_do || "—"), r.gia_tri_tang == null ? "—" : `<span class="money">${vnd(r.gia_tri_tang)}</span>`,
    r.gia_tri_giam == null ? "—" : `<span class="money">${vnd(r.gia_tri_giam)}</span>`,
    esc(r.ten_nguoi_de_nghi || "—"), esc(r.ten_nguoi_duyet || "—"), chip(r.trang_thai),
    `${r.can_edit ? `<button class="btn ghost btn-sm ct-vo-edit" data-id="${r.id}">Sửa</button>` : ""}
     ${r.can_revise ? `<button class="btn ghost btn-sm ct-vo-revise" data-id="${r.id}">Tạo revision</button>` : ""}
     ${r.can_decide ? `<button class="btn ghost btn-sm ct-vo-duyet" data-id="${r.id}" data-version="${r.version}">Quyết định</button>` : ""}`]);
  const boqPanel = exactBoq ? ctExactBoqPanel(vt, selectedStageId) : panel("Đối chiếu khối lượng dự toán vs thực tế theo giai đoạn", table(
      ["GĐ", "Hạng mục / Vật tư", "ĐVT", "Dự toán", "Xuất kho", "Thực dùng", "Hoàn trả", "Chênh lệch", "Trạng thái", ""],
      vtRows, { empty: "Chưa có định mức vật tư theo giai đoạn — bấm [+ Nhập định mức] để tạo." })
      + (ctCan("ct_vat_tu_thuc_te") ? `<div class="toolbar" style="margin-top:10px">
          <button class="btn primary btn-sm" id="ct-dm-new">+ Nhập định mức vật tư</button>
          <button class="btn ghost btn-sm" id="ct-dm-autofill" title="Điền tự động kl_du_toan từ số lượng vật tư/thiết bị trong báo giá công trình — không ghi đè định mức đã có">+ Tự động điền từ báo giá</button>
        </div>` : "")
      + `<div class="muted" style="font-size:11px;margin-top:6px">Xuất kho lấy từ stock_ledger (qua phiếu vật tư đã duyệt) — cảnh báo 🟡🔴 hiện ngay khi vượt 80%/90%/100% định mức. Thực dùng/hoàn trả nhập tay khi đối chiếu cuối giai đoạn.</div>`);
  body.innerHTML = `
    ${boqPanel}
    ${burnup.rows && burnup.rows.length > 1 ? `<div style="margin-top:14px">${panel("Burn-up tiến độ (kế hoạch vs thực tế)", svgBurnup(burnup.rows))}</div>` : ""}
    ${!exactBoq && stageRows.length ? `<div style="margin-top:14px">${panel("Tổng hợp chênh lệch theo giai đoạn",
      table(["Giai đoạn", "Số mục", "Dự toán", "Xuất kho", "Thực tế", "Chênh lệch", "% thực tế"], stageRows))}</div>` : ""}
    <div class="grid cols-2" style="margin-top:14px">
      ${panel("Tiến độ theo hạng mục", table(
        ["Hạng mục", "Khu vực", "Kế hoạch", "Thực tế", "Hoàn thành", "Phụ trách", "Rủi ro", ""],
        tdRows, { empty: "Chưa có dòng tiến độ." })
        + (ctCan("tien_do") ? `<div class="toolbar" style="margin-top:10px"><button class="btn ghost btn-sm" id="ct-td-new">+ Thêm hạng mục tiến độ</button></div>` : ""))}
      <div class="grid" style="gap:14px">
        ${panel("Phân bổ phát sinh theo trạng thái", donutHtml)}
        ${panel("Tổng phát sinh (VO)", formGrid([
          ["Đã duyệt (tăng)", kl.tong.tang_duyet == null ? "—" : vnd(kl.tong.tang_duyet)],
          ["Đã duyệt (giảm)", kl.tong.giam_duyet == null ? "—" : vnd(kl.tong.giam_duyet)],
          ["Đang chờ duyệt", String(kl.tong.cho_duyet || 0) + " VO"]], 1))}
      </div>
    </div>
    <div style="margin-top:14px">${panel("Khối lượng phát sinh (VO)",
      table(["Mã VO", "Ngày", "Hạng mục", "Loại/KL", "Lý do", "Tăng", "Giảm", "Đề nghị", "Duyệt", "TT", ""], klRows,
        { empty: "Chưa có phát sinh nào." })
      + (ctCan("phat_sinh") ? `<div class="toolbar" style="margin-top:10px"><button class="btn primary btn-sm" id="ct-vo-new">+ Tạo phát sinh mới</button></div>` : ""))}</div>`;
  const refresh = () => ctTabKhoiLuong(body, pid, proj);
  const stageSelect = $("#ct-boq-stage", body);
  if (exactBoq && stageSelect) stageSelect.onchange = () => {
    body.dataset.boqStageId = stageSelect.value;
    refresh();
  };
  const boqImportRevision = $("#boq-import-revision", body);
  if (exactBoq && boqImportRevision) boqImportRevision.onclick = () =>
    quickProjectQuoteImport(pid, proj, refresh);
  if (exactBoq) body.querySelectorAll(".ct-boq-edit").forEach((button) => button.addEventListener("click", () => {
    const line = (vt.hierarchy_rows || []).find((item) => Number(item.boq_line_id || item.id) === Number(button.dataset.lineId));
    const allocation = line && (line.allocations || []).find((item) => Number(item.id) === Number(button.dataset.allocationId));
    if (line && allocation) ctBoqActualModal(line, allocation, refresh);
  }));
  if (exactBoq && ctCan("boq_actual")) {
    const selectedUpdates = () => [...body.querySelectorAll(".boq-grid-select:checked")].map((x) => ({
      id: Number(x.dataset.id), actual_qty: Number(x.dataset.actual || 0), returned_qty: Number(x.dataset.returned || 0),
      status: "Cho_xac_nhan", expected_updated_at: x.dataset.updatedAt }));
    const applyPaste = $("#boq-grid-apply-paste", body); if (applyPaste) applyPaste.onclick = () => {
      const lines = ($("#boq-grid-paste", body).value || "").trim().split(/\r?\n/).filter(Boolean); let applied = 0;
      lines.forEach((line) => { const [sourceRow, actual, returned = "0"] = line.split("\t");
        const box = body.querySelector(`.boq-grid-select[data-source-row="${Number(sourceRow)}"]`);
        if (box && Number.isFinite(Number(actual)) && Number(actual) >= 0 && Number(returned) >= 0) {
          box.dataset.actual = String(Number(actual)); box.dataset.returned = String(Number(returned)); box.checked = true; applied += 1;
        }}); toast(`Đã map chính xác ${applied}/${lines.length} dòng theo source_row.`);
    };
    const suggest = $("#boq-grid-suggest", body); if (suggest) suggest.onclick = () => {
      body.querySelectorAll(".boq-grid-select").forEach((box) => { box.dataset.actual = box.dataset.suggested || "0"; box.checked = true; });
      toast("Đã chọn gợi ý chỉ từ nhật ký đã duyệt và đúng dòng BOQ/tầng.");
    };
    const previewBtn = $("#boq-grid-preview", body); if (previewBtn) previewBtn.onclick = async () => {
      const updates = selectedUpdates(); if (!updates.length) return toast("Chọn ít nhất một dòng BOQ.", false);
      try { const pv = await apiPost("write/project_boq_actual_batch", { phase: "preview", project_id: pid, updates });
        openModal(`Ghi ${pv.count} dòng BOQ`, `<p>Hệ thống sẽ kiểm tra lại project, source-row và version; lỗi một dòng sẽ rollback toàn bộ.</p>`,
          async () => { await apiPost("write/project_boq_actual_batch", { phase: "commit", confirm_token: pv.confirm_token });
            closeModal(); toast(`Đã cập nhật ${pv.count} dòng BOQ.`); refresh(); }, "Ghi chính thức");
      } catch (e) { toast(e.message || "Không thể xem trước.", false); }
    };
  }
  if (exactBoq && ctCan("boq_stage_assignment")) {
    const assignPreview = $("#boq-assign-preview", body);
    if (assignPreview) assignPreview.onclick = async () => {
      const selected = [...body.querySelectorAll(".boq-stage-assign-select:checked")];
      if (!selected.length) return toast("Chọn ít nhất một dòng chưa phân tầng.", false);
      const targetStageId = Number($("#boq-assign-target", body).value) || null;
      const newStageName = ($("#boq-assign-new-stage", body).value || "").trim();
      const reason = ($("#boq-assign-reason", body).value || "").trim();
      if (!!targetStageId === !!newStageName) return toast("Chọn tầng có sẵn hoặc nhập tầng mới, không dùng cả hai.", false);
      if (reason.length < 3) return toast("Nhập căn cứ phân tầng.", false);
      const updates = selected.map((box) => ({ stage_qty_id: Number(box.dataset.id),
        expected_updated_at: box.dataset.updatedAt, target_stage_id: targetStageId,
        new_stage_name: newStageName, reason }));
      try {
        const pv = await apiPost("write/project_boq_stage_assignment", {
          phase: "preview", project_id: pid, updates });
        const previewRows = (pv.rows || []).map((row) => [String(row.source_row), esc(row.item_name),
          esc(row.from_stage_name), "→", esc(row.target_stage_name), String(row.planned_qty), row.merge ? "Gộp" : "Giữ ID"]);
        openModal(`Phân tầng ${pv.count} hạng mục`, `<div class="f wide">${table(
          ["Dòng", "Hạng mục", "Từ", "", "Đến", "KL", "Cách ghi"], previewRows)}</div>
          <div class="f wide muted">Hệ thống sẽ kiểm tra lại version và rollback toàn bộ nếu một dòng xung đột.</div>`,
          async () => {
            await apiPost("write/project_boq_stage_assignment", { phase: "commit", confirm_token: pv.confirm_token });
            closeModal(); toast(`Đã phân tầng ${pv.count} hạng mục.`); refresh();
          }, "Xác nhận phân tầng");
      } catch (e) { toast(e.message || "Không thể xem trước phân tầng.", false); }
    };
  }
  body.querySelectorAll(".ct-td-edit").forEach((b) => b.addEventListener("click", () =>
    ctTdModal(pid, td.rows.find((r) => r.id === Number(b.dataset.id)), refresh)));
  const tdNew = $("#ct-td-new", body); if (tdNew) tdNew.onclick = () => ctTdModal(pid, null, refresh);
  const voNew = $("#ct-vo-new", body); if (voNew) voNew.onclick = () => ctVoNewModal(pid, refresh);
  body.querySelectorAll(".ct-vo-edit").forEach((b) => b.onclick = () => ctVoNewModal(pid, refresh,
    kl.rows.find((r) => Number(r.id) === Number(b.dataset.id))));
  body.querySelectorAll(".ct-vo-revise").forEach((b) => b.onclick = async () => {
    try { await apiPost("write/ct_phat_sinh_revise", { id: Number(b.dataset.id) });
      toast("Đã tạo revision nháp; bản đã duyệt vẫn bất biến."); refresh();
    } catch (e) { toast(e.message || "Không thể tạo revision.", false); }
  });
  body.querySelectorAll(".ct-vo-duyet").forEach((b) => b.addEventListener("click", () =>
    ctVoDuyetModal(pid, Number(b.dataset.id), Number(b.dataset.version), refresh, kl.return_reasons || [])));
  const dmNew = $("#ct-dm-new", body); if (!exactBoq && dmNew) dmNew.onclick = () => ctDinhMucModal(pid, null, refresh);
  if (!exactBoq) body.querySelectorAll(".ct-dm-edit").forEach((b) => b.addEventListener("click", () =>
    ctDinhMucModal(pid, (vt.rows || []).find((r) => r.id === Number(b.dataset.id)), refresh)));
  const dmAuto = $("#ct-dm-autofill", body);
  if (dmAuto) dmAuto.onclick = async () => {
    dmAuto.disabled = true;
    try {
      const r = await apiPost("write/dinh_muc_tu_bao_gia", { project_id: pid });
      toast(r.so_dinh_muc_moi ? `Đã thêm ${r.so_dinh_muc_moi} định mức mới từ báo giá (gán tạm GD1, sửa lại giai đoạn nếu cần).` : "Báo giá không có vật tư/thiết bị mới — hoặc đã có đủ định mức.");
      refresh();
    } catch (e) { toast(e.message || "Lỗi", false); dmAuto.disabled = false; }
  };
}
/* WO-38: modal nhập/sửa định mức vật tư theo giai đoạn (write/ct_dinh_muc_vat_tu) */
function ctDinhMucModal(pid, row, after) {
  const w = openModal(row ? "Sửa định mức vật tư" : "Nhập định mức vật tư theo giai đoạn",
    fS("giai_doan", "Giai đoạn *", ["GD1", "GD2", "GD3", "GD4", "GD5"]) +
    fI("ten_vat_tu", "Tên vật tư *", "text", "required") + fI("ma_vat_tu", "Mã vật tư") +
    fI("dvt", "ĐVT") + fI("kl_du_toan", "KL dự toán", "number", "step=any min=0") +
    fI("kl_thuc_te", "KL thực dùng", "number", "step=any min=0") +
    fI("kl_hoan_tra", "KL hoàn trả", "number", "step=any min=0"),
    async (fd) => {
      const b = { project_id: pid, giai_doan: fd.get("giai_doan"), ten_vat_tu: fd.get("ten_vat_tu"),
        ma_vat_tu: fd.get("ma_vat_tu"), dvt: fd.get("dvt"), kl_du_toan: fd.get("kl_du_toan") || 0,
        kl_thuc_te: fd.get("kl_thuc_te") || 0, kl_hoan_tra: fd.get("kl_hoan_tra") || 0 };
      if (row) b.id = row.id;
      await apiPost("write/ct_dinh_muc_vat_tu", b);
      closeModal(); toast("Đã lưu định mức vật tư."); after();
    });
  if (row) {
    ["giai_doan", "ten_vat_tu", "ma_vat_tu", "dvt", "kl_du_toan", "kl_thuc_te", "kl_hoan_tra"].forEach((k) => {
      const inp = w.querySelector(`[name="${k}"]`); if (inp && row[k] != null) inp.value = row[k];
    });
  }
}
async function ctTdModal(pid, row, after) {
  const ns = await nsOptions();
  const nsOpts = `<option value="">— chưa gán —</option>` +
    ns.map((n) => `<option value="${n.id}" ${row && row.nguoi_phu_trach === n.id ? "selected" : ""}>${esc(n.ho_ten)}</option>`).join("");
  const w = openModal(row ? "Sửa tiến độ hạng mục" : "Thêm hạng mục tiến độ",
    fI("hang_muc", "Hạng mục *", "text", "required") + fI("khu_vuc", "Khu vực") +
    fI("ngay_bd_ke_hoach", "KH bắt đầu", "date") + fI("ngay_kt_ke_hoach", "KH kết thúc", "date") +
    fI("ngay_bd_thuc_te", "TT bắt đầu", "date") + fI("ngay_kt_thuc_te", "TT kết thúc", "date") +
    fI("phan_tram_hoan_thanh", "% hoàn thành", "number", "min=0 max=100 step=any") +
    `<div class="f"><label>Người phụ trách</label><select name="nguoi_phu_trach">${nsOpts}</select></div>` +
    fT("rui_ro_vuong_mac", "Rủi ro / vướng mắc"),
    async (fd) => {
      const body = { project_id: pid, hang_muc: fd.get("hang_muc"), khu_vuc: fd.get("khu_vuc"),
        ngay_bd_ke_hoach: fd.get("ngay_bd_ke_hoach"), ngay_kt_ke_hoach: fd.get("ngay_kt_ke_hoach"),
        ngay_bd_thuc_te: fd.get("ngay_bd_thuc_te"), ngay_kt_thuc_te: fd.get("ngay_kt_thuc_te"),
        phan_tram_hoan_thanh: fd.get("phan_tram_hoan_thanh"),
        nguoi_phu_trach: fd.get("nguoi_phu_trach") || null, rui_ro_vuong_mac: fd.get("rui_ro_vuong_mac") };
      if (row) body.id = row.id;
      await apiPost("write/ct_tien_do", body);
      closeModal(); toast("Đã lưu tiến độ."); after();
    });
  if (row) {
    ["hang_muc", "khu_vuc", "ngay_bd_ke_hoach", "ngay_kt_ke_hoach", "ngay_bd_thuc_te", "ngay_kt_thuc_te",
      "phan_tram_hoan_thanh", "rui_ro_vuong_mac"].forEach((k) => {
      const inp = w.querySelector(`[name="${k}"]`);
      if (inp && row[k] != null) inp.value = row[k];
    });
  }
}
function ctVoNewModal(pid, after, row = null) {
  const moneyFields = ["Giam doc", "Quan tri he thong"].includes(ME.role)
    ? fI("don_gia", "Đơn giá", "number", "step=any min=0") + fI("gia_tri_giam", "Giá trị GIẢM", "number", "step=any min=0") : "";
  const w = openModal(row ? "Tiếp tục bản nháp phát sinh" : "Tạo phát sinh (VO) mới",
    fS("loai_phat_sinh", "Loại phát sinh *", [["vat_tu", "Vật tư"], ["nhan_cong", "Nhân công"], ["khoi_luong", "Khối lượng"]]) +
    fI("hang_muc", "Hạng mục *", "text", "required") + fT("ly_do", "Lý do *") +
    fI("so_luong", "Số lượng *", "number", "step=any min=0") + fI("dvt", "ĐVT *") +
    fI("nhat_ky_id", "ID nhật ký/bằng chứng", "number", "min=1") + moneyFields + fI("ngay", "Ngày", "date") +
    fS("action", "Thao tác", [["draft", "Lưu nháp"], ["submit", "Gửi duyệt"]]),
    async (fd) => {
      const payload = { id: row && row.id, expected_version: row && row.version, project_id: pid,
        client_draft_id: row ? row.client_draft_id : `vo-${pid}-${Date.now()}`,
        loai_phat_sinh: fd.get("loai_phat_sinh"), hang_muc: fd.get("hang_muc"), ly_do: fd.get("ly_do"),
        so_luong: fd.get("so_luong"), dvt: fd.get("dvt"), nhat_ky_id: Number(fd.get("nhat_ky_id")) || null,
        don_gia: fd.get("don_gia") || null, gia_tri_giam: fd.get("gia_tri_giam") || 0, ngay: fd.get("ngay") };
      const saved = await apiPost("write/ct_phat_sinh", payload);
      if (fd.get("action") === "submit") await apiPost("write/ct_phat_sinh_submit", { id: saved.id, expected_version: saved.version });
      closeModal(); toast(fd.get("action") === "submit" ? `Đã gửi ${saved.ma_vo}.` : `Đã lưu nháp ${saved.ma_vo}.`); after();
    });
  if (row) ["loai_phat_sinh", "hang_muc", "ly_do", "so_luong", "dvt", "nhat_ky_id", "don_gia", "gia_tri_giam", "ngay"].forEach((k) => {
    const input = w.querySelector(`[name="${k}"]`); if (input && row[k] != null) input.value = row[k]; });
}
function ctVoDuyetModal(pid, voId, version, after, reasons) {
  openModal("Quyết định phát sinh",
    fS("decision", "Quyết định", [["approve", "Duyệt"], ["return", "Trả lại"]]) +
    fS("reason_code", "Lý do trả lại", [["", "— không áp dụng —"], ...(reasons || []).map((x) => [x, x.replaceAll("_", " ")])]),
    async (fd) => {
      const pv = await apiPost("write/ct_phat_sinh_decide", { phase: "preview", id: voId,
        expected_version: version, decision: fd.get("decision"), reason_code: fd.get("reason_code") });
      await apiPost("write/ct_phat_sinh_decide", { phase: "commit", confirm_token: pv.confirm_token });
      closeModal(); toast("Đã ghi quyết định phát sinh."); after();
    }, "Xem trước & xác nhận");
}

/* ---- Tab: Vật tư & CO-CQ (WO-38 3.6: + KPI cảnh báo CO-CQ từ ct_co_cq.kpi) ---- */
async function ctTabVatTu(body, pid, proj) {
  const [cocq, lich, phieu, vt] = await Promise.all([
    apiGet("ct_co_cq", { project_id: pid }), apiGet("ct_lich_giao_vat_tu", { project_id: pid }),
    apiGet("phieu_vat_tu", { project_id: pid }).catch(() => ({ rows: [] })),
    apiGet("ct_vat_tu_thuc_te", { project_id: pid }).catch(() => ({ rows: [] }))]);
  const ck = cocq.kpi || {};
  const expChip = (r) => {
    if (!r.ngay_het_han) return "";
    const days = Math.round((Date.parse(r.ngay_het_han) - Date.now()) / 86400000);
    if (days < 0) return ` <span class="chip danger">Hết hạn</span>`;
    if (days <= 30) return ` <span class="chip warn">Sắp hết hạn (${days}d)</span>`;
    return "";
  };
  const cocqRows = cocq.rows.map((r) => [esc(r.ten_vat_tu) + expChip(r), esc(r.ma_vat_tu || "—"), esc(r.quy_cach || "—"),
    esc(r.nha_cung_cap || "—"), esc(r.so_lo || "—"),
    `<div class="cocq-flags"><span class="${r.co ? "yes" : "no"}">CO ${r.co ? "✓" : "✗"}</span><span class="${r.cq ? "yes" : "no"}">CQ ${r.cq ? "✓" : "✗"}</span></div>`,
    esc(fmtDate(r.ngay_nhan)), r.ngay_het_han ? esc(fmtDate(r.ngay_het_han)) : "—", chip(r.trang_thai),
    r.can_decide ? `<button class="btn primary btn-sm ct-cocq-approve" data-id="${r.id}">Duyệt</button>
      <button class="btn ghost btn-sm ct-cocq-return" data-id="${r.id}">Trả lại</button>`
      : `<span class="muted">${r.has_file ? "📎 " + esc(r.file_name || "Có file") : "Chưa có file"}</span>`]);
  const lichRows = lich.rows.map((r) => [esc(r.ten_vat_tu),
    r.so_luong_du_kien != null ? String(r.so_luong_du_kien) : "—", esc(fmtDate(r.ngay_giao_du_kien)),
    r.ngay_giao_thuc_te ? esc(fmtDate(r.ngay_giao_thuc_te)) : "—", chip(r.trang_thai), esc(r.ghi_chu || "—")]);
  // 2026-07-10 tham khao FastCon (F3): phieu nhap/xuat vat tu co duyet — nguon that cho
  // "kl_xuat_kho" o tab Khoi luong (stock_ledger movement_type='xuat_cong_trinh').
  const pvtLoaiChip = (l) => l === "xuat" ? `<span class="chip warn">Xuất</span>` : `<span class="chip info">Nhập (hoàn trả)</span>`;
  const pvtSuaBtn = (id) => ctCan("vat_tu_ct")
    ? `<button class="btn ghost btn-sm ct-pvt-sua" data-id="${id}">Sửa</button>` : "";
  const pvtRows = (phieu.rows || []).map((r) => [`<span class="code">${esc(r.ma_phieu)}</span>`,
    pvtLoaiChip(r.loai), esc(fmtDate(r.ngay)), String(r.so_dong || 0),
    esc(r.ten_nguoi_lap || "—"), esc(r.ten_nguoi_duyet || "—"),
    r.trang_thai === "Tu_choi" ? `${chip(r.trang_thai)}<br><span class="muted" style="font-size:11px">${esc(r.ly_do_tu_choi || "")}</span>` : chip(r.trang_thai),
    ((r.trang_thai === "Cho_duyet" && ctCan("vat_tu_ct_duyet"))
      ? `<button class="btn ghost btn-sm ct-pvt-duyet" data-id="${r.id}">Duyệt</button>
         <button class="btn ghost btn-sm ct-pvt-tuchoi" data-id="${r.id}">Từ chối</button>`
      : `<button class="btn ghost btn-sm ct-pvt-xem" data-id="${r.id}">Xem</button>`) + pvtSuaBtn(r.id)]);
  body.innerHTML = `
    ${metrics([
      ["Tổng CO-CQ", String(ck.tong || 0), "chứng chỉ", "info", "doc"],
      ["Sắp hết hạn", String(ck.sap_het_han || 0), "trong 30 ngày", ck.sap_het_han ? "warn" : "ok", "clock"],
      ["Đã hết hạn", String(ck.het_han || 0), "", ck.het_han ? "danger" : "ok", "alert"],
      ["Thiếu CO hoặc CQ", String(ck.thieu_co_cq || 0), "chưa đủ chứng chỉ", ck.thieu_co_cq ? "warn" : "ok", "folder"]])}
    ${panel("Phiếu vật tư (nhập/xuất có duyệt)", table(
      ["Mã phiếu", "Loại", "Ngày", "Số dòng", "Người lập", "Người duyệt", "Trạng thái", ""], pvtRows,
      { empty: "Chưa có phiếu vật tư nào." })
      + (ctCan("vat_tu_ct") ? `<div class="toolbar" style="margin-top:10px">
          <button class="btn primary btn-sm" id="ct-pvt-xuat">+ Lập phiếu XUẤT vật tư</button>
          <button class="btn ghost btn-sm" id="ct-pvt-nhap">+ Lập phiếu nhập (hoàn trả kho)</button>
        </div>` : "")
      + `<div class="muted" style="font-size:11px;margin-top:6px">Xuất kho phải qua duyệt (KTT/GĐ/QT — người lập không tự duyệt được) mới ghi nhận vào đối chiếu định mức ở tab Khối lượng.</div>`)}
    <div style="margin-top:14px">${panel("CO-CQ vật tư/thiết bị", table(
      ["Tên VT", "Mã VT", "Quy cách", "NCC", "Số lô", "CO/CQ", "Ngày nhận", "Hết hạn", "TT", ""], cocqRows,
      { empty: "Chưa có CO-CQ." })
      + (ctCan("vat_tu_kho") ? `<div class="toolbar" style="margin-top:10px"><button class="btn primary btn-sm" id="ct-cocq-new">+ Ghi nhận CO/CQ</button></div>` : ""))}</div>
    <div style="margin-top:14px">${panel("Lịch giao vật tư", table(
      ["Tên VT", "SL dự kiến", "Ngày giao dự kiến", "Ngày giao thực tế", "TT", "Ghi chú"], lichRows,
      { empty: "Chưa có lịch giao vật tư." })
      + (ctCan("vat_tu_kho") ? `<div class="toolbar" style="margin-top:10px"><button class="btn ghost btn-sm" id="ct-lich-new">+ Thêm lịch giao</button></div>` : ""))}</div>`;
  const refresh = () => ctTabVatTu(body, pid, proj);
  const cocqBtn = $("#ct-cocq-new", body); if (cocqBtn) cocqBtn.onclick = () => ctCoCqModal(pid, refresh);
  const lichBtn = $("#ct-lich-new", body); if (lichBtn) lichBtn.onclick = () => ctLichModal(pid, refresh);
  const pvtXuat = $("#ct-pvt-xuat", body); if (pvtXuat) pvtXuat.onclick = () => ctPhieuVatTuModal(pid, "xuat", refresh, vt);
  const pvtNhap = $("#ct-pvt-nhap", body); if (pvtNhap) pvtNhap.onclick = () => ctPhieuVatTuModal(pid, "nhap", refresh, vt, cocq.rows);
  body.querySelectorAll(".ct-pvt-duyet").forEach((b) => b.addEventListener("click", () =>
    ctPhieuVatTuDuyetModal(Number(b.dataset.id), "Da_duyet", refresh)));
  body.querySelectorAll(".ct-pvt-tuchoi").forEach((b) => b.addEventListener("click", () =>
    ctPhieuVatTuDuyetModal(Number(b.dataset.id), "Tu_choi", refresh)));
  body.querySelectorAll(".ct-pvt-xem").forEach((b) => b.addEventListener("click", () =>
    ctPhieuVatTuXemModal(Number(b.dataset.id))));
  body.querySelectorAll(".ct-pvt-sua").forEach((b) => b.addEventListener("click", () =>
    ctPhieuVatTuSuaModal(Number(b.dataset.id), refresh)));
  body.querySelectorAll(".ct-cocq-approve").forEach((b) => b.addEventListener("click", () =>
    ctCoCqDecisionModal(Number(b.dataset.id), "approve", refresh)));
  body.querySelectorAll(".ct-cocq-return").forEach((b) => b.addEventListener("click", () =>
    ctCoCqDecisionModal(Number(b.dataset.id), "return", refresh)));
}
function ctPhieuVatTuReceiptModal(pid, after, vt, cocqRows) {
  const exact = vt && vt.boq_mode === "exact_official_profile" && (vt.rows || []).length;
  const boqOptions = `<option value="">— Chọn hạng mục / tầng —</option>` + (vt && vt.rows || []).map((r) =>
    `<option value="${Number(r.id)}">${esc(r.giai_doan || "—")} · ${esc(r.ten_vat_tu || "")} · ${esc(r.dvt || "")}</option>`).join("");
  const cocqOptions = `<option value="">— Chọn CO/CQ —</option>` + (cocqRows || []).map((r) =>
    `<option value="${Number(r.id)}">${esc(r.ten_vat_tu)} · ${esc(r.nha_cung_cap || "—")} · ${esc(r.so_lo || "—")} · ${esc(r.trang_thai)}</option>`).join("");
  let rowNo = 0;
  const rowHtml = () => {
    rowNo += 1;
    return `<div class="receipt-line" data-row="${rowNo}">
      <div><label>${exact ? "Hạng mục BOQ / tầng *" : "Tên vật tư *"}</label>${exact
        ? `<select class="receipt-boq">${boqOptions}</select>`
        : `<input class="receipt-name" placeholder="Tên vật tư">`}</div>
      <div><label>ĐVT</label><input class="receipt-uom" placeholder="m, bộ..."></div>
      <div><label>Thực nhận *</label><input class="receipt-actual" type="number" min="0" step="any"></div>
      <div><label>SL hóa đơn *</label><input class="receipt-invoice-qty" type="number" min="0" step="any"></div>
      <div><label>CO/CQ *</label><select class="receipt-cocq">${cocqOptions}</select></div>
      <button type="button" class="btn ghost btn-sm receipt-remove" title="Xóa dòng">✕</button></div>`;
  };
  const w = openModal("Nhập vật tư đầu vào", `<div class="receipt-wizard">
      <div class="receipt-steps"><b>1. Nguồn & kho</b><span>2. Thực nhận & hóa đơn</span><span>3. CO/CQ</span></div>
      ${fI("supplier_name", "Nhà cung cấp *", "text", "required")}
      ${fI("warehouse_name", "Kho nhận *", "text", "required")}
      ${fI("hoa_don_id", "ID hóa đơn đầu vào", "number", "min=1")}
      ${fI("ngay", "Ngày nhận", "date")}
      <div class="f wide"><label>Dòng vật tư</label><div id="receipt-lines">${rowHtml()}${rowHtml()}</div>
        <button type="button" class="btn ghost btn-sm" id="receipt-add">+ Thêm dòng</button>
        <div class="muted" style="font-size:11px;margin-top:6px">Chênh lệch thực nhận và hóa đơn sẽ được cảnh báo; chỉ được xác nhận kho khi CO/CQ đã duyệt.</div></div>
      ${fT("ghi_chu", "Ghi chú")}</div>`, async (fd) => {
    const dong = [];
    w.querySelectorAll(".receipt-line").forEach((el) => {
      const boqId = exact ? Number(el.querySelector(".receipt-boq").value) || null : null;
      const source = exact ? (vt.rows || []).find((r) => Number(r.id) === boqId) : null;
      const name = source ? source.ten_vat_tu : (el.querySelector(".receipt-name") || {}).value;
      const actualRaw = el.querySelector(".receipt-actual").value;
      if (!boqId && !(name || "").trim() && !actualRaw) return;
      const actual = Number(actualRaw), invoiceQty = Number(el.querySelector(".receipt-invoice-qty").value);
      const co_cq_id = Number(el.querySelector(".receipt-cocq").value) || null;
      if (exact && !boqId) throw new Error("Hãy chọn đúng hạng mục BOQ/tầng.");
      if (!(name || "").trim() || !Number.isFinite(actual) || actual <= 0 || !Number.isFinite(invoiceQty) || invoiceQty < 0)
        throw new Error("Mỗi dòng phải có vật tư, thực nhận > 0 và số lượng hóa đơn hợp lệ.");
      if (!co_cq_id) throw new Error("Mỗi dòng nhập phải gắn CO/CQ.");
      dong.push({ boq_stage_qty_id: boqId, ten_vat_tu: name,
        dvt: source ? source.dvt : el.querySelector(".receipt-uom").value,
        so_luong: actual, so_luong_hoa_don: invoiceQty, co_cq_id });
    });
    if (!dong.length) throw new Error("Phải có ít nhất một dòng vật tư.");
    const result = await apiPost("write/phieu_vat_tu", { project_id: pid, loai: "nhap",
      supplier_name: fd.get("supplier_name"), warehouse_name: fd.get("warehouse_name"),
      hoa_don_id: Number(fd.get("hoa_don_id")) || null, ngay: fd.get("ngay") || null,
      ghi_chu: fd.get("ghi_chu"), dong });
    closeModal();
    const diff = (result.quantity_discrepancies || []).length;
    toast(`Đã lập ${result.ma_phieu}${diff ? ` · ${diff} dòng chênh lệch cần xác nhận` : ""}.`, !diff);
    after();
  }, "Lưu phiếu chờ duyệt");
  const root = $("#receipt-lines", w);
  $("#receipt-add", w).onclick = () => root.insertAdjacentHTML("beforeend", rowHtml());
  root.addEventListener("click", (event) => {
    const button = event.target.closest(".receipt-remove");
    if (button) button.closest(".receipt-line").remove();
  });
}

function ctPhieuVatTuExactModal(pid, loai, after, vt) {
  const stageOrder = new Map((vt.stages || []).map((stage, index) => [String(stage.id), Number(stage.thu_tu ?? index)]));
  const boqRows = (vt.rows || []).slice().sort((a, b) => {
    const stageCmp = (stageOrder.get(String(a.stage_id)) ?? 9999) - (stageOrder.get(String(b.stage_id)) ?? 9999);
    return stageCmp || Number(a.source_row || 0) - Number(b.source_row || 0) || Number(a.id || 0) - Number(b.id || 0);
  });
  const groups = new Map();
  boqRows.forEach((row) => {
    const key = row.giai_doan || "Chưa phân tầng";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const options = `<option value="">— Chọn đúng hạng mục / tầng —</option>` + Array.from(groups.entries()).map(([stage, rows]) =>
    `<optgroup label="${esc(stage)}">${rows.map((row) => `<option value="${Number(row.id)}">
      ${esc(row.source_stt_raw || "—")} · ${esc(row.ten_vat_tu || "")} · KH ${esc(String(row.kl_du_toan ?? 0))} ${esc(row.dvt || "")}</option>`).join("")}</optgroup>`).join("");
  let rowNo = 0;
  const rowHtml = () => {
    rowNo += 1;
    return `<div class="ct-pvt-boq-row" data-row="${rowNo}" style="display:grid;grid-template-columns:minmax(280px,1fr) 110px 120px auto;gap:8px;align-items:end;margin-bottom:8px">
      <div><label>Hạng mục BOQ / tầng</label><select class="ct-pvt-boq-id">${options}</select></div>
      <div><label>Số lượng *</label><input class="ct-pvt-boq-qty" type="number" min="0" step="any" placeholder="0"></div>
      <div><label>Đơn giá</label><input class="ct-pvt-boq-price" type="number" min="0" step="any" placeholder="tùy chọn"></div>
      <button type="button" class="btn ghost btn-sm ct-pvt-boq-remove" title="Xóa dòng">✕</button>
    </div>`;
  };
  const w = openModal(loai === "xuat" ? "Lập phiếu XUẤT theo BOQ/tầng"
      : "Lập phiếu NHẬP hoàn trả theo BOQ/tầng",
    `<div class="f wide"><label>Ngày</label><input type="date" name="ngay"></div>
     <div class="f wide"><label>Dòng vật tư — chọn từ BOQ chính thức</label><div id="ct-pvt-boq-rows">${rowHtml()}${rowHtml()}</div>
       <button type="button" class="btn ghost btn-sm" id="ct-pvt-boq-add">+ Thêm dòng</button>
       <div class="muted" style="font-size:11px;margin-top:5px">Mỗi dòng gửi <code>boq_stage_qty_id</code>; server lấy lại tên/ĐVT từ BOQ active, không khớp tên tự do.</div></div>` +
     fT("ghi_chu", "Ghi chú"),
    async (fd) => {
      const selected = new Set();
      const items = [];
      w.querySelectorAll(".ct-pvt-boq-row").forEach((rowEl) => {
        const id = Number(rowEl.querySelector(".ct-pvt-boq-id").value) || null;
        const qtyRaw = rowEl.querySelector(".ct-pvt-boq-qty").value;
        const priceRaw = rowEl.querySelector(".ct-pvt-boq-price").value;
        if (!id && !qtyRaw) return;
        if (!id) throw new Error("Hãy chọn hạng mục BOQ/tầng cho mọi dòng có số lượng.");
        const qty = Number(qtyRaw);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("Số lượng mỗi dòng phải lớn hơn 0.");
        if (selected.has(id)) throw new Error("Một hạng mục BOQ/tầng chỉ được chọn một lần trong phiếu.");
        selected.add(id);
        const source = boqRows.find((row) => Number(row.id) === id) || {};
        items.push({ boq_stage_qty_id: id, ten_vat_tu: source.ten_vat_tu || "", dvt: source.dvt || null,
          so_luong: qty, don_gia: priceRaw === "" ? null : Number(priceRaw) });
      });
      if (!items.length) throw new Error("Phải có ít nhất 1 dòng BOQ/tầng.");
      const r = await apiPost("write/phieu_vat_tu", { project_id: pid, loai,
        ngay: fd.get("ngay") || null, ghi_chu: fd.get("ghi_chu"), dong: items });
      closeModal(); toast("Đã lập phiếu " + r.ma_phieu + " theo đúng BOQ/tầng — chờ duyệt."); after();
    });
  const rowsRoot = $("#ct-pvt-boq-rows", w);
  $("#ct-pvt-boq-add", w).onclick = () => rowsRoot.insertAdjacentHTML("beforeend", rowHtml());
  rowsRoot.addEventListener("click", (e) => {
    const button = e.target.closest(".ct-pvt-boq-remove");
    if (button) button.closest(".ct-pvt-boq-row").remove();
  });
}
/* Lập phiếu theo BOQ exact nếu có; project legacy tiếp tục dùng lưới tên/SL/ĐVT cũ. */
function ctPhieuVatTuModal(pid, loai, after, vt, cocqRows = []) {
  if (loai === "nhap") return ctPhieuVatTuReceiptModal(pid, after, vt, cocqRows);
  if (vt && vt.boq_mode === "exact_official_profile" && (vt.rows || []).length) {
    return ctPhieuVatTuExactModal(pid, loai, after, vt);
  }
  const w = openModal(loai === "xuat" ? "Lập phiếu XUẤT vật tư cho công trình"
      : "Lập phiếu NHẬP (hoàn trả vật tư dư về kho)",
    `<div class="f wide"><label>Ngày</label><input type="date" name="ngay"></div>` +
    itemRowsEditor(2, {}) + fT("ghi_chu", "Ghi chú"),
    async (fd) => {
      const items = itemsFrom(fd).map((it) => ({ ten_vat_tu: it.hang_muc, dvt: it.dvt,
        so_luong: it.so_luong, don_gia: it.don_gia || null }));
      if (!items.length) throw new Error("Phải có ít nhất 1 dòng vật tư (nhập tên + số lượng).");
      const r = await apiPost("write/phieu_vat_tu", { project_id: pid, loai,
        ngay: fd.get("ngay") || null, ghi_chu: fd.get("ghi_chu"), dong: items });
      closeModal(); toast("Đã lập phiếu " + r.ma_phieu + " — chờ duyệt."); after();
    });
  bindItemEditor(w);
  const ieLabel = w.querySelector("#ie-wrap label");
  if (ieLabel) ieLabel.textContent = "Dòng vật tư";
}
function ctPhieuVatTuDuyetModal(id, trangThai, after) {
  const isReject = trangThai === "Tu_choi";
  openModal(isReject ? "Từ chối phiếu vật tư" : "Duyệt phiếu vật tư",
    isReject ? fT("ly_do", "Lý do từ chối *")
      : `<div class="f wide muted" style="font-size:12px">Duyệt XUẤT sẽ ghi nhận vào kho công trình ngay — kiểm tra kỹ số lượng trước khi bấm.</div>`,
    async (fd) => {
      const ly_do = fd.get("ly_do");
      if (isReject && !(ly_do || "").trim()) throw new Error("Phải ghi lý do từ chối.");
      const preview = await apiPost("write/phieu_vat_tu_duyet", {
        phase: "preview", id, trang_thai: trangThai, ly_do });
      if ((preview.quantity_discrepancies || []).length && !window.confirm(
          `Có ${preview.quantity_discrepancies.length} dòng chênh lệch thực nhận so với hóa đơn. Vẫn xác nhận?`)) return;
      const r = await apiPost("write/phieu_vat_tu_duyet", {
        phase: "commit", confirm_token: preview.confirm_token });
      closeModal();
      if (r.canh_bao && r.canh_bao.length) toast("Đã duyệt — CẢNH BÁO: " + r.canh_bao.join("; "), false);
      else toast(isReject ? "Đã từ chối phiếu." : "Đã duyệt phiếu.");
      after();
    }, isReject ? "Từ chối" : "Duyệt");
}
async function ctPhieuVatTuXemModal(id) {
  const d = await apiGet("phieu_vat_tu_detail", { id });
  const rows = (d.dong || []).map((r) => [r.boq_stage_qty_id ? `<span class="code">#${Number(r.boq_stage_qty_id)}</span>` : "—",
    esc(r.ten_vat_tu), esc(r.dvt || "—"), String(r.so_luong), String(r.so_luong_hoa_don ?? "—"),
    r.quantity_discrepancy ? `<span class="chip danger">Lệch ${esc(String(r.quantity_delta))}</span>` : `<span class="chip ok">Khớp</span>`,
    r.co_cq_id ? `<span class="code">#${Number(r.co_cq_id)}</span> ${chip(r.co_cq_status || "—")}` : "—", esc(r.ghi_chu || "—")]);
  openModal("Phiếu " + d.phieu.ma_phieu,
    `<div class="f wide" style="text-align:right"><button type="button" class="btn ghost btn-sm" id="pvt-print-btn">🖨️ In phiếu</button></div>` +
    formGrid([["Loại", d.phieu.loai === "xuat" ? "Xuất" : "Nhập (hoàn trả)"],
      ["Ngày", fmtDate(d.phieu.ngay)], ["Người lập", d.phieu.ten_nguoi_lap || "—"],
      ["Trạng thái", d.phieu.trang_thai], ["Người duyệt", d.phieu.ten_nguoi_duyet || "—"],
      ["Người nhận hàng", d.phieu.nguoi_nhan_hang || "—"],
      ["Lý do từ chối", d.phieu.ly_do_tu_choi || "—"]], 2) +
    `<div class="f wide">${table(["Dòng BOQ", "Vật tư", "ĐVT", "Thực nhận", "SL hóa đơn", "Đối chiếu", "CO/CQ", "Ghi chú"], rows)}</div>`,
    async () => { closeModal(); }, "Đóng");
  const printBtn = $("#pvt-print-btn");
  if (printBtn) printBtn.onclick = () => printPhieuVatTu(d);
}

// Sua phieu vat tu — CHI cac truong mo ta (ghi_chu/warehouse_name/supplier_name/
// nguoi_nhan_hang). KHONG cho sua so luong/vat tu/gia/ngay du phieu da duyet hay
// chua, vi nhung truong do da/se dung de ghi so kho (stock_ledger) — sua duoc thi
// phai lam them co che dieu chinh so kho di kem, ngoai pham vi yeu cau hien tai.
async function ctPhieuVatTuSuaModal(id, after) {
  const d = await apiGet("phieu_vat_tu_detail", { id });
  const p = d.phieu;
  openModal("Sửa thông tin phiếu " + p.ma_phieu,
    `<div class="f wide muted" style="font-size:12px">Chỉ sửa được thông tin mô tả — số lượng/vật tư/đơn giá không sửa được (đã hoặc sẽ ghi vào sổ kho). Cần sửa số lượng/vật tư: liên hệ Giám đốc để xử lý điều chỉnh kho.</div>` +
    `<div class="f wide"><label>Ghi chú / Lý do xuất-nhập</label><textarea name="ghi_chu" rows="3">${esc(p.ghi_chu || "")}</textarea></div>` +
    fI("nguoi_nhan_hang", "Người nhận hàng", "text", `value="${esc(p.nguoi_nhan_hang || "")}"`) +
    fI("warehouse_name", "Kho xuất/nhận", "text", `value="${esc(p.warehouse_name || "")}"`) +
    fI("supplier_name", "Nhà cung cấp", "text", `value="${esc(p.supplier_name || "")}"`),
    async (fd) => {
      await apiPost("write/phieu_vat_tu_sua", { id,
        ghi_chu: fd.get("ghi_chu"), warehouse_name: fd.get("warehouse_name"),
        supplier_name: fd.get("supplier_name"), nguoi_nhan_hang: fd.get("nguoi_nhan_hang") });
      closeModal(); toast("Đã lưu thông tin phiếu."); after();
    }, "Lưu");
}

// Ban in phieu vat tu — dap theo DUNG mau chuan cong ty dang dung:
// "D:\Quản trị DOANH NGHIỆP\Mẫu chứng từ chuẩn\07. Phiếu xuất kho (PXK)\
//  07_TEMPLATE_PHIEU_GIAO_HANG_XUAT_KHO_THANH_HOAI.docx" (doc lai tung bang/cot
// dung nhu file .docx that, khong tu bien bo cuc). CO Y: mau chuan KHONG co cot
// don_gia/thanh_tien — phieu xuat la chung tu SO LUONG giao hien truong, khong
// phai chung tu ke toan.
function printPhieuVatTu(d) {
  const p = d.phieu;
  const isXuat = p.loai === "xuat";
  const rows = (d.dong || []).map((r, i) => `<tr>
    <td style="text-align:center">${i + 1}</td>
    <td>${esc(r.ten_vat_tu)}</td>
    <td style="text-align:center">—</td>
    <td style="text-align:center">${esc(r.dvt || "—")}</td>
    <td style="text-align:center">${esc(String(r.so_luong))}</td>
    <td style="text-align:center">${esc(String(r.so_luong))}</td>
    <td>${esc(r.ghi_chu || "")}</td>
  </tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>${esc(p.ma_phieu)}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: #111; padding: 24px; }
      table.hd { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      table.hd td { border: 0; vertical-align: top; padding: 0 8px; width: 50%; }
      table.hd .r { text-align: center; }
      h1 { text-align: center; font-size: 17px; margin: 12px 0 2px; letter-spacing: .5px; }
      .sub { text-align: center; color: #333; margin-bottom: 12px; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th, td { border: 1px solid #444; padding: 5px 7px; font-size: 12px; }
      th { background: #eee; }
      table.info td { width: 25%; }
      table.info td.lbl { font-weight: 600; background: #f7f7f7; width: 18%; }
      .note { margin: 10px 0; }
      .sign { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .sign td { border: 0; text-align: center; vertical-align: top; width: 25%; padding-top: 4px; }
      .sign b { display: block; margin-bottom: 50px; }
      .sign small { color: #444; }
      @media print { body { padding: 0 } }
    </style></head><body>
    <table class="hd"><tr>
      <td>
        <b>CÔNG TY TNHH MTV CƠ ĐIỆN LẠNH THANH HOÀI</b><br>
        MST: 3602504881<br>
        448/3, tổ 16, KP 2, Phường Long Hưng, Tỉnh Đồng Nai, Việt Nam<br>
        ĐT: 02513 835 395<br>
        Số: ${esc(p.ma_phieu)}
      </td>
      <td class="r">
        <b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br>
        Độc lập – Tự do – Hạnh phúc<br>
        —————
      </td>
    </tr></table>
    <h1>PHIẾU GIAO HÀNG / PHIẾU ${isXuat ? "XUẤT" : "NHẬP (HOÀN TRẢ)"} KHO</h1>
    <table class="info"><tr>
      <td class="lbl">Người nhận hàng</td><td>${esc(p.nguoi_nhan_hang || "")}</td>
      <td class="lbl">Điện thoại</td><td></td>
    </tr><tr>
      <td class="lbl">Đơn vị nhận</td><td></td>
      <td class="lbl">Bộ phận</td><td></td>
    </tr><tr>
      <td class="lbl">Tên dự án/công trình</td><td>${esc(p.project_name || "—")}</td>
      <td class="lbl">Địa chỉ dự án</td><td>${esc(p.project_address || "—")}</td>
    </tr><tr>
      <td class="lbl">Lý do xuất kho</td><td>${esc(p.ghi_chu || "—")}</td>
      <td class="lbl">Xuất kho tại</td><td>${esc(p.warehouse_name || "—")}</td>
    </tr><tr>
      <td class="lbl">Ngày giao</td><td>${esc(fmtDate(p.ngay))}</td>
      <td class="lbl">Số phiếu kho</td><td>${esc(p.ma_phieu)}</td>
    </tr></table>
    <div class="note"><b>Danh sách hàng hóa/vật tư</b></div>
    <table><thead><tr>
      <th style="width:32px">STT</th><th>Tên, nhãn hiệu, quy cách vật tư/hàng hóa</th>
      <th style="width:70px">Xuất xứ</th><th style="width:70px">ĐVT</th>
      <th style="width:70px">SL yêu cầu</th><th style="width:70px">SL thực xuất</th><th>Ghi chú</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div class="note">Ghi chú giao nhận: —</div>
    <table class="sign"><tr>
      <td><b>Người lập phiếu</b><small>(Ký, ghi rõ họ tên)</small><br><br>${esc(p.ten_nguoi_lap || "")}</td>
      <td><b>Người nhận hàng</b><small>(Ký, ghi rõ họ tên)</small><br><br>${esc(p.nguoi_nhan_hang || "")}</td>
      <td><b>Thủ kho</b><small>(Ký, ghi rõ họ tên)</small></td>
      <td><b>Thủ trưởng đơn vị</b><small>(Ký, ghi rõ họ tên)</small><br><br>${esc(p.ten_nguoi_duyet || "")}</td>
    </tr></table>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { toast("Trình duyệt chặn cửa sổ in — cho phép popup rồi thử lại.", false); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
function ctCoCqModal(pid, after) {
  openModal("Ghi nhận CO/CQ",
    fI("ten_vat_tu", "Tên vật tư/thiết bị *", "text", "required") + fI("ma_vat_tu", "Mã vật tư") +
    fI("quy_cach", "Quy cách") + fI("nha_cung_cap", "Nhà cung cấp") + fI("so_lo", "Số lô") +
    `<div class="f"><label>Có CO?</label><select name="co"><option value="0">Không</option><option value="1">Có</option></select></div>` +
    `<div class="f"><label>Có CQ?</label><select name="cq"><option value="0">Không</option><option value="1">Có</option></select></div>` +
    fI("ngay_nhan", "Ngày nhận", "date") + fI("ngay_het_han", "Ngày hết hạn CO/CQ", "date") +
    `<div class="f wide"><label>File CO/CQ (tùy chọn)</label><input type="file" name="file"></div>` +
    fT("ghi_chu", "Ghi chú"),
    async (fd) => {
      const f = fd.get("file");
      const b64 = (f && f.name) ? await fileToB64(f) : null;
      await apiPost("write/ct_co_cq", { project_id: pid, ten_vat_tu: fd.get("ten_vat_tu"),
        ma_vat_tu: fd.get("ma_vat_tu"), quy_cach: fd.get("quy_cach"), nha_cung_cap: fd.get("nha_cung_cap"),
        so_lo: fd.get("so_lo"), co: Number(fd.get("co")), cq: Number(fd.get("cq")),
        ngay_nhan: fd.get("ngay_nhan"), ngay_het_han: fd.get("ngay_het_han"), ghi_chu: fd.get("ghi_chu"),
        filename: (f && f.name) ? f.name : null, file_b64: b64 });
      closeModal(); toast("Đã ghi nhận CO/CQ."); after();
    });
}
function ctLichModal(pid, after) {
  openModal("Thêm lịch giao vật tư",
    fI("ten_vat_tu", "Tên vật tư *", "text", "required") +
    fI("so_luong_du_kien", "SL dự kiến", "number", "step=any") +
    fI("ngay_giao_du_kien", "Ngày giao dự kiến", "date") + fI("ngay_giao_thuc_te", "Ngày giao thực tế", "date") +
    fI("trang_thai", "Trạng thái (vd: Chua_giao / Da_giao)", "text", `value="Chua_giao"`) +
    fT("ghi_chu", "Ghi chú"),
    async (fd) => {
      await apiPost("write/ct_lich_giao_vat_tu", { project_id: pid, ten_vat_tu: fd.get("ten_vat_tu"),
        so_luong_du_kien: fd.get("so_luong_du_kien"), ngay_giao_du_kien: fd.get("ngay_giao_du_kien"),
        ngay_giao_thuc_te: fd.get("ngay_giao_thuc_te"), trang_thai: fd.get("trang_thai"),
        ghi_chu: fd.get("ghi_chu") });
      closeModal(); toast("Đã thêm lịch giao."); after();
    });
}

/* ---- Tab: Điểm danh — KHÔNG có backend (WO34A không làm) → empty-state ---- */
/* WO-38 (3.6): Điểm danh = check-in/out thật (write/cong_viec_check_in). Backend chốt:
   chỉ nhân sự được gán mới check-in được việc của mình → nút bấm role khác sẽ 403 (đúng). */
async function ctTabDiemDanh(body, pid, proj) {
  const todayIso = new Date().toISOString().slice(0, 10);
  let tech;
  try { tech = await apiGet("technician"); }
  catch (e) {
    body.innerHTML = panel("Điểm danh hiện trường",
      `<div class="empty">Không tải được danh sách công việc: ${esc(e.message || "")}</div>`);
    return;
  }
  const rows = (tech.rows || []).filter((r) => r.project_id === pid && r.ngay_hen === todayIso);
  const trRows = rows.map((r) => [
    `<b>${esc(r.ktv_chinh || "—")}</b>${r.ktv_phu ? `<br><span class="muted" style="font-size:11px">phụ: ${esc(r.ktv_phu)}</span>` : ""}`,
    `<span class="code">${esc(r.code)}</span> ${chip(r.loai_viec)}`,
    esc(r.gio_hen || "—"),
    r.da_check_in ? `<span class="chip ok">✓ ${esc((r.gio_check_in || "").slice(11, 16) || "đã check-in")}</span>` : `<span class="chip neutral">Chưa check-in</span>`,
    r.gio_check_out ? `<span class="chip info">${esc((r.gio_check_out || "").slice(11, 16))}</span>` : `<span class="muted">—</span>`,
    !r.da_check_in ? `<button class="btn primary btn-sm ct-checkin" data-id="${r.id}" data-a="check_in">Check-in</button>`
      : !r.gio_check_out ? `<button class="btn ghost btn-sm ct-checkin" data-id="${r.id}" data-a="check_out">Check-out</button>`
      : `<span class="muted">Xong</span>`]);
  const daCheckIn = rows.filter((r) => r.da_check_in).length;
  body.innerHTML = `
    ${metrics([
      ["Nhân sự hôm nay", String(rows.length), "việc tại công trình", "info", "people"],
      ["Đã check-in", String(daCheckIn), rows.length ? Math.round(daCheckIn * 100 / rows.length) + "%" : "", daCheckIn ? "ok" : "warn", "clock"],
      ["Chưa check-in", String(rows.length - daCheckIn), "", (rows.length - daCheckIn) ? "warn" : "ok", "alert"]])}
    ${panel("Điểm danh hiện trường hôm nay (" + fmtDate(todayIso) + ")", table(
      ["Nhân sự", "Công việc", "Giờ hẹn", "Check-in", "Check-out", ""], trRows,
      { empty: "Không có việc nào tại công trình này hôm nay." })
      + `<div class="muted" style="font-size:11px;margin-top:6px">Chỉ nhân sự được gán tự check-in việc của mình (backend chốt). Chưa có FaceID/GPS — chấm công bằng nút.</div>`)}`;
  body.querySelectorAll(".ct-checkin").forEach((b) => b.addEventListener("click", async () => {
    try {
      await apiPost("write/cong_viec_check_in", { id: Number(b.dataset.id), action: b.dataset.a });
      toast(b.dataset.a === "check_in" ? "Đã check-in." : "Đã check-out.");
      ctTabDiemDanh(body, pid, proj);
    } catch (e) { toast(e.message || "Lỗi", false); }
  }));
}

/* ---- Tab: Nghiệm thu — V3.1 gates + exact BOQ + CO/CQ + pack draft ---- */
async function ctAcceptanceTwoPhase(action, previewPayload, confirmText) {
  const preview = await apiPost("write/" + action, Object.assign({ phase: "preview" }, previewPayload));
  if (!confirm(confirmText)) return null;
  return apiPost("write/" + action, { phase: "commit", confirm_token: preview.confirm_token });
}

function ctAcceptanceGate(title, gate, detail) {
  return `<div class="accept-gate ${gate.ready ? "ready" : "blocked"}">
    <span class="accept-gate-icon" aria-hidden="true">${gate.ready ? "✓" : "!"}</span>
    <span><b>${esc(title)}</b><small>${esc(detail)}</small></span>
    <span class="chip ${gate.ready ? "ok" : "danger"}">${gate.ready ? "Đủ" : "Còn thiếu"}</span></div>`;
}

function ctAcceptanceDraftModal(pid, model, refresh) {
  const isEdit = !!model.id;
  const stageOptions = (model.stages || []).filter((s) => !s.is_unallocated)
    .map((s) => [String(s.id), s.giai_doan || s.name]);
  const rowHtml = isEdit ? `<div class="accept-edit-rows">${(model.quantity_rows || []).map((r) => `
    <div class="accept-edit-row" data-qid="${r.boq_stage_qty_id}">
      <span><b>${esc(r.stage_name)} · ${esc(r.item_name_raw)}</b><small>Dòng nguồn ${esc(r.source_row)} · ${esc(r.uom_raw || "")}</small></span>
      <label>Nhật ký đã duyệt<input value="${Number(r.journal_confirmed_qty || 0)}" disabled></label>
      <label>KL nghiệm thu<input name="qty_${r.boq_stage_qty_id}" type="number" min="0" step="any" value="${Number(r.acceptance_qty || 0)}" required></label>
      <label class="accept-confirm"><input name="ack_${r.boq_stage_qty_id}" type="checkbox" ${r.discrepancy_confirmed ? "checked" : ""}> Xác nhận chênh lệch</label>
      <label class="wide">Lý do chênh lệch<input name="reason_${r.boq_stage_qty_id}" value="${esc(r.discrepancy_reason || "")}"></label>
    </div>`).join("")}</div>` : "";
  const modal = openModal(isEdit ? "Sửa bản nháp nghiệm thu" : "Tạo đợt nghiệm thu", `
    <input type="hidden" name="id" value="${model.id || ""}">
    ${fS("acceptance_type", "Loại nghiệm thu", [["Giai_doan", "Giai đoạn / bộ phận"], ["Hoan_thanh", "Hoàn thành đưa vào sử dụng"]])}
    ${fS("scope_stage_id", "Tầng / giai đoạn BOQ", [["", "Toàn bộ (chỉ khi hoàn thành)"]].concat(stageOptions))}
    ${fI("period_from", "Từ ngày", "date")}${fI("period_to", "Đến ngày", "date")}
    ${fT("note", "Ghi chú", "Phạm vi nghiệm thu")}${rowHtml}`, async (fd, wrap) => {
      const payload = { project_id: pid, acceptance_type: fd.get("acceptance_type"),
        scope_stage_id: fd.get("scope_stage_id") || null,
        period_from: fd.get("period_from") || null, period_to: fd.get("period_to") || null,
        note: fd.get("note") || "" };
      if (isEdit) {
        payload.id = model.id; payload.expected_version = model.version;
        payload.items = model.quantity_rows.map((r) => ({ boq_stage_qty_id: r.boq_stage_qty_id,
          acceptance_qty: Number(fd.get("qty_" + r.boq_stage_qty_id) || 0),
          discrepancy_confirmed: fd.get("ack_" + r.boq_stage_qty_id) === "on",
          discrepancy_reason: fd.get("reason_" + r.boq_stage_qty_id) || "" }));
      }
      const result = await ctAcceptanceTwoPhase("ct_acceptance_draft", payload,
        `${isEdit ? "Lưu" : "Tạo"} bản nháp nghiệm thu với dữ liệu exact BOQ này?`);
      if (!result) return;
      closeModal(); toast(isEdit ? "Đã cập nhật bản nháp." : "Đã tạo bản nháp nghiệm thu.");
      await refresh(result.id);
    }, isEdit ? "Xem trước & lưu" : "Xem trước & tạo");
  const type = $('[name="acceptance_type"]', modal);
  const stage = $('[name="scope_stage_id"]', modal);
  type.value = model.acceptance_type || "Giai_doan";
  stage.value = model.scope_stage_id || "";
  $('[name="period_from"]', modal).value = model.period_from || "";
  $('[name="period_to"]', modal).value = model.period_to || "";
  $('[name="note"]', modal).value = model.note || "";
  type.onchange = () => { stage.required = type.value === "Giai_doan"; };
  type.onchange();
}

async function ctTabNghiemThu(body, pid, proj, selectedId) {
  const data = await apiGet("ct_acceptance", { project_id: pid,
    acceptance_id: selectedId || undefined });
  const selected = data.acceptance || (data.rows || [])[0] || data.new_draft;
  const refresh = (id) => ctTabNghiemThu(body, pid, proj, id || selected.id);
  const dossier = selected.dossier_gate || {};
  const material = selected.material_gate || {};
  const quantity = selected.quantity_gate || {};
  const pack = selected.pack_gate || {};
  const list = (data.rows || []).map((r) => `<button type="button" class="accept-list-row ${r.id === selected.id ? "active" : ""}" data-id="${r.id}">
    <span><b>${esc(r.code)}</b><small>${esc(r.acceptance_type === "Hoan_thanh" ? "Hoàn thành" : "Giai đoạn")} · ${esc(r.status)}</small></span>
    <span class="chip ${r.status === "Da_duyet" ? "ok" : r.status === "Cho_duyet" ? "warn" : "info"}">${esc(r.status)}</span></button>`).join("");
  const qtyRows = (selected.quantity_rows || []).map((r) => [
    esc(r.stage_name), `<b>${esc(r.item_name_raw)}</b><br><span class="muted">Dòng ${esc(r.source_row)} · ${esc(r.source_stt_raw || "")}</span>`,
    esc(r.uom_raw || ""), String(r.planned_qty || 0), String(r.journal_confirmed_qty || 0),
    `<b>${esc(r.acceptance_qty || 0)}</b>`,
    Math.abs(Number(r.difference_journal || 0)) > 0.000000001
      ? `<span class="chip warn">${esc(r.difference_journal)}</span><br><small>${esc(r.discrepancy_reason || "Chưa có lý do")}</small>`
      : `<span class="chip ok">Khớp</span>`]);
  body.innerHTML = `<div class="accept-layout">
    <aside class="accept-sidebar">
      <div class="toolbar"><b>Đợt nghiệm thu</b>${selected.can_edit || selected.status === "New" ? `<button class="btn primary btn-sm" id="accept-new">+ Tạo mới</button>` : ""}</div>
      ${list || `<div class="empty">Chưa có đợt nghiệm thu.</div>`}
    </aside>
    <section class="accept-workspace">
      <div class="panel-head"><div><h2 class="panel-title">${esc(selected.code || "Bản nháp nghiệm thu mới")}</h2>
        <span class="muted">Ruleset V3.1 profile/trigger · không chứa dữ liệu tiền · không tự ký</span></div>
        <span class="chip ${selected.status === "Da_duyet" ? "ok" : "info"}">${esc(selected.status)}</span></div>
      <div class="accept-gates">
        ${ctAcceptanceGate("Hồ sơ đầu vào", dossier, `${(dossier.complete_codes || []).length}/${(dossier.required_codes || []).length} mã đạt`)}
        ${ctAcceptanceGate("Khối lượng exact BOQ", quantity, `${quantity.row_count || 0} dòng · ${quantity.discrepancy_count || 0} chênh lệch`)}
        ${ctAcceptanceGate("Vật tư & CO/CQ", material, material.required ? `${material.total_material_rows || 0} dòng đã dùng` : "Không có vật tư đã dùng trong nhật ký duyệt")}
        ${ctAcceptanceGate("Bản nháp BBNT", pack, pack.report_document ? pack.report_document.file_name : pack.template_code || "")}
      </div>
      ${(selected.blockers || []).length ? `<div class="accept-blockers"><b>Chưa thể gửi:</b> ${selected.blockers.map((b) => `<span>${esc(b)}</span>`).join("")}</div>` : `<div class="accept-ready">✓ Đủ điều kiện gửi duyệt nghiệm thu.</div>`}
      <div class="toolbar accept-actions">
        ${selected.can_edit ? `<button class="btn ghost" id="accept-edit">Sửa khối lượng</button>` : ""}
        ${selected.can_generate_pack ? `<button class="btn primary" id="accept-pack">Sinh ${esc(pack.template_code)} từ mẫu V3.1</button>` : ""}
        ${selected.can_submit && selected.ready_to_submit ? `<button class="btn primary" id="accept-submit">Gửi nghiệm thu</button>` : ""}
        ${selected.can_decide ? `<button class="btn ghost" id="accept-return">Trả lại</button><button class="btn primary" id="accept-approve">Duyệt nghiệm thu</button>` : ""}
        <span class="chip neutral">Ký số: ${esc(selected.signature_status || "Chua_ky")}</span>
      </div>
      ${panel("Đối chiếu khối lượng theo đúng tầng / dòng báo giá", table(
        ["Tầng / giai đoạn", "Hạng mục nguồn", "ĐVT", "Dự toán", "Nhật ký đã duyệt", "Nghiệm thu", "Chênh lệch"],
        qtyRows, { empty: "Chưa có dòng BOQ chính thức trong phạm vi." }))}
      ${!dossier.ready ? panel("Hồ sơ đầu vào còn thiếu", `<div class="dossier-missing-list">${(dossier.missing_codes || []).map((c) => `<span class="chip danger">${esc(c)}</span>`).join("")}</div>
        <button class="btn ghost btn-sm" id="accept-go-dossier">Mở tab Tài liệu</button>`) : ""}
      ${material.incomplete_rows ? panel("Vật tư / CO-CQ chưa đạt", (material.rows || []).filter((r) => !r.ready).map((r) =>
        `<div class="accept-material-row"><b>${esc(r.item_name)}</b><span>${(r.reasons || []).map(esc).join(" · ")}</span></div>`).join("")) : ""}
    </section></div>`;
  body.querySelectorAll(".accept-list-row").forEach((b) => b.onclick = () => refresh(Number(b.dataset.id)));
  const newBtn = $("#accept-new", body); if (newBtn) newBtn.onclick = () => ctAcceptanceDraftModal(pid, data.new_draft, refresh);
  const editBtn = $("#accept-edit", body); if (editBtn) editBtn.onclick = () => ctAcceptanceDraftModal(pid, selected, refresh);
  const dossierBtn = $("#accept-go-dossier", body); if (dossierBtn) dossierBtn.onclick = () => {
    const dossierTab = document.querySelector('#ct-tabs .tab[data-t="tai_lieu"]');
    if (dossierTab) dossierTab.click();
    else toast("Không tìm thấy tab Tài liệu trong ngữ cảnh công trình.", false);
  };
  const packBtn = $("#accept-pack", body); if (packBtn) packBtn.onclick = async () => {
    try { const r = await ctAcceptanceTwoPhase("ct_acceptance_pack", { id: selected.id, expected_version: selected.version },
      `Sinh bản nháp ${pack.template_code} theo đúng template V3.1?`); if (r) { toast("Đã sinh bản nháp BBNT."); refresh(selected.id); } }
    catch (e) { toast(e.message || "Không sinh được BBNT", false); }
  };
  const submitBtn = $("#accept-submit", body); if (submitBtn) submitBtn.onclick = async () => {
    try { const r = await ctAcceptanceTwoPhase("ct_acceptance_submit", { id: selected.id, expected_version: selected.version },
      "Gửi đợt nghiệm thu này cho Giám đốc duyệt?"); if (r) { toast("Đã gửi nghiệm thu."); refresh(selected.id); } }
    catch (e) { toast(e.message || "Không gửi được", false); }
  };
  const decide = async (decision) => {
    const reason = decision === "return" ? prompt("Lý do trả lại (bắt buộc):") : "";
    if (decision === "return" && !(reason || "").trim()) return;
    try { const r = await ctAcceptanceTwoPhase("ct_acceptance_decide", { id: selected.id,
      expected_version: selected.version, decision, reason }, decision === "approve"
        ? "Duyệt nghiệm thu? Thao tác này không ký số." : "Trả lại để KTT bổ sung?");
      if (r) { toast(decision === "approve" ? "Đã duyệt nghiệm thu (chưa ký số)." : "Đã trả lại."); refresh(selected.id); } }
    catch (e) { toast(e.message || "Không xử lý được", false); }
  };
  const approveBtn = $("#accept-approve", body); if (approveBtn) approveBtn.onclick = () => decide("approve");
  const returnBtn = $("#accept-return", body); if (returnBtn) returnBtn.onclick = () => decide("return");
}

/* ---- Tab: Hoàn công & BQT — tái dùng renderer BBNT/BQT có sẵn ---- */
async function ctTabHoanCong(body, pid, proj) {
  const d = await apiGet("ct_tong_quan", { project_id: pid });
  const HC_CODES = ["CT-07-DMBVHC", "CT-07-MLHC", "CT-07-BBBG", "CT-08-HSTT", "CT-08-TDNTT", "CT-08-QTHT", "CT-09-CKBH", "CT-09-BBSUCO"];
  const rows = d.ho_so_00_09.filter((h) => HC_CODES.includes(h.ma_mau));
  body.innerHTML = `
    ${panel("Hồ sơ hoàn công & quyết toán", `
      <div class="muted" style="margin-bottom:10px;font-size:12px">
        <b>Xuất Word</b> điền header theo CT/HĐ/BG. Bảng chi tiết (nếu có) bổ sung tay — không ghi đè bản đã ký.
      </div>
      <div class="hs-grid">${rows.map((h) => {
        const hasFile = !!h.evidence_source_document_id;
        return `<div class="hs-card" data-ma="${esc(h.ma_mau)}">
          <div class="hs-code">${esc(h.ma_mau)}</div>
          <div class="hs-title">${esc(h.title)}</div>
          ${ctHoSoChip(h.trang_thai)}
          <div class="hs-card-actions" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            ${ctExportBtnHtml(h)}
            ${hasFile ? `<a class="btn ghost btn-sm" href="/api/document_download?source_document_id=${Number(h.evidence_source_document_id)}">Tải file</a>` : ""}
            <button type="button" class="btn ghost btn-sm hs-open-detail" data-ma="${esc(h.ma_mau)}">Chi tiết</button>
          </div>
        </div>`;
      }).join("")}</div>`)}
    ${panel("Liên kết chứng từ công ty này", `<div class="toolbar">
      <button class="btn ghost" id="ct-go-bbnt">Mở BBNT →</button>
      <button class="btn ghost" id="ct-go-bqt">Mở BQT →</button>
      <button class="btn ghost" id="ct-go-payment">Mở đề nghị thanh toán →</button></div>`)}`;
  body.querySelectorAll(".hs-open-detail").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    ctHoSoModal(pid, rows.find((h) => h.ma_mau === b.dataset.ma), () => ctTabHoanCong(body, pid, proj));
  }));
  body.querySelectorAll(".hs-card").forEach((c) => c.addEventListener("click", (e) => {
    if (e.target.closest("button, a")) return;
    ctHoSoModal(pid, rows.find((h) => h.ma_mau === c.dataset.ma), () => ctTabHoanCong(body, pid, proj));
  }));
  ctWireExportButtons(body, pid, rows, () => ctTabHoanCong(body, pid, proj));
  const kh_enc = encodeURIComponent(proj.customer_name || "");
  const wire = (id, hash) => { const b = $(id, body); if (b) b.onclick = () => { location.hash = hash; }; };
  wire("#ct-go-bbnt", "#bbnt?customer_id=" + proj.customer_id + "&kh=" + kh_enc);
  wire("#ct-go-bqt", "#bqt?customer_id=" + proj.customer_id + "&kh=" + kh_enc);
  wire("#ct-go-payment", "#payment?customer_id=" + proj.customer_id + "&kh=" + kh_enc);
}

/* ---- Tab: Tài liệu — registry V3.1 đủ 84 mã, rule/trigger/evidence/bulk ---- */
const DOSSIER_FLAG_LABELS = {
  requires_drawings: "Có bản vẽ cần trình duyệt",
  requires_material_approval: "Có vật tư cần phê duyệt / CO-CQ",
  requires_testing_commissioning: "Có thử nghiệm / chạy thử",
  uses_subcontractor_or_supplier_selection: "Có thầu phụ / chọn nhà cung cấp",
  has_guarantee: "Có bảo lãnh",
  requires_om_manual: "Yêu cầu tài liệu O&M",
  has_warranty_retention: "Có bảo hành / giữ lại"
};
const DOSSIER_REQUIREMENT_LABELS = {
  REQUIRED: "Bắt buộc", ACTIVE_CONDITIONAL: "Điều kiện đang áp dụng",
  INACTIVE_CONDITIONAL: "Điều kiện chưa kích hoạt", OPTIONAL: "Tùy chọn"
};
const DOSSIER_NEXT_LABELS = {
  generate_or_link_evidence: "Sinh hồ sơ hoặc liên kết bằng chứng",
  link_evidence: "Liên kết bằng chứng", submit_review: "Gửi kiểm tra",
  approve_or_return: "Duyệt hoặc trả lại", sign_or_close: "Ký hoặc đóng hồ sơ",
  complete: "Đã hoàn tất", none: "Chưa cần xử lý"
};

function dossierEvidenceImport(pid, proj, dossier, after) {
  if (dossier.ma_mau?.startsWith("BG-")) {
    return quickProjectQuoteImport(pid, proj, after);
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.jpg,.jpeg,.png";
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const code = dossier.ma_mau || "";
    const docType = code.startsWith("HD-") ? "hop_dong" :
      code.includes("BBNT") ? "bbnt" : code.includes("BQT") ? "bqt" : "ho_so_cong_trinh";
    const targetStatus = ["Thieu", "Khong_ap_dung"].includes(dossier.trang_thai)
      ? "Dang_soan" : dossier.trang_thai;
    openModal(`Bổ sung ${code} từ file`, `<div class="f wide">${formGrid([
      ["Mã hồ sơ", code], ["Tên file", file.name], ["Dung lượng", `${Math.ceil(file.size / 1024)} KB`],
      ["Sau khi nạp", CT_HO_SO_LABEL[targetStatus] || targetStatus]], 2)}</div>
      <div class="f wide muted">File sẽ được lưu đúng thư mục công trình, lập SHA256 và liên kết chính xác với mã hồ sơ này.</div>`,
      async () => {
        const uploaded = await apiPost("write/upload_ho_so", { customer_id: Number(proj.customer_id),
          project_id: Number(pid), doc_type: docType, filename: file.name, file_b64: await fileToB64(file) });
        const preview = await apiPost("write/ct_dossier_batch", { phase: "preview", project_id: Number(pid),
          updates: [{ ma_mau: code, trang_thai: targetStatus,
            evidence_source_document_id: uploaded.source_document_id,
            evidence_note: `Import tại trang công trình · SHA256 ${uploaded.source_sha256}` }] });
        await apiPost("write/ct_dossier_batch", { phase: "commit", confirm_token: preview.confirm_token });
        closeModal(); toast(`Đã nạp và liên kết ${code}.`); if (after) after();
      }, "Xác nhận nạp & liên kết");
  };
  input.click();
}

async function ctTabTaiLieu(body, pid, proj) {
  const d = await apiGet("ct_dossier", { project_id: pid });
  const statusOptions = ["Thieu", "Dang_soan", "Cho_duyet", "Da_duyet", "Da_ky", "Khong_ap_dung"];
  body.innerHTML = `
    <section class="dossier-policy-alert ${d.completion_ready ? "ready" : ""}" role="status">
      <b>Registry V3.1: ${d.summary.registry_total}/84 mẫu · Profile ${esc(d.profile_code)}</b>
      <span>Policy đã khóa theo profile/trigger V3.1: ${d.summary.complete}/${d.summary.applicable} hồ sơ áp dụng đã duyệt/ký và có bằng chứng đúng công trình. ${d.completion_ready ? "Hồ sơ sẵn sàng cho bước nghiệm thu." : "Chưa đủ điều kiện nghiệm thu."}</span>
    </section>
    ${d.can_export_full_pack ? panel("Xuất toàn bộ hồ sơ công trình", `<div class="toolbar">
      <button class="btn primary btn-sm" id="dossier-export-pack" ${d.completion_ready ? "" : "disabled"}>Kiểm tra & đóng gói ZIP</button>
      <span class="muted">${d.completion_ready ? `${d.summary.export_ready}/${d.summary.applicable} hồ sơ có file hợp lệ` : `${d.summary.export_blocked} hồ sơ chưa xuất trình được`}</span></div>
      ${(d.export_packs || []).length ? `<div class="dossier-pack-history">${(d.export_packs || []).map((pack) =>
        `<a class="btn ghost btn-sm" href="/api/document_download?source_document_id=${Number(pack.source_document_id)}">${esc(pack.code)} · ${Number(pack.item_count)} file</a>`).join(" ")}</div>` : `<div class="muted" style="margin-top:8px">Chưa có bộ ZIP nào.</div>`}`) : ""}
    ${panel("Ngữ cảnh kích hoạt hồ sơ", `
      <div class="dossier-rule-flags">
        ${Object.entries(DOSSIER_FLAG_LABELS).map(([key, label]) => `<label>
          <input type="checkbox" data-flag="${key}" ${d.flags[key] ? "checked" : ""} ${d.can_edit_context ? "" : "disabled"}> ${esc(label)}
          ${d.suggested_flags[key] && !d.flags[key] ? `<small>Hệ thống gợi ý bật</small>` : ""}
        </label>`).join("")}
      </div>
      <div class="toolbar">${d.can_edit_context ? `<button class="btn primary btn-sm" id="dossier-save-flags">Lưu ngữ cảnh</button>` : ""}
        <span class="muted">${d.summary.required} bắt buộc · ${d.summary.active_conditional} điều kiện đang áp dụng · ${d.summary.missing} còn thiếu</span></div>`) }
    ${panel("Danh mục hồ sơ và bằng chứng", `
      <div class="dossier-filters toolbar">
        <input id="dossier-search" class="field" placeholder="Tìm mã hoặc tên hồ sơ">
        <select id="dossier-requirement" class="field"><option value="">Mọi mức yêu cầu</option>
          ${Object.entries(DOSSIER_REQUIREMENT_LABELS).map(([v,l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>
        <select id="dossier-status" class="field"><option value="">Mọi trạng thái</option>
          ${statusOptions.map((s) => `<option value="${s}">${esc(CT_HO_SO_LABEL[s])}</option>`).join("")}</select>
        <select id="dossier-group" class="field"><option value="">Mọi nhóm</option>
          ${[...new Set(d.rows.map((r) => r.phase_code || r.ma_mau.split("-")[1]))].sort().map((g) => `<option value="${esc(g)}">Nhóm ${esc(g)}</option>`).join("")}</select>
      </div>
      <div class="dossier-bulk toolbar">
        <b><span id="dossier-selected-count">0</span> đã chọn</b>
        <select id="dossier-bulk-status" class="field"><option value="">Chọn trạng thái đích</option>
          ${statusOptions.map((s) => `<option value="${s}">${esc(CT_HO_SO_LABEL[s])}</option>`).join("")}</select>
        <input id="dossier-evidence-id" class="field" type="number" min="1" placeholder="ID tài liệu bằng chứng">
        <input id="dossier-evidence-note" class="field" maxlength="500" placeholder="Ghi chú bằng chứng">
        <button class="btn primary btn-sm" id="dossier-bulk-apply">Kiểm tra & cập nhật</button>
      </div>
      <div id="dossier-list" class="dossier-list"></div>`) }`;

  const renderRows = () => {
    const q = String($("#dossier-search", body).value || "").trim().toLowerCase();
    const requirement = $("#dossier-requirement", body).value;
    const status = $("#dossier-status", body).value;
    const group = $("#dossier-group", body).value;
    const rows = d.rows.filter((r) => (!q || `${r.ma_mau} ${r.title}`.toLowerCase().includes(q)) &&
      (!requirement || r.requirement === requirement) && (!status || r.trang_thai === status) &&
      (!group || String(r.phase_code || r.ma_mau.split("-")[1]) === group));
    $("#dossier-list", body).innerHTML = rows.length ? rows.map((h) => `
      <article class="dossier-row ${h.applicable ? "is-applicable" : ""}" data-ma="${esc(h.ma_mau)}">
        <label class="dossier-select"><input type="checkbox" class="dossier-select-box" data-ma="${esc(h.ma_mau)}" ${h.can_update ? "" : "disabled"}><span class="sr-only">Chọn ${esc(h.ma_mau)}</span></label>
        <div class="dossier-main"><div><b>${esc(h.ma_mau)}</b> · ${esc(h.title)}</div>
          <div class="dossier-meta"><span>${esc(DOSSIER_REQUIREMENT_LABELS[h.requirement] || h.requirement)}</span>
            ${ctHoSoChip(h.trang_thai)}
            <span>${h.has_evidence ? `📎 ${esc(h.evidence_file_name || "Đã có bằng chứng")}` : "Chưa có bằng chứng"}</span></div>
          <div class="dossier-next-action"><b>Tiếp theo:</b> ${esc(DOSSIER_NEXT_LABELS[h.next_action] || h.next_action)}</div></div>
        <div class="dossier-actions">
          ${ctExportBtnHtml(h, "dossier-export-doc hs-export-doc")}
          ${h.evidence_source_document_id ? `<button class="btn ghost btn-sm dossier-open-evidence" data-id="${Number(h.evidence_source_document_id)}">Mở bằng chứng</button>` : ""}
          ${h.can_update && ["Thieu", "Dang_soan", "Khong_ap_dung"].includes(h.trang_thai) ? `<button class="btn ghost btn-sm dossier-import-evidence">Bổ sung từ file</button>` : ""}
          <button class="btn ghost btn-sm dossier-edit">${h.can_update ? "Xử lý" : "Xem"}</button>
        </div>
      </article>`).join("") : `<div class="empty">Không có hồ sơ phù hợp bộ lọc.</div>`;
    body.querySelectorAll(".dossier-select-box").forEach((c) => c.onchange = () => {
      $("#dossier-selected-count", body).textContent = body.querySelectorAll(".dossier-select-box:checked").length;
    });
    body.querySelectorAll(".dossier-edit").forEach((b) => b.onclick = () => {
      const code = b.closest(".dossier-row").dataset.ma;
      ctHoSoModal(pid, d.rows.find((r) => r.ma_mau === code), () => ctTabTaiLieu(body, pid, proj));
    });
    body.querySelectorAll(".dossier-open-evidence").forEach((b) => b.onclick = (e) => {
      e.stopPropagation(); window.location.href = `/api/document_download?source_document_id=${Number(b.dataset.id)}`;
    });
    body.querySelectorAll(".dossier-import-evidence").forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const code = b.closest(".dossier-row").dataset.ma;
      dossierEvidenceImport(pid, proj, d.rows.find((row) => row.ma_mau === code),
        () => ctTabTaiLieu(body, pid, proj));
    });
    ctWireExportButtons(body, pid, d.rows, () => ctTabTaiLieu(body, pid, proj));
  };
  renderRows();
  const exportPack = $("#dossier-export-pack", body);
  if (exportPack) exportPack.onclick = async () => {
    try {
      const preview = await apiPost("write/ct_dossier_export_pack", { phase: "preview", project_id: pid });
      openModal(`Đóng gói ${preview.item_count} file hồ sơ`, `<div class="f wide">${formGrid([
        ["Công trình", preview.project_code], ["Profile", preview.profile_code],
        ["Số file", String(preview.item_count)], ["Manifest", "SHA256 + phiên bản record"]], 2)}</div>
        <div class="f wide muted">Hệ thống sẽ kiểm tra lại toàn bộ hash trước khi tạo ZIP; một file thay đổi sẽ hủy cả bộ.</div>`,
        async () => {
          const result = await apiPost("write/ct_dossier_export_pack", { phase: "commit", confirm_token: preview.confirm_token });
          closeModal(); toast("Đã tạo bộ hồ sơ ZIP có manifest/checksum.");
          window.location.href = result.download_url; ctTabTaiLieu(body, pid, proj);
        }, "Xác nhận đóng gói");
    } catch (e) { toast(e.message || "Không thể đóng gói hồ sơ.", false); }
  };
  ["#dossier-search", "#dossier-requirement", "#dossier-status", "#dossier-group"].forEach((sel) => {
    const el = $(sel, body); el.addEventListener(el.tagName === "INPUT" ? "input" : "change", renderRows);
  });
  const saveFlags = $("#dossier-save-flags", body);
  if (saveFlags) saveFlags.onclick = async () => {
    const flags = {};
    body.querySelectorAll("[data-flag]").forEach((c) => { flags[c.dataset.flag] = c.checked; });
    const preview = await apiPost("write/ct_dossier_context", { phase: "preview", project_id: pid, flags });
    if (!window.confirm("Xác nhận lưu ngữ cảnh? Danh sách hồ sơ điều kiện sẽ được tính lại.")) return;
    await apiPost("write/ct_dossier_context", { phase: "commit", confirm_token: preview.confirm_token });
    toast("Đã cập nhật ngữ cảnh hồ sơ."); ctTabTaiLieu(body, pid, proj);
  };
  $("#dossier-bulk-apply", body).onclick = async () => {
    const codes = [...body.querySelectorAll(".dossier-select-box:checked")].map((c) => c.dataset.ma);
    const target = $("#dossier-bulk-status", body).value;
    if (!codes.length || !target) { toast("Chọn hồ sơ và trạng thái đích.", false); return; }
    const evidenceId = $("#dossier-evidence-id", body).value || null;
    const evidenceNote = $("#dossier-evidence-note", body).value || "";
    const updates = codes.map((ma_mau) => ({ ma_mau, trang_thai: target,
      evidence_source_document_id: evidenceId, evidence_note: evidenceNote }));
    const preview = await apiPost("write/ct_dossier_batch", { phase: "preview", project_id: pid, updates });
    if (!window.confirm(`Xác nhận cập nhật ${preview.count} hồ sơ? Hệ thống sẽ kiểm tra lại toàn bộ batch trước khi ghi.`)) return;
    await apiPost("write/ct_dossier_batch", { phase: "commit", confirm_token: preview.confirm_token });
    toast(`Đã cập nhật ${preview.count} hồ sơ.`); ctTabTaiLieu(body, pid, proj);
  };
}

/* ---- Modal dùng chung: ghi hình ảnh hiện trường (project_id nhập tay —
   cùng gap đã nêu ở ctRenderList; dùng được ngay khi biết project_id) ---- */
function ctHinhAnhModal(defaultPid, after) {
  const w = openModal("📷 Ghi hình ảnh hiện trường",
    fI("project_id", "Project ID *", "number", "required" + (defaultPid ? ` value="${defaultPid}"` : "")) +
    fI("hang_muc", "Hạng mục") + fI("vi_tri", "Vị trí") +
    fI("loai_anh", "Loại ảnh (vd: Truoc/Trong/Sau thi công)", "text") +
    fT("mo_ta", "Mô tả") +
    `<div class="f wide"><label>Chọn ảnh *</label><input type="file" name="file" accept="image/*" required></div>`,
    async (fd) => {
      const f = fd.get("file");
      if (!f || !f.name) throw new Error("Chọn 1 ảnh.");
      const b64 = await fileToB64(f);
      await apiPost("write/ct_hinh_anh", { project_id: Number(fd.get("project_id")),
        hang_muc: fd.get("hang_muc"), vi_tri: fd.get("vi_tri"), loai_anh: fd.get("loai_anh"),
        mo_ta: fd.get("mo_ta"), filename: f.name, file_b64: b64 });
      closeModal(); toast("Đã lưu ảnh hiện trường."); if (after) after();
    }, "Lưu ảnh");
}

/* ==== WO-34B: Lịch & Công việc — thêm khối "Hiện trường (KTV/CTV)":
   điểm danh empty-state (không backend) + ghi ảnh nhanh (ct_hinh_anh). ==== */
const _sched0ct = RENDER.schedule;
RENDER.schedule = async function (el) {
  await _sched0ct(el);
  if (!ME || ME.role !== "Ky thuat vien") return;
  const html = `<section class="panel" style="margin-top:14px"><div class="panel-head">
    <h2 class="panel-title">📍 Hiện trường hôm nay</h2></div>
    <div class="panel-body">
      <div class="empty" style="margin-bottom:10px">Điểm danh/chấm công (FaceID, GPS) chưa có trong hệ —
        nằm ngoài phạm vi WO34A. Chưa thể check-in/check-out tại đây.</div>
      <button class="btn primary btn-sm" id="ct-quick-anh">📷 Ghi hình ảnh hiện trường</button>
    </div></section>`;
  el.insertAdjacentHTML("beforeend", html);
  const b = $("#ct-quick-anh", el);
  if (b) b.onclick = () => ctHinhAnhModal(null, null);
};

/* ==== WO-35B: nút "＋ Bắt đầu công việc" + drawer + wizard 6 bước + resume =====
   Hợp đồng API: docs/work_orders/WO35A_WORKFLOW_ENGINE_STATE_MACHINE_PERMISSION.md
   mục 4 (state machine 13 token) + mục 6 (4 GET + 7 POST) — bám đúng code thật.
   KHÔNG lưu state ở localStorage: mọi resume đổ lại từ workflow_resume /
   work_start_context (đóng trình duyệt mở lại vẫn còn). ==== */

// nhãn hiển thị 13 canonical state (chỉ là NHÃN cho token hợp đồng — không phải dữ liệu bịa)
const WF_STATE_LABEL = {
  NHAP: "Nháp", SAN_SANG: "Sẵn sàng", DA_GIAO: "Đã giao", DANG_THUC_HIEN: "Đang thực hiện",
  CHO_KTT_XAC_NHAN: "Chờ KTT xác nhận", CAN_BO_SUNG: "Cần bổ sung", DA_XAC_NHAN: "Đã xác nhận",
  CHO_GD_DUYET: "Chờ GĐ duyệt", DA_DUYET: "Đã duyệt", CHO_HO_SO_NGHIEM_THU: "Chờ hồ sơ nghiệm thu",
  HOAN_THANH: "Hoàn thành", BAO_HANH: "Bảo hành", DONG: "Đóng",
};
function wfStateChip(s) {
  const kind = s === "CAN_BO_SUNG" ? "need"
    : (s === "CHO_KTT_XAC_NHAN" || s === "CHO_GD_DUYET" || s === "CHO_HO_SO_NGHIEM_THU") ? "wait"
    : (s === "DANG_THUC_HIEN" || s === "DA_GIAO" || s === "SAN_SANG") ? "run"
    : (s === "DA_XAC_NHAN" || s === "DA_DUYET" || s === "HOAN_THANH") ? "ok" : "";
  return `<span class="wf-state ${kind}">${esc(WF_STATE_LABEL[s] || s)}</span>`;
}
// mirror PERMS_WRITE thật (api_write.py): workflow=ALL role · workflow_duyet=GĐ/KTT/QT.
// UI ẩn theo đây nhưng server luôn re-check 403 — không dựa mỗi ẩn nút.
const WF_DUYET_ROLES = ["Giam doc", "Ky thuat truong", "Quan tri he thong"];
const WF_GD_ROLES = ["Giam doc", "Quan tri he thong"];
const wfCanDuyet = () => !!ME && WF_DUYET_ROLES.includes(ME.role);
const wfIsGd = () => !!ME && WF_GD_ROLES.includes(ME.role);
const WF_STEP_SUBMITABLE = new Set(["NHAP", "SAN_SANG", "DA_GIAO", "DANG_THUC_HIEN", "CAN_BO_SUNG"]);

/* ---- ngữ cảnh trang đang mở (Bước 1 tự điền — backend xác thực lại id) ---- */
function wfCurrentCtx() {
  const raw = (location.hash || "").replace("#", "");
  const [page, qs] = raw.split("?");
  const q = Object.fromEntries(new URLSearchParams(qs || ""));
  const out = {};
  if (page === "cong_trinh" && q.project_id) out.current_project_id = q.project_id;
  if (q.customer_id) out.current_customer_id = q.customer_id;
  return out;
}

/* ---- Nút global: header (mọi trang) — nhãn đổi theo role + màn hình ---- */
function wfBtnLabel() {
  const mobile = window.matchMedia && window.matchMedia("(max-width: 680px)").matches;
  return (ME && ME.role === "Ky thuat vien" && mobile) ? "▶ Bắt đầu việc hôm nay" : "＋ Bắt đầu công việc";
}
function mountStartWork() {
  const b = $("#btn-start-work");
  if (!b || !ME) return;
  b.style.display = "";
  b.textContent = wfBtnLabel();
  b.onclick = () => startWorkDrawer();
  window.addEventListener("resize", () => { b.textContent = wfBtnLabel(); });
}
let UX_EXPERIENCE = null;
function applyExperiencePreference(preference) {
  const settings = (preference || {}).settings || {};
  document.documentElement.setAttribute("data-reduced-motion", String(Boolean(settings.reduced_motion)));
  document.documentElement.setAttribute("data-high-contrast", String(Boolean(settings.high_contrast)));
  document.documentElement.setAttribute("data-mobile-compact-nav", String(settings.mobile_compact_nav !== false));
}
async function mountExperienceControls() {
  try { UX_EXPERIENCE = await apiGet("user_experience"); } catch (e) { return; }
  applyExperiencePreference(UX_EXPERIENCE.preference);
  const foot = $("#foot"); if (!foot) return;
  foot.insertAdjacentHTML("beforeend", `<button class="logout-btn" id="ux-preferences" type="button">⚙ Tùy chỉnh cá nhân</button>`);
  $("#ux-preferences").onclick = () => {
    const pref = UX_EXPERIENCE.preference || { settings: {}, notifications: {}, version: 0 };
    const s = pref.settings || {}, n = pref.notifications || {};
    openModal("Tùy chỉnh cá nhân", `<div class="form-grid cols-2">
      <label class="f wide"><span><input type="checkbox" name="reduced_motion" ${s.reduced_motion ? "checked" : ""}> Giảm hiệu ứng chuyển động</span></label>
      <label class="f wide"><span><input type="checkbox" name="high_contrast" ${s.high_contrast ? "checked" : ""}> Tăng độ tương phản</span></label>
      <label class="f wide"><span><input type="checkbox" name="mobile_compact_nav" ${s.mobile_compact_nav !== false ? "checked" : ""}> Menu gọn trên điện thoại</span></label>
      <label class="f wide"><span><input type="checkbox" name="browser_enabled" ${n.browser_enabled ? "checked" : ""}> Cho phép thông báo trình duyệt</span></label>
      ${fI("quiet_start", "Bắt đầu giờ yên lặng", "time", `value="${esc(n.quiet_start || "22:00")}"`)}
      ${fI("quiet_end", "Kết thúc giờ yên lặng", "time", `value="${esc(n.quiet_end || "06:00")}"`)}</div>`,
    async (fd) => {
      const browserEnabled = !!fd.get("browser_enabled");
      const out = await apiPost("write/user_preference", { expected_version: pref.version,
        settings: { reduced_motion: !!fd.get("reduced_motion"), high_contrast: !!fd.get("high_contrast"),
          mobile_compact_nav: !!fd.get("mobile_compact_nav") },
        notifications: { browser_enabled: browserEnabled, quiet_start: fd.get("quiet_start"), quiet_end: fd.get("quiet_end") } });
      UX_EXPERIENCE.preference = out; applyExperiencePreference(out);
      if (browserEnabled && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
      closeModal(); toast("Đã lưu tùy chỉnh cho tài khoản.");
    });
  };
}

const _startApp35 = startApp;
startApp = async function (user) {
  await _startApp35(user);
  mountStartWork();
  await mountExperienceControls();
};

function wfProjectSelectHtml(ctx, selected, id, required = false) {
  const rows = ctx.project_choices || [];
  return `<select class="field" id="${esc(id)}" ${required ? "required" : ""}>
    <option value="">${required ? "— Chọn công trình —" : "— Không gắn công trình —"}</option>
    ${rows.map((p) => `<option value="${p.project_id}" data-cid="${p.customer_id || ""}" ${Number(selected) === Number(p.project_id) ? "selected" : ""}>${esc(p.code)} · ${esc(p.project_name)}</option>`).join("")}
  </select>`;
}
function ctCoCqDecisionModal(id, decision, after) {
  const isReturn = decision === "return";
  openModal(isReturn ? "Trả lại CO/CQ" : "Duyệt CO/CQ",
    isReturn ? fT("reason", "Lý do trả lại *")
      : `<div class="f wide muted">Hệ thống sẽ kiểm tra đủ CO, CQ, file đính kèm và hạn hiệu lực trước khi duyệt.</div>`,
    async (fd) => {
      const reason = (fd.get("reason") || "").trim();
      if (isReturn && !reason) throw new Error("Phải ghi lý do trả lại.");
      const preview = await apiPost("write/ct_co_cq_decide", { phase: "preview", id, decision, reason });
      await apiPost("write/ct_co_cq_decide", { phase: "commit", confirm_token: preview.confirm_token });
      closeModal(); toast(isReturn ? "Đã trả lại CO/CQ." : "Đã duyệt CO/CQ."); after();
    }, "Xem trước & xác nhận");
}

/* ---- Drawer 3 chức năng (modal gọn, KHÔNG page riêng) ---- */
async function startWorkDrawer() {
  let ctx;
  try { ctx = await apiGet("work_start_context", wfCurrentCtx()); }
  catch (e) { toast(e.message || "Không tải được ngữ cảnh làm việc.", false); return; }
  const resume = ctx.resume_items || [];
  const tpls = ctx.allowed_templates || [];
  const resumeHtml = resume.length ? resume.slice(0, 8).map((r) => `
      <div class="wf-resume-row">
        <span><b>${esc(r.project_name || r.customer_name || r.template_ten)}</b>
          <span class="muted">→ ${esc(r.buoc_hien_tai ? r.buoc_hien_tai.ten_buoc : r.template_ten)} ${wfStateChip(r.canonical_state)}</span></span>
        <button class="btn primary btn-sm wf-resume-go" data-iid="${r.instance_id}">Tiếp tục</button>
      </div>`).join("")
    : `<div class="empty" style="padding:12px">Không có việc dang dở của bạn.</div>`;
  const tplHtml = tpls.length ? `<div class="wf-tpl-grid">${tpls.map((t) => `
      <button type="button" class="wf-tpl-card wf-tpl-go" data-tid="${t.id}">
        <b>${esc(t.ten)}</b>
        <span class="muted">${esc(t.loai_viec || "")} · ${t.steps.length} bước</span>
        <span><span class="chip ${t.quy_mo === "nang" ? "danger" : t.quy_mo === "vua" ? "warn" : "ok"}">${t.quy_mo === "nang" ? "Nặng — full 00-09" : t.quy_mo === "vua" ? "Vừa" : "Nhẹ"}</span></span>
      </button>`).join("")}</div>`
    : `<div class="empty" style="padding:12px">Vai trò của bạn chưa được phép khởi động quy trình nào.</div>`;
  const canPS = ctCan("phat_sinh"), canNK = ctCan("nhat_ky"), canAnh = ctCan("hinh_anh");
  const quickHtml = `<div class="wf-quick-grid">
      ${canAnh ? `<button type="button" class="quick-card" id="wfq-anh"><span class="qc-ico">${ICO.doc}</span><b>📷 Chụp ảnh</b><span>Ảnh hiện trường, gắn vào công trình</span></button>` : ""}
      ${canNK ? `<button type="button" class="quick-card warn" id="wfq-suco"><span class="qc-ico">${ICO.alert}</span><b>⚠️ Báo sự cố</b><span>Ghi vào nhật ký thi công</span></button>` : ""}
      ${canNK ? `<button type="button" class="quick-card purple" id="wfq-thieuvt"><span class="qc-ico">${ICO.db}</span><b>📦 Báo thiếu vật tư</b><span>Ghi nhật ký (chưa có API riêng)</span></button>` : ""}
      ${canPS ? `<button type="button" class="quick-card info" id="wfq-phatsinh"><span class="qc-ico">${ICO.money}</span><b>➕ Báo phát sinh</b><span>Tạo VO chờ duyệt</span></button>` : ""}
      <button type="button" class="quick-card" id="wfq-checkin" disabled style="opacity:.55;cursor:not-allowed"><span class="qc-ico">${ICO.clock}</span><b>⏱ Check-in / out</b><span>Chưa có backend chấm công</span></button>
      ${canNK ? `<button type="button" class="quick-card ok" id="wfq-note"><span class="qc-ico">${ICO.doc}</span><b>📝 Ghi chú nhanh</b><span>Ghi vào nhật ký thi công</span></button>` : ""}
    </div>`;
  const w = openModal(wfBtnLabel(),
    `<div class="f wide"><div class="wf-context-picker"><label>Ngữ cảnh công trình hiện tại</label>
       ${wfProjectSelectHtml(ctx, ctx.current_project_id, "wf-drawer-project")}
       <span class="muted">Hệ thống giữ công trình đang mở; chỉ đổi khi bạn chủ động chọn.</span></div>
     <div class="wf-sec"><b><span class="wf-num">1</span> Tiếp tục việc đang làm</b>${resumeHtml}</div>
     <div class="wf-sec"><b><span class="wf-num">2</span> Bắt đầu quy trình mới</b>${tplHtml}</div>
     <div class="wf-sec"><b><span class="wf-num">3</span> Ghi nhanh hiện trường</b>${quickHtml}
       <div class="muted" style="font-size:11px;margin-top:6px">Mỗi ghi nhanh được gắn vào công trình đã chọn ở trên; backend vẫn kiểm tra quyền.</div></div></div>`,
    async () => closeModal(), "Đóng");
  w.querySelector(".modal").classList.add("xl");
  const projectPicker = $("#wf-drawer-project", w);
  if (projectPicker) projectPicker.onchange = () => {
    ctx.current_project_id = projectPicker.value ? Number(projectPicker.value) : null;
    const opt = projectPicker.selectedOptions[0];
    ctx.current_customer_id = opt && opt.dataset.cid ? Number(opt.dataset.cid) : ctx.current_customer_id;
  };
  w.querySelectorAll(".wf-resume-go").forEach((b) => b.addEventListener("click", () => {
    closeModal(); wfInstanceModal(Number(b.dataset.iid));
  }));
  w.querySelectorAll(".wf-tpl-go").forEach((b) => b.addEventListener("click", () => {
    const tpl = tpls.find((t) => t.id === Number(b.dataset.tid));
    closeModal(); wfWizard(ctx, tpl);
  }));
  const wire = (id, fn) => { const b2 = w.querySelector(id); if (b2) b2.onclick = fn; };
  wire("#wfq-anh", () => { closeModal(); ctHinhAnhModal(ctx.current_project_id, null); });
  wire("#wfq-suco", () => { closeModal(); wfQuickNhatKy(ctx, "su_co", "⚠️ Báo sự cố hiện trường"); });
  wire("#wfq-thieuvt", () => { closeModal(); wfQuickNhatKy(ctx, "thieu_vt", "📦 Báo thiếu vật tư"); });
  wire("#wfq-note", () => { closeModal(); wfQuickNhatKy(ctx, "note", "📝 Ghi chú nhanh hiện trường"); });
  wire("#wfq-phatsinh", () => {
    closeModal();
    if (ctx.current_project_id) ctVoNewModal(ctx.current_project_id, () => toast("Đã tạo VO."));
    else wfQuickPhatSinhAskPid(ctx);
  });
}
function wfQuickNhatKy(ctx, kind, title) {
  const w = openModal(title,
    `<div class="f wide"><label>Công trình *</label>${wfProjectSelectHtml(ctx, ctx.current_project_id, "wf-quick-project", true)}</div>` +
    fT("noi_dung", kind === "su_co" ? "Mô tả sự cố *" : kind === "thieu_vt" ? "Thiếu vật tư gì, số lượng *" : "Nội dung ghi chú *"),
    async (fd) => {
      const txt = (fd.get("noi_dung") || "").trim();
      if (!txt) throw new Error("Nhập nội dung.");
      const projectId = Number($("#wf-quick-project", w).value);
      if (!projectId) throw new Error("Chọn công trình.");
      const body = { project_id: projectId };
      if (kind === "su_co") { body.noi_dung = "[SỰ CỐ] " + txt; body.su_co = txt; }
      else if (kind === "thieu_vt") { body.noi_dung = "[THIẾU VẬT TƯ] " + txt; }
      else { body.noi_dung = txt; }
      await apiPost("write/ct_nhat_ky", body);
      closeModal(); toast("Đã ghi vào nhật ký công trình.");
    }, "Lưu");
}
function wfQuickPhatSinhAskPid(ctx) {
  const w = openModal("➕ Báo phát sinh — chọn công trình",
    `<div class="f wide"><label>Công trình *</label>${wfProjectSelectHtml(ctx, ctx.current_project_id, "wf-vo-project", true)}</div>`,
    async () => {
      const pid = Number($("#wf-vo-project", w).value);
      if (!pid) throw new Error("Chọn công trình.");
      closeModal(); ctVoNewModal(pid, () => toast("Đã tạo VO."));
    }, "Tiếp tục");
}

/* ---- Wizard 6 bước — dữ liệu 100% từ context/API, không hardcode ---- */
async function wfWizard(ctx, tpl0) {
  const tpls = ctx.allowed_templates || [];
  const ns = await nsOptions().catch(() => []);
  const S = { step: 1, tplId: tpl0 ? tpl0.id : (tpls[0] && tpls[0].id),
    customer_id: ctx.current_customer_id || "", project_id: ctx.current_project_id || "",
    cong_viec_id: "", nhan_su_ids: [], vai_tro: "Nguoi thuc hien",
    pham_vi_ghi_chu: "" };
  const tplCur = () => tpls.find((t) => t.id === Number(S.tplId));
  const w = openModal("Bắt đầu quy trình mới — wizard 6 bước",
    `<div class="f wide">
      <div class="wf-steps-bar" id="wf-bar"></div>
      <div class="wf-wiz-body" id="wf-body"></div>
      <div class="toolbar" style="margin-top:12px">
        <button type="button" class="btn ghost" id="wf-prev">← Quay lại</button>
        <button type="button" class="btn primary" id="wf-next">Tiếp tục →</button>
        <span class="modal-err" id="wf-err" style="margin-left:auto"></span>
      </div></div>`,
    async () => closeModal(), "Đóng");
  w.querySelector(".modal").classList.add("xl");
  const NAMES = ["Ngữ cảnh", "Loại việc", "Phạm vi", "Giao người", "Checklist", "Xác nhận"];
  const bar = () => { $("#wf-bar", w).innerHTML = NAMES.map((n, i) =>
    `<span class="${i + 1 === S.step ? "cur" : i + 1 < S.step ? "done" : ""}">${i + 1}. ${esc(n)}</span>`).join(""); };
  const err = (m) => { $("#wf-err", w).textContent = m || ""; };

  const draw = () => {
    bar(); err("");
    const t = tplCur();
    const body = $("#wf-body", w);
    $("#wf-prev", w).style.visibility = S.step === 1 ? "hidden" : "visible";
    $("#wf-next", w).textContent = S.step === 6 ? "✔ Khởi động quy trình" : "Tiếp tục →";
    if (S.step === 1) {
      body.innerHTML = `
        <p class="muted" style="font-size:12px">Gắn quy trình vào đúng đối tượng. Việc nhẹ (bảo trì/khảo sát/báo giá) chỉ cần <b>khách hàng</b>; quy trình nặng bắt buộc <b>công trình</b>. Tự điền theo trang đang mở${ctx.current_project_id || ctx.current_customer_id ? " ✓" : ""}.</p>
        <div class="form-grid cols-2" style="gap:10px">
          <div class="form-field"><label>Customer ID (khách/công ty)</label>
            <input class="field" type="number" id="wf-cid" value="${esc(S.customer_id || "")}" placeholder="vd: 4"></div>
          <div class="form-field"><label>Công trình${t && t.can_project ? " *" : ""}</label>
            ${wfProjectSelectHtml(ctx, S.project_id, "wf-pid", !!(t && t.can_project))}</div>
          <div class="form-field"><label>Công việc KTV ID (tùy chọn)</label>
            <input class="field" type="number" id="wf-cvid" value="${esc(S.cong_viec_id || "")}" placeholder="gắn vào việc đã có"></div>
        </div>
        <p class="muted" style="font-size:11px">Công trình đã được backend lọc theo quyền; hệ thống giữ lựa chọn hiện tại sau khi mở lại.</p>`;
      $("#wf-cid", body).oninput = (e) => { S.customer_id = e.target.value; };
      $("#wf-pid", body).onchange = (e) => {
        S.project_id = e.target.value;
        const opt = e.target.selectedOptions[0];
        if (opt && opt.dataset.cid) { S.customer_id = opt.dataset.cid; $("#wf-cid", body).value = opt.dataset.cid; }
      };
      $("#wf-cvid", body).oninput = (e) => { S.cong_viec_id = e.target.value; };
    } else if (S.step === 2) {
      body.innerHTML = `
        <p class="muted" style="font-size:12px">Loại việc quyết định template + quy mô bộ hồ sơ — việc nhỏ đi workflow nhẹ, KHÔNG bày checklist đầy đủ 00-09.</p>
        <div class="f wide"><label>Quy trình (đã lọc theo vai trò ${esc(ME.role)})</label>
          <select id="wf-tpl" class="field">${tpls.map((x) =>
            `<option value="${x.id}" ${x.id === Number(S.tplId) ? "selected" : ""}>${esc(x.ten)} (${x.steps.length} bước)</option>`).join("")}</select></div>
        <div id="wf-tpl-info" style="margin-top:10px"></div>`;
      const info = () => {
        const x = tplCur();
        $("#wf-tpl-info", body).innerHTML = x ? `
          <span class="chip ${x.quy_mo === "nang" ? "danger" : x.quy_mo === "vua" ? "warn" : "ok"}">Quy mô: ${x.quy_mo === "nang" ? "NẶNG — full hồ sơ 00-09, bắt buộc công trình" : x.quy_mo === "vua" ? "VỪA — chỉ hồ sơ liên quan" : "NHẸ — tối thiểu giấy tờ"}</span>
          <div class="muted" style="font-size:12px;margin-top:8px">Các bước: ${x.steps.map((s) => esc(s.ten_buoc)).join(" → ")}</div>` : "";
      };
      $("#wf-tpl", body).onchange = (e) => { S.tplId = e.target.value; info(); };
      info();
    } else if (S.step === 3) {
      body.innerHTML = `
        <p class="muted" style="font-size:12px">Phạm vi công việc (giai đoạn/khu vực/hạng mục/khối lượng/deadline).</p>
        <div class="empty">⚠️ Backend <code>workflow_start</code> hiện CHƯA nhận phạm vi/deadline lúc khởi động
          (bảng <code>workflow_step_instance.deadline</code> có cột nhưng chưa có API đặt giá trị khi start)
          — đã ghi vào "field còn thiếu". Phạm vi chi tiết ghi ở bước nộp kết quả từng bước sau khi khởi động.</div>`;
    } else if (S.step === 4) {
      body.innerHTML = `
        <p class="muted" style="font-size:12px">Giao người thực hiện (danh sách nhân sự thật đang làm việc) — người được gán sẽ nhận thông báo + quy trình chuyển "Đã giao".</p>
        ${ns.length ? `<div class="wf-ns-list">${ns.map((n) => `
          <label><input type="checkbox" class="wf-ns-ck" value="${n.id}" ${S.nhan_su_ids.includes(n.id) ? "checked" : ""}>
            ${esc(n.ho_ten)} <span class="muted">(${esc(n.loai)})</span></label>`).join("")}</div>`
          : `<div class="empty">Không tải được danh sách nhân sự (vai trò không có quyền xem) — có thể bỏ qua, gán sau bằng nút "Gán lại" trong quy trình.</div>`}
        <div class="f" style="margin-top:10px"><label>Vai trò trong việc</label>
          <input class="field" id="wf-vaitro" value="${esc(S.vai_tro)}"></div>`;
      body.querySelectorAll(".wf-ns-ck").forEach((c) => c.addEventListener("change", () => {
        S.nhan_su_ids = Array.from(body.querySelectorAll(".wf-ns-ck:checked")).map((x) => Number(x.value));
      }));
      const vt = $("#wf-vaitro", body); if (vt) vt.oninput = (e) => { S.vai_tro = e.target.value; };
    } else if (S.step === 5) {
      const x = tplCur();
      const steps = (x && x.steps) || [];
      const anyHs = steps.some((s) => (s.ho_so_goi_y || "").trim());
      body.innerHTML = `
        <p class="muted" style="font-size:12px">Checklist hồ sơ TỰ SINH từ template (cột <code>ho_so_goi_y</code>, bộ mã CT-00→09) — không chế riêng từng công trình.</p>
        ${anyHs ? `<div class="wf-checklist">${steps.map((s) => `
          <div class="wf-ck-step"><b>${s.thu_tu}. ${esc(s.ten_buoc)} <span class="muted">(${esc(s.role_owner || "—")})</span></b>
            ${(s.ho_so_goi_y || "").trim()
              ? `<div class="wf-ck-codes">${s.ho_so_goi_y.split(",").map((c) => `<span>${esc(c.trim())}</span>`).join("")}</div>`
              : `<span class="muted" style="font-size:11px">Không yêu cầu hồ sơ ở bước này.</span>`}</div>`).join("")}</div>`
          : `<div class="empty">Template ${esc(x ? x.ten : "")} là quy trình NHẸ — không yêu cầu bộ hồ sơ nào. ✓</div>`}`;
    } else {
      const x = tplCur();
      const steps = (x && x.steps) || [];
      const hsSet = new Set();
      steps.forEach((s) => (s.ho_so_goi_y || "").split(",").forEach((c) => { if (c.trim()) hsSet.add(c.trim()); }));
      body.innerHTML = `
        <p class="muted" style="font-size:12px">Kiểm tra lần cuối — bấm "Khởi động quy trình" sẽ ghi thật (có audit).</p>
        ${formGrid([
          ["Quy trình", x ? x.ten : "—"],
          ["Gắn vào", [S.customer_id && "Khách #" + S.customer_id, S.project_id && "Công trình #" + S.project_id,
            S.cong_viec_id && "Việc #" + S.cong_viec_id].filter(Boolean).join(" · ") || "—"],
          ["Số bước quy trình", String(steps.length)],
          ["Hồ sơ cần chuẩn bị", hsSet.size ? hsSet.size + " mã (CT-xx)" : "Không yêu cầu"],
          ["Người được gán (sẽ nhận thông báo)", S.nhan_su_ids.length ? S.nhan_su_ids.length + " người" : "Chưa gán — gán sau được"],
          ["Vật tư dự kiến", "—"],
        ], 2)}
        <p class="muted" style="font-size:11px">"Vật tư dự kiến" chưa có nguồn dữ liệu lúc khởi động — hiển thị "—".</p>`;
    }
  };
  $("#wf-prev", w).onclick = () => { if (S.step > 1) { S.step--; draw(); } };
  $("#wf-next", w).onclick = async () => {
    const t = tplCur();
    if (S.step === 1) {
      if (!S.customer_id && !S.project_id && !S.cong_viec_id) { err("Cần gắn ít nhất khách hàng / công trình / công việc."); return; }
    }
    if (S.step === 2 && !t) { err("Chọn quy trình."); return; }
    if (S.step < 6) {
      // quy trình nặng: chặn sớm từ bước 2 nếu thiếu công trình (server cũng chặn 400)
      if (S.step === 2 && t && t.can_project && !S.project_id) { err("Quy trình NẶNG bắt buộc Project ID — quay lại bước 1 điền."); return; }
      S.step++; draw(); return;
    }
    // Bước 6 → POST workflow_start
    const btn = $("#wf-next", w); btn.disabled = true; btn.textContent = "Đang khởi động…";
    try {
      const bodyReq = { template_id: Number(S.tplId) };
      if (S.customer_id) bodyReq.customer_id = Number(S.customer_id);
      if (S.project_id) bodyReq.project_id = Number(S.project_id);
      if (S.cong_viec_id) bodyReq.cong_viec_id = Number(S.cong_viec_id);
      if (S.nhan_su_ids.length) { bodyReq.nhan_su_ids = S.nhan_su_ids; bodyReq.vai_tro = S.vai_tro; }
      const r = await apiPost("write/workflow_start", bodyReq);
      closeModal(); toast("Đã khởi động quy trình " + r.template_ma + " (có audit).");
      wfInstanceModal(r.instance_id);
    } catch (e) {
      err(e.message || "Lỗi khởi động."); btn.disabled = false; btn.textContent = "✔ Khởi động quy trình";
    }
  };
  draw();
}

/* ---- Chi tiết 1 lần chạy (resume đích đến) — mọi state từ server ---- */
async function wfInstanceModal(iid) {
  let d;
  try { d = await apiGet("workflow_instance", { id: iid }); }
  catch (e) { toast(e.message || "Không mở được quy trình.", false); return; }
  const i = d.instance;
  // text thuần — formGrid tự esc() 1 lần, không nhét HTML vào đây (tránh double-escape)
  const gan = (d.assignments || []).map((a) => a.ho_ten + (a.vai_tro_trong_viec ? ` (${a.vai_tro_trong_viec})` : "")).join(", ");
  const stepRows = d.steps.map((s) => {
    const acts = [];
    // 1 hành động chính mỗi bước theo state (spec §7); server luôn re-check quyền/anti-skip
    if (WF_STEP_SUBMITABLE.has(s.canonical_state)) {
      acts.push(`<button class="btn primary btn-sm wf-act" data-a="submit" data-sid="${s.id}">▶ Nộp kết quả</button>`);
    } else if (s.canonical_state === "CHO_KTT_XAC_NHAN" && wfCanDuyet()) {
      acts.push(`<button class="btn primary btn-sm wf-act" data-a="approve_ktt" data-sid="${s.id}">✔ KTT xác nhận</button>`);
      acts.push(`<button class="btn ghost btn-sm wf-act" data-a="reject" data-sid="${s.id}">Yêu cầu bổ sung</button>`);
    } else if (s.canonical_state === "CHO_GD_DUYET" && wfIsGd()) {
      acts.push(`<button class="btn primary btn-sm wf-act" data-a="approve_gd" data-sid="${s.id}">✔ GĐ duyệt</button>`);
      acts.push(`<button class="btn ghost btn-sm wf-act" data-a="reject" data-sid="${s.id}">Yêu cầu bổ sung</button>`);
    } else if (["DA_XAC_NHAN", "DA_DUYET", "CHO_HO_SO_NGHIEM_THU"].includes(s.canonical_state)
               && !(s.canonical_state === "DA_XAC_NHAN" && s.bat_buoc_duyet)) {
      acts.push(`<button class="btn ghost btn-sm wf-act" data-a="complete" data-sid="${s.id}">Đóng bước</button>`);
    }
    if (wfCanDuyet() && !["HOAN_THANH", "DONG"].includes(s.canonical_state)) {
      acts.push(`<button class="btn ghost btn-sm wf-act" data-a="reassign" data-sid="${s.id}">Gán lại</button>`);
    }
    const hs = (s.ho_so_goi_y || "").trim()
      ? `<div class="wf-ck-codes" style="margin-top:3px">${s.ho_so_goi_y.split(",").map((c) => `<span>${esc(c.trim())}</span>`).join("")}</div>` : "";
    return [String(s.thu_tu), `<b>${esc(s.ten_buoc)}</b>${hs}${s.ket_qua ? `<div class="muted" style="font-size:11px">KQ: ${esc(s.ket_qua)}</div>` : ""}`,
      esc(s.ten_owner || s.role_owner || "—"), wfStateChip(s.canonical_state),
      s.deadline ? esc(fmtDate(s.deadline)) : "—",
      `<div class="toolbar" style="margin:0;gap:4px">${acts.join("")}</div>`];
  });
  const w = openModal(`Quy trình: ${i.template_ten}`,
    `<div class="f wide">
      ${formGrid([
        ["Trạng thái", WF_STATE_LABEL[i.canonical_state] || i.canonical_state, true],
        ["Gắn vào", [i.customer_name, i.project_name && (i.project_code + " · " + i.project_name)].filter(Boolean).join(" — ") || "—"],
        ["Người tham gia", gan || "Chưa gán"],
      ], 1)}
      <div style="margin-top:12px">${table(["#", "Bước", "Phụ trách", "Trạng thái", "Hạn", ""], stepRows)}</div>
      <div class="toolbar" style="margin-top:10px">
        ${i.canonical_state !== "DONG" ? `<button class="btn ghost danger btn-sm" id="wf-cancel">🗑 Hủy quy trình</button>` : ""}
        <span class="muted" style="font-size:11px">Mọi thao tác đều re-check quyền + đi đúng luồng ở server (anti-skip); sai luồng sẽ báo lỗi 400.</span>
      </div></div>`,
    async () => closeModal(), "Đóng");
  w.querySelector(".modal").classList.add("xl");
  const redo = () => { closeModal(); wfInstanceModal(iid); };
  w.querySelectorAll(".wf-act").forEach((b) => b.addEventListener("click", async () => {
    const sid = Number(b.dataset.sid), a = b.dataset.a;
    try {
      if (a === "submit") {
        const kq = prompt("Kết quả bước này (mô tả ngắn):");
        if (kq === null) return;
        await apiPost("write/workflow_step_submit", { step_instance_id: sid, ket_qua: kq.trim() });
        toast("Đã nộp — chờ KTT xác nhận.");
      } else if (a === "approve_ktt") {
        await apiPost("write/workflow_step_approve", { step_instance_id: sid, cap: "ktt" });
        toast("Đã xác nhận (cấp KTT).");
      } else if (a === "approve_gd") {
        await apiPost("write/workflow_step_approve", { step_instance_id: sid, cap: "gd" });
        toast("Đã duyệt (cấp Giám đốc).");
      } else if (a === "reject") {
        const ly = prompt("Lý do yêu cầu bổ sung (bắt buộc):");
        if (!ly || !ly.trim()) { toast("Phải ghi lý do.", false); return; }
        await apiPost("write/workflow_step_reject", { step_instance_id: sid, ly_do: ly.trim() });
        toast("Đã trả về Cần bổ sung — người làm bước sẽ nhận thông báo.");
      } else if (a === "complete") {
        await apiPost("write/workflow_step_complete", { step_instance_id: sid });
        toast("Đã đóng bước.");
      } else if (a === "reassign") {
        const ns = await nsOptions().catch(() => []);
        if (!ns.length) { toast("Không tải được danh sách nhân sự.", false); return; }
        closeModal();
        openModal("Gán lại bước cho nhân sự khác",
          `<div class="f wide"><label>Nhân sự</label><select name="nhan_su_id">${ns.map((n) =>
            `<option value="${n.id}">${esc(n.ho_ten)} (${esc(n.loai)})</option>`).join("")}</select></div>`,
          async (fd) => {
            await apiPost("write/workflow_reassign", { step_instance_id: sid, nhan_su_id: Number(fd.get("nhan_su_id")) });
            closeModal(); toast("Đã gán lại — người mới nhận thông báo."); wfInstanceModal(iid);
          }, "Gán");
        return;
      }
      redo();
    } catch (e) { toast(e.message || "Lỗi", false); }
  }));
  const cancelBtn = $("#wf-cancel", w);
  if (cancelBtn) cancelBtn.onclick = async () => {
    const ly = prompt("Lý do hủy quy trình:") || "";
    if (!confirm("Hủy toàn bộ quy trình này? (có audit)")) return;
    try {
      await apiPost("write/workflow_cancel", { instance_id: iid, ly_do: ly });
      closeModal(); toast("Đã hủy quy trình.");
    } catch (e) { toast(e.message || "Lỗi", false); }
  };
}

/* ---- "VIỆC CẦN TÔI XỬ LÝ" trên Dashboard + polling (spec §11/§12) ---- */
let WF_NEED_TIMER = null;
function wfStopNeedPoll() { if (WF_NEED_TIMER) { clearInterval(WF_NEED_TIMER); WF_NEED_TIMER = null; } }
window.addEventListener("hashchange", () => {
  if ((location.hash || "#").replace("#", "").split("?")[0] !== "dashboard") wfStopNeedPoll();
});
function wfNeedBoxHtml(ctx) {
  const pend = ctx.pending_approvals || [];
  const notif = ctx.notifications || [];
  if (!pend.length && !notif.length) {
    return `<div class="empty">✅ Không có việc nào chờ bạn xử lý.</div>`;
  }
  const pendHtml = pend.slice(0, 10).map((p) => `
    <div class="wf-need-row">
      <span><b>${esc(p.ten_buoc)}</b> ${wfStateChip(p.canonical_state)}
        <span class="muted">· ${esc(p.template_ten)} · ${esc(p.project_name || p.customer_name || "")}</span></span>
      <span class="toolbar">
        <button class="btn primary btn-sm wf-need-duyet" data-sid="${p.step_instance_id}" data-st="${esc(p.canonical_state)}">Duyệt</button>
        <button class="btn ghost btn-sm wf-need-reject" data-sid="${p.step_instance_id}">Y/c bổ sung</button>
        <button class="btn ghost btn-sm wf-need-open" data-iid="${p.instance_id}">Mở</button>
      </span></div>`).join("");
  const notifHtml = notif.slice(0, 10).map((n) => `
    <div class="wf-need-row">
      <span>🔔 ${esc(n.noi_dung || n.loai)}<span class="muted"> · ${esc(fmtDateTime(n.created_at))}</span></span>
      <span class="toolbar">${n.instance_id ? `<button class="btn ghost btn-sm wf-need-open" data-iid="${n.instance_id}" data-nid="${n.id}">${esc(n.hanh_dong_goi_y || "Tiếp tục")}</button>` : ""}
        <button class="btn ghost btn-sm wf-notif-snooze" data-nid="${n.id}">Nhắc sau 30p</button>
        <button class="btn ghost btn-sm wf-notif-resolve" data-nid="${n.id}">Đã xử lý</button></span>
    </div>`).join("");
  return pendHtml + notifHtml;
}
function wfWireNeedBox(box) {
  box.querySelectorAll(".wf-need-open").forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.nid) await apiPost("write/workflow_notification_state", {
      notification_id: Number(b.dataset.nid), action: "read" }).catch(() => {});
    wfInstanceModal(Number(b.dataset.iid));
  }));
  box.querySelectorAll(".wf-notif-snooze").forEach((b) => b.addEventListener("click", async () => {
    try { await apiPost("write/workflow_notification_state", {
      notification_id: Number(b.dataset.nid), action: "snooze", minutes: 30 });
      toast("Đã tạm ẩn thông báo 30 phút."); wfRefreshNeedBox();
    } catch (e) { toast(e.message || "Lỗi", false); }
  }));
  box.querySelectorAll(".wf-notif-resolve").forEach((b) => b.addEventListener("click", async () => {
    try { await apiPost("write/workflow_notification_state", {
      notification_id: Number(b.dataset.nid), action: "resolve" });
      toast("Đã đánh dấu thông báo đã xử lý."); wfRefreshNeedBox();
    } catch (e) { toast(e.message || "Lỗi", false); }
  }));
  box.querySelectorAll(".wf-need-duyet").forEach((b) => b.addEventListener("click", async () => {
    const cap = b.dataset.st === "CHO_GD_DUYET" ? "gd" : "ktt";
    try {
      await apiPost("write/workflow_step_approve", { step_instance_id: Number(b.dataset.sid), cap });
      toast("Đã duyệt."); wfRefreshNeedBox();
    } catch (e) { toast(e.message || "Lỗi", false); }
  }));
  box.querySelectorAll(".wf-need-reject").forEach((b) => b.addEventListener("click", async () => {
    const ly = prompt("Lý do yêu cầu bổ sung (bắt buộc):");
    if (!ly || !ly.trim()) return;
    try {
      await apiPost("write/workflow_step_reject", { step_instance_id: Number(b.dataset.sid), ly_do: ly.trim() });
      toast("Đã trả về Cần bổ sung."); wfRefreshNeedBox();
    } catch (e) { toast(e.message || "Lỗi", false); }
  }));
}
async function wfRefreshNeedBox() {
  const box = document.querySelector("#wf-need-body");
  if (!box || !box.isConnected) { wfStopNeedPoll(); return; }
  try {
    const ctx = await apiGet("work_start_context");
    box.innerHTML = wfNeedBoxHtml(ctx);
    wfWireNeedBox(box);
    const n = (ctx.pending_approvals || []).length + (ctx.notifications || []).length;
    const cnt = document.querySelector("#wf-need-count");
    if (cnt) cnt.textContent = n ? String(n) : "";
  } catch (e) { /* role không có workflow — bỏ qua */ }
}

function kttProjectShortcuts(rows, emptyText) {
  if (!(rows || []).length) return `<div class="empty">${esc(emptyText)}</div>`;
  return `<div class="ktt-shortcuts">${rows.map((r) => {
    const tabLabel = (CT_TABS.find((t) => t[0] === r.last_tab) || [])[1]
      || r.last_tab || r.status || "Tổng quan";
    return `<button type="button" class="ktt-project-link" data-route="${esc(r.route || (`#cong_trinh?project_id=${r.project_id}`))}">
      <b>${esc(r.code)}</b><span>${esc(r.project_name)}</span>
      <small>${esc(tabLabel)}</small>
    </button>`;
  }).join("")}</div>`;
}

function kttWorkRows(items) {
  if (!(items || []).length) return `<div class="empty">✅ Không có việc chờ xử lý.</div>`;
  return items.map((r) => `<div class="ktt-work-row">
    <span><b>${esc(r.title || "Việc cần xử lý")}</b>
      <small>${esc([r.project_code, r.subtitle].filter(Boolean).join(" · "))}</small></span>
    <span class="toolbar"><span class="chip ${r.kind === "tien_do" || r.kind === "co_cq" ? "warn" : "info"}">${esc(r.status || r.kind)}</span>
      <button type="button" class="btn primary btn-sm ktt-work-open" data-route="${esc(r.route || "")}" data-iid="${r.workflow_instance_id || ""}">${esc(r.cta || "Mở")}</button></span>
  </div>`).join("");
}

function wireKttOperations(el) {
  el.querySelectorAll(".ktt-project-link").forEach((b) => b.onclick = () => { location.hash = b.dataset.route; });
  el.querySelectorAll(".ktt-work-open").forEach((b) => b.onclick = () => {
    if (b.dataset.iid) return wfInstanceModal(Number(b.dataset.iid));
    if (b.dataset.route) location.hash = b.dataset.route;
  });
}

async function renderKttDashboard(el) {
  const d = await apiGet("dashboard");
  if (d.projection !== "ktt_operations") throw new Error("Projection Dashboard KTT không hợp lệ.");
  const m = d.metrics || {};
  el.innerHTML = `
    ${metrics([
      ["Nhật ký chờ xác nhận", String(m.nhat_ky_cho_xac_nhan || 0), "mở đúng nhật ký", m.nhat_ky_cho_xac_nhan ? "warn" : "ok", "doc"],
      ["Công trình trễ", String(m.cong_trinh_tre || 0), "cảnh báo tiến độ", m.cong_trinh_tre ? "danger" : "ok", "alert"],
      ["Hồ sơ còn thiếu", String(m.ho_so_con_thieu || 0), "mã bắt buộc", m.ho_so_con_thieu ? "warn" : "ok", "folder"],
      ["Vật tư / CO-CQ", String(m.vat_tu_co_cq_can_xu_ly || 0), "cần đối chiếu", m.vat_tu_co_cq_can_xu_ly ? "warn" : "ok", "db"],
      ["Việc cần giao", String(m.ktv_va_viec_can_giao || 0), "KTV chưa được gán", m.ktv_va_viec_can_giao ? "warn" : "ok", "people"],
      ["Tổng việc cần xử lý", String(m.cong_viec_can_xu_ly || 0), "theo quyền KTT", "info", "board"],
    ])}
    <div class="ktt-dash-grid">
      ${panel("🎯 Việc cần tôi xử lý", kttWorkRows(d.work_items || []), `<button class="btn ghost btn-sm" id="ktt-all-work">Xem Việc của tôi</button>`)}
      <div class="grid" style="gap:14px">
        ${panel("★ Công trình đã ghim", kttProjectShortcuts(d.favorites, "Chưa ghim công trình nào."))}
        ${panel("Gần đây", kttProjectShortcuts(d.recent, "Chưa có lịch sử mở công trình."))}
      </div>
    </div>
    ${panel("Cảnh báo kỹ thuật & tiến độ", kttWorkRows(d.technical_progress_warnings || []))}`;
  wireKttOperations(el);
  const all = $("#ktt-all-work", el); if (all) all.onclick = () => { location.hash = "#viec_cua_toi"; };
}

async function renderKtvDashboard(el) {
  const d = await apiGet("dashboard");
  if (d.projection !== "ktv_operations") throw new Error("Projection Dashboard KTV không hợp lệ.");
  const m = d.metrics || {};
  const pageNote = $("#page-note");
  if (pageNote) pageNote.textContent = "Công việc hiện trường, nhật ký và công trình được giao. Không hiển thị dữ liệu tài chính.";
  el.innerHTML = `
    ${metrics([
      ["Việc hôm nay", String(m.viec_hom_nay || 0), "theo lịch được giao", m.viec_hom_nay ? "info" : "ok", "cal"],
      ["Việc đang làm", String(m.viec_dang_lam || 0), "chưa hoàn thành", m.viec_dang_lam ? "info" : "ok", "wrench"],
      ["Nhật ký nháp", String(m.nhat_ky_nhap || 0), "tiếp tục trên thiết bị", m.nhat_ky_nhap ? "warn" : "ok", "doc"],
      ["Cần bổ sung", String(m.can_bo_sung || 0), "KTT đã trả lại", m.can_bo_sung ? "danger" : "ok", "alert"],
      ["Công trình được giao", String(m.cong_trinh_duoc_giao || 0), "backend đã lọc phạm vi", "info", "company"],
    ])}
    <div class="ktt-dash-grid">
      ${panel("Việc cần tôi xử lý", kttWorkRows(d.work_items || []),
        `<button class="btn primary btn-sm" id="ktv-today">Đến Việc hôm nay</button>`)}
      <div class="grid" style="gap:14px">
        ${panel("★ Công trình đã ghim", kttProjectShortcuts(d.favorites, "Chưa ghim công trình nào."))}
        ${panel("Gần đây", kttProjectShortcuts(d.recent, "Chưa có lịch sử mở công trình."))}
      </div>
    </div>
    ${panel("Công trình của tôi", kttProjectShortcuts(d.projects || [], "Chưa được gán công trình."))}`;
  wireKttOperations(el);
  const today = $("#ktv-today", el); if (today) today.onclick = () => { location.hash = "#viec_hom_nay"; };
}

RENDER.viec_cua_toi = async function (el) {
  const d = await apiGet("my_work_queue");
  el.innerHTML = `${panel(`Việc của tôi (${d.count || 0})`, kttWorkRows(d.items || []),
    `<button class="btn primary btn-sm" id="my-start-work">＋ Bắt đầu công việc</button>`)}`;
  wireKttOperations(el);
  const start = $("#my-start-work", el); if (start) start.onclick = startWorkDrawer;
  const iid = Number((window.ROUTE_Q || {}).workflow_instance_id);
  if (iid) setTimeout(() => wfInstanceModal(iid), 0);
};

const _dash35 = RENDER.dashboard;
let ADMIN_HEALTH_TIMER = null;
async function renderAdminHealthPanel(root) {
  if (ADMIN_HEALTH_TIMER) { clearTimeout(ADMIN_HEALTH_TIMER); ADMIN_HEALTH_TIMER = null; }
  const slot = $("#admin-health-slot", root); if (!slot) return;
  let health;
  try { health = await apiGet("admin_system_health"); }
  catch (e) { slot.innerHTML = panel("System Health", `<div class="empty">Không tải được: ${esc(e.message || "")}</div>`); return; }
  const active = health.active_run;
  const suites = health.suites || [];
  slot.innerHTML = panel("System Health · smoke test cô lập", `
    <div class="health-contract">
      <span class="chip ${health.database.quick_check === "ok" ? "ok" : "danger"}">DB ${esc(health.database.quick_check)}</span>
      <span class="chip ${health.database.foreign_key_violations ? "danger" : "ok"}">FK ${health.database.foreign_key_violations}</span>
      <span class="chip info">Allowlist</span><span class="chip info">Fixture DB riêng</span>
      <span class="chip ok">Không arbitrary shell</span>
    </div>
    ${active ? `<div class="smoke-progress" role="status"><b>Run #${active.id} · ${esc(active.status)}</b>
      <progress max="${active.total_suites || 1}" value="${active.completed_suites || 0}"></progress>
      <span>${active.completed_suites}/${active.total_suites} module · ${active.passed_suites} pass · ${active.failed_suites} fail</span></div>` : ""}
    <div class="smoke-grid">${suites.map((s) => {
      const latest = s.latest;
      const cls = !latest ? "neutral" : latest.status === "Passed" ? "ok" : "danger";
      return `<label class="smoke-suite ${cls}"><input type="checkbox" class="smoke-suite-check" value="${esc(s.id)}" ${active ? "disabled" : "checked"}>
        <span><b>${esc(s.name)}</b><small>${esc(s.description)}</small></span>
        <span class="chip ${cls}">${latest ? esc(latest.status) : "Chưa chạy"}</span></label>`;
    }).join("")}</div>
    <div class="toolbar"><button class="btn primary" id="admin-smoke-run" ${active ? "disabled" : ""}>Chạy smoke test đã chọn</button>
      <button class="btn ghost" id="admin-smoke-all" ${active ? "disabled" : ""}>Chọn/bỏ tất cả</button>
      <span class="muted">Mỗi suite chỉ nhận ID cố định; output được lưu cùng SHA-256.</span></div>
    ${panel("Lịch sử smoke run", table(["Run", "Trạng thái", "Tiến độ", "Người chạy", "Bắt đầu", "Evidence"],
      (health.runs || []).map((r) => [`#${r.id}`, chip(r.status), `${r.completed_suites}/${r.total_suites} · ${r.passed_suites} pass · ${r.failed_suites} fail`,
        esc(r.initiated_by), fmtDate(r.started_at || r.created_at), r.evidence_sha256 ? `<code title="${esc(r.evidence_sha256)}">${esc(r.evidence_sha256.slice(0, 12))}…</code>` : "—"]),
      { empty: "Chưa có smoke run." }))}`);
  const allButton = $("#admin-smoke-all", slot);
  if (allButton) allButton.onclick = () => {
    const checks = Array.from(slot.querySelectorAll(".smoke-suite-check"));
    const next = checks.some((c) => !c.checked); checks.forEach((c) => { c.checked = next; });
  };
  const runButton = $("#admin-smoke-run", slot);
  if (runButton) runButton.onclick = async () => {
    const ids = Array.from(slot.querySelectorAll(".smoke-suite-check:checked")).map((c) => c.value);
    if (!ids.length) { toast("Chọn ít nhất một module.", false); return; }
    if (!confirm(`Chạy ${ids.length} suite allowlist trên fixture DB cô lập?`)) return;
    await apiPost("write/admin_smoke_start", { suite_ids: ids });
    toast("Đã khởi động smoke run."); await renderAdminHealthPanel(root);
  };
  if (active) ADMIN_HEALTH_TIMER = setTimeout(() => {
    if (ME && ME.role === "Quan tri he thong" && location.hash.startsWith("#dashboard"))
      renderAdminHealthPanel(root);
  }, 1800);
}

RENDER.dashboard = async function (el) {
  if (ME && ME.role === "Ky thuat truong") return renderKttDashboard(el);
  if (ME && ME.role === "Ky thuat vien") return renderKtvDashboard(el);
  await _dash35(el);
  if (ME && ME.role === "Quan tri he thong") {
    el.insertAdjacentHTML("afterbegin", `<div id="admin-health-slot"><div class="loading">Đang tải System Health…</div></div>`);
    await renderAdminHealthPanel(el);
  }
  wfStopNeedPoll();
  const slot = $("#dash-prio", el);
  const html = `<section class="panel prio"><div class="panel-head">
      <h2 class="panel-title">🎯 VIỆC CẦN TÔI XỬ LÝ <b class="prio-count" id="wf-need-count"></b></h2></div>
      <div class="panel-body" id="wf-need-body"><div class="loading">Đang tải…</div></div></section>`;
  if (slot) slot.insertAdjacentHTML("afterbegin", html);
  else el.insertAdjacentHTML("afterbegin", html);
  await wfRefreshNeedBox();
  WF_NEED_TIMER = setInterval(wfRefreshNeedBox, 45000); // polling 30-60s (spec §12)
  // WO-38: nút "＋ Bắt đầu công việc" đã có SẴN trên header toàn hệ thống (mountStartWork) —
  // KHÔNG inject thêm ở Dashboard/Board (tránh 2 nút trùng như bug đã thấy).
};

/* ==== WO-38 (3.1): trang "Việc hôm nay" (KTV/CTV) — viec_hom_nay_cua_toi lọc theo
   nhan_su của session ở backend. Account chưa gắn nhan_su → empty-state rõ ràng. ==== */
RENDER.viec_hom_nay = async function (el) {
  const d = await apiGet("viec_hom_nay_cua_toi");
  const ns = d.nhan_su;
  const m = d.metrics || {};
  if (!ns) {
    el.innerHTML = `
      ${metrics([["Việc hôm nay", "—", "", "info", "cal"], ["Đã check-in", "—", "", "ok", "clock"],
        ["Chờ xác nhận HT", "—", "", "warn", "alert"], ["Vật tư cần mang", "—", "", "purple", "db"]])}
      ${panel("Việc hôm nay của tôi", `<div class="empty">🔗 Tài khoản <b>${esc(ME.username || ME.role)}</b> chưa được liên kết hồ sơ nhân sự —
        liên hệ Quản trị để gắn tài khoản vào một nhân sự (nhan_su.app_user_id) thì mới thấy việc được giao.<br>
        <span class="muted">Đây là thiết lập dữ liệu, không phải lỗi. Hiện chỉ tài khoản đã gắn nhân sự mới có việc.</span></div>`)}`;
    return;
  }
  let filter = "all";
  const rows = d.rows || [];
  const draw = () => {
    let list = rows.slice();
    if (filter === "uu_tien") list = list.filter((r) => /Ưu tiên|uu tien|khan/i.test((r.loai_viec || "") + (r.ghi_chu || "")));
    if (filter === "tuyen") list.sort((a, b) => String(a.gio_hen || "").localeCompare(String(b.gio_hen || "")));
    const jobRows = list.map((r, i) => [
      String(i + 1),
      `<b>${esc(r.loai_viec || "Việc")}</b><br><span class="code">${esc(r.code)}</span>`,
      esc(r.customer_name || "—") + (r.project_name ? `<br><span class="muted" style="font-size:11px">${esc(r.project_name)}</span>` : ""),
      esc(r.dia_diem || r.khu_vuc || "—"),
      esc(r.gio_hen || "—"),
      chip(r.loai_viec),
      r.gio_check_out ? chip("Da xac nhan") : r.da_check_in ? chip("Dang thuc hien") : chip("Chua check-in"),
      !r.da_check_in ? `<button class="btn primary btn-sm vh-checkin" data-id="${r.id}" data-a="check_in">Check-in</button>`
        : !r.gio_check_out ? `<button class="btn ghost btn-sm vh-checkin" data-id="${r.id}" data-a="check_out">Check-out</button>`
        : `<span class="muted">✓ Xong</span>`]);
    const jb = $("#vh-jobs", el);
    if (jb) jb.innerHTML = table(["#", "Công việc", "Công trình / Khách", "Địa điểm", "Giờ", "Loại", "Trạng thái", ""],
      jobRows, { empty: "Không có việc phù hợp bộ lọc." });
    el.querySelectorAll(".vh-checkin").forEach((b) => b.addEventListener("click", async () => {
      try { await apiPost("write/cong_viec_check_in", { id: Number(b.dataset.id), action: b.dataset.a });
        toast(b.dataset.a === "check_in" ? "Đã check-in." : "Đã check-out."); RENDER.viec_hom_nay(el);
      } catch (e) { toast(e.message || "Lỗi", false); }
    }));
  };
  el.innerHTML = `
    ${metrics([
      ["Việc hôm nay", String(m.viec_hom_nay || 0), "tổng việc được giao", "info", "cal"],
      ["Đã check-in", String(m.da_check_in || 0), m.viec_hom_nay ? Math.round((m.da_check_in || 0) * 100 / m.viec_hom_nay) + "%" : "", (m.da_check_in) ? "ok" : "warn", "clock"],
      ["Chờ xác nhận HT", String(m.cho_xac_nhan_ht || 0), "đang chờ KTT duyệt", m.cho_xac_nhan_ht ? "warn" : "ok", "alert"],
      ["Vật tư cần mang", String(m.vat_tu_can_mang || 0), "mặt hàng", "purple", "db"]])}
    <div class="sched-split">
      <section class="panel"><div class="panel-head"><h2 class="panel-title">Danh sách công việc (${rows.length})</h2>
        <div class="toolbar" style="margin:0">
          <button class="btn primary btn-sm vh-f" data-f="all">Tất cả</button>
          <button class="btn ghost btn-sm vh-f" data-f="uu_tien">Ưu tiên</button>
          <button class="btn ghost btn-sm vh-f" data-f="tuyen">Sắp theo giờ</button></div></div>
        <div class="panel-body" id="vh-jobs"></div></section>
      <div class="grid" style="gap:14px">
        ${panel("Ảnh hiện trường", `<div class="empty" style="margin-bottom:8px">Tải ảnh hiện trường gắn vào công trình.</div>
          <button class="btn primary btn-sm" id="vh-anh">📷 Tải ảnh hiện trường</button>`)}
        ${panel("Vật tư mang theo", (d.vat_tu || []).length
          ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${d.vat_tu.map((v) => `<span class="chip neutral">${esc(v)}</span>`).join("")}</div>`
          : `<div class="empty">Không có vật tư ghi kèm việc hôm nay.</div>`)}
      </div>
    </div>`;
  draw();
  el.querySelectorAll(".vh-f").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.f;
    el.querySelectorAll(".vh-f").forEach((x) => x.classList.toggle("primary", x === b));
    el.querySelectorAll(".vh-f").forEach((x) => x.classList.toggle("ghost", x !== b));
    draw();
  }));
  const anhBtn = $("#vh-anh", el);
  if (anhBtn) anhBtn.onclick = () => {
    const pid = rows.find((r) => r.project_id) ? rows.find((r) => r.project_id).project_id : null;
    ctHinhAnhModal(pid, null);
  };
};

/* ==== WO-38 (3.5): Blueprint tổng thể — gần tĩnh, số từ cau_hinh_tong_hop +
   ma trận quyền thật + workflow (vòng khép kín). GĐ/QT. ==== */
RENDER.blueprint = async function (el) {
  const [cfg, wf] = await Promise.all([
    apiGet("cau_hinh_tong_hop").catch(() => null),
    apiGet("workflow_templates").catch(() => null)]);
  const MODULES = [
    ["01", "Điều hành & Company Board", "Board công ty, KPI, phân tích tổng quan"],
    ["02", "Dashboard điều hành", "Tổng quan công trình, tiến độ, công nợ"],
    ["03", "Công trình tổng quan", "Danh sách công trình, chi phí, cảnh báo"],
    ["04", "Nhật ký công trình", "Nhật ký tuần/ngày, phát sinh, ảnh, duyệt KTT"],
    ["05", "Khối lượng theo giai đoạn", "Dự toán vs thực tế, vượt/thiếu, biểu đồ"],
    ["06", "Vật tư thực tế & CO/CQ", "Vật tư, tồn kho, CO/CQ, cảnh báo"],
    ["07", "Lịch giao việc & điểm danh KTV", "Phân công, check-in, năng suất"],
    ["08", "Hoàn công – BQT – thanh toán", "Nghiệm thu, quyết toán, công nợ"],
    ["09", "Cấu hình / Quyền / Admin", "Danh mục, template, phân quyền, audit"]];
  const wfSteps = (wf && wf.rows || []).find((t) => t.ma === "WF-THI-CONG");
  const chain = wfSteps ? wfSteps.steps.map((s) => s.ten_buoc)
    : ["Báo giá", "Tạo công trình", "Kế hoạch", "Giao việc", "Thi công", "Nhật ký", "Vật tư", "Phát sinh", "Nghiệm thu", "Hoàn công & BQT", "Thanh toán", "Bảo hành"];
  // ma trận quyền thật từ cau_hinh_tong_hop.read_permissions
  const roles = (cfg && cfg.roles) || [];
  const permRows = (cfg && cfg.read_permissions || []).slice(0, 12).map((m) =>
    [esc(m.module)].concat(roles.map((r) => m.roles[r]
      ? `<span style="color:var(--ok)">●</span>` : `<span class="muted">○</span>`)));
  el.innerHTML = `
    ${metrics([
      ["Module chính", "9", "bao phủ toàn bộ nghiệp vụ", "info", "board"],
      ["Vai trò", cfg ? String(cfg.tong_vai_tro) : "—", "phân quyền chi tiết", "purple", "people"],
      ["Workflow", cfg && cfg.workflow ? String(cfg.workflow.tong) : "—", (cfg && cfg.workflow ? cfg.workflow.dang_hoat_dong : "") + " đang hoạt động", "ok", "gear"],
      ["Bộ hồ sơ 00-09", cfg && cfg.ct_00_09 ? String(cfg.ct_00_09.tong_mau) : "—", "mã tài liệu chuẩn", "warn", "folder"],
      ["Vòng khép kín", "1", "từ báo giá đến bảo hành", "info", "play"],
      ["Danh mục vật tư", cfg ? "—" : "—", "từ hóa đơn thật", "neutral", "db"]])}
    <div class="grid cols-2" style="margin-top:14px">
      ${panel("Sơ đồ 9 module & phạm vi chức năng", `<div class="quick-grid">${MODULES.map((m) => `
        <div class="quick-card"><b>${esc(m[0])}. ${esc(m[1])}</b><span>${esc(m[2])}</span></div>`).join("")}</div>`)}
      ${panel("Ma trận quyền truy cập theo vai trò", roles.length
        ? table(["Module"].concat(roles.map((r) => r.replace("Ky thuat ", "KT ").replace("Quan tri he thong", "QT"))), permRows)
        : `<div class="empty">Không tải được ma trận quyền (cần Giám đốc/Quản trị).</div>`)}
    </div>
    <div style="margin-top:14px">${panel("Quy trình vòng khép kín (WF-THI-CONG)",
      `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">${chain.map((s, i) =>
        `<span class="chip info">${esc(s)}</span>${i < chain.length - 1 ? '<span class="muted">→</span>' : ""}`).join("")}</div>
       <div class="muted" style="font-size:11px;margin-top:8px">Các bước lấy từ workflow_template WF-THI-CONG (WO35A) — nguồn thật, không hardcode.</div>`)}
    ${cfg && cfg.ct_00_09 ? `<div style="margin-top:14px">${panel("Tài liệu chuẩn 00-09 (" + cfg.ct_00_09.tong_mau + " mã)",
      `<div class="hs-grid">${cfg.ct_00_09.rows.map((r) => `<div class="hs-card"><div class="hs-code">${esc(r.ma_mau)}</div><div class="hs-title">${esc(r.title)}</div></div>`).join("")}</div>`)}</div>` : ""}`;
};

/* ==== 2026-07-10 tham khao FastCon (F4): Tong quan cong ty cho GD — rollup /api/gd_tong_quan
   (tai dung _profit_agg dang dung o tung cong trinh, khong bia nguon moi). Mo rong Bang dieu
   khien theo Cong ty (WO-19/21, tung khach) len toan he thong theo cong trinh. GD/QT. ==== */
RENDER.gd_tong_quan = async function (el) {
  const d = await apiGet("gd_tong_quan");
  const t = d.tong_hop || {};
  const rows = d.du_an || [];
  const projRows = rows.map((r) => [
    `<span class="code">${esc(r.code)}</span>`,
    esc(r.project_name || "—"),
    chip(r.status),
    vnd(r.revenue), vnd(r.total_cost),
    `<span class="money" style="color:${r.gross_profit < 0 ? "var(--danger)" : "var(--ok)"}">${vnd(r.gross_profit)}</span>`,
    r.margin_pct != null ? r.margin_pct + "%" : "—",
    r.vo_cho_duyet ? `<span class="chip warn">${r.vo_cho_duyet} · ${vnd(r.vo_gia_tri_cho_duyet)}</span>` : "—"]);
  const top5Dt = (d.top5_doanh_thu || []).map((r, i) =>
    `<div class="quick-card"><b>#${i + 1} ${esc(r.code)}</b><span>${esc(r.project_name || "—")} — ${vnd(r.revenue)}</span></div>`).join("");
  const top5PsRows = (d.top5_phat_sinh || []).filter((r) => r.vo_gia_tri_cho_duyet > 0);
  const top5Ps = top5PsRows.map((r, i) =>
    `<div class="quick-card"><b>#${i + 1} ${esc(r.code)}</b><span>${esc(r.project_name || "—")} — ${r.vo_cho_duyet} phát sinh chờ duyệt, ${vnd(r.vo_gia_tri_cho_duyet)}</span></div>`).join("");
  el.innerHTML = `
    ${metrics([
      ["Doanh thu toàn hệ thống", vnd(t.revenue), rows.length + " công trình", "info", "money"],
      ["Chi phí thực tế", vnd(t.total_cost), t.data_quality === "thieu_gia_von" ? "một số hóa đơn chưa có giá vốn" : "đầy đủ giá vốn", t.data_quality === "thieu_gia_von" ? "warn" : "ok", "db"],
      ["Lợi nhuận gộp", vnd(t.gross_profit), t.margin_pct != null ? "margin " + t.margin_pct + "%" : "—", t.gross_profit < 0 ? "danger" : "ok", "bank"],
      ["Nợ phải thu", vnd(d.no_phai_thu), "hóa đơn bán ra chưa thu đủ", d.no_phai_thu > 0 ? "warn" : "ok", "alert"]])}
    <div style="margin-top:14px">${panel("Mua vào trong kỳ", `
      <div class="grid cols-2">${miniStat("Tổng giá trị mua vào", vnd(d.mua_vao_tong), "neutral")}${miniStat("Số hóa đơn mua vào", String(d.mua_vao_so_hd || 0), "neutral")}</div>
      <div class="muted" style="font-size:11px;margin-top:6px">⚠ ${esc(d.ghi_chu_mua_vao)}</div>`)}</div>
    <div class="grid cols-2" style="margin-top:14px">
      ${panel("Top 5 công trình doanh thu cao nhất", top5Dt ? `<div class="quick-grid">${top5Dt}</div>` : `<div class="empty">Chưa có dữ liệu.</div>`)}
      ${panel("Top 5 công trình có phát sinh chờ duyệt", top5Ps ? `<div class="quick-grid">${top5Ps}</div>` : `<div class="empty">Không có phát sinh nào đang chờ duyệt.</div>`)}
    </div>
    <div style="margin-top:14px">${panel("Tất cả công trình (" + rows.length + ")",
      table(["Mã", "Tên công trình", "Trạng thái", "Doanh thu", "Chi phí", "Lợi nhuận gộp", "Margin", "Phát sinh chờ duyệt"],
        projRows, { empty: "Chưa có công trình nào." }))}</div>`;
};

/* ==== Kho giá vật tư/NCC: dữ liệu thật, không catalog hardcode =========== */
RENDER.pricing = async function (el) {
  let projectId = new URLSearchParams(location.hash.split("?")[1] || "").get("project_id") || "";
  let activeTab = "warehouse";
  let query = "";
  const financeRole = ["Giam doc", "Ke toan", "Quan tri he thong"].includes(ME && ME.role);
  const decisionRole = ["Giam doc", "Quan tri he thong"].includes(ME && ME.role);
  let data = null;

  const load = async () => {
    data = await apiGet("material_price_workspace", projectId ? { project_id: projectId } : {});
  };
  const projectOptions = () => `<option value="">Tất cả / bảng giá chung</option>${(data.projects || []).map((p) =>
    `<option value="${Number(p.id)}" ${String(p.id) === String(projectId) ? "selected" : ""}>${esc(p.code)} · ${esc(p.project_name)}</option>`).join("")}`;
  const filteredMaterials = () => (data.materials || []).filter((m) => {
    const hay = [m.canonical_name, m.sku, m.brand, m.category].join(" ").toLowerCase();
    return !query || hay.includes(query.toLowerCase());
  });

  const moneyCell = (value) => value == null ? "—" : `<span class="money">${vnd(value)}</span>`;
  const scopeLabel = (value) => ({ SUPPLY_ONLY: "Chỉ cung cấp", SUPPLY_INSTALL: "Cung cấp + lắp đặt",
    LABOR_ONLY: "Chỉ nhân công", TURNKEY: "Trọn gói", MIXED: "Hỗn hợp" }[value] || value || "—");

  function warehouseView() {
    const rows = filteredMaterials().map((m) => [
      `<b>${esc(m.canonical_name)}</b><div class="muted mpw-sub">${esc(m.sku)} · ${esc(m.uom)}</div>`,
      esc(m.category || "—"), esc(m.brand || "—"),
      data.financial_fields_included ? moneyCell(m.current_price) : `<span class="chip neutral">Ẩn theo quyền</span>`,
      data.financial_fields_included ? esc(m.current_supplier || "—") : "—",
      `<b>${Number(m.available_qty || 0).toLocaleString("vi-VN")}</b>`]);
    return panel("Kho vật tư chuẩn hóa", table(
      ["Vật tư / thiết bị", "Danh mục", "Hãng", "Giá hiện hành", "NCC", "Tồn khả dụng"], rows,
      { empty: "Chưa có vật tư chuẩn. Hãy thêm master hoặc import bảng giá NCC." }));
  }

  function comparisonView() {
    if (!data.financial_fields_included) return panel("So sánh NCC", `<div class="empty">Vai trò của bạn chỉ xem số lượng tồn, không xem giá NCC.</div>`);
    const rows = (data.supplier_comparison || []).map((r) => [
      `<input type="checkbox" class="mpw-quote-check" value="${Number(r.batch_id)}" data-supplier="${Number(r.supplier_id)}" data-scope="${esc(r.scope_basis)}">`,
      `<b>${esc(r.canonical_name)}</b><div class="muted mpw-sub">${esc(r.uom)} · ${esc(r.project_code || "Bảng giá chung")}</div>`,
      esc(r.supplier), esc(scopeLabel(r.scope_basis)), moneyCell(r.unit_price), esc(fmtDate(r.period_start)),
      r.comparable ? `<span class="chip ok">Cùng phạm vi</span>` : `<span class="chip warn" title="${esc(r.comparison_warning || "")}">Không so trực tiếp</span>`]);
    return panel("So sánh NCC / nhà thầu theo cùng chủng loại", `
      <div class="mpw-decision-bar"><span>Chỉ xếp cạnh nhau khi cùng vật tư, ĐVT, tiền tệ và phạm vi.</span>
      ${decisionRole ? `<button class="btn primary btn-sm" id="mpw-select-contractor">Chọn nhà thầu</button>` : ""}</div>
      ${table(["Xét", "Vật tư / công trình", "NCC", "Phạm vi chào giá", "Đơn giá", "Kỳ", "Khả năng so sánh"], rows,
        { empty: projectId ? "Chưa có báo giá đã duyệt cho công trình này." : "Chọn một công trình để so sánh nhà thầu." })}`);
  }

  function trendsView() {
    if (!data.financial_fields_included) return panel("Biến động giá", `<div class="empty">Giá và biến động chỉ dành cho Kế toán, Giám đốc và Admin.</div>`);
    const facts = (data.price_facts || []).filter((r) => !query || [r.canonical_name, r.supplier, r.brand].join(" ").toLowerCase().includes(query.toLowerCase()));
    const max = Math.max(1, ...facts.map((r) => Number(r.unit_price || 0)));
    return panel("Biến động giá theo tháng / quý / năm", facts.length ? `<div class="mpw-trend-list">${facts.slice(0, 120).map((r) => `
      <div class="mpw-trend-row"><div><b>${esc(r.canonical_name)}</b><span>${esc(r.supplier)} · ${esc(fmtDate(r.period_start))}</span></div>
      <div class="mpw-bar"><i style="width:${Math.max(2, Number(r.unit_price || 0) * 100 / max)}%"></i></div>
      <strong>${vnd(r.unit_price)}</strong></div>`).join("")}</div>` : `<div class="empty">Chưa có price fact đã duyệt.</div>`);
  }

  function stockView() {
    const rows = filteredMaterials().map((m) => [esc(m.canonical_name),
      Number(m.qty_in || 0).toLocaleString("vi-VN"), Number(m.qty_out || 0).toLocaleString("vi-VN"),
      `<b>${Number(m.available_qty || 0).toLocaleString("vi-VN")}</b>`,
      data.financial_fields_included ? moneyCell(m.inventory_value) : `<span class="chip neutral">Ẩn theo quyền</span>`]);
    return panel("Tồn & đối chiếu hóa đơn đầu ra", `
      <div class="mpw-warning">${Number((data.reconciliation || {}).outbound_invoice_lines_unmapped || 0).toLocaleString("vi-VN")} dòng hóa đơn bán ra chưa map vật tư chuẩn.</div>
      ${table(["Vật tư", "Đã nhập", "Đã xuất", "Tồn khả dụng", "Giá trị tồn"], rows,
        { empty: "Chưa có giao dịch kho đã map vật tư chuẩn." })}`);
  }

  function importsView() {
    if (!data.financial_fields_included) return panel("Import bảng giá NCC", `<div class="empty">Thủ kho không xem hoặc import dữ liệu giá.</div>`);
    const rows = (data.imports || []).map((r) => [
      `<span class="code">${esc(r.code)}</span>`, esc(r.supplier),
      `<b>${esc(r.project_code || "Bảng giá chung")}</b><div class="muted mpw-sub">${esc(r.project_name || "Không gắn công trình")}</div>`,
      esc(r.quote_type === "PROJECT_QUOTE" ? "Báo giá công trình" : "Bảng giá chung"), esc(scopeLabel(r.scope_basis)),
      esc(r.stage), `${Number(r.matched_rows || 0)}/${Number(r.total_rows || 0)}`,
      chip(r.status), `<div class="mpw-actions">${r.status === "Staged" ?
        `<button class="btn ghost btn-sm mpw-map" data-id="${Number(r.id)}">Map dòng</button>` : ""}${r.status === "Staged" && !r.pending_rows && decisionRole ?
        `<button class="btn primary btn-sm mpw-approve" data-id="${Number(r.id)}" data-version="${Number(r.version)}" data-owner="${esc(r.created_by || "")}">Duyệt</button>` : ""}</div>`]);
    return panel("Phiếu import bảng giá NCC", `
      <div class="mpw-decision-bar"><span>Staging không làm thay đổi giá chính thức.</span>
      <div>${financeRole ? `<button class="btn ghost btn-sm" id="mpw-add-supplier">+ Khai báo NCC</button>
      <button class="btn primary btn-sm" id="mpw-import">Import bảng giá NCC</button>` : ""}</div></div>
      ${table(["Phiếu", "NCC", "Công trình", "Loại", "Phạm vi chào giá", "Đợt", "Đã map", "Trạng thái", "Thao tác"], rows,
        { empty: "Chưa có phiếu import." })}`);
  }

  function draw() {
    const materialCount = (data.materials || []).length;
    const supplierCount = (data.suppliers || []).length;
    const pending = (data.imports || []).filter((x) => x.status === "Staged").length;
    const stockValue = (data.materials || []).reduce((sum, x) => sum + Number(x.inventory_value || 0), 0);
    el.innerHTML = `
      <section class="mpw-head"><div><h2>Kho giá vật tư</h2><p>Danh mục chuẩn · giá theo kỳ · NCC → kho → công trình → hóa đơn đầu ra</p></div>
        <div class="mpw-head-actions">${financeRole ? `<button class="btn ghost" id="mpw-add-supplier-top">+ NCC / nhà thầu</button><button class="btn primary" id="mpw-import-top">Import bảng giá NCC</button>` : ""}</div></section>
      ${metrics([["SKU đang theo dõi", String(materialCount), "máy + vật tư", "info", "db"],
        ["NCC có hồ sơ", data.financial_fields_included ? String(supplierCount) : "—", "đủ pháp nhân và MST", "purple", "people"],
        ["Phiếu staging", data.financial_fields_included ? String(pending) : "—", "chưa thành giá chính thức", pending ? "warn" : "ok", "alert"],
        ["Giá trị tồn", data.financial_fields_included ? vnd(stockValue) : "Ẩn theo quyền", "bình quân giá nhập", "neutral", "money"]])}
      <div class="mpw-toolbar"><select id="mpw-project" class="field"><option>Đang tải...</option></select>
        <input id="mpw-search" class="field" placeholder="Tìm vật tư, hãng, SKU..." value="${esc(query)}">
        <span class="chip ${data.financial_fields_included ? "ok" : "neutral"}">${data.financial_fields_included ? "Có quyền xem giá" : "Chỉ xem số lượng"}</span></div>
      <div class="tabs mpw-tabs">${[["warehouse","Kho giá vật tư"],["compare","So sánh NCC"],["trends","Biến động giá"],["stock","Tồn & đối chiếu"],["imports","Import bảng giá NCC"]].map((t) =>
        `<button class="${activeTab === t[0] ? "active" : ""}" data-mpw-tab="${t[0]}">${t[1]}</button>`).join("")}</div>
      <div id="mpw-body">${activeTab === "warehouse" ? warehouseView() : activeTab === "compare" ? comparisonView() : activeTab === "trends" ? trendsView() : activeTab === "stock" ? stockView() : importsView()}</div>`;
    const project = $("#mpw-project", el); project.innerHTML = projectOptions();
    project.onchange = async () => { projectId = project.value; await load(); draw(); };
    $("#mpw-search", el).oninput = (event) => { query = event.target.value.trim(); draw(); };
    el.querySelectorAll("[data-mpw-tab]").forEach((b) => b.onclick = () => { activeTab = b.dataset.mpwTab; draw(); });
    [$("#mpw-add-supplier", el), $("#mpw-add-supplier-top", el)].filter(Boolean).forEach((b) => b.onclick = addSupplier);
    [$("#mpw-import", el), $("#mpw-import-top", el)].filter(Boolean).forEach((b) => b.onclick = importQuote);
    el.querySelectorAll(".mpw-map").forEach((b) => b.onclick = () => mapBatch(Number(b.dataset.id)));
    el.querySelectorAll(".mpw-approve").forEach((b) => b.onclick = () => approveBatch(Number(b.dataset.id), Number(b.dataset.version), b.dataset.owner));
    const select = $("#mpw-select-contractor", el); if (select) select.onclick = selectContractor;
  }

  function addSupplier() {
    openModal("Khai báo NCC / nhà thầu", `<div class="form-grid cols-2">
      ${fI("legal_name", "Tên pháp nhân *", "text", "required maxlength=250")}
      ${fI("tax_code", "Mã số thuế *", "text", "required maxlength=14")}
      ${fI("address", "Địa chỉ *", "text", "required maxlength=500")}
      ${fI("phone", "Số điện thoại *", "tel", "required")}
      ${fI("email", "Email", "email")}${fI("contact_person", "Người liên hệ")}
      ${fS("partner_type", "Loại đối tác", [["MATERIAL_SUPPLIER","Nhà cung cấp vật tư"],["SUBCONTRACTOR","Nhà thầu phụ"],["BOTH","Cả hai"]])}</div>`,
    async (fd) => {
      const preview = await apiPost("write/material_supplier_upsert", { phase: "preview", ...Object.fromEntries(fd.entries()) });
      if (!confirm(`Xác nhận hồ sơ pháp nhân ${preview.supplier.legal_name}\nMST: ${preview.supplier.tax_code}?`)) return;
      await apiPost("write/material_supplier_upsert", { phase: "commit", confirm_token: preview.confirm_token });
      closeModal(); await load(); draw(); toast("Đã lưu hồ sơ NCC và audit.");
    }, "Xem trước & xác nhận");
  }

  function importQuote() {
    if (!(data.suppliers || []).length) { toast("Hãy khai báo đầy đủ NCC trước khi import.", false); return; }
    const suppliers = (data.suppliers || []).map((s) => [String(s.id), `${s.legal_name} · MST ${s.tax_code}`]);
    const projects = [["", "— Bảng giá chung —"]].concat((data.projects || []).map((p) => [String(p.id), `${p.code} · ${p.project_name}`]));
    openModal("Import bảng giá NCC", `<div class="form-grid cols-2">
      ${fS("supplier_id", "NCC / nhà thầu *", suppliers, "required")}${fS("project_id", "Công trình", projects)}
      ${fS("quote_type", "Loại phiếu", [["PROJECT_QUOTE","Báo giá cho công trình"],["PRICE_LIST","Bảng giá chung"]])}
      ${fS("scope_basis", "Phạm vi chào giá", [["SUPPLY_ONLY","Chỉ cung cấp"],["SUPPLY_INSTALL","Cung cấp + lắp đặt"],["LABOR_ONLY","Chỉ nhân công"],["TURNKEY","Trọn gói"],["MIXED","Hỗn hợp"]])}
      ${fI("stage", "Đợt giá *", "text", "required placeholder='Tháng 07/2026'")}${fI("period_start", "Ngày bắt đầu kỳ *", "date", "required")}
      ${fS("tax_basis", "Thuế", [["","Theo từng dòng"],["BEFORE_VAT","Giá chưa VAT"],["INCLUDE_VAT","Giá đã gồm VAT"]])}
      ${fI("file", "File .xls/.xlsx/.csv *", "file", "required accept='.xls,.xlsx,.csv'")}${fT("scope_note", "Ghi chú phạm vi", "Bao gồm/không bao gồm vận chuyển, lắp đặt, bảo hành...")}</div>
      <div class="mpw-warning">Báo giá công trình bắt buộc chọn Công trình. File chỉ được staging; chưa cập nhật giá chính thức.</div>`,
    async (fd) => {
      const file = fd.get("file"); if (!file || !file.name) throw new Error("Chưa chọn file.");
      const project = fd.get("project_id"); const quoteType = fd.get("quote_type");
      if (quoteType === "PROJECT_QUOTE" && !project) throw new Error("Báo giá dự án bắt buộc chọn công trình.");
      const payload = { phase: "preview", supplier_id: Number(fd.get("supplier_id")),
        project_id: project ? Number(project) : null, quote_type: quoteType, scope_basis: fd.get("scope_basis"),
        scope_note: fd.get("scope_note"), stage: fd.get("stage"), period_start: fd.get("period_start"),
        tax_basis: fd.get("tax_basis"), currency: "VND", filename: file.name, file_b64: await fileToB64(file) };
      const preview = await apiPost("write/material_price_import", payload);
      openModal("Xác nhận staging bảng giá", `<div class="mpw-preview-grid">
        <div><span>Tổng dòng giá</span><b>${preview.total_rows}</b></div><div><span>Tự khớp chắc chắn</span><b>${preview.matched_rows}</b></div>
        <div><span>Cần map tay</span><b>${preview.pending_rows}</b></div><div><span>Dòng bỏ qua (0/rỗng)</span><b>${preview.ignored_rows}</b></div></div>
        <div class="mpw-warning">NCC: ${esc((preview.supplier_hints || {}).legal_name || "File không có tên pháp nhân — dùng hồ sơ NCC đã chọn")}. Chỉ xác nhận staging, chưa công bố giá.</div>`,
      async () => { await apiPost("write/material_price_import", { phase: "commit", confirm_token: preview.confirm_token });
        closeModal(); activeTab = "imports"; await load(); draw(); toast("Đã staging bảng giá; cần map và duyệt."); }, "Xác nhận staging");
    }, "Xem trước file");
  }

  function mapBatch(batchId) {
    const lines = (data.batch_lines || []).filter((x) => Number(x.batch_id) === batchId);
    const mats = data.materials || [];
    if (!lines.length) { toast("Không có dòng staging.", false); return; }
    openModal("Map dòng báo giá vào vật tư chuẩn", `<div class="mpw-map-list">${lines.map((line) => `
      <label><span><b>${esc(line.raw_name)}</b><small>${esc(line.raw_brand || "—")} · ${esc(line.raw_specification || "—")} · ${esc(line.raw_uom || "—")} · ${vnd(line.unit_price)}</small>
      <small><input type="checkbox" name="learn_${Number(line.id)}" value="1"> Học keyword chính xác cho NCC này sau khi xác nhận</small></span>
      <select name="map_${Number(line.id)}"><option value="">— Cần chọn vật tư chuẩn —</option>${mats.map((m) =>
        `<option value="${Number(m.material_id)}" ${Number(line.material_id) === Number(m.material_id) ? "selected" : ""}>${esc(m.sku)} · ${esc(m.canonical_name)}</option>`).join("")}</select></label>`).join("")}</div>`,
    async (fd) => {
      const mappings = lines.map((line) => ({ line_id: Number(line.id), material_id: Number(fd.get(`map_${line.id}`) || 0),
        learn_alias: !!fd.get(`learn_${line.id}`) })).filter((x) => x.material_id);
      if (!mappings.length) throw new Error("Chưa chọn mapping nào.");
      const preview = await apiPost("write/material_price_batch_map", { phase: "preview", batch_id: batchId, mappings });
      await apiPost("write/material_price_batch_map", { phase: "commit", confirm_token: preview.confirm_token });
      closeModal(); await load(); draw(); toast("Đã map vật tư chuẩn và lưu các keyword được chọn.");
    }, "Xác nhận mapping");
  }

  async function approveBatch(batchId, version, owner) {
    const acting = ME && ME.role === "Giam doc" && owner === ME.username;
    if (!confirm(`${acting ? "Bạn đang acting accounting và tự duyệt. " : ""}Duyệt sẽ công bố price fact bất biến. Tiếp tục?`)) return;
    const preview = await apiPost("write/material_price_batch_decide", { phase: "preview", batch_id: batchId,
      decision: "approve", expected_version: version, acting_accounting: acting, separation_warning_ack: acting });
    await apiPost("write/material_price_batch_decide", { phase: "commit", confirm_token: preview.confirm_token });
    await load(); draw(); toast("Đã duyệt và công bố lịch sử giá.");
  }

  function selectContractor() {
    if (!projectId) { toast("Hãy chọn một công trình trước.", false); return; }
    const checked = Array.from(el.querySelectorAll(".mpw-quote-check:checked"));
    const batchIds = [...new Set(checked.map((x) => Number(x.value)))];
    if (!batchIds.length) { toast("Chọn ít nhất một báo giá để xét.", false); return; }
    const supplierIds = [...new Set(checked.map((x) => Number(x.dataset.supplier)))];
    const scopes = [...new Set(checked.map((x) => x.dataset.scope))];
    const suppliers = (data.suppliers || []).filter((s) => supplierIds.includes(Number(s.id)));
    openModal("Chọn nhà thầu cho công trình", `<div class="form-grid cols-2">
      ${fS("selected_supplier_id", "Nhà thầu được chọn *", suppliers.map((s) => [String(s.id), s.legal_name]), "required")}
      <div class="f"><label>Báo giá được xét</label><input value="${batchIds.join(", ")}" disabled></div>
      ${fT("decision_reason", "Lý do lựa chọn *", "Không chỉ dựa vào giá: phạm vi, tiến độ, chất lượng, thanh toán...")}
      ${scopes.length > 1 ? `<label class="f wide"><span><input type="checkbox" name="scope_warning_ack" value="1" required> Tôi xác nhận các báo giá khác phạm vi và đã đánh giá phần chênh lệch.</span></label>` : ""}</div>
      <div class="mpw-warning">Hệ thống không tự chọn giá thấp nhất. Quyết định này sẽ được ghi audit.</div>`,
    async (fd) => {
      const preview = await apiPost("write/project_supplier_selection", { phase: "preview", project_id: Number(projectId),
        selected_supplier_id: Number(fd.get("selected_supplier_id")), considered_batch_ids: batchIds,
        decision_reason: fd.get("decision_reason"), scope_warning_ack: !!fd.get("scope_warning_ack") });
      if (!confirm("Xác nhận chọn nhà thầu và ghi audit?")) return;
      await apiPost("write/project_supplier_selection", { phase: "commit", confirm_token: preview.confirm_token });
      closeModal(); await load(); draw(); toast("Đã ghi nhận nhà thầu được chọn cho công trình.");
    }, "Xem trước & xác nhận");
  }

  await load(); draw();
};
