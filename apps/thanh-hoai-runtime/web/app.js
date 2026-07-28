/* ============================================================================
   THANH HOAI ERP — app doc lap (frontend). Port 17 page tu mockup, wire API that.
   Khong framework — vanilla JS. Hash routing, permission-aware sidebar.
   ============================================================================ */
"use strict";

// ---- Dinh nghia 17 page ----
const PAGES = [
  { id: "dashboard",   no: "1",  group: "Điều hành", name: "Dashboard điều hành", sub: "Cảnh báo từ công trình, bảo trì, KTV, công nợ và giá vật tư." },
  { id: "customer",    no: "2",  group: "Vận hành", name: "Khách hàng / Công trình", sub: "Hồ sơ 360°: công trình, chứng từ, công nợ và dòng thời gian." },
  { id: "quotation",   no: "3",  group: "Vận hành", name: "Báo giá", sub: "Chuỗi phiên bản, nhóm dịch vụ, nguồn giá vật tư." },
  { id: "progress",    no: "4",  group: "Vận hành", name: "Tiến độ công trình", sub: "Kanban 6 giai đoạn suy từ dữ liệu thật." },
  { id: "bbnt",        no: "5",  group: "Chứng từ", name: "BBNT — Biên bản nghiệm thu", sub: "Nghiệm thu theo hạng mục, xem trước tờ chứng từ." },
  { id: "bqt",         no: "6",  group: "Chứng từ", name: "BQT — Bảng quyết toán", sub: "So sánh báo giá/thực tế/phát sinh; quyết toán, đã thu, còn phải thu." },
  { id: "payment",     no: "7",  group: "Chứng từ", name: "Thư đề nghị thanh toán", sub: "Đề nghị theo đợt, gắn BQT, mẫu in chuẩn." },
  { id: "dccn",        no: "8",  group: "Công nợ", name: "Đối chiếu công nợ", sub: "Xác nhận công nợ theo kỳ." },
  { id: "receivable",  no: "9",  group: "Công nợ", name: "Theo dõi công nợ", sub: "Hóa đơn còn nợ + nhật ký nhắc nợ." },
  { id: "documents",   no: "10", group: "Hồ sơ", name: "Kho hồ sơ / Tài liệu", sub: "Index hồ sơ, phân loại, bảo mật Nội bộ/Tuyệt mật." },
  { id: "maintenance", no: "11", group: "Bảo trì", name: "Lịch bảo trì / HĐ bảo trì", sub: "Hợp đồng, số máy, mốc đến hạn." },
  { id: "technician",  no: "12", group: "Bảo trì", name: "Công việc KTV", sub: "Kanban hiện trường + lịch tuần." },
  { id: "template",    no: "13", group: "Cấu hình", name: "Template chứng từ", sub: "Cấu hình công ty và 8 mẫu in." },
  { id: "pl",          no: "14", group: "Quản trị nâng cao", name: "Lãi/Lỗ công trình", sub: "Doanh thu, chi phí, margin, hoa hồng (mật)." },
  { id: "tax",         no: "15", group: "Quản trị nâng cao", name: "Thuế / Phí / Chính sách", sub: "Kho chính sách theo hiệu lực." },
  { id: "pricing",     no: "16", group: "Giá vật tư", name: "Giá vật tư", sub: "Import bảng giá NCC, lịch sử giá bất biến." },
  { id: "support",     no: "CS", group: "Tích hợp", name: "CSKH / Tiếp nhận", sub: "Ticket tiếp nhận; Zalo là lớp thông báo (chưa triển khai)." },
];
// WO-19/20: nhan nav 6 muc — "Import & Rà soát" + "Cấu hình" (route va renderer giu nguyen id)
PAGES.find((p) => p.id === "template").name = "Cấu hình & Template";
PAGES.find((p) => p.id === "template").sub = "Thông tin công ty, 8 mẫu in; nhật ký hệ thống mở từ đây.";

let ME = null;

// ---- WO-23 §7: phân quyền GIÁ VỐN / LỢI NHUẬN / TỒN KHO (mirror PERMS backend api.py) ----
// UI ẩn theo role, NHƯNG luôn TIN backend đã strip/403 — field thiếu thì hiện "—", không lỗi.
const COST_ROLES = ["Giam doc", "Ke toan", "Quan tri he thong"];        // giá vốn unit_cost
const PROFIT_ROLES = ["Giam doc", "Quan tri he thong"];                  // margin / lợi nhuận
const STOCK_ROLES = ["Giam doc", "Ke toan", "Thu kho", "Quan tri he thong"]; // tồn kho (Thủ kho chỉ SL)
const STOCK_MONEY_ROLES = ["Giam doc", "Ke toan", "Quan tri he thong"]; // giá trị tiền của tồn
const SELL_PRICE_ROLES = ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"]; // giá bán gợi ý
const canCost = () => !!ME && COST_ROLES.includes(ME.role);
const canProfit = () => !!ME && PROFIT_ROLES.includes(ME.role);
const canStock = () => !!ME && STOCK_ROLES.includes(ME.role);
const canStockMoney = () => !!ME && STOCK_MONEY_ROLES.includes(ME.role);
const canSellPrice = () => !!ME && SELL_PRICE_ROLES.includes(ME.role);
// Badge margin theo skill: <10% đỏ · 10–20% vàng · >20% xanh
function marginBadge(pct) {
  if (pct == null || pct === "" || isNaN(pct)) return `<span class="chip neutral">margin —</span>`;
  const p = Number(pct);
  const kind = p < 10 ? "danger" : p <= 20 ? "warn" : "ok";
  return `<span class="chip ${kind}">margin ${p.toFixed(1)}%</span>`;
}

// ---- Helpers ----
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const vnd = (v) => (Number(v || 0)).toLocaleString("vi-VN") + " đ";

// WO-22: bộ icon SVG nội bộ (stroke=currentColor) — cho nav, KPI, shortcut. Không CDN.
const ICO = {
  board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5"/><rect x="13.5" y="12" width="7.5" height="9" rx="1.5"/><rect x="3" y="15.5" width="7.5" height="5.5" rx="1.5"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 12l3.5-3.5"/><path d="M12 6.5V8M17.5 12H16M8 12H6.5M8.8 8.8l-1-1"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.8 14.6c2.4.2 4.1 1.7 4.7 4.2"/></svg>',
  db: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M4.1 7.4l2.6 1.5M17.3 15.1l2.6 1.5M4.1 16.6l2.6-1.5M17.3 8.9l2.6-1.5"/></svg>',
  company: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21V5.5L12 3v18M12 8.5L20 11v10M4 21h16"/><path d="M7 8h2M7 11.5h2M7 15h2M15 13.5h2M15 17h2"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 7.5v11a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-7l-2-2.5H5.5a2 2 0 0 0-2 2.5z"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.8" y="6" width="18.4" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6.2 9.5h.01M17.8 14.5h.01"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L3.5 16.8a2 2 0 1 0 2.8 2.8l5.4-5.4a4 4 0 0 0 4.9-5.6l-2.6 2.6-2.3-2.3z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3.5h8l4 4V20.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4.5M8.5 12h7M8.5 15.5h7"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5l9.5 16.5H2.5z"/><path d="M12 10v4.5M12 17.5h.01"/></svg>',
  bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9.5L12 4l9 5.5M4.5 10v8M9 10v8M15 10v8M19.5 10v8M3 20.5h18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/></svg>',
};
// icon cho nav chính (trang chưa có icon → hiện số cũ)
const NAV_ICON = { congty: "board", dashboard: "dash", schedule: "cal", nhansu: "people",
  import: "db", template: "gear", technician: "wrench", pricing: "money" };

// ---- Giao dien Sang/Toi: nut 🌓 o chan sidebar, luu localStorage, ap qua data-theme ----
// "system" = theo Windows (khong dat attribute); "dark"/"light" = ep cung qua [data-theme] trong app.css
const THEME_LABEL = { system: "Theo Windows", dark: "Tối", light: "Sáng" };
function themeCur() { try { return localStorage.getItem("th_theme") || "system"; } catch (e) { return "system"; } }
function themeLabel() {
  const b = $("#theme-btn");
  if (b) b.textContent = "🌓 Giao diện: " + (THEME_LABEL[themeCur()] || THEME_LABEL.system);
}
function applyTheme(mode) {
  if (mode === "dark" || mode === "light") document.documentElement.setAttribute("data-theme", mode);
  else document.documentElement.removeAttribute("data-theme");
  themeLabel();
  const navToggle = $("#mobile-nav-toggle");
  const sidebar = $("#app-sidebar");
  if (navToggle && sidebar) {
    const syncNav = (forceClosed = false) => {
      const compact = window.matchMedia("(max-width: 1100px)").matches;
      if (forceClosed || compact) sidebar.classList.remove("mobile-open");
      else sidebar.classList.add("mobile-open");
      navToggle.setAttribute("aria-expanded", String(sidebar.classList.contains("mobile-open")));
    };
    if (navToggle.dataset.mobileNavBound !== "1") {
      navToggle.dataset.mobileNavBound = "1";
      navToggle.addEventListener("click", () => {
        sidebar.classList.toggle("mobile-open");
        navToggle.setAttribute("aria-expanded", String(sidebar.classList.contains("mobile-open")));
      });
      window.addEventListener("resize", () => syncNav(false));
    }
    syncNav(true);
  }
}
applyTheme(themeCur());

async function apiGet(path, params) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const r = await fetch("/api/" + path + qs, { credentials: "same-origin" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "Lỗi"), { status: r.status, data });
  return data;
}
async function apiPost(path, body) {
  const r = await fetch("/api/" + path, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "Lỗi"), { status: r.status, data });
  return data;
}

// ---- Component builders (port tu mockup) ----
// Nhan trang thai luu khong dau trong DB -> hien dung tu nghiep vu co dau (chi hien thi)
const VI_STATUS = {
  "Nhap": "Nháp", "Da gui": "Đã gửi", "Cho khach": "Chờ khách", "Da duyet": "Đã duyệt",
  "Huy": "Hủy", "Tu choi": "Từ chối", "Het hieu luc": "Hết hiệu lực", "Con hieu luc": "Còn hiệu lực",
  "Moi tao": "Mới tạo", "Da giao KTV": "Đã giao KTV", "KTV da nhan": "KTV đã nhận",
  "Dang thuc hien": "Đang thực hiện", "Cho vat tu": "Chờ vật tư", "Hoan thanh": "Hoàn thành",
  "Da nghiem thu": "Đã nghiệm thu", "Cho khach ky": "Chờ khách ký", "Cho ky": "Chờ ký",
  "Dang lam": "Đang làm", "Nghi": "Nghỉ", "Lap dat": "Lắp đặt", "Bao tri": "Bảo trì",
  "Sua chua": "Sửa chữa", "Khao sat": "Khảo sát", "Sap het han": "Sắp hết hạn",
  "Cho duyet": "Chờ duyệt", "Da thu du": "Đã thu đủ", "Cho thanh toan": "Chờ thanh toán",
  "Da TT ngoai": "Đã TT (ngoài)",
  "Da xac nhan": "Đã xác nhận", "Cho xac nhan": "Chờ xác nhận", "Tho": "Thợ",
  // nhan metric/kanban tu API (hien thi co dau, gia tri gui server giu nguyen)
  "Viec hom nay": "Việc hôm nay", "tuan nay": "tuần này",
  "Tong cong no": "Tổng công nợ", "Qua han": "Quá hạn", "Lan nhac gan nhat": "Lần nhắc gần nhất",
  "Cam ket thu": "Cam kết thu", "can nhac": "cần nhắc",
  "Hop dong hieu luc": "Hợp đồng hiệu lực", "Tong so may": "Tổng số máy",
  "Moc 7 ngay toi": "Mốc 7 ngày tới", "duoc bao tri": "được bảo trì", "can gia han": "cần gia hạn",
  "Da bao gia": "Đã báo giá", "Dang thi cong": "Đang thi công", "Cho nghiem thu": "Chờ nghiệm thu",
  "Hoan tat": "Hoàn tất", "Bao tri dinh ky": "Bảo trì định kỳ",
  "Quotation": "Báo giá", "SI": "Hóa đơn", "PARTIAL": "Tạm tính", "COMPLETE": "Đủ dữ liệu",
  "Dat": "Đạt", "Dat co dieu kien": "Đạt có điều kiện", "Khong dat": "Không đạt",
  // phan loai khach tu du lieu quet (khong dau trong DB)
  "Khac": "Khác", "Nha may": "Nhà máy", "Nha may / Doanh nghiep": "Nhà máy / Doanh nghiệp",
  "Cong trinh cong": "Công trình công", "Nha hang": "Nhà hàng", "Truong hoc": "Trường học",
  "Cao oc": "Cao ốc", "Kho lanh": "Kho lạnh", "Giai tri": "Giải trí",
  // trang thai ho so / cong trinh / bao tri / gia / CSKH
  "Chua co": "Chưa có", "Day du": "Đầy đủ", "Thieu vat tu": "Thiếu vật tư", "Thieu BQT": "Thiếu BQT",
  "Working": "Đang chạy", "Completed": "Hoàn thành", "Open": "Mới mở",
  "Hang thang": "Hằng tháng", "Hang quy": "Hằng quý", "6 thang": "6 tháng", "Sap den han": "Sắp đến hạn",
  "Hieu luc": "Hiệu lực", "Phi": "Phí", "Cho khach xac nhan": "Chờ khách xác nhận", "Da chot": "Đã chốt",
  "Quyet toan": "Quyết toán", "Tam ung": "Tạm ứng", "Da gui khach": "Đã gửi khách",
  "Goi dien": "Gọi điện", "Dang xu ly": "Đang xử lý", "Moi": "Mới", "Da xong": "Đã xong",
  // ten 8 mau in (bang cau hinh)
  "San sang": "Sẵn sàng", "Bao gia": "Báo giá", "Gui khach": "Gửi khách", "Sau thi cong": "Sau thi công",
  "Thu de nghi thanh toan": "Thư đề nghị thanh toán", "Theo dot": "Theo đợt",
  "Bien ban doi chieu cong no": "Biên bản đối chiếu công nợ", "Cuoi ky": "Cuối kỳ",
  "Phieu xuat kho": "Phiếu xuất kho", "Xuat vat tu": "Xuất vật tư", "Hien truong": "Hiện trường",
  "Hop dong bao tri": "Hợp đồng bảo trì", "Ky HDBT": "Ký HĐBT",
};
function viStatus(s) { return VI_STATUS[String(s)] || String(s); }
function chip(status) {
  const s = viStatus(status == null || status === "" ? "—" : status);
  const kind = /quá|thiếu|chặn|hủy|lỗi|khẩn|nhắc|lỗ|het han|hết hạn|hết hiệu lực|từ chối|chênh/i.test(s) ? "danger"
    : /chờ|sắp|duyệt|cảnh|dời|tạm|phát sinh|xác nhận|cần/i.test(s) ? "warn"
    : /xong|hoàn|đã|đủ|hiệu lực|ok|đạt|chốt|con hieu luc/i.test(s) ? "ok"
    : /mới|đang|giao|bảo trì|nhận|info/i.test(s) ? "info" : "neutral";
  return `<span class="chip ${kind}">${esc(s)}</span>`;
}
function panel(title, body, aside = "") {
  return `<section class="panel"><div class="panel-head"><h2 class="panel-title">${esc(title)}</h2>${aside}</div><div class="panel-body">${body}</div></section>`;
}
function table(headers, rows, opts = {}) {
  const { onClick, empty = "Chưa có dữ liệu." } = opts;
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows.map((r, i) =>
    `<tr class="${onClick ? "clickable" : ""}" data-i="${i}">${r.map((c) =>
      `<td>${c == null || c === "" ? '<span class="muted">—</span>' : c}</td>`).join("")}</tr>`).join("");
  return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
/* KPI card. Phần tử: [label, value, foot, kind, ico] — ico (tùy chọn, WO-22) vẽ vòng
   tròn icon màu theo mockup; card không icon giữ nguyên dạng cũ (chip + foot). */
function metrics(items) {
  return `<div class="grid metrics">${items.map(([label, value, foot, kind, ico]) => `
    <div class="panel metric ${ico ? "has-ico " : ""}${kind || ""}">
      ${ico ? `<span class="metric-ico">${ICO[ico] || ""}</span>` : ""}
      <div class="metric-label">${esc(viStatus(label))}</div>
      <div class="metric-value ${kind || ""} ${String(value).length > 11 ? "money-kpi" : ""}" ${String(value).length > 11 ? `title="${esc(value)}"` : ""}>${esc(value)}</div>
      <div class="metric-foot">${ico
        ? esc(viStatus(foot || ""))
        : chip(kind === "ok" ? "Ổn định" : kind === "danger" ? "Cần xử lý" : kind === "warn" ? "Cần theo dõi" : "Đang chạy") + " " + esc(viStatus(foot || "").replace(/(\d+) hoa don/, "$1 hóa đơn"))}</div>
    </div>`).join("")}</div>`;
}
// ô số nhỏ (dùng cho khối giá vốn/lợi nhuận) — nhẹ hơn metric card
function miniStat(label, value, kind) {
  return `<div class="panel metric ${kind || ""}"><div class="metric-label">${esc(label)}</div>
    <div class="metric-value ${kind || ""} ${String(value).length > 11 ? "money-kpi" : ""}">${esc(value)}</div></div>`;
}
function pipeline(columns) {
  return `<div class="pipeline">${columns.map((col) => `
    <div class="pipe-col">
      <div class="pipe-head"><span>${esc(viStatus(col.title))}</span><span>${col.items.length}</span></div>
      ${col.items.map((it) => `<div class="task-card" ${it.route ? `data-route="${esc(it.route)}"` : ""}>
        <div class="task-title">${esc(it.title)}</div>
        <div class="muted">${esc(it.meta || "")}</div>
        ${it.status ? `<div>${chip(it.status)}</div>` : ""}
      </div>`).join("") || `<div class="muted" style="font-size:12px">—</div>`}
    </div>`).join("")}</div>`;
}
function formGrid(fields, cols) {
  return `<div class="form-grid ${cols ? "cols-" + cols : ""}">${fields.map(([label, value, isChip]) =>
    `<div class="form-field"><label>${esc(label)}</label><div class="form-value">${isChip ? chip(value) : esc(value)}</div></div>`).join("")}</div>`;
}
function imageStrip(labels) {
  return `<div class="image-strip">${labels.map((l) => `<div class="thumb">${esc(l)}</div>`).join("")}</div>`;
}
// Doc preview: to giay + logo + chu ky 2 ben (yeu cau §6-A#3)
function docPreview(cfg, title, meta, lineHeaders, lines, totals, signA, signB) {
  return `<div class="doc-preview">
    <div class="doc-top">
      <div class="doc-logo">${cfg.has_logo && cfg.logo_url
        ? `<img src="${esc(cfg.logo_url)}" alt="logo" style="max-height:40px;max-width:80px;object-fit:contain">`
        : "TH"}</div>
      <div><div class="doc-company">${esc(cfg.ten_cong_ty || CFG.ten_cong_ty || "CÔNG TY CỦA BẠN")}</div>
        <div class="muted">MST ${esc(cfg.ma_so_thue || "3602504881")} · ${esc(cfg.dia_chi || "Đồng Nai")} · Hotline: ${esc(cfg.dien_thoai || "0962 811 166")}</div></div>
    </div>
    <div class="doc-title">${esc(title)}</div>
    ${meta.length ? formGrid(meta, 2) : ""}
    <div style="margin-top:14px">${lines.length ? table(lineHeaders, lines) : `<div class="empty">Chưa có dòng chi tiết.</div>`}</div>
    ${totals && totals.length ? `<div class="doc-total"><table><tbody>${totals.map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td class="money" style="text-align:right">${esc(v)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <div class="doc-sign">
      <div><div class="sign-role">ĐẠI DIỆN BÊN A</div><div class="muted" style="font-size:11px">${esc(signA || "")}</div><br><br><br><div class="sign-hint">Ký, ghi rõ họ tên</div></div>
      <div><div class="sign-role">ĐẠI DIỆN BÊN B</div><div class="muted" style="font-size:11px">${esc(signB || "Cơ điện lạnh Thanh Hoài")}</div><br><br><br><div class="sign-hint">Ký, ghi rõ họ tên</div></div>
    </div>
  </div>`;
}
function miniChart(values) {
  const max = Math.max(...values, 1);
  return `<div class="mini-chart">${values.map((v, i) => {
    const h = Math.max(8, Math.round(v * 100 / max));
    const cls = i > 5 ? "warn" : (i % 3 === 0 ? "alt" : "");
    return `<div class="bar ${cls}" style="height:${h}%" title="${vnd(v)}"><span>T${i + 1}</span></div>`;
  }).join("")}</div>`;
}

/* WO-22: gom hóa đơn bán ra theo tháng (client tính — backend chưa có endpoint riêng).
   rows = /api/hoa_don .rows; trả [{thang:"YYYY-MM", phai_thu, da_thu, con}] N tháng cuối. */
function debtByMonth(rows, nMonths = 6) {
  const by = {};
  (rows || []).forEach((r) => {
    if (r.chieu && r.chieu !== "ban_ra") return;
    const m = String(r.ngay || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    if (!by[m]) by[m] = { pt: 0, dt: 0 };
    by[m].pt += Number(r.tong_cong || 0);
    by[m].dt += Number(r.da_thu || 0);
  });
  return Object.keys(by).sort().slice(-nMonths)
    .map((k) => ({ thang: k, phai_thu: by[k].pt, da_thu: by[k].dt, con: by[k].pt - by[k].dt }));
}
/* Chart cột kép (phải thu / đã thu) + đường (còn phải thu) — SVG thuần, màu qua token. */
function svgBarLine(data) {
  if (!data.length) return `<div class="empty">Chưa có hóa đơn để dựng biểu đồ theo tháng.</div>`;
  const W = 560, H = 210, padB = 24, padT = 12;
  const max = Math.max(...data.map((r) => Math.max(r.phai_thu, r.da_thu, r.con)), 1);
  const gap = W / data.length, bw = Math.min(16, gap / 4);
  const y = (v) => padT + (H - padB - padT) * (1 - v / max);
  let bars = "", labels = "", pts = [], dots = "";
  data.forEach((r, i) => {
    const x0 = gap * i + gap / 2;
    const lb = r.thang.split("-");
    bars += `<rect x="${(x0 - bw - 1.5).toFixed(1)}" y="${y(r.phai_thu).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, H - padB - y(r.phai_thu)).toFixed(1)}" rx="3" fill="var(--info)" opacity=".9"><title>Phải thu ${lb[1]}/${lb[0]}: ${vnd(r.phai_thu)}</title></rect>`;
    bars += `<rect x="${(x0 + 1.5).toFixed(1)}" y="${y(r.da_thu).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, H - padB - y(r.da_thu)).toFixed(1)}" rx="3" fill="var(--ok)" opacity=".9"><title>Đã thu ${lb[1]}/${lb[0]}: ${vnd(r.da_thu)}</title></rect>`;
    pts.push(`${x0.toFixed(1)},${y(r.con).toFixed(1)}`);
    dots += `<circle cx="${x0.toFixed(1)}" cy="${y(r.con).toFixed(1)}" r="3.2" fill="var(--danger)"><title>Còn phải thu ${lb[1]}/${lb[0]}: ${vnd(r.con)}</title></circle>`;
    labels += `<text x="${x0.toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(lb[1] + "/" + lb[0])}</text>`;
  });
  const tot = data.reduce((s, r) => ({ pt: s.pt + r.phai_thu, dt: s.dt + r.da_thu, c: s.c + r.con }),
    { pt: 0, dt: 0, c: 0 });
  return `<div class="svg-chart">
    <div class="chart-legend"><span class="lg phaithu">Phải thu</span><span class="lg dathu">Đã thu</span><span class="lg conno">Còn phải thu</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Công nợ theo tháng">
      <line x1="0" y1="${H - padB}" x2="${W}" y2="${H - padB}" stroke="var(--line-soft)"/>
      ${bars}<polyline points="${pts.join(" ")}" fill="none" stroke="var(--danger)" stroke-width="2"/>${dots}${labels}
    </svg>
    <div class="chart-tot">
      <div class="t-phaithu">Tổng phải thu<b>${vnd(tot.pt)}</b></div>
      <div class="t-dathu">Đã thu trong kỳ<b>${vnd(tot.dt)}</b></div>
      <div class="t-conno">Còn phải thu<b>${vnd(tot.c)}</b></div>
    </div></div>`;
}
/* Donut trạng thái — segments = [[label, n], ...], màu semantic theo vị trí. */
function svgDonut(segments) {
  const PAL = ["var(--info)", "var(--brand)", "var(--warn)", "var(--purple)", "var(--ok)", "var(--neutral-ink)", "var(--danger)"];
  const segs = segments.filter((s) => s[1] > 0);
  const tot = segs.reduce((s, x) => s + x[1], 0);
  if (!tot) return `<div class="empty">Chưa có dữ liệu trạng thái.</div>`;
  const R = 46, C = 2 * Math.PI * R;
  let off = 0, arcs = "", legend = "";
  segs.forEach((s, i) => {
    const idx = segments.indexOf(s), color = PAL[idx % PAL.length];
    const frac = s[1] / tot;
    arcs += `<circle r="${R}" cx="65" cy="65" fill="none" stroke="${color}" stroke-width="17" stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off * C).toFixed(2)}" transform="rotate(-90 65 65)"><title>${esc(viStatus(s[0]))}: ${s[1]}</title></circle>`;
    legend += `<div class="dl"><i style="background:${color}"></i>${esc(viStatus(s[0]))} <span class="muted">(${(frac * 100).toFixed(1)}%)</span><b>${s[1]}</b></div>`;
    off += frac;
  });
  return `<div class="donut-wrap">
    <svg width="130" height="130" viewBox="0 0 130 130">${arcs}
      <text x="65" y="62" text-anchor="middle" font-size="21" font-weight="700" fill="var(--ink)">${tot}</text>
      <text x="65" y="78" text-anchor="middle" font-size="9.5" fill="var(--muted)">Tổng số</text></svg>
    <div class="donut-legend">${legend}</div></div>`;
}
/* WO-38: chart tiến độ theo tuần (kế hoạch vs thực tế % lũy kế + chênh lệch) —
   dữ liệu từ dashboard_charts.tien_do_tuan; điểm null bị bỏ, rỗng → empty-state. */
function svgWeekProgress(rows) {
  const has = (rows || []).some((r) => r.ke_hoach_pct != null || r.thuc_te_pct != null);
  if (!has) return `<div class="empty">Chưa có dữ liệu tiến độ theo tuần (bảng tiến độ hạng mục trống).</div>`;
  const W = 520, H = 190, padB = 32, padT = 14;
  const y = (v) => padT + (H - padB - padT) * (1 - Math.min(100, Math.max(0, v)) / 100);
  const gap = W / rows.length;
  const line = (key, color, dash) => {
    const p = rows.map((r, i) => r[key] == null ? null
      : `${(gap * i + gap / 2).toFixed(1)},${y(r[key]).toFixed(1)}`).filter(Boolean);
    return p.length > 1 ? `<polyline points="${p.join(" ")}" fill="none" stroke="${color}" stroke-width="2"${dash ? ' stroke-dasharray="5 4"' : ""}/>` : "";
  };
  let labels = "", dots = "";
  rows.forEach((r, i) => {
    const x = (gap * i + gap / 2).toFixed(1);
    labels += `<text x="${x}" y="${H - 16}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${esc(fmtDate(r.tu_ngay).slice(0, 5))}</text>`;
    if (r.chenh_lech_pct != null) labels += `<text x="${x}" y="${H - 5}" text-anchor="middle" font-size="9" fill="${r.chenh_lech_pct < 0 ? "var(--danger)" : "var(--ok)"}">${(r.chenh_lech_pct > 0 ? "+" : "") + r.chenh_lech_pct}%</text>`;
    if (r.ke_hoach_pct != null) dots += `<circle cx="${x}" cy="${y(r.ke_hoach_pct).toFixed(1)}" r="3" fill="var(--info)"><title>Kế hoạch ${r.ke_hoach_pct}%</title></circle>`;
    if (r.thuc_te_pct != null) dots += `<circle cx="${x}" cy="${y(r.thuc_te_pct).toFixed(1)}" r="3" fill="var(--ok)"><title>Thực tế ${r.thuc_te_pct}%</title></circle>`;
  });
  return `<div class="svg-chart">
    <div class="chart-legend"><span class="lg kehoach">Kế hoạch %</span><span class="lg thucte">Thực tế %</span><span class="lg chenhlech">Chênh lệch</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tiến độ theo tuần">
      <line x1="0" y1="${H - padB}" x2="${W}" y2="${H - padB}" stroke="var(--line-soft)"/>
      ${line("ke_hoach_pct", "var(--info)", true)}${line("thuc_te_pct", "var(--ok)", false)}${dots}${labels}
    </svg></div>`;
}

/* 2026-07-10 tham khao FastCon: burn-up 1 cong trinh — 2 duong Ke hoach vs Thuc te (uoc
   tinh tuyen tinh, server tra data_quality trung thuc) tren suot vong doi du an.
   rows = [{date, plan_pct, actual_pct}] tu /api/ct_burnup. */
function svgBurnup(rows) {
  if (!rows || rows.length < 2) return `<div class="empty">Chưa đủ dữ liệu tiến độ để vẽ burn-up (cần ít nhất 2 mốc ngày kế hoạch).</div>`;
  const W = 560, H = 200, padB = 26, padT = 12, padL = 4;
  const y = (v) => padT + (H - padB - padT) * (1 - Math.min(100, Math.max(0, v)) / 100);
  const gap = (W - padL) / (rows.length - 1);
  const line = (key, color) => rows.map((r, i) =>
    `${(padL + gap * i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(" ");
  const nStep = Math.max(1, Math.ceil(rows.length / 7));
  let labels = "";
  rows.forEach((r, i) => {
    if (i % nStep !== 0 && i !== rows.length - 1) return;
    labels += `<text x="${(padL + gap * i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${esc(fmtDate(r.date).slice(0, 5))}</text>`;
  });
  const last = rows[rows.length - 1];
  return `<div class="svg-chart">
    <div class="chart-legend"><span class="lg kehoach">Kế hoạch %</span><span class="lg thucte">Thực tế %</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Burn-up tiến độ công trình">
      <line x1="0" y1="${H - padB}" x2="${W}" y2="${H - padB}" stroke="var(--line-soft)"/>
      <polyline points="${line("plan_pct", "var(--info)")}" fill="none" stroke="var(--info)" stroke-width="2" stroke-dasharray="5 4"/>
      <polyline points="${line("actual_pct", "var(--ok)")}" fill="none" stroke="var(--ok)" stroke-width="2.4"/>
      ${labels}
    </svg>
    <div class="muted" style="font-size:11px;margin-top:4px">Hiện tại: kế hoạch ${last.plan_pct}% · thực tế ${last.actual_pct}% —
      ước tính tuyến tính từ ngày bắt đầu/kết thúc kế hoạch và thực tế (hệ thống chưa lưu lịch sử % theo từng ngày).</div></div>`;
}

// ---- Global cfg (lay 1 lan cho doc-preview) ----
let CFG = { ten_cong_ty: "CÔNG TY CỦA BẠN", ma_so_thue: "", dia_chi: "", dien_thoai: "", has_logo: false, logo_url: null, scan_roots: [] };

// ========================================================================
// 17 RENDERER
// ========================================================================
const RENDER = {
  /* WO-38: Dashboard theo mockup — 8 stat + 3 chart đổ từ /api/dashboard_charts (WO37).
     Money-gate ở BACKEND: field tiền bị strip (undefined/[]) cho KTV/Thủ kho/KTT → UI
     hiện "—"/empty, không suy ngược. Không còn tự tính chart từ hoa_don ở client. */
  async dashboard(el) {
    const d = await apiGet("dashboard");
    const k = d.kpi || {};
    // mirror CAN_SEE_MONEY backend (GĐ/KT/KD/QT) — KTT bị strip tiền ở Dashboard
    const canMoney = ME && ["Giam doc", "Ke toan", "Kinh doanh", "Quan tri he thong"].includes(ME.role);
    const isGdQt = ME && ["Giam doc", "Quan tri he thong"].includes(ME.role);
    const hideMoney = !canMoney;
    const [board, charts, queue, docs, audit, tech, ctgd] = await Promise.all([
      canMoney ? apiGet("cong_ty_board").catch(() => null) : Promise.resolve(null),
      apiGet("dashboard_charts").catch(() => null),
      apiGet("cho_xep_lich").catch(() => null),
      apiGet("documents").catch(() => null),
      apiGet("audit").catch(() => null),
      apiGet("technician").catch(() => null),
      isGdQt ? apiGet("ct_dashboard_gd").catch(() => null) : Promise.resolve(null),
    ]);
    // 8 stat theo mockup — field tiền server strip → "—" (không bịa)
    const mv = (v) => (v === undefined || v === null) ? "—" : vnd(v);
    const cnt = (v) => (v === undefined || v === null) ? "—" : String(v);
    const psChoDuyet = ctgd ? (ctgd.rows || []).reduce((s, r) => s + (r.vo_cho_duyet || 0), 0) : null;
    const kpiCards = [
      ["Tổng số công ty", cnt(k.tong_cong_ty), "trừ khách cá nhân", "info", "company"],
      ["Tổng số công trình", cnt(k.tong_cong_trinh), "", "info", "play"],
      ["Công nợ phải thu", canMoney && board ? vnd(board.tong.con_no) : "—", "",
        canMoney && board && board.tong.con_no > 0.5 ? "danger" : "ok", "money"],
      ["Giá trị dự toán", mv(k.gia_tri_du_toan), "báo giá gắn công trình", "purple", "money"],
      ["Giá trị thực tế", mv(k.gia_tri_thuc_te), "theo bảng quyết toán", "ok", "bank"],
      ["Phát sinh chờ duyệt", psChoDuyet == null ? "—" : String(psChoDuyet), "VO công trình",
        psChoDuyet ? "warn" : "ok", "alert"],
      ["Nhân sự hôm nay", cnt(k.nhan_su_hom_nay), "có việc được gán", "info", "people"],
      ["Công việc quá hạn", cnt(k.cv_qua_han), "", k.cv_qua_han ? "danger" : "ok", "clock"],
    ];
    // 3 chart — dashboard_charts (WO37) là source of truth, KHÔNG tự tính client
    const cn = (charts && charts.cong_no_thang) || [];
    const chartHtml = cn.length
      ? svgBarLine(cn.map((r) => ({ thang: r.thang, phai_thu: r.phai_thu || 0,
          da_thu: r.da_thu || 0, con: (r.phai_thu || 0) - (r.da_thu || 0) })))
      : `<div class="empty">${canMoney ? "Chưa có hóa đơn theo tháng." : "Vai trò của bạn không xem dữ liệu tài chính."}</div>`;
    const stArr = (charts && charts.tinh_trang_cong_trinh) || [];
    const donutHtml = stArr.length ? svgDonut(stArr.map((r) => [r.status, r.so]))
      : `<div class="empty">Chưa có công trình.</div>`;
    const wpHtml = svgWeekProgress((charts && charts.tien_do_tuan) || []);
    // việc quá hạn (đếm theo ngày thật của máy)
    const nowIso = new Date().toISOString().slice(0, 10);
    const overdue = ((tech && tech.rows) || [])
      .filter((r) => r.ngay_hen && r.ngay_hen < nowIso && !["Hoan thanh", "Huy"].includes(r.trang_thai))
      .slice(0, 6)
      .map((r) => [`<span class="code">${esc(r.code)}</span>`, esc(r.customer_name || "—"),
        chip(r.loai_viec), esc(fmtDate(r.ngay_hen)),
        `<b style="color:var(--danger)">${Math.max(1, Math.round((Date.parse(nowIso) - Date.parse(r.ngay_hen)) / 86400000))} ngày</b>`,
        esc(r.ktv_chinh || "—")]);
    // chứng từ vừa tạo = file thật mới nhất từ D:\2026
    const docRows = ((docs && docs.mode === "scan" && docs.rows) || []).slice(0, 5);
    const docsHtml = docRows.length ? `<div class="act-list">${docRows.map((r) => `
      <div class="act-row"><div><b>${esc(r.file_name)}</b>
        <div class="muted">${chip(r.doc_type_label)} ${esc(r.khach_folder || r.customer_name || "")}</div></div>
        <div class="act-time">${esc(fmtDateTime(r.mtime))}<br><button class="btn btn-sm ghost open-file" data-id="${Number(r.source_document_id) || ""}" data-rel="${esc(r.rel_path)}">Mở</button></div></div>`).join("")}</div>`
      : `<div class="empty">Chưa quét nguồn D:\\2026 hoặc vai trò không xem kho hồ sơ.</div>`;
    // hoạt động gần đây = audit thật (chỉ GĐ/Quản trị có quyền — role khác ẩn)
    const actHtml = (audit && audit.rows && audit.rows.length) ? `<div class="act-list">${audit.rows.slice(0, 6).map((r) => `
      <div class="act-row"><div><b>${esc(r.user)}</b>
        <div class="muted">${esc(r.tom_tat || r.hanh_dong || "")}</div></div>
        <div class="act-time">${esc(fmtDateTime(r.thoi_gian))}</div></div>`).join("")}</div>`
      : `<div class="empty">${audit ? "Chưa có thao tác ghi nào." : "Nhật ký hệ thống: chỉ Giám đốc / Quản trị xem."}</div>`;
    const alerts = d.alerts
      .filter((a) => !hideMoney || !/phai thu/i.test(String(a[1])))
      .map((a) => [esc(a[0]), esc(a[1]), a[2]]);
    const projRows = d.projects.map((p) => [
      `<span class="code">${esc(p.code)}</span>`, esc(p.project_name), chip(p.status),
      (p.percent_complete || 0) + "%", esc(p.khu_vuc || ""), chip(p.trang_thai_ho_so)]);
    const debtRows = hideMoney ? [] : d.debts.map((r) => [
      esc(r.customer_name), `<span class="code">${esc(r.code)}</span>`, `<span class="money">${vnd(r.grand_total)}</span>`,
      `<span class="money">${vnd(r.da_thu)}</span>`, `<span class="money">${vnd(r.outstanding_amount)}</span>`, chip("Còn nợ")]);
    el.innerHTML = `
      ${metrics(kpiCards)}
      <div class="dash-3">
        <div class="grid" style="gap:14px">
          ${panel("Công nợ phải thu & thu tiền theo tháng", chartHtml)}
          ${queue && queue.moc_den_han && queue.moc_den_han.length ? panel("Lịch bảo trì sắp đến",
            queue.moc_den_han.slice(0, 5).map((m) => `<div class="queue-row"><span>${esc(m.ten_diem)} · ${esc(m.customer_name)}</span><span class="muted">${esc(fmtDate(m.ngay_du_kien))}</span></div>`).join("")) : ""}
        </div>
        <div class="grid" style="gap:14px">
          ${panel("Tình trạng công trình", donutHtml)}
          ${panel("Tiến độ thực hiện theo tuần", wpHtml)}
        </div>
        <div class="grid" style="gap:14px" id="dash-prio">
          ${panel("Việc cần hoàn thành", `<div class="loading">Đang tải…</div>`)}
        </div>
      </div>
      <div style="margin-top:14px">${panel("Cảnh báo điều hành",
        table(["Đối tượng", "Trạng thái", "Việc cần làm"], alerts, { empty: "Không có cảnh báo." }))}</div>
      <div class="dash-3">
        ${panel("Việc quá hạn cần xử lý", table(["Mã việc", "Công ty", "Loại", "Hẹn", "Quá hạn", "KTV"], overdue, { empty: "Không có việc quá hạn 🎉" }))}
        ${panel("Chứng từ / tài liệu mới nhất (D:\\2026)", docsHtml)}
        ${panel("Hoạt động gần đây", actHtml)}
      </div>
      <div class="grid cols-2" style="margin-top:14px">
        ${panel("Công trình trọng điểm", table(["Mã", "Công trình", "Trạng thái", "%", "Khu vực", "Hồ sơ"], projRows))}
        ${hideMoney ? "" : panel("Công nợ cần xử lý", table(["Khách", "Chứng từ", "Giá trị", "Đã thu", "Còn nợ", "Trạng thái"], debtRows, { empty: "Không có công nợ." }))}
      </div>
      ${hideMoney || !(d.weeks || []).length ? "" : `<div style="margin-top:14px">${panel("Doanh thu & phải thu 8 tuần", miniChart(d.weeks))}</div>`}
      <div id="dash-legacy"></div>`;
    bindOpenFiles(el);
  },

  async customer(el) {
    const list = await apiGet("customers");
    const scanned = list.length && list[0].bao_gia_moi_nhat !== undefined;
    const cols = scanned
      ? ["Khách hàng", "Phân loại", "Tài liệu", "Báo giá mới nhất"]
      : ["Khách hàng", "Phân loại", "Khu vực"];
    const rows = list.map((c) => scanned
      ? [esc(c.customer_name), chip(c.phan_loai), `<b>${c.so_tai_lieu || 0}</b> file`, esc(fmtDateTime(c.bao_gia_moi_nhat))]
      : [esc(c.customer_name), chip(c.phan_loai), esc(c.khu_vuc || "")]);
    el.innerHTML = `<div class="split">
      <div>${panel(scanned ? "Khách hàng (từ D:\\2026 — sắp theo ngày giờ báo giá)" : "Danh sách khách hàng",
        table(cols, rows, { onClick: true, empty: "Chưa có khách hàng — bấm nút [+ Khách hàng mới] để tạo." }))}</div>
      <div id="cust-detail">${panel("Hồ sơ 360°", `<div class="empty">Chọn một khách hàng để xem 360°.</div>`)}</div>
    </div>`;
    bindRows(el, "tbody tr.clickable", async (i) => {
      const snap = await apiGet("customer_360", { id: list[i].id });
      const kh = snap.khach;
      const projRows = snap.projects.map((p) => [
        `<span class="code">${esc(p.code)}</span>`, esc(p.project_name), (p.percent_complete || 0) + "%", chip(p.trang_thai_ho_so)]);
      const tl = snap.timeline.map((t) => `<div class="event"><div class="event-date">${esc(fmtDate(t.ngay))}</div>
        <div class="event-text">${chip(t.loai)} <b>${esc(t.ref_code || "")}</b> — ${esc(t.mo_ta)}</div></div>`).join("")
        || `<div class="empty">Chưa có hoạt động.</div>`;
      // Tai lieu that tu D:\2026
      const srcCount = (snap.src_by_type || []).map((t) => `${chip(t.label + ": " + t.so)}`).join(" ");
      const srcRows = (snap.src_recent || []).map((d, j) => [
        chip(d.doc_type_label), `<span class="code">${esc(d.file_name)}</span>`,
        esc(fmtDateTime(d.mtime)), `<button class="btn open-file" data-id="${Number(d.source_document_id) || ""}" data-rel="${esc(d.rel_path)}">Mở</button>`]);
      const srcPanel = (snap.src_recent && snap.src_recent.length)
        ? panel("Tài liệu thật từ D:\\2026 (mới nhất theo ngày giờ)",
            `<div style="margin-bottom:10px">${srcCount}</div>` +
            table(["Loại", "Tên file", "Ngày giờ", ""], srcRows))
        : "";
      $("#cust-detail", el).innerHTML = `
        <div class="toolbar" id="hoso-actions" style="margin-bottom:12px">
          <button class="btn primary" id="btn-upload-hoso">📤 Upload hồ sơ</button>
          <button class="btn ghost" id="btn-open-folder">📂 Mở folder hồ sơ</button>
        </div>
        ${panel("Hồ sơ khách hàng", formGrid([
          ["Khách hàng", kh.customer_name], ["Khu vực", kh.khu_vuc || "—"], ["Phân loại", kh.phan_loai || "—"],
          ["Địa chỉ", kh.dia_chi || "—"], ["Người liên hệ", kh.nguoi_lien_he || "—"], ["Công nợ", vnd(snap.cong_no), true],
        ]))}
        ${projRows.length ? panel("Danh sách công trình", table(["Mã", "Tên", "Tiến độ", "Hồ sơ"], projRows)) : ""}
        ${srcPanel}
        ${snap.timeline && snap.timeline.length ? panel("Dòng thời gian", `<div class="timeline">${tl}</div>`) : ""}`;
      bindOpenFiles($("#cust-detail", el));
      // WO-24: nút Upload hồ sơ / Mở folder (helper ở app_write.js — guard nếu chạy độc lập)
      if (typeof bindHoSoButtons === "function")
        bindHoSoButtons($("#cust-detail", el), list[i].id, kh.customer_name, () => setTimeout(() => {
          const rows = el.querySelectorAll("tbody tr.clickable"); if (rows[i]) rows[i].click();
        }, 200));
    });
  },

  async quotation(el) {
    const list = await apiGet("quotations");
    const rows = list.map((q) => [
      `<span class="code">${esc(q.code)}</span>`, esc(q.customer_name), chip(q.nhom_dich_vu),
      `<span class="money">${vnd(q.grand_total)}</span>`, (q.loi_nhuan_pct || 0) + "%", chip(q.status)]);
    el.innerHTML = `<div class="split">
      <div>${panel("Danh sách báo giá", table(["Số", "Khách", "Nhóm DV", "Tổng", "Margin", "Trạng thái"], rows, { onClick: true, empty: "Chưa có báo giá — bấm nút [+ Lập báo giá] để tạo." }))}</div>
      <div id="q-detail">${panel("Chi tiết & phiên bản", `<div class="empty">Chọn một báo giá để xem chuỗi phiên bản.</div>`)}</div>
    </div>`;
    bindRows(el, "tbody tr.clickable", async (i) => {
      const q = await apiGet("quotation", { id: list[i].id });
      const chainRows = q.chain.map((c) => [`<b>${esc(c.version)}</b>`, `<span class="code">${esc(c.code)}</span>`,
        esc(fmtDate(c.ngay)), `<span class="money">${vnd(c.grand_total)}</span>`, chip(c.status)]);
      const itemRows = q.items.map((it) => [it.stt, esc(it.hang_muc), esc(it.khoi_luong),
        `<span class="money">${vnd(it.don_gia)}</span>`,
        it.thue_suat != null ? it.thue_suat + "%" : "—",
        esc(it.nguon_gia || ""), chip(it.trang_thai)]);
      $("#q-detail", el).innerHTML = `
        ${panel("Thông tin báo giá", formGrid([
          ["Số báo giá", q.code], ["Khách hàng", q.customer_name], ["Nhóm dịch vụ", q.nhom_dich_vu || "—"],
          ["Lợi nhuận ước tính", (q.loi_nhuan_pct || 0) + "%", true],
          ["Cộng trước thuế", vnd(q.tong_truoc_thue != null ? q.tong_truoc_thue : q.grand_total)],
          ["Tiền thuế (VAT)", vnd(q.tien_thue || 0)],
          ["TỔNG CỘNG (sau thuế)", vnd(q.grand_total)],
        ], 2))}
        ${panel("Chuỗi phiên bản", table(["Phiên bản", "Số", "Ngày", "Tổng", "Trạng thái"], chainRows))}
        ${panel("Dòng báo giá", table(["STT", "Hạng mục", "KL", "Đơn giá", "Thuế", "Nguồn giá", "TT"], itemRows, { empty: "Chưa có dòng." }))}`;
    });
  },

  async progress(el) {
    const k = await apiGet("kanban");
    const cols = k.cot.map((c) => ({ title: c, items: (k.data[c] || []).map((t) => ({
      title: t.ten || t.code, meta: `${t.code} · ${t.khach || ""}${t.khu_vuc ? " · " + t.khu_vuc : ""}${t.pct != null ? " · " + t.pct + "%" : ""}`,
      status: t.ho_so })) }));
    el.innerHTML = panel("Pipeline công trình (suy từ dữ liệu thật)", pipeline(cols));
  },

  async bbnt(el) {
    const list = await apiGet("bbnt");
    const rows = list.map((b) => [`<span class="code">${esc(b.code)}</span>`, esc(b.customer_name),
      esc(fmtDate(b.ngay_nghiem_thu)), chip(b.ket_luan), chip(b.trang_thai)]);
    el.innerHTML = `<div class="split">
      <div>${panel("Danh sách BBNT", table(["Số", "Khách", "Ngày", "Kết luận", "Trạng thái"], rows, { onClick: true, empty: "Chưa có BBNT — bấm [+ Lập BBNT] hoặc dùng [Sinh bộ 7 chứng từ] trên trang Báo giá." }))}</div>
      <div id="doc">${panel("Xem trước chứng từ", `<div class="empty">Chọn một BBNT để xem tờ chứng từ.</div>`)}</div>
    </div>`;
    bindRows(el, "tbody tr.clickable", async (i) => {
      const b = await apiGet("bbnt_detail", { id: list[i].id });
      const lines = b.items.map((it, j) => [j + 1, esc(it.hang_muc), esc(it.kl_thuc_te || it.kl_hop_dong || ""),
        `<span class="money">${vnd(it.don_gia)}</span>`, `<span class="money">${vnd(it.thanh_tien)}</span>`]);
      $("#doc", el).innerHTML = docPreview(CFG, "Biên bản nghiệm thu",
        [["Khách hàng", b.customer_name], ["Công trình", b.project_name || "—"], ["Số chứng từ", b.code], ["Ngày lập", fmtDate(b.ngay_nghiem_thu)]],
        ["STT", "Hạng mục", "Khối lượng", "Đơn giá", "Thành tiền"], lines,
        [["Kết luận", b.ket_luan || "—"], ["Tồn đọng", b.ton_dong || "Không"], ["Bảo hành", b.thoi_han_bao_hanh || "—"]],
        b.dai_dien_a ? b.dai_dien_a + (b.chuc_vu_a ? " · " + b.chuc_vu_a : "") : b.customer_name,
        b.dai_dien_b || "Cơ điện lạnh Thanh Hoài");
    });
  },

  async bqt(el) {
    const list = await apiGet("bqt");
    const rows = list.map((b) => [`<span class="code">${esc(b.code)}</span>`, esc(b.customer_name),
      `<span class="money">${vnd(b.gia_tri_quyet_toan)}</span>`, `<span class="money">${vnd(b.con_lai)}</span>`, chip(b.trang_thai)]);
    el.innerHTML = `<div class="split">
      <div>${panel("Danh sách BQT", table(["Số", "Khách", "Giá trị QT", "Còn phải thu", "Trạng thái"], rows, { onClick: true, empty: "Chưa có BQT — dùng [Sinh bộ 7 chứng từ] trên trang Báo giá." }))}</div>
      <div id="doc">${panel("Xem trước chứng từ", `<div class="empty">Chọn một BQT để xem tờ chứng từ.</div>`)}</div>
    </div>`;
    bindRows(el, "tbody tr.clickable", async (i) => {
      const b = await apiGet("bqt_detail", { id: list[i].id });
      const lines = b.items.map((it, j) => [j + 1, esc(it.hang_muc), esc(it.thuc_te || ""),
        esc(it.phat_sinh || ""), `<span class="money">${vnd(it.thanh_tien)}</span>`]);
      $("#doc", el).innerHTML = docPreview(CFG, "Bảng quyết toán",
        [["Khách hàng", b.customer_name], ["Công trình", b.project_name || "—"], ["Số chứng từ", b.code], ["Ngày lập", fmtDate(b.ngay_lap)]],
        ["STT", "Hạng mục", "Thực tế", "Phát sinh", "Thành tiền"], lines,
        [["Giá trị quyết toán", vnd(b.gia_tri_quyet_toan)], ["Đã thu", vnd(b.da_thu)], ["Còn phải thu", vnd(b.con_lai)]],
        b.customer_name, "Cơ điện lạnh Thanh Hoài");
    });
  },

  async payment(el) {
    const list = await apiGet("payment");
    const rows = list.map((p) => [`<span class="code">${esc(p.code)}</span>`, esc(p.customer_name),
      chip(p.dot_thanh_toan), `<span class="money">${vnd(p.grand_total)}</span>`, esc(fmtDate(p.han_thanh_toan)), chip(p.status)]);
    el.innerHTML = `<div class="split">
      <div>${panel("Thư đề nghị thanh toán", table(["Số", "Khách", "Đợt", "Số tiền", "Hạn", "Trạng thái"], rows, { onClick: true, empty: "Chưa có đề nghị — dùng [Sinh bộ 7 chứng từ] trên trang Báo giá." }))}</div>
      <div id="doc">${panel("Xem trước chứng từ", `<div class="empty">Chọn một đề nghị để xem tờ chứng từ.</div>`)}</div>
    </div>`;
    bindRows(el, "tbody tr.clickable", async (i) => {
      const p = await apiGet("payment_detail", { id: list[i].id });
      $("#doc", el).innerHTML = docPreview(CFG, "Thư đề nghị thanh toán",
        [["Khách hàng", p.customer_name], ["Đợt thanh toán", p.dot_thanh_toan || "—"], ["Số phiếu", p.code], ["BQT liên quan", p.bqt_code || "—"]],
        ["Nội dung", "Tham chiếu", "Số tiền"], [["Đề nghị thanh toán " + (p.dot_thanh_toan || ""), esc(p.reference || "—"), `<span class="money">${vnd(p.grand_total)}</span>`]],
        [["Số tiền đề nghị", vnd(p.grand_total)], ["Hạn thanh toán", fmtDate(p.han_thanh_toan)]],
        p.customer_name, "Cơ điện lạnh Thanh Hoài");
    });
  },

  async dccn(el) {
    const list = await apiGet("dccn");
    const rows = list.map((d) => [`<span class="code">${esc(d.code)}</span>`, esc(d.customer_name), esc(d.ky || ""),
      `<span class="money">${vnd(d.du_cuoi)}</span>`, `<span class="money">${vnd(d.chenh_lech)}</span>`, chip(d.trang_thai)]);
    el.innerHTML = `<div class="split">
      <div>${panel("Biên bản đối chiếu công nợ", table(["Số", "Khách", "Kỳ", "Dư cuối", "Chênh lệch", "Trạng thái"], rows, { onClick: true, empty: "Chưa có DCCN — dùng [Sinh bộ 7 chứng từ] trên trang Báo giá." }))}</div>
      <div id="doc">${panel("Xem trước chứng từ", `<div class="empty">Chọn một biên bản để xem tờ chứng từ.</div>`)}</div>
    </div>`;
    bindRows(el, "tbody tr.clickable", async (i) => {
      const d = await apiGet("dccn_detail", { id: list[i].id });
      $("#doc", el).innerHTML = docPreview(CFG, "Biên bản đối chiếu công nợ",
        [["Khách hàng", d.customer_name], ["Kỳ đối chiếu", d.ky || "—"], ["Số chứng từ", d.code], ["Trạng thái", d.trang_thai || "—"]],
        ["Chỉ tiêu", "Số tiền"], [["Dư đầu kỳ", vnd(d.du_dau)], ["Phát sinh tăng", vnd(d.phat_sinh_tang)],
          ["Đã thu", vnd(d.da_thu)], ["Dư cuối kỳ", vnd(d.du_cuoi)]].map((r) => [r[0], `<span class="money">${r[1]}</span>`]),
        [["Dư cuối kỳ", vnd(d.du_cuoi)], ["Chênh lệch", vnd(d.chenh_lech)]],
        d.customer_name, "Cơ điện lạnh Thanh Hoài");
    });
  },

  async receivable(el) {
    const d = await apiGet("receivable");
    const siRows = d.invoices.map((r) => [`<span class="code">${esc(r.code)}</span>`, esc(r.customer_name),
      `<span class="money">${vnd(r.grand_total)}</span>`, `<span class="money">${vnd(r.da_thu)}</span>`,
      `<span class="money">${vnd(r.outstanding_amount)}</span>`, esc(fmtDate(r.due_date))]);
    const nkRows = d.nhac_no.map((r) => [esc(fmtDate(r.ngay)), esc(r.customer_name), chip(r.kenh),
      esc(r.nguoi_phu_trach || ""), `<span class="money">${vnd(r.so_tien_cam_ket)}</span>`, esc(r.ket_qua || "")]);
    el.innerHTML = `${metrics(d.metrics)}
      <div class="grid cols-2" style="margin-top:14px">
        ${panel("Hóa đơn còn nợ", table(["Hóa đơn", "Khách", "Tổng", "Đã thu", "Còn nợ", "Hạn"], siRows, { empty: "Không có công nợ." }))}
        ${panel("Nhật ký nhắc nợ", table(["Ngày", "Khách", "Kênh", "Phụ trách", "Cam kết", "Kết quả"], nkRows, { empty: "Chưa có nhắc nợ — bấm [Ghi nhắc nợ] sau mỗi lần gọi/Zalo." }))}
      </div>`;
  },

  async documents(el, query) {
    const d = await apiGet("documents", query || {});
    if (d.mode === "scan") {
      const filterBtns = [["all", "Tất cả (" + d.total + ")"]].concat(
        (d.by_type || []).map((t) => [t.doc_type, t.label + " (" + t.so + ")"]));
      const activeType = (query && query.type) || "all";
      const rows = d.rows.map((r) => [
        chip(r.doc_type_label), `<span class="code">${esc(r.file_name)}</span>`,
        esc(r.khach_folder || r.customer_name || "—"), esc(fmtDateTime(r.mtime)),
        `<span class="muted">${(r.ext || "").replace(".", "").toUpperCase()}</span>`,
        `<button class="btn open-file" data-id="${Number(r.source_document_id) || ""}" data-rel="${esc(r.rel_path)}">Mở</button>`]);
      el.innerHTML = `
        <div class="panel" style="margin-bottom:14px"><div class="panel-body">
          <div class="muted" style="font-size:12.5px;margin-bottom:10px">Nguồn: <b>${esc(d.source_dir || "")}</b> · Quét lúc: ${esc(fmtDateTime(d.last_scan))} · <b>${d.total}</b> tài liệu thật (sắp theo ngày giờ)</div>
          <div class="toolbar" style="margin-bottom:10px">
            <input id="doc-search" class="field" style="max-width:260px" placeholder="Tìm theo tên file / khách…" value="${esc((query && query.q) || "")}">
            <button class="btn primary" id="doc-search-btn">Tìm</button>
          </div>
          <div class="toolbar">${filterBtns.map(([t, label]) =>
            `<button class="btn ${t === activeType ? "primary" : ""} doc-filter" data-type="${esc(t)}">${esc(label)}</button>`).join("")}</div>
        </div></div>
        ${panel("Tài liệu thật từ D:\\2026", table(["Loại", "Tên file", "Khách hàng", "Ngày giờ", "Định dạng", ""], rows,
          { empty: "Không có tài liệu khớp." }))}`;
      // wire filter + search
      el.querySelectorAll(".doc-filter").forEach((b) => b.addEventListener("click", () =>
        RENDER.documents(el, { type: b.dataset.type, q: $("#doc-search", el).value })));
      $("#doc-search-btn", el).addEventListener("click", () =>
        RENDER.documents(el, { type: activeType, q: $("#doc-search", el).value }));
      $("#doc-search", el).addEventListener("keydown", (e) => {
        if (e.key === "Enter") RENDER.documents(el, { type: activeType, q: e.target.value });
      });
      bindOpenFiles(el);
      return;
    }
    // fallback: ho so mau
    const rows = d.rows.map((r) => [`<span class="code">${esc(r.code)}</span>`, esc(r.ten_tai_lieu), chip(r.loai_tai_lieu),
      r.nam || "", esc(r.customer_name || "—"), esc(r.duong_dan || ""), r.so_file || 0,
      chip(r.do_bao_mat), chip(r.trang_thai)]);
    el.innerHTML = panel("Kho hồ sơ / tài liệu (dữ liệu mẫu — chưa quét D:\\2026)", table(
      ["Mã", "Tên tài liệu", "Loại", "Năm", "Khách", "Đường dẫn", "Số file", "Bảo mật", "Trạng thái"], rows,
      { empty: "Chưa có tài liệu." }));
  },

  async maintenance(el) {
    const d = await apiGet("maintenance");
    const hdRows = d.hop_dong.map((h) => [`<span class="code">${esc(h.code)}</span>`, esc(h.ten_hop_dong),
      esc(h.customer_name), chip(h.chu_ky), h.tong_so_may || 0, esc(fmtDate(h.ngay_ket_thuc)), chip(h.trang_thai)]);
    const mocRows = d.moc.map((m) => [`<span class="code">${esc(m.code)}</span>`, esc(m.khach),
      esc(fmtDate(m.ngay)), chip(m.trang_thai)]);
    el.innerHTML = `${metrics(d.metrics)}
      <div class="grid cols-2" style="margin-top:14px">
        ${panel("Hợp đồng bảo trì", table(["Mã HĐ", "Hợp đồng", "Khách", "Chu kỳ", "Số máy", "Hết hạn", "Trạng thái"], hdRows, { empty: "Chưa có HĐ bảo trì — bấm [+ Hợp đồng bảo trì] để tạo." }))}
        ${panel("Mốc sắp đến hạn", table(["Lịch", "Khách", "Đến hạn", "Trạng thái"], mocRows, { empty: "Không có mốc." }))}
      </div>`;
  },

  async technician(el) {
    const d = await apiGet("technician");
    const cols = d.cot.map((c) => ({ title: c, items: (d.kanban[c] || []).map((t) => ({
      title: t.code, meta: `${t.customer_name || ""} · ${t.loai_viec || ""}${t.khu_vuc ? " · " + t.khu_vuc : ""}`, status: t.trang_thai })) }));
    // lich tuan
    const cal = d.calendar;
    const dayNames = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6"];
    let calHtml = `<div class="calendar"><div class="cal-head">Ngày</div>${dayNames.map((n) => `<div class="cal-head">${n}</div>`).join("")}
      <div class="cal-time">Lịch</div>`;
    cal.days.forEach((day) => {
      const items = cal.items[day] || [];
      calHtml += `<div>${items.map((it) => `${esc((it.customer_name || it.code))}<br>${chip(it.loai_viec)}`).join("<hr style='border:0;border-top:1px solid var(--line-soft)'>") || "<span class='muted'>—</span>"}</div>`;
    });
    calHtml += `</div>`;
    el.innerHTML = `${metrics(d.metrics)}
      <div style="margin-top:14px">${panel("Lịch KTV tuần này", calHtml)}</div>
      <div style="margin-top:14px">${panel("Kanban Công Việc KTV", pipeline(cols))}</div>`;
  },

  async template(el) {
    const d = await apiGet("template");
    const c = d.cfg;
    // audit rut khoi nav chinh (WO-19 P7) -> loi vao tu trang Cau hinh (chi GD/Quan tri)
    if (ME && ["Giam doc", "Quan tri he thong"].includes(ME.role)) {
      const slot = $("#page-actions");
      if (slot) {
        slot.innerHTML = `<button class="btn ghost" id="btn-goto-audit">📜 Nhật ký hệ thống</button>`;
        $("#btn-goto-audit").onclick = () => { location.hash = "#audit"; };
      }
    }
    const pfRows = d.mau_in.map((m) => [esc(viStatus(m.ten)), esc(viStatus(m.dung_khi)), chip(m.trang_thai)]);
    el.innerHTML = `<div class="split">
      <div class="grid">
        ${panel("Thông tin in trên chứng từ", formGrid([
          ["Tên công ty", c.ten_cong_ty || ""], ["Mã số thuế", c.ma_so_thue || ""], ["Địa chỉ", c.dia_chi || ""],
          ["Điện thoại", c.dien_thoai || ""], ["Website", c.website || ""], ["Hotline KT", c.hotline_kt || ""],
        ], 1))}
        ${panel("8 mẫu in chuẩn", table(["Mẫu in", "Dùng khi", "Trạng thái"], pfRows))}
      </div>
      ${docPreview(c, "Mẫu letterhead chứng từ", [], [], [], null, "Khách hàng", "Cơ điện lạnh Thanh Hoài")}
    </div>`;
  },

  async pl(el) {
    const d = await apiGet("pl");
    const rows = d.rows.map((r) => [`<span class="code">${esc(r.project_code)}</span>`, chip(r.revenue_mode),
      `<span class="money">${vnd(r.total_revenue_before_tax)}</span>`,
      `<span class="money" style="color:${r.gross_profit < 0 ? "var(--danger)" : "var(--ok)"}">${vnd(r.gross_profit)}</span>`,
      (r.gross_margin_pct || 0).toFixed(1) + "%",
      d.show_commission ? `<span class="money">${vnd(r.hoa_hong)}</span>` : `<span class="muted">🔒 ẩn</span>`,
      chip(r.data_quality_status)]);
    el.innerHTML = panel("Lãi/Lỗ công trình", table(
      ["Công trình", "Nguồn DT", "Doanh thu", "Lãi gộp", "Margin %", "Hoa hồng", "Dữ liệu"], rows, { empty: "Chưa có dữ liệu P&L." }))
      + (!d.show_commission ? `<div class="empty" style="margin-top:12px">🔒 Cột <b>Hoa hồng</b> là thông tin mật — chỉ Giám đốc/Quản trị xem được.</div>` : "");
  },

  async tax(el) {
    const d = await apiGet("tax");
    const rows = d.rows.map((r) => [`<span class="code">${esc(r.code)}</span>`, esc(r.policy || ""), chip(r.tax_fee_type),
      (r.rate_percent || 0) + "%", esc(fmtDate(r.effective_from)), r.effective_to ? esc(fmtDate(r.effective_to)) : "—", chip(r.trang_thai)]);
    el.innerHTML = panel("Thuế / Phí / Chính sách theo hiệu lực", table(
      ["Rule", "Chính sách", "Loại", "Mức %", "Hiệu lực từ", "Đến", "Trạng thái"], rows, { empty: "Chưa có chính sách." }));
  },

  async pricing(el) {
    const d = await apiGet("pricing");
    const mpiRows = d.imports.map((r) => [`<span class="code">${esc(r.code)}</span>`, esc(r.supplier || ""),
      esc(r.stage || ""), r.tong_dong || 0, r.dong_can_xac_nhan || 0, chip(r.trang_thai)]);
    const mphRows = d.history.map((r) => [`<span class="code">${esc(r.code)}</span>`, esc(r.item), esc(r.supplier || ""),
      `<span class="money">${vnd(r.gia)}</span>`, esc(r.stage || ""), chip(r.trang_thai)]);
    // WO-23 §2b: khối GIÁ VỐN + TỒN — chỉ dựng khi role ∈ stock; giá vốn tiền/lịch sử mua thêm gate cost.
    const stockBlock = (canStock() || canCost())
      ? `<div id="vt-lookup" class="section-name" style="margin-top:0">Tra cứu Vật tư / Thiết bị — giá vốn &amp; tồn kho</div>
         <div class="panel"><div class="panel-body">
           <div class="toolbar" style="margin-bottom:10px">
             <input id="vt-q" class="field" style="max-width:320px" placeholder="Gõ tên vật tư/thiết bị để tra cứu…" aria-label="Tìm vật tư">
             ${canCost() ? "" : `<span class="chip warn">Vai trò của bạn chỉ xem SỐ LƯỢNG tồn — không xem giá vốn/giá trị tiền</span>`}
           </div>
           <div id="vt-list"></div>
           <div id="vt-detail"></div>
         </div></div>`
      : `<div class="empty" style="margin-bottom:14px">🔒 Vai trò <b>${esc(ME ? ME.role : "")}</b> không xem giá vốn / tồn kho. Trang này chỉ hiện phần import giá NCC.</div>`;
    el.innerHTML = stockBlock + `<div class="grid cols-2">
      ${panel("Phiếu import giá NCC", table(["Phiếu", "NCC", "Đợt", "Dòng", "Cần XN", "Trạng thái"], mpiRows, { empty: "Chưa có phiếu import — nạp bảng giá NCC ở trang Import & Đồng bộ." }))}
      ${panel("Lịch sử giá (bất biến)", table(["Số", "Vật tư", "NCC", "Giá", "Đợt", "Trạng thái"], mphRows, { empty: "Chưa có lịch sử giá." }))}
    </div>`;
    if (!(canStock() || canCost())) return;
    // danh sách item từ stock ledger (item_stock không key = toàn bộ); Thủ kho đã bị backend strip tiền
    let stockRows = [];
    try { stockRows = (await apiGet("item_stock")).rows || []; } catch (e) { /* 403 -> giữ rỗng */ }
    const drawList = (q) => {
      const kw = (q || "").trim().toLowerCase();
      const rows = stockRows.filter((r) => !kw || String(r.item_name || r.item_key || "").toLowerCase().includes(kw)).slice(0, 40);
      const cols = ["Vật tư / Thiết bị", "Tồn khả dụng", "Đã nhập", "Đã xuất"].concat(canStockMoney() ? ["Giá trị tồn"] : []);
      $("#vt-list", el).innerHTML = table(cols, rows.map((r) => {
        const base = [esc(r.item_name || r.item_key),
          `<b class="money">${Number(r.ton_kha_dung || 0).toLocaleString("vi-VN")}</b>`,
          `<span class="money">${Number(r.nhap || 0).toLocaleString("vi-VN")}</span>`,
          `<span class="money">${Number(r.xuat || 0).toLocaleString("vi-VN")}</span>`];
        return canStockMoney() ? base.concat([`<span class="money">${vnd(r.gia_tri_ton)}</span>`]) : base;
      }), { onClick: true, empty: kw ? "Không có vật tư khớp." : "Chưa có dữ liệu tồn kho — cần import hóa đơn đầu vào (giá vốn) trước." });
      bindRows($("#vt-list", el), "tbody tr.clickable", async (i) => {
        const it = rows[i];
        await showItemDetail(it.item_key, it.item_name);
      });
    };
    const showItemDetail = async (itemKey, itemName) => {
      const box = $("#vt-detail", el);
      box.innerHTML = `<div class="loading">Đang tải giá vốn…</div>`;
      let cost = null;
      if (canCost()) { try { cost = await apiGet("item_cost", { item_key: itemKey }); } catch (e) { cost = null; } }
      const costPanel = canCost() ? panel("Giá vốn — " + itemName, cost && cost.gia_von_gan_nhat != null
        ? `<div class="grid metrics">
             ${miniStat("Giá vốn gần nhất", vnd(cost.gia_von_gan_nhat), "ok")}
             ${miniStat("Giá vốn trung bình", vnd(cost.gia_von_tb), "info")}
             ${miniStat("Thấp nhất", vnd(cost.gia_thap), "info")}
             ${miniStat("Cao nhất", vnd(cost.gia_cao), "warn")}</div>
           <div class="muted" style="font-size:12px;margin-top:8px">NCC gần nhất: <b>${esc(cost.ncc_gan_nhat || "—")}</b> · ngày mua: ${esc(fmtDate(cost.ngay_mua))}</div>
           <div class="section-name">Lịch sử mua (${(cost.lich_su || []).length})</div>
           ${table(["Ngày", "NCC", "SL", "Đơn giá", "Giá gồm VAT"], (cost.lich_su || []).map((h) => [
             esc(fmtDate(h.purchase_date)), esc(h.supplier_name || "—"),
             Number(h.quantity || 0).toLocaleString("vi-VN"),
             `<span class="money">${vnd(h.unit_cost)}</span>`, `<span class="money">${vnd(h.cost_with_vat)}</span>`],
             ), { empty: "Chưa có lịch sử mua cho vật tư này." })}`
        : `<div class="empty">Chưa có giá vốn cho "<b>${esc(itemName)}</b>" — nhập hóa đơn đầu vào có mặt hàng này để hệ ghi giá vốn.</div>`)
        : "";
      box.innerHTML = costPanel;
      box.scrollIntoView({ block: "nearest" });
    };
    drawList("");
    $("#vt-q", el).addEventListener("input", (e) => drawList(e.target.value));
  },

  async support(el) {
    const d = await apiGet("support");
    const rows = d.tickets.map((t) => [`<span class="code">${esc(t.code)}</span>`, esc(t.subject),
      esc(t.customer_name || "—"), chip(t.kenh), chip(t.status)]);
    el.innerHTML = `
      ${panel("Tiếp nhận CSKH (Ticket)", table(["Ticket", "Chủ đề", "Khách", "Kênh", "Trạng thái"], rows, { empty: "Chưa có ticket — tiếp nhận yêu cầu khách qua trang này khi phát sinh." }))}
      <div style="margin-top:14px">${panel("Thông báo Zalo",
        `<div class="empty">⏳ ${esc(d.zalo.ghi_chu)}</div>`)}</div>`;
  },
};

// ---- Helpers cho renderer ----
function fmtDate(s) {
  if (!s) return "—";
  const m = String(s).slice(0, 10);
  const parts = m.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : m;
}
function fmtDateTime(s) {
  if (!s) return "—";
  const str = String(s);
  const datePart = fmtDate(str);
  const t = str.includes("T") ? str.split("T")[1] : (str.includes(" ") ? str.split(" ")[1] : "");
  return t ? `${datePart} ${t.slice(0, 5)}` : datePart;
}
async function openFile(sourceDocumentId, rel) {
  try {
    await apiPost("open_file", { source_document_id: sourceDocumentId || null, rel_path: rel });
  } catch (e) {
    alert("Không mở được file: " + (e.message || ""));
  }
}
function bindOpenFiles(root) {
  root.querySelectorAll(".open-file").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      openFile(Number(b.dataset.id) || null, b.dataset.rel);
    }));
}
function bindRows(el, sel, handler) {
  el.querySelectorAll(sel).forEach((tr) => {
    tr.addEventListener("click", () => handler(Number(tr.dataset.i)));
  });
}
// task-card route (kanban -> chua co form; giu chi tiet o cot phai neu can) — hien tai click no-op an toan

// ========================================================================
// Routing + auth + shell
// ========================================================================
function buildNav() {
  const nav = $("#nav");
  const groups = {};
  PAGES.forEach((p) => (groups[p.group] = groups[p.group] || []).push(p));
  // WO-22 (bám mockup): icon + tên + mô tả phụ + badge đỏ (badge chỉ bật khi có nguồn live)
  nav.innerHTML = Object.entries(groups).map(([g, ps]) =>
    `<div class="nav-group">${esc(g)}</div>` + ps.map((p) => `
      <button class="nav-btn" data-id="${p.id}">
        <span class="nav-ico">${ICO[NAV_ICON[p.id]] || `<span class="nav-num">${esc(p.no)}</span>`}</span>
        <span class="nav-txt"><span class="nav-name">${esc(p.navName || p.name)}</span><span class="nav-sub">${esc(p.navSub || p.sub || "")}</span></span>
        <span class="nav-badge" data-badge="${p.id}"></span>
      </button>`).join("")
  ).join("");
  nav.querySelectorAll(".nav-btn").forEach((b) =>
    b.addEventListener("click", () => { location.hash = "#" + b.dataset.id; }));
}

async function route() {
  // WO-19 P6: ho tro drill-down "#page?id=..." — tham so nam o window.ROUTE_Q
  const raw = (location.hash || "#congty").replace("#", "");
  const [id0, qs] = raw.split("?");
  window.ROUTE_Q = Object.fromEntries(new URLSearchParams(qs || ""));
  let id = id0 || "congty";
  if (id === "cong-ty-board") id = "congty"; // alias theo WO-21B
  if (id === "congty" && ME && ["Ky thuat vien", "Thu kho"].includes(ME.role)) id = "dashboard";
  const p = PAGES.find((x) => x.id === id) || PAGES[0];
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.id === p.id));
  $("#page-crumb").textContent = `${p.group} / Trang ${p.no}`;
  $("#page-title").textContent = p.name;
  $("#page-note").textContent = p.sub;
  $("#page-actions").innerHTML = "";
  const content = $("#content");
  content.innerHTML = `<div class="loading">Đang tải…</div>`;
  try {
    await (RENDER[p.id] || (async (el) => { el.innerHTML = `<div class="empty">Trang đang hoàn thiện.</div>`; }))(content);
  } catch (e) {
    if (e.status === 403 || (e.data && e.data.permission_denied)) {
      content.innerHTML = `<div class="empty">🔒 ${esc(e.message)}<br><span class="muted">Vai trò hiện tại: ${esc(ME.role)}</span></div>`;
    } else {
      content.innerHTML = `<div class="empty">Không tải được dữ liệu: ${esc(e.message || "")}</div>`;
    }
  }
}

async function startApp(user) {
  ME = user;
  try { const t = await apiGet("template"); if (t.cfg) CFG = Object.assign({}, CFG, t.cfg); } catch (e) { /* KTV khong xem duoc template — dung CFG mac dinh */ }
  $("#login").style.display = "none";
  $("#app").style.display = "grid";
  // Brand mark + title from config (logo optional)
  try {
    const brandEl = document.querySelector(".brand-title");
    if (brandEl) {
      const name = CFG.product_name || CFG.ten_cong_ty || "Thanh Hoai ERP";
      brandEl.innerHTML = CFG.has_logo && CFG.logo_url
        ? `<img src="${esc(CFG.logo_url)}" alt="" style="height:28px;width:auto;vertical-align:middle;margin-right:8px"> ${esc(name)}`
        : `<span class="brand-mark">TH</span> ${esc(name)}`;
    }
    const sub = document.querySelector(".brand-subtitle");
    if (sub && CFG.ten_cong_ty) sub.textContent = CFG.ten_cong_ty;
    document.title = (CFG.product_name || "Thanh Hoai ERP") + " — Hệ quản trị nội bộ";
  } catch (e) { /* ignore */ }
  // WO-22: avatar user ở topbar (mockup) — dữ liệu từ session thật
  const tu = $("#topbar-user");
  if (tu) {
    const words = String(user.full_name || user.username || "?").trim().split(/\s+/);
    const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
    tu.innerHTML = `<div class="tu-avatar">${esc(initials)}</div>
      <div><div class="tu-name">${esc(user.full_name || user.username)}</div><div class="tu-role">${esc(user.role)}</div></div>`;
  }
  // Quét hồ sơ: nhập path + bấm Quét ngay (GĐ / Quản trị)
  let scanHtml = "";
  try {
    const st = await apiGet("scan_status");
    const canScan = user.role === "Giam doc" || user.role === "Quan tri he thong";
    const roots = (st.scan_roots && st.scan_roots.length)
      ? st.scan_roots
      : (CFG.scan_roots || []);
    const rootsText = roots.join("\n");
    const lastLine = st.has_scan
      ? `${st.documents || 0} tài liệu · ${st.customers || 0} khách · ${esc(fmtDateTime(st.last_scan))}`
      : "Chưa quét lần nào";
    if (canScan) {
      scanHtml = `<div class="scan-box" id="scan-box">
        <div class="scan-box-title">📁 Quét hồ sơ ổ đĩa</div>
        <div class="scan-box-sub">Mỗi dòng = 1 thư mục gốc (vd D:\\2026)</div>
        <textarea id="scan-paths" class="scan-paths" rows="3" spellcheck="false"
          placeholder="D:\\2025&#10;D:\\2026">${esc(rootsText)}</textarea>
        <button type="button" class="scan-go-btn" id="scan-btn">🔄 Quét ngay</button>
        <label class="scan-save"><input type="checkbox" id="scan-save" checked> Lưu path cho lần sau</label>
        <div class="scan-last muted" id="scan-last">${lastLine}</div>
        <div id="scan-msg" class="scan-msg"></div>
      </div>`;
    } else {
      scanHtml = `<div class="scan-box scan-box-ro">
        <div class="scan-box-title">📁 Nguồn hồ sơ</div>
        <div class="muted" style="font-size:11.5px;line-height:1.4">${st.has_scan
          ? esc(st.source_dir || "") + "<br>" + lastLine
          : "Chỉ Giám đốc / Quản trị được quét."}</div>
      </div>`;
    }
  } catch (e) { /* bo qua */ }

  $("#foot").innerHTML = `<div class="user-name">${esc(user.full_name)}</div><div class="user-role">${esc(user.role)}</div>
    <button class="logout-btn" id="logout">Đăng xuất</button>
    <button class="logout-btn" id="theme-btn" title="Bấm để xoay vòng: Theo Windows → Tối → Sáng"></button>${scanHtml}`;
  $("#logout").addEventListener("click", async () => { await apiPost("logout"); location.reload(); });
  $("#theme-btn").addEventListener("click", () => {
    const order = ["system", "dark", "light"];
    const next = order[(order.indexOf(themeCur()) + 1) % order.length];
    try { localStorage.setItem("th_theme", next); } catch (e) { /* private mode — van ap trong phien */ }
    applyTheme(next);
  });
  themeLabel();
  const scanBtn = $("#scan-btn");
  if (scanBtn) scanBtn.addEventListener("click", async () => {
    const msg = $("#scan-msg");
    const ta = $("#scan-paths");
    const saveEl = $("#scan-save");
    const paths = String(ta ? ta.value : "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!paths.length) {
      msg.textContent = "Nhập ít nhất 1 đường dẫn thư mục.";
      msg.className = "scan-msg err";
      return;
    }
    msg.textContent = "Đang quét…";
    msg.className = "scan-msg";
    scanBtn.disabled = true;
    try {
      const r = await apiPost("scan_now", {
        source_dirs: paths,
        save_roots: !!(saveEl && saveEl.checked),
      });
      const src = r.source_dir || paths.join(" + ");
      msg.textContent = `Xong: ${r.stats.customers} khách · ${r.stats.documents} tài liệu`;
      msg.className = "scan-msg ok";
      const last = $("#scan-last");
      if (last) last.textContent = `${r.stats.documents} tài liệu · ${r.stats.customers} khách · vừa xong`;
      CFG.scan_roots = r.scan_roots || paths;
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      msg.textContent = e.message || "Lỗi quét";
      msg.className = "scan-msg err";
      scanBtn.disabled = false;
    }
  });
  buildNav();
  window.addEventListener("hashchange", route);
  // WO-19: hub chinh = Bang cong ty; KTV/Thu kho khong xem board -> vao Dashboard.
  // Chi goi route() TRUC TIEP khi hash da co san — set hash moi tu kich hoat hashchange,
  // goi ca hai se render chong nhau (dashboard tung bi nhan doi khoi uu tien).
  if (!location.hash) {
    location.hash = user.role === "Ky thuat truong" ? "#dashboard"
      : (["Ky thuat vien", "Thu kho"].includes(user.role) ? "#dashboard" : "#congty");
  } else {
    route();
  }
}

function showLogin() {
  $("#app").style.display = "none";
  $("#login").style.display = "grid";
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#login-err").textContent = "";
    try {
      const r = await apiPost("login", { username: $("#u").value, password: $("#p").value });
      startApp(r.user);
    } catch (err) {
      $("#login-err").textContent = err.message || "Đăng nhập thất bại";
    }
  });
}

(async function init() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js")
      .catch(() => { /* PWA la progressive enhancement; app online van hoat dong. */ }));
  }
  try {
    const me = await apiGet("me");
    if (me.authenticated) startApp(me.user);
    else showLogin();
  } catch (e) {
    showLogin();
  }
})();
