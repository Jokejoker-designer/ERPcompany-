/* ============================================================
   Module Mang Xa Hoi Noi Bo (Giai doan 1-3)
   - Chat real-time qua SSE (nhan) + POST (gui)
   - Video call 1-1 WebRTC P2P (signaling qua SSE+POST, media di thang)
   - Ve o "freeze-frame" tren khung hinh dong bang qua DataChannel
   Phu thuoc globals cua app.js/app_write.js: apiGet, apiPost, esc, toast, ME,
   ICO, PAGES, RENDER, NAV_ICON, NAV_MAIN.
   ============================================================ */
(function () {
  "use strict";

  // ---- icon + dang ky trang/nav ----
  ICO.chat = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V16.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5z"/><path d="M7 9.5h10M7 12.5h6"/></svg>';
  PAGES.push({
    id: "chat", no: "MX", group: "Vận hành", name: "Nhắn tin",
    sub: "Chat nội bộ, gửi tài liệu/ảnh, gọi video 1-1 kèm chỉ dẫn hiện trường.",
    navName: "Nhắn tin", navSub: "Chat · Gọi video · Chỉ dẫn"
  });
  NAV_ICON.chat = "chat";
  try { if (Array.isArray(NAV_MAIN) && !NAV_MAIN.includes("chat")) NAV_MAIN.push("chat"); } catch (e) {}

  // ============================================================
  // SSE — 1 ket noi toan cuc, chay ngay sau khi dang nhap
  // ============================================================
  var _es = null, _sseOn = false, _unread = 0, _lastBeat = 0, _connecting = false;
  var State = { conv: null, convs: [], contacts: [] };
  var onChatMessage = null; // callback do RENDER.chat gan khi mo trang

  function sseConnect() {
    if (_connecting) return;
    _connecting = true;
    if (_es) { try { _es.close(); } catch (e) {} }
    _es = new EventSource("/api/chat/stream");
    _lastBeat = Date.now();
    _es.addEventListener("hb", function () { _lastBeat = Date.now(); });
    _es.addEventListener("chat_message", function (e) {
      _lastBeat = Date.now();
      var m = JSON.parse(e.data);
      if (onChatMessage) onChatMessage(m);
      // dem chua doc + toast neu khong o dung hoi thoai
      if (!(State.conv && State.conv.id === m.conversation_id) || location.hash !== "#chat") {
        _unread++; refreshBadge();
        toast("💬 " + (m.sender_name || "") + ": " + (m.body || "[tệp]").slice(0, 40));
      }
    });
    _es.addEventListener("incoming_call", function (e) { _lastBeat = Date.now(); Call.onIncoming(JSON.parse(e.data)); });
    _es.addEventListener("call_signal", function (e) { _lastBeat = Date.now(); Call.onSignal(JSON.parse(e.data)); });
    _es.addEventListener("call_status", function (e) { _lastBeat = Date.now(); Call.onStatus(JSON.parse(e.data)); });
    _es.onopen = function () { _lastBeat = Date.now(); _connecting = false; };
    _es.onerror = function () {
      _connecting = false;
      // Neu trinh duyet dong han ket noi (khong tu retry duoc nua, vd sau khi may
      // ngu/khoa man hinh lau), tu ket noi lai thay vi cho mai khong thay.
      if (_es && _es.readyState === EventSource.CLOSED) { _sseOn = false; setTimeout(sseConnect, 1500); }
    };
    _sseOn = true;
  }
  function refreshBadge() {
    var b = document.getElementById("chat-nav-badge");
    if (b) { b.textContent = _unread > 0 ? (_unread > 99 ? "99+" : _unread) : ""; b.style.display = _unread > 0 ? "" : "none"; }
  }
  // cho ME co (sau login) roi ket noi 1 lan
  var _w = setInterval(function () {
    if (typeof ME !== "undefined" && ME && !_sseOn) { clearInterval(_w); sseConnect(); }
  }, 400);
  // Nhip tim: neu qua 35s (>2 lan bo qua heartbeat 15s cua server) khong nhan duoc
  // gi ca thi coi nhu ket noi da "chet ngam" (thuong gap tren dien thoai sau khi
  // khoa man hinh / chuyen app) -> tu ket noi lai am tham.
  setInterval(function () {
    if (_sseOn && !_connecting && Date.now() - _lastBeat > 35000) sseConnect();
  }, 10000);
  // Dien thoai khoa man hinh / chuyen tab roi quay lai -> trinh duyet thuong da
  // ngat SSE ngam; ket noi lai ngay khi tab active tro lai thay vi cho nhip tim.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && typeof ME !== "undefined" && ME) sseConnect();
  });
  window.addEventListener("online", function () {
    if (typeof ME !== "undefined" && ME) sseConnect();
  });

  // ============================================================
  // Helpers UI
  // ============================================================
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function fmtTime(s) { try { return (s || "").slice(11, 16); } catch (e) { return ""; } }
  function fmtDay(s) {
    try {
      var d = (s || "").slice(0, 10); var today = new Date().toISOString().slice(0, 10);
      if (d === today) return fmtTime(s);
      var yd = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      if (d === yd) return "Hôm qua";
      return d.slice(8, 10) + "/" + d.slice(5, 7);
    } catch (e) { return fmtTime(s); }
  }
  // Avatar tron kieu Zalo: chu cai dau + mau on dinh theo ten
  var AV_COLORS = ["#0068FF", "#00A96E", "#F5A623", "#E5484D", "#8E5BE8", "#0B7285", "#D6409F", "#E8590C"];
  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function avatar(name, size) {
    var s = size || 42, n = String(name || "?");
    var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    var bg = AV_COLORS[h % AV_COLORS.length];
    return '<span class="zavatar" style="width:' + s + 'px;height:' + s + 'px;background:' + bg +
      ';font-size:' + Math.round(s * 0.4) + 'px">' + esc(initials(n)) + '</span>';
  }

  // ============================================================
  // RENDER.chat — trang nhan tin
  // ============================================================
  RENDER.chat = async function (root) {
    _unread = 0; refreshBadge();
    var backendDown = false;
    var data = await apiGet("chat/conversations").catch(function () { backendDown = true; return { rows: [] }; });
    State.convs = data.rows || [];
    if (backendDown) {
      root.innerHTML = '<div class="form-error-summary"><b>Chưa bật được module chat.</b> Máy chủ đang chạy phiên bản cũ (chưa có endpoint chat). Hãy <b>khởi động lại máy chủ</b> rồi tải lại trang.</div>';
      return;
    }
    root.innerHTML =
      '<div class="chat-wrap">' +
      '  <aside class="chat-side">' +
      '    <div class="chat-side-head"><b>Hội thoại</b>' +
      '      <button class="btn primary btn-sm" id="chat-new">＋ Mới</button></div>' +
      '    <div class="chat-conv-list" id="chat-conv-list"></div>' +
      '  </aside>' +
      '  <section class="chat-main" id="chat-main">' +
      '    <div class="chat-empty" id="chat-empty">Chọn một hội thoại hoặc bấm ＋ Mới để bắt đầu.</div>' +
      '  </section>' +
      '</div>';
    drawConvList(root);
    document.getElementById("chat-new").onclick = function () { openNewChat(root); };
    onChatMessage = function (m) {
      // cap nhat list + neu dang mo dung hoi thoai thi append
      if (State.conv && State.conv.id === m.conversation_id) appendMessage(m, true);
      apiGet("chat/conversations").then(function (d) { State.convs = d.rows || []; drawConvList(root); });
    };
    // mo tu ?with=<user_id> (goi tu danh ba/noi khac)
    var q = (location.hash.split("?")[1] || "");
    var mWith = /with=(\d+)/.exec(q);
    if (mWith) { var cid = (await apiPost("chat/direct", { user_id: +mWith[1] })).conversation_id; openConv(root, cid); }
    else if (State.convs.length) openConv(root, State.convs[0].id);
    else renderContactRoster(root);
  };

  function drawConvList(root) {
    var list = document.getElementById("chat-conv-list"); if (!list) return;
    if (!State.convs.length) { list.innerHTML = '<div class="chat-empty" style="padding:16px">Chưa có hội thoại.</div>'; return; }
    list.innerHTML = State.convs.map(function (c) {
      var active = State.conv && State.conv.id === c.id ? " active" : "";
      var preview = c.last_kind === "image" ? "🖼 Hình ảnh" : c.last_kind === "annotation" ? "📍 Ảnh chỉ dẫn" :
        c.last_kind === "file" ? "📄 Tệp đính kèm" : (c.last_body || "Bắt đầu trò chuyện");
      return '<button class="chat-conv' + active + '" data-cid="' + c.id + '">' +
        avatar(c.display_name, 46) +
        '<span class="chat-conv-top"><span class="chat-conv-name">' + esc(c.display_name) + '</span>' +
        '<span class="chat-conv-when">' + esc(fmtDay(c.last_message_at)) + '</span></span>' +
        '<span class="chat-conv-bot"><span class="chat-conv-preview' + (c.unread ? ' unread' : '') + '">' +
        esc((preview || "").slice(0, 40)) + '</span>' +
        (c.unread ? '<span class="chat-unread">' + (c.unread > 9 ? "9+" : c.unread) + '</span>' : '') +
        '</span></button>';
    }).join("");
    Array.prototype.forEach.call(list.querySelectorAll("[data-cid]"), function (b) {
      b.onclick = function () { openConv(root, +b.dataset.cid); };
    });
  }

  async function openConv(root, cid) {
    State.conv = State.convs.find(function (c) { return c.id === cid; }) || { id: cid, display_name: "Hội thoại" };
    drawConvList(root);
    var msgs = (await apiGet("chat/messages", { conversation_id: cid })).rows || [];
    var main = document.getElementById("chat-main");
    main.innerHTML =
      '<div class="chat-head">' +
      '  <span class="chat-head-who">' + avatar(State.conv.display_name, 38) +
      '    <span><b>' + esc(State.conv.display_name) + '</b>' +
      '    <small class="chat-head-sub">Nhấn để gọi hoặc gửi tin</small></span></span>' +
      '  <span class="chat-head-actions">' +
      '    <button class="chat-icon-btn" id="chat-call-audio" title="Gọi thoại">📞</button>' +
      '    <button class="chat-icon-btn" id="chat-call" title="Gọi video">📹</button>' +
      '  </span></div>' +
      '<div class="chat-thread" id="chat-thread"></div>' +
      '<div class="chat-att-preview" id="chat-att-preview"></div>' +
      '<form class="chat-composer" id="chat-form">' +
      '  <label class="chat-icon-btn" title="Gửi hình"><input type="file" id="chat-img" accept="image/*" multiple hidden>🖼️</label>' +
      '  <label class="chat-icon-btn" title="Đính kèm tệp"><input type="file" id="chat-file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" hidden>📎</label>' +
      '  <input type="text" id="chat-input" placeholder="Nhập tin nhắn…" autocomplete="off">' +
      '  <button class="chat-send-btn" type="submit" title="Gửi" aria-label="Gửi">➤</button>' +
      '</form>';
    var thread = document.getElementById("chat-thread");
    thread.innerHTML = "";
    msgs.forEach(function (m) { appendMessage(m, false); });
    thread.scrollTop = thread.scrollHeight;
    // danh dau da doc
    if (msgs.length) apiPost("chat/read", { conversation_id: cid, up_to_message_id: msgs[msgs.length - 1].id });
    document.getElementById("chat-call").onclick = function () { Call.start(otherUserId(), cid, false); };
    document.getElementById("chat-call-audio").onclick = function () { Call.start(otherUserId(), cid, true); };
    wireComposer(cid);
  }

  function otherUserId() {
    // hoi thoai direct: tim user con lai tu contacts (hoac tu display) — dung callee_id qua call/start
    var c = State.conv;
    return c && c._other_id ? c._other_id : (c && c.other_id) || null;
  }

  function appendMessage(m, scroll) {
    var thread = document.getElementById("chat-thread"); if (!thread) return;
    if (m.kind === "system") {
      thread.appendChild(el("div", "chat-sys", esc(m.body || "")));
    } else {
      var mine = m.sender_id === (ME && ME.user_id);
      var isGroup = State.conv && State.conv.kind && State.conv.kind !== "direct";
      var wrap = el("div", "chat-msg" + (mine ? " mine" : ""));
      if (!mine) wrap.innerHTML = avatar(m.sender_name, 30);   // avatar Zalo cho tin nhan
      var bubble = el("div", "chat-bubble");
      if (!mine && isGroup) bubble.appendChild(el("div", "chat-sender", esc(m.sender_name || "")));
      if (m.body) bubble.appendChild(el("div", "chat-text", esc(m.body)));
      (m.attachments || []).forEach(function (a) {
        if (a.kind === "image" && a.id) {
          var img = el("img", "chat-img"); img.src = "/api/chat/attachment?id=" + a.id; img.loading = "lazy";
          img.onclick = function () { window.open(img.src, "_blank"); };
          bubble.appendChild(img);
        } else if (a.id) {
          var lk = el("a", "chat-fileatt", "📄 " + esc(a.file_name));
          lk.href = "/api/chat/attachment?id=" + a.id; lk.target = "_blank";
          bubble.appendChild(lk);
        } else {
          bubble.appendChild(el("div", "chat-text muted", "🖼 " + esc(a.file_name)));
        }
      });
      bubble.appendChild(el("div", "chat-time", fmtTime(m.created_at)));
      wrap.appendChild(bubble);
      thread.appendChild(wrap);
    }
    if (scroll) thread.scrollTop = thread.scrollHeight;
  }

  function wireComposer(cid) {
    var form = document.getElementById("chat-form"), input = document.getElementById("chat-input");
    var preview = document.getElementById("chat-att-preview");
    var pending = [];
    function addFiles(fileList) {
      Array.prototype.forEach.call(fileList, function (f) {
        if (f.size > 15 * 1024 * 1024) { toast("Tệp >15MB bị bỏ qua: " + f.name, false); return; }
        var r = new FileReader();
        r.onload = function () { pending.push({ file_name: f.name, mime: f.type || "application/octet-stream", data_b64: r.result }); renderPreview(); };
        r.readAsDataURL(f);
      });
    }
    document.getElementById("chat-file").onchange = function () { addFiles(this.files); this.value = ""; };
    document.getElementById("chat-img").onchange = function () { addFiles(this.files); this.value = ""; };
    function renderPreview() {
      preview.innerHTML = pending.map(function (p, i) { return '<span class="chat-att-chip">' + esc(p.file_name) + ' <b data-rm="' + i + '">✕</b></span>'; }).join("");
      Array.prototype.forEach.call(preview.querySelectorAll("[data-rm]"), function (b) { b.onclick = function () { pending.splice(+b.dataset.rm, 1); renderPreview(); }; });
    }
    form.onsubmit = async function (ev) {
      ev.preventDefault();
      var body = input.value.trim();
      if (!body && !pending.length) return;
      input.value = ""; var atts = pending.slice(); pending = []; renderPreview();
      try {
        var r = await apiPost("chat/send", { conversation_id: cid, body: body, attachments: atts });
        appendMessage(r.message, true);
      } catch (e) { toast(e.message || "Không gửi được.", false); }
    };
  }

  // Danh sach lien he dung chung (modal "+Mới" VA panel goi y khi chua co hoi thoai nao) —
  // moi nhan su active trong he thong deu xuat hien o day, khong phan biet vai tro.
  function contactRowsHtml(rows) {
    return '<div class="chat-contact-list">' + rows.map(function (u) {
      return '<button type="button" class="chat-contact" data-uid="' + u.id + '">' +
        '<span class="chat-contact-av">' + avatar(u.full_name || u.username, 40) +
        '<span class="chat-contact-dot' + (u.online ? " on" : "") + '"></span></span>' +
        '<b>' + esc(u.full_name || u.username) + (u.online ? ' <span class="chat-online-tag">● Đang online</span>' : '') + '</b>' +
        '<span class="muted">' + esc(u.nhan_su_ten ? u.nhan_su_ten + " · " : "") + esc(u.role) + '</span></button>';
    }).join("") + '</div>';
  }
  function wireContactButtons(container, root, onDone) {
    Array.prototype.forEach.call(container.querySelectorAll("[data-uid]"), function (b) {
      b.onclick = async function () {
        var cid = (await apiPost("chat/direct", { user_id: +b.dataset.uid })).conversation_id;
        if (onDone) onDone();
        var d = await apiGet("chat/conversations"); State.convs = d.rows || [];
        var c = State.convs.find(function (x) { return x.id === cid; }); if (c) c._other_id = +b.dataset.uid;
        openConv(root, cid);
      };
    });
  }

  // Bang khi chua co hoi thoai nao: hien luon toan bo dong nghiep dang hoat dong
  // de ai cung thay ro co the nhan tin cho BAT KY ai trong cong ty, khong rieng
  // gi giam doc — khong bat phai bam "+Mới" moi thay danh ba.
  async function renderContactRoster(root) {
    var empty = document.getElementById("chat-empty"); if (!empty) return;
    var data;
    try { data = await apiGet("chat/contacts"); }
    catch (e) { return; }
    var rows = data.rows || [];
    if (!rows.length) return;
    empty.innerHTML = '<div class="chat-roster-head">Bắt đầu trò chuyện với đồng nghiệp (' + rows.length + ' người, mọi vai trò)</div>' + contactRowsHtml(rows);
    wireContactButtons(empty, root);
  }

  async function openNewChat(root) {
    var data;
    try { data = await apiGet("chat/contacts"); }
    catch (e) {
      openModal("Bắt đầu trò chuyện",
        '<div class="empty">Không tải được danh bạ.<br><b>Máy chủ chưa bật module chat</b> — cần khởi động lại máy chủ (server.py mới) để kích hoạt.<br><span class="muted">' + esc(e.message || "") + '</span></div>',
        async function () { closeModal(); }, "Đóng");
      return;
    }
    var rows = data.rows || [];
    if (!rows.length) { openModal("Bắt đầu trò chuyện", '<div class="empty">Chưa có người dùng nào khác để nhắn tin.</div>', async function () { closeModal(); }, "Đóng"); return; }
    openModal("Bắt đầu trò chuyện", contactRowsHtml(rows), async function () { closeModal(); }, "Đóng");
    wireContactButtons(document.getElementById("modal-wrap"), root, closeModal);
  }

  // ============================================================
  // VIDEO CALL 1-1 (WebRTC P2P) + freeze-frame annotation
  // ============================================================
  var Call = {
    pc: null, dc: null, callId: null, convId: null, peerId: null, role: null,
    localStream: null, pendingIce: [], overlay: null, frozen: false,

    // Truoc day de rong, dua hoan toan vao host candidate (Tailscale 100.x/LAN).
    // Thuc te kiem chung: cuoc goi bi ket "Đang kết nối…" mai khong xong — ICE
    // gathering chi co host candidate co the khong ghep noi duoc (mDNS an danh
    // IP cuc bo, khac loai mang giua may tinh/dien thoai, v.v...). Them STUN
    // cong khai lam luoi an toan: STUN chi giup 2 may TIM duong toi nhau (goi
    // UDP nho, khong mang du lieu), video/am thanh THAT van di P2P truc tiep,
    // khong qua may chu nao ca — khong lam lo du lieu hinh anh/am thanh.
    ICE: { iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ] },

    async start(calleeId, convId, audioOnly) {
      if (!calleeId) { toast("Không xác định được người nhận.", false); return; }
      try {
        var r = await apiPost("call/start", { callee_id: calleeId, conversation_id: convId });
        if (!r.callee_online) toast("Người nhận hiện không online — vẫn đang gọi thử.", false);
        this.callId = r.call_id; this.convId = r.conversation_id; this.peerId = calleeId;
        this.role = "caller"; this.audioOnly = !!audioOnly;
        await this._media();
        this._openUI(audioOnly ? "Đang gọi thoại…" : "Đang gọi video…");
        this._newPc();
        this.dc = this.pc.createDataChannel("annot");
        this._wireDc(this.dc);
        var offer = await this.pc.createOffer(); await this.pc.setLocalDescription(offer);
        await this._sig("offer", offer);
      } catch (e) {
        toast("Không gọi được: " + (e.message || e), false);
        // Neu call/start da thanh cong (peer da duoc bao "incoming_call") ma loi xay ra
        // SAU do (vd may khong co camera), phai bao huy that su, khong duoc goi im
        // lang — neu khong nguoi kia se thay chuong reo mai khong ai bat may.
        this.hangup(!this.callId);
      }
    },

    onIncoming(d) {
      if (this.callId) { return; } // dang trong cuoc khac
      this.callId = d.call_id; this.convId = d.conversation_id; this.peerId = d.caller_id; this.role = "callee";
      var self = this;
      this._ring(d.caller_name, function accept() {
        apiPost("call/update", { call_id: self.callId, status: "active" });
        // _media() gio KHONG bao gio nem loi (tu ha cap dan: video+audio -> chi audio
        // -> khong gui gi ca) nen luon vao duoc cuoc goi de XEM hinh ben kia, du may
        // nay thieu camera/mic. van .catch() phong ho loi khac ngoai du kien.
        self._media().then(function () { self._openUI("Đang kết nối…"); self._newPc(); })
          .catch(function (e) { toast("Không nhận cuộc gọi được: " + (e.message || e), false); self._reset(); });
      }, function decline() {
        apiPost("call/update", { call_id: self.callId, status: "declined" }); self._reset();
      });
    },

    async onSignal(d) {
      if (d.call_id !== this.callId) return;
      try {
        if (d.kind === "offer") {
          if (!this.pc) this._newPc();
          await this.pc.setRemoteDescription(new RTCSessionDescription(d.payload));
          for (var i = 0; i < this.pendingIce.length; i++) await this.pc.addIceCandidate(this.pendingIce[i]);
          this.pendingIce = [];
          var ans = await this.pc.createAnswer(); await this.pc.setLocalDescription(ans);
          await this._sig("answer", ans);
        } else if (d.kind === "answer") {
          await this.pc.setRemoteDescription(new RTCSessionDescription(d.payload));
        } else if (d.kind === "ice" && d.payload) {
          var c = new RTCIceCandidate(d.payload);
          if (this.pc && this.pc.remoteDescription) await this.pc.addIceCandidate(c); else this.pendingIce.push(c);
        }
      } catch (e) { /* bo qua goi ice tre */ }
    },

    onStatus(d) {
      if (d.call_id !== this.callId) return;
      if (d.status === "declined") { toast("Cuộc gọi bị từ chối.", false); this._reset(); }
      else if (d.status === "ended" || d.status === "missed") { this.hangup(true); }
    },

    // Tu ha cap dan khi thieu thiet bi/quyen — KHONG bao gio nem loi ra ngoai, vi mot
    // may khong co camera (vd may ban cua Giam doc) van phai vao duoc cuoc goi de
    // XEM hinh truyen tu may ben kia (KTV), chi la khong gui duoc hinh cua minh thoi.
    async _media() {
      this.noLocalCam = false;
      var wantVideo = !this.audioOnly;
      if (wantVideo) {
        try {
          // uu tien camera sau tren dien thoai; "ideal" (khong phai "exact") de khong
          // vo mach khi thiet bi (laptop/webcam) khong co facingMode nao ca.
          this.localStream = await navigator.mediaDevices.getUserMedia(
            { video: { facingMode: { ideal: "environment" } }, audio: true });
          return;
        } catch (e1) {
          try {
            // Webcam thuong khong khai bao facingMode -> Chrome bao "Requested device
            // not found". Thu lai voi camera bat ky (khong rang buoc facingMode).
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            return;
          } catch (e2) { /* may nay khong co/khong duoc cap camera -> lui ve chi tieng ben duoi */ }
        }
      }
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (wantVideo) {
          this.noLocalCam = true;
          toast("Máy này không có camera — bạn vẫn xem/nghe được bên kia, nhưng họ sẽ không thấy hình của bạn.", false);
        }
      } catch (e3) {
        // Khong co ca camera lan mic (hoac ca 2 deu bi chan) -> van vao cuoc goi o
        // che do CHI XEM/NGHE, khong gui gi len ca.
        this.localStream = null;
        this.noLocalCam = true;
        toast("Máy này không có camera/mic — chỉ xem/nghe được, phía bên kia sẽ không thấy/nghe bạn.", false);
      }
    },

    _newPc() {
      var self = this;
      this.pc = new RTCPeerConnection(this.ICE);
      if (this.localStream) this.localStream.getTracks().forEach(function (t) { self.pc.addTrack(t, self.localStream); });
      this.pc.onicecandidate = function ( e) { if (e.candidate) self._sig("ice", e.candidate); };
      this.pc.ontrack = function (e) {
        var rv = document.getElementById("call-remote");
        if (rv && rv.srcObject !== e.streams[0]) {
          rv.srcObject = e.streams[0];
          // ontrack chay KHONG dong bo voi cu click cua nguoi dung (no toi sau khi
          // ICE/DTLS xong) nen trinh duyet co the coi day la "tu phat nhac" va chan
          // video CO TIENG (khac video muted cua call-local luon duoc phep). Neu bi
          // chan thi hien nut "Bấm để xem/nghe" — bam vao la 1 cu click that, chac
          // chan phat duoc.
          var p = rv.play();
          if (p && p.catch) p.catch(function () { self._showTapToPlay(); });
        }
        self._setStatus("Đã kết nối");
      };
      this.pc.ondatachannel = function (e) { self.dc = e.channel; self._wireDc(self.dc); };
      this.pc.onconnectionstatechange = function () {
        if (["failed", "disconnected", "closed"].indexOf(self.pc.connectionState) >= 0) self._setStatus("Mất kết nối");
      };
    },

    _sig(kind, payload) { return apiPost("call/signal", { call_id: this.callId, kind: kind, payload: payload }); },

    // ---------- UI cuoc goi ----------
    _openUI(status) {
      if (this.overlay) return;
      var o = el("div", "call-overlay");
      o.innerHTML =
        '<div class="call-box">' +
        '  <video id="call-remote" class="call-remote" autoplay playsinline></video>' +
        '  <video id="call-local" class="call-local" autoplay playsinline muted style="' +
        (this.noLocalCam ? "display:none" : "") + '"></video>' +
        (this.noLocalCam ? '<div class="call-local-empty">🚫 Máy này không có camera</div>' : "") +
        '  <div class="call-status" id="call-status">' + esc(status) + '</div>' +
        '  <div class="call-bar">' +
        '    <button class="call-btn" id="call-freeze" title="Đóng băng để vẽ chỉ dẫn">📸 Chỉ dẫn</button>' +
        '    <button class="call-btn call-end" id="call-hang" title="Kết thúc">✕ Kết thúc</button>' +
        '  </div>' +
        '  <canvas id="freeze-canvas" class="freeze-canvas" style="display:none"></canvas>' +
        '  <canvas id="draw-canvas" class="draw-canvas" style="display:none"></canvas>' +
        '  <div class="freeze-bar" id="freeze-bar" style="display:none">' +
        '    <button class="call-btn" id="freeze-clear">Xóa nét</button>' +
        '    <button class="call-btn" id="freeze-save">💾 Lưu vào hồ sơ</button>' +
        '    <button class="call-btn" id="freeze-resume">▶ Tiếp tục gọi</button>' +
        '  </div>' +
        '  <button class="call-tap-play" id="call-tap-play" style="display:none">🔊 Bấm để xem/nghe</button>' +
        '</div>';
      document.body.appendChild(o); this.overlay = o;
      var lv = document.getElementById("call-local"); if (this.localStream) lv.srcObject = this.localStream;
      document.getElementById("call-hang").onclick = this.hangup.bind(this, false);
      document.getElementById("call-freeze").onclick = this._freeze.bind(this);
      document.getElementById("freeze-resume").onclick = this._unfreeze.bind(this, true);
      document.getElementById("freeze-clear").onclick = this._clearDraw.bind(this, true);
      document.getElementById("freeze-save").onclick = this._saveAnnot.bind(this);
      document.getElementById("call-tap-play").onclick = function () {
        var rv = document.getElementById("call-remote");
        if (rv) rv.play().catch(function () {});
        document.getElementById("call-tap-play").style.display = "none";
      };
    },
    _setStatus(s) { var e = document.getElementById("call-status"); if (e) e.textContent = s; },
    _showTapToPlay() { var b = document.getElementById("call-tap-play"); if (b) b.style.display = "block"; },

    _ring(name, onAccept, onDecline) {
      var o = el("div", "call-overlay ringing");
      o.innerHTML = '<div class="call-ring"><div class="call-ring-name">📞 ' + esc(name) + ' đang gọi…</div>' +
        '<div class="call-bar"><button class="call-btn call-accept" id="ring-acc">Nghe</button>' +
        '<button class="call-btn call-end" id="ring-dec">Từ chối</button></div></div>';
      document.body.appendChild(o); this.overlay = o;
      var self = this;
      document.getElementById("ring-acc").onclick = function () { o.remove(); self.overlay = null; onAccept(); };
      document.getElementById("ring-dec").onclick = function () { o.remove(); self.overlay = null; onDecline(); };
    },

    // ---------- freeze-frame annotation ----------
    _freeze() {
      var remote = document.getElementById("call-remote");
      var src = (remote && remote.videoWidth) ? remote : document.getElementById("call-local");
      if (!src || !src.videoWidth) { toast("Chưa có hình để đóng băng.", false); return; }
      var fc = document.getElementById("freeze-canvas");
      fc.width = src.videoWidth; fc.height = src.videoHeight;
      fc.getContext("2d").drawImage(src, 0, 0, fc.width, fc.height);
      var img = fc.toDataURL("image/jpeg", 0.85);
      this._showFreeze(img);
      if (this.dc && this.dc.readyState === "open") this.dc.send(JSON.stringify({ t: "freeze", img: img }));
    },
    _showFreeze(imgDataUrl) {
      var self = this; this.frozen = true;
      var fc = document.getElementById("freeze-canvas"), dc = document.getElementById("draw-canvas");
      var im = new Image();
      im.onload = function () {
        fc.width = im.width; fc.height = im.height; fc.getContext("2d").drawImage(im, 0, 0);
        dc.width = im.width; dc.height = im.height;
        fc.style.display = "block"; dc.style.display = "block";
        document.getElementById("freeze-bar").style.display = "flex";
        self._wireDraw(dc);
      };
      im.src = imgDataUrl;
    },
    _wireDraw(canvas) {
      var self = this, ctx = canvas.getContext("2d"), drawing = false, pts = [];
      ctx.strokeStyle = "#ff3b30"; ctx.lineWidth = Math.max(3, canvas.width / 260); ctx.lineJoin = "round"; ctx.lineCap = "round";
      function pos(ev) { var r = canvas.getBoundingClientRect(); var t = ev.touches ? ev.touches[0] : ev; return { x: (t.clientX - r.left) / r.width * canvas.width, y: (t.clientY - r.top) / r.height * canvas.height }; }
      function down(ev) { ev.preventDefault(); drawing = true; pts = [pos(ev)]; }
      function move(ev) {
        if (!drawing) return; ev.preventDefault(); var p = pos(ev); pts.push(p);
        ctx.beginPath(); ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      function up() { if (!drawing) return; drawing = false; if (self.dc && self.dc.readyState === "open" && pts.length) self.dc.send(JSON.stringify({ t: "draw", pts: pts, w: canvas.width })); }
      canvas.onmousedown = down; canvas.onmousemove = move; window.addEventListener("mouseup", up);
      canvas.ontouchstart = down; canvas.ontouchmove = move; canvas.ontouchend = up;
    },
    _remoteDraw(pts, w) {
      var canvas = document.getElementById("draw-canvas"); if (!canvas || !canvas.width) return;
      var ctx = canvas.getContext("2d"), sc = canvas.width / (w || canvas.width);
      ctx.strokeStyle = "#ff9500"; ctx.lineWidth = Math.max(3, canvas.width / 260); ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(pts[0].x * sc, pts[0].y * sc);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * sc, pts[i].y * sc);
      ctx.stroke();
    },
    _clearDraw(broadcast) {
      var dc = document.getElementById("draw-canvas"); if (dc) dc.getContext("2d").clearRect(0, 0, dc.width, dc.height);
      if (broadcast && this.dc && this.dc.readyState === "open") this.dc.send(JSON.stringify({ t: "clear" }));
    },
    _unfreeze(broadcast) {
      this.frozen = false;
      ["freeze-canvas", "draw-canvas"].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = "none"; });
      var fb = document.getElementById("freeze-bar"); if (fb) fb.style.display = "none";
      if (broadcast && this.dc && this.dc.readyState === "open") this.dc.send(JSON.stringify({ t: "unfreeze" }));
    },
    async _saveAnnot() {
      var fc = document.getElementById("freeze-canvas"), dc = document.getElementById("draw-canvas");
      if (!fc || !fc.width) return;
      var out = document.createElement("canvas"); out.width = fc.width; out.height = fc.height;
      var octx = out.getContext("2d"); octx.drawImage(fc, 0, 0); octx.drawImage(dc, 0, 0);
      var img = out.toDataURL("image/jpeg", 0.85);
      try {
        await apiPost("call/annotation", { conversation_id: this.convId, call_id: this.callId, image_b64: img, note: "Ảnh chỉ dẫn hiện trường" });
        toast("Đã lưu ảnh chỉ dẫn vào hồ sơ/hội thoại.");
      } catch (e) { toast(e.message || "Không lưu được.", false); }
    },

    _wireDc(dc) {
      var self = this;
      dc.onmessage = function (ev) {
        var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (d.t === "freeze") self._showFreeze(d.img);
        else if (d.t === "draw") self._remoteDraw(d.pts, d.w);
        else if (d.t === "clear") self._clearDraw(false);
        else if (d.t === "unfreeze") self._unfreeze(false);
      };
    },

    hangup(silent) {
      if (!silent && this.callId) apiPost("call/update", { call_id: this.callId, status: "ended" }).catch(function () {});
      this._reset();
    },
    _reset() {
      try { if (this.localStream) this.localStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      try { if (this.pc) this.pc.close(); } catch (e) {}
      if (this.overlay) { this.overlay.remove(); this.overlay = null; }
      this.pc = this.dc = this.callId = this.convId = this.peerId = this.role = null;
      this.localStream = null; this.pendingIce = []; this.frozen = false;
    },
  };
  window._SocialCall = Call;
})();
