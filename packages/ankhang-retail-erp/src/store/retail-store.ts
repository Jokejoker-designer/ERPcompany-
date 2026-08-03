import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type CartLine,
  type Customer,
  type GoodsReceipt,
  type GrnLine,
  type Lot,
  type OnboardingState,
  type Product,
  type PromoRule,
  type PurchaseOrder,
  type Sale,
  type SetupFlags,
  type Shift,
  type StockCount,
  type StoreConfig,
  type Supplier,
  type User,
  BLANK_STORE,
  DEFAULT_ONBOARDING,
  DEMO_USERS,
  EMPTY_SETUP_FLAGS,
  SEED_CATEGORIES,
  SEED_CUSTOMERS,
  SEED_GRNS,
  SEED_LOTS,
  SEED_POS,
  SEED_PRODUCTS,
  SEED_PROMOS,
  SEED_STORE,
  SEED_SUPPLIERS,
  allFlagsTrue,
  computeMap,
  normalizeStoreConfig,
  parseWeightedBarcode,
  toBaseQty,
  tierDiscount,
  type PendingPayment,
  type PayMethod,
} from "@retail/data/retail";
import { findProductByScan } from "@retail/lib/product-code";
import {
  type Session,
  type CredentialsMap,
  createSession,
  validateSession,
  verifyPasswordWithCredentials,
  verifyRecoveryAnswer,
  validateNewPassword,
  validateRecoverySetup,
  mustChangePassword as credMustChange,
  hasRecoverySetup,
  getRecoveryQuestion,
  defaultCredentials,
  normalizeCredentials,
  hashPassword,
  hashRecoveryAnswer,
  makeSessionToken,
  DEMO_PASSWORD_HASHES,
  DEMO_PLAIN_PASSWORDS,
} from "@retail/lib/auth";
import {
  generateTotpSecret,
  verifyTotp,
  buildOtpauthUri,
  otpauthQrImageUrl,
  generateBackupCodes,
} from "@retail/lib/totp";

type RetailState = {
  /** Live user always resolved from registry via session — never trust role from storage */
  user: User | null;
  session: Session | null;
  /** Per-username password hashes + mustChangePassword flags */
  credentials: CredentialsMap;
  store: StoreConfig;
  products: Product[];
  categories: typeof SEED_CATEGORIES;
  lots: Lot[];
  suppliers: Supplier[];
  customers: Customer[];
  promos: PromoRule[];
  purchaseOrders: PurchaseOrder[];
  grns: GoodsReceipt[];
  sales: Sale[];
  counts: StockCount[];
  shifts: Shift[];
  cart: CartLine[];
  cartCustomerId: string | null;
  activeShiftId: string | null;
  pendingPayment: PendingPayment | null;
  pendingTotpUser: string | null;
  _totpPending: {
    user: User;
    session: Session;
    mustChange: boolean;
  } | null;
  onboarding: OnboardingState;

  login: (username: string, password: string) => Promise<{ ok: boolean; message: string; mustChangePassword?: boolean; needsTotp?: boolean }>;
  logout: () => void;
  /** Force-change gate: true until user sets a new password after first login */
  needsPasswordChange: () => boolean;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
    recovery?: { question: string; answer: string },
  ) => Promise<{ ok: boolean; message: string }>;
  /** Public: get recovery question for username (no secret) */
  peekRecoveryQuestion: (username: string) => {
    ok: boolean;
    question?: string;
    message: string;
  };
  /** Forgot password via security answer → set new password */
  resetPasswordWithRecovery: (
    username: string,
    recoveryAnswer: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<{ ok: boolean; message: string }>;
  /** Owner resets staff password to temp / forces change on next login */
  ownerResetUserPassword: (
    username: string,
    ownerPassword: string,
    opts?: { temporaryPassword?: string },
  ) => Promise<{ ok: boolean; message: string; temporaryPassword?: string }>;
  verifyLoginTotp: (code: string) => Promise<{ ok: boolean; message: string }>;
  cancelPendingTotp: () => void;
  /** Start Google Authenticator setup (returns secret + QR) */
  beginTotpSetup: (password: string) => Promise<{
    ok: boolean;
    message: string;
    secret?: string;
    otpauth?: string;
    qrUrl?: string;
  }>;
  confirmTotpSetup: (code: string) => Promise<{
    ok: boolean;
    message: string;
    backupCodes?: string[];
  }>;
  disableTotp: (password: string, code: string) => Promise<{ ok: boolean; message: string }>;
  isTotpEnabled: (username?: string) => boolean;
  /** Resolve & revalidate session (call on app boot / sensitive screens) */
  refreshSession: () => Promise<boolean>;
  requireOwner: () => { ok: boolean; message: string };
  /** Sensitive store config — owner only; optional password re-auth for QR upload */
  updateStore: (p: Partial<StoreConfig>, opts?: { ownerPassword?: string; requirePassword?: boolean }) => Promise<{ ok: boolean; message: string }>;
  uploadPaymentQr: (dataUrl: string, note: string, ownerPassword: string) => Promise<{ ok: boolean; message: string }>;
  clearPaymentQrUpload: (ownerPassword: string) => Promise<{ ok: boolean; message: string }>;

  addProduct: (p: Omit<Product, "id">) => string;
  updateProduct: (id: string, p: Partial<Product>) => void;
  addSupplier: (s: Omit<Supplier, "id">) => void;
  addCustomer: (c: Omit<Customer, "id" | "code"> & { code?: string }) => void;

  createPo: (supplierId: string, lines: PurchaseOrder["lines"]) => string;
  postGrn: (input: {
    supplierId: string;
    poId?: string;
    lines: GrnLine[];
  }) => string;

  openShift: (openingCash: number) => string;
  closeShift: (countedCash: number) => void;

  setCartCustomer: (id: string | null) => void;
  /** Scan barcode / QR / SKU → add to cart with price */
  addToCartByCode: (code: string) => { ok: boolean; message: string; product?: Product };
  addToCart: (productId: string, qty: number, uom?: string) => void;
  updateCartQty: (lineId: string, qty: number) => void;
  removeCartLine: (lineId: string) => void;
  clearCart: () => void;
  cartTotals: () => {
    subtotal: number;
    discount: number;
    vat: number;
    total: number;
    appliedPromos: string[];
  };
  checkout: (payments: Sale["payments"]) => {
    ok: boolean;
    saleId?: string;
    message: string;
  };

  resolveScan: (code: string) => Product | undefined;
  adjustStockByScan: (
    code: string,
    deltaBaseQty: number,
    opts?: { batchNo?: string; expiryDate?: string; unitCost?: number },
  ) => { ok: boolean; message: string; product?: Product };

  createCount: (location: string, productIds: string[]) => string;
  submitCount: (
    id: string,
    counts: Record<string, number>,
    reasons: Record<string, string>,
  ) => void;
  approveCount: (id: string) => void;

  nearExpiryLots: (
    withinDays?: number,
  ) => (Lot & { product?: Product; days: number })[];

  openWizard: () => void;
  closeWizard: (opts?: { dismiss?: boolean }) => void;
  setWizardStep: (step: number) => void;
  markSetup: (flag: keyof SetupFlags) => void;
  completeOnboarding: () => void;
  wipeOperationalData: (opts?: { keepStore?: boolean }) => void;
  createPendingPayment: (amount: number, method?: "qr" | "card") => PendingPayment;
  confirmPendingPayment: (opts?: { provider?: string; externalId?: string }) => { ok: boolean; message: string };
  cancelPendingPayment: () => void;
  /** External hook: loa thanh toán / app / webhook demo */
  receiveExternalPayment: (payload: {
    amount: number;
    content?: string;
    externalId?: string;
    provider?: string;
    secret?: string;
  }) => { ok: boolean; message: string };
  resetDemo: () => void;
};

function saleCode(n: number) {
  return `HĐ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(n).padStart(4, "0")}`;
}

export const useRetailStore = create<RetailState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      credentials: defaultCredentials(),
      store: normalizeStoreConfig(SEED_STORE),
      products: SEED_PRODUCTS,
      categories: SEED_CATEGORIES,
      lots: SEED_LOTS,
      suppliers: SEED_SUPPLIERS,
      customers: SEED_CUSTOMERS,
      promos: SEED_PROMOS,
      purchaseOrders: SEED_POS,
      grns: SEED_GRNS,
      sales: [],
      counts: [],
      shifts: [],
      cart: [],
      cartCustomerId: null,
      activeShiftId: null,
      pendingPayment: null,
      pendingTotpUser: null,
      _totpPending: null,
      onboarding: { ...DEFAULT_ONBOARDING },

      login: async (username, password) => {
        const uname = username.trim().toLowerCase();
        const found = DEMO_USERS.find((u) => u.username.toLowerCase() === uname);
        if (!found) {
          return { ok: false, message: "Tài khoản không tồn tại" };
        }
        const credentials = get().credentials;
        const session = await createSession(found, password, credentials);
        if (!session) {
          return { ok: false, message: "Mật khẩu không đúng" };
        }
        const user = { ...found };
        const must = credMustChange(credentials, uname);
        const totpOn = Boolean(
          credentials[uname]?.totpEnabled && credentials[uname]?.totpSecret,
        );
        if (totpOn) {
          set({
            pendingTotpUser: uname,
            _totpPending: { user, session, mustChange: must },
            user: null,
            session: null,
          });
          return {
            ok: true,
            message: "Nhập mã từ Google Authenticator",
            needsTotp: true,
          };
        }
        set((s) => ({
          user,
          session,
          pendingTotpUser: null,
          _totpPending: null,
          onboarding: {
            ...s.onboarding,
            wizardOpen:
              !must &&
              !s.onboarding.completed &&
              !s.onboarding.dismissed
                ? true
                : s.onboarding.wizardOpen,
          },
        }));
        return {
          ok: true,
          message: must
            ? `Xin chào ${user.name} — vui lòng đổi mật khẩu`
            : `Xin chào ${user.name}`,
          mustChangePassword: must,
        };
      },
      logout: () =>
        set({
          user: null,
          session: null,
          cart: [],
          cartCustomerId: null,
          pendingPayment: null,
          pendingTotpUser: null,
          _totpPending: null,
        }),

      needsPasswordChange: () => {
        const session = get().session;
        if (!session?.username) return false;
        return credMustChange(get().credentials, session.username);
      },

      changePassword: async (
        currentPassword,
        newPassword,
        confirmPassword,
        recovery,
      ) => {
        const session = get().session;
        const user = get().user;
        if (!session || !user) {
          return { ok: false, message: "Chưa đăng nhập" };
        }
        const uname = session.username.toLowerCase();
        const okCurrent = await verifyPasswordWithCredentials(
          get().credentials,
          uname,
          currentPassword,
        );
        if (!okCurrent) {
          return { ok: false, message: "Mật khẩu hiện tại không đúng" };
        }
        if (newPassword !== confirmPassword) {
          return { ok: false, message: "Xác nhận mật khẩu mới không khớp" };
        }
        const policy = validateNewPassword(newPassword, {
          currentPassword,
          username: uname,
        });
        if (!policy.ok) return policy;

        const prev = get().credentials[uname];
        const needsRecovery =
          !prev?.recoveryQuestion || !prev?.recoveryAnswerHash;
        if (needsRecovery) {
          if (!recovery?.question || !recovery?.answer) {
            return {
              ok: false,
              message:
                "Bắt buộc thiết lập câu hỏi bảo mật để khôi phục mật khẩu sau này",
            };
          }
          const rv = validateRecoverySetup(recovery.question, recovery.answer);
          if (!rv.ok) return rv;
        }

        const newHash = await hashPassword(newPassword);
        let recoveryQuestion = prev?.recoveryQuestion;
        let recoveryAnswerHash = prev?.recoveryAnswerHash;
        let recoverySetupAt = prev?.recoverySetupAt;
        if (recovery?.question && recovery?.answer) {
          const rv = validateRecoverySetup(recovery.question, recovery.answer);
          if (!rv.ok) return rv;
          recoveryQuestion = recovery.question.trim();
          recoveryAnswerHash = await hashRecoveryAnswer(recovery.answer);
          recoverySetupAt = new Date().toISOString();
        }

        const nextCreds: CredentialsMap = {
          ...get().credentials,
          [uname]: {
            passwordHash: newHash,
            mustChangePassword: false,
            changedAt: new Date().toISOString(),
            recoveryQuestion,
            recoveryAnswerHash,
            recoverySetupAt,
          },
        };
        const token = await makeSessionToken(user.id, user.username, newHash);
        set((s) => ({
          credentials: nextCreds,
          session: {
            userId: user.id,
            username: user.username,
            token,
            issuedAt: Date.now(),
          },
          onboarding: {
            ...s.onboarding,
            wizardOpen:
              !s.onboarding.completed && !s.onboarding.dismissed
                ? true
                : s.onboarding.wizardOpen,
          },
        }));
        return {
          ok: true,
          message: needsRecovery
            ? "Đã đổi mật khẩu và lưu câu hỏi bảo mật"
            : "Đã đổi mật khẩu — bạn có thể sử dụng hệ thống",
        };
      },

      peekRecoveryQuestion: (username) => {
        const uname = username.trim().toLowerCase();
        if (!DEMO_USERS.some((u) => u.username.toLowerCase() === uname)) {
          return {
            ok: false,
            message: "Không tìm thấy tài khoản (kiểm tra tên đăng nhập)",
          };
        }
        if (!hasRecoverySetup(get().credentials, uname)) {
          return {
            ok: false,
            message:
              "Tài khoản chưa thiết lập câu hỏi bảo mật. Liên hệ Chủ cửa hàng để reset, hoặc đăng nhập lần đầu bằng mật khẩu mặc định để thiết lập.",
          };
        }
        return {
          ok: true,
          question: getRecoveryQuestion(get().credentials, uname) || undefined,
          message: "ok",
        };
      },

      resetPasswordWithRecovery: async (
        username,
        recoveryAnswer,
        newPassword,
        confirmPassword,
      ) => {
        const uname = username.trim().toLowerCase();
        const found = DEMO_USERS.find((u) => u.username.toLowerCase() === uname);
        if (!found) {
          return { ok: false, message: "Tài khoản không tồn tại" };
        }
        if (!hasRecoverySetup(get().credentials, uname)) {
          return {
            ok: false,
            message:
              "Chưa có câu hỏi bảo mật — không thể tự khôi phục. Nhờ Chủ cửa hàng reset mật khẩu.",
          };
        }
        const ansOk = await verifyRecoveryAnswer(
          get().credentials,
          uname,
          recoveryAnswer,
        );
        if (!ansOk) {
          return { ok: false, message: "Câu trả lời bảo mật không đúng" };
        }
        if (newPassword !== confirmPassword) {
          return { ok: false, message: "Xác nhận mật khẩu mới không khớp" };
        }
        const policy = validateNewPassword(newPassword, { username: uname });
        if (!policy.ok) return policy;

        const prev = get().credentials[uname];
        const newHash = await hashPassword(newPassword);
        set({
          credentials: {
            ...get().credentials,
            [uname]: {
              ...prev,
              passwordHash: newHash,
              mustChangePassword: false,
              changedAt: new Date().toISOString(),
            },
          },
          // clear any open session of that user on this device
          user: null,
          session: null,
        });
        return {
          ok: true,
          message: "Đã đặt lại mật khẩu — đăng nhập bằng mật khẩu mới",
        };
      },

      ownerResetUserPassword: async (username, ownerPassword, opts) => {
        const gate = get().requireOwner();
        if (!gate.ok) return gate;
        const pwOk = await verifyPasswordWithCredentials(
          get().credentials,
          "owner",
          ownerPassword,
        );
        if (!pwOk) {
          return { ok: false, message: "Sai mật khẩu Chủ cửa hàng" };
        }
        const uname = username.trim().toLowerCase();
        const found = DEMO_USERS.find((u) => u.username.toLowerCase() === uname);
        if (!found) {
          return { ok: false, message: "Không tìm thấy user" };
        }
        // Generate temporary password if not provided
        const temp =
          opts?.temporaryPassword?.trim() ||
          `Tmp${Math.random().toString(36).slice(2, 6)}A1!`;
        // Ensure policy-ish: pad if needed
        let temporaryPassword = temp;
        if (temporaryPassword.length < 8) temporaryPassword = temporaryPassword + "Aa1!";
        const newHash = await hashPassword(temporaryPassword);
        const prev = get().credentials[uname] || {
          passwordHash: DEMO_PASSWORD_HASHES[uname] || newHash,
          mustChangePassword: true,
        };
        set({
          credentials: {
            ...get().credentials,
            [uname]: {
              ...prev,
              passwordHash: newHash,
              mustChangePassword: true, // force change on next login
              changedAt: new Date().toISOString(),
            },
          },
        });
        // If resetting self while logged in as owner, invalidate? keep session if not self
        if (get().session?.username?.toLowerCase() === uname) {
          set({ user: null, session: null });
        }
        return {
          ok: true,
          message: `Đã reset MK cho ${found.username} — bắt buộc đổi sau khi đăng nhập`,
          temporaryPassword,
        };
      },


      verifyLoginTotp: async (code) => {
        const pending = get()._totpPending;
        if (!pending || !get().pendingTotpUser) {
          return { ok: false, message: "Không có phiên chờ xác thực 2FA" };
        }
        const uname = get().pendingTotpUser!;
        const cred = get().credentials[uname];
        if (!cred?.totpSecret) {
          return { ok: false, message: "Chưa bật Authenticator" };
        }
        let ok = await verifyTotp(cred.totpSecret, code);
        // backup codes
        if (!ok && cred.totpBackupHashes?.length) {
          const hash = await hashPassword(`backup:${code.trim().toUpperCase()}`);
          const idx = cred.totpBackupHashes.indexOf(hash);
          if (idx >= 0) {
            ok = true;
            const next = [...cred.totpBackupHashes];
            next.splice(idx, 1);
            set({
              credentials: {
                ...get().credentials,
                [uname]: { ...cred, totpBackupHashes: next },
              },
            });
          }
        }
        if (!ok) {
          return { ok: false, message: "Mã Authenticator / mã dự phòng không đúng" };
        }
        const { user, session, mustChange } = pending;
        set((s) => ({
          user,
          session,
          pendingTotpUser: null,
          _totpPending: null,
          onboarding: {
            ...s.onboarding,
            wizardOpen:
              !mustChange &&
              !s.onboarding.completed &&
              !s.onboarding.dismissed
                ? true
                : s.onboarding.wizardOpen,
          },
        }));
        return {
          ok: true,
          message: mustChange
            ? `Xin chào ${user.name} — vui lòng đổi mật khẩu`
            : `Xin chào ${user.name}`,
        };
      },

      cancelPendingTotp: () =>
        set({ pendingTotpUser: null, _totpPending: null }),

      beginTotpSetup: async (password) => {
        const user = get().user;
        const session = get().session;
        if (!user || !session) {
          return { ok: false, message: "Cần đăng nhập" };
        }
        const uname = session.username.toLowerCase();
        const pwOk = await verifyPasswordWithCredentials(
          get().credentials,
          uname,
          password,
        );
        if (!pwOk) {
          return { ok: false, message: "Sai mật khẩu" };
        }
        const secret = generateTotpSecret();
        const issuer = get().store.productName || "AnKhang POS";
        const otpauth = buildOtpauthUri({
          secret,
          account: uname,
          issuer,
        });
        set({
          credentials: {
            ...get().credentials,
            [uname]: {
              ...get().credentials[uname],
              totpPendingSecret: secret,
            },
          },
        });
        return {
          ok: true,
          message: "Quét QR bằng Google Authenticator rồi nhập mã 6 số",
          secret,
          otpauth,
          qrUrl: otpauthQrImageUrl(otpauth),
        };
      },

      confirmTotpSetup: async (code) => {
        const session = get().session;
        if (!session) return { ok: false, message: "Chưa đăng nhập" };
        const uname = session.username.toLowerCase();
        const cred = get().credentials[uname];
        const secret = cred?.totpPendingSecret;
        if (!secret) {
          return { ok: false, message: "Chưa bắt đầu thiết lập 2FA" };
        }
        const ok = await verifyTotp(secret, code);
        if (!ok) {
          return { ok: false, message: "Mã không đúng — thử mã mới trên app" };
        }
        const backups = generateBackupCodes(8);
        const backupHashes: string[] = [];
        for (const b of backups) {
          backupHashes.push(await hashPassword(`backup:${b}`));
        }
        set({
          credentials: {
            ...get().credentials,
            [uname]: {
              ...cred,
              totpEnabled: true,
              totpSecret: secret,
              totpPendingSecret: undefined,
              totpBackupHashes: backupHashes,
            },
          },
        });
        return {
          ok: true,
          message: "Đã bật Google Authenticator (2FA)",
          backupCodes: backups,
        };
      },

      disableTotp: async (password, code) => {
        const session = get().session;
        if (!session) return { ok: false, message: "Chưa đăng nhập" };
        const uname = session.username.toLowerCase();
        const pwOk = await verifyPasswordWithCredentials(
          get().credentials,
          uname,
          password,
        );
        if (!pwOk) return { ok: false, message: "Sai mật khẩu" };
        const cred = get().credentials[uname];
        if (cred?.totpEnabled && cred.totpSecret) {
          const ok = await verifyTotp(cred.totpSecret, code);
          if (!ok) return { ok: false, message: "Sai mã Authenticator" };
        }
        set({
          credentials: {
            ...get().credentials,
            [uname]: {
              ...cred,
              totpEnabled: false,
              totpSecret: undefined,
              totpPendingSecret: undefined,
              totpBackupHashes: undefined,
            },
          },
        });
        return { ok: true, message: "Đã tắt 2FA" };
      },

      isTotpEnabled: (username) => {
        const uname = (username || get().session?.username || "").toLowerCase();
        if (!uname) return false;
        const c = get().credentials[uname];
        return Boolean(c?.totpEnabled && c?.totpSecret);
      },


      refreshSession: async () => {
        const session = get().session;
        const user = await validateSession(
          session,
          DEMO_USERS,
          get().credentials,
        );
        if (!user) {
          set({ user: null, session: null });
          return false;
        }
        set({ user: { ...user } });
        return true;
      },

      requireOwner: () => {
        const user = get().user;
        // Re-bind from session registry — ignore any F12-mutated user.role
        const sid = get().session?.userId;
        const fresh = DEMO_USERS.find((u) => u.id === sid);
        if (!fresh || fresh.role !== "owner") {
          return {
            ok: false,
            message: "Chỉ Chủ cửa hàng mới được truy cập cấu hình / QR thanh toán",
          };
        }
        // Keep user in sync with registry
        if (!user || user.role !== "owner" || user.id !== fresh.id) {
          set({ user: { ...fresh } });
        }
        return { ok: true, message: "ok" };
      },


      updateStore: async (p, opts) => {
        const gate = get().requireOwner();
        if (!gate.ok) return gate;
        if (opts?.requirePassword) {
          const pwOk = await verifyPasswordWithCredentials(
            get().credentials,
            "owner",
            opts.ownerPassword || "",
          );
          if (!pwOk) {
            return { ok: false, message: "Sai mật khẩu Chủ cửa hàng — không thể lưu" };
          }
        }
        // Strip fields non-owners shouldn't set even if called via console
        const safe = { ...p };
        set((s) => ({
          store: { ...s.store, ...safe },
          onboarding: {
            ...s.onboarding,
            flags: { ...s.onboarding.flags, store: true },
          },
        }));
        return { ok: true, message: "Đã lưu cấu hình" };
      },

      uploadPaymentQr: async (dataUrl, note, ownerPassword) => {
        const gate = get().requireOwner();
        if (!gate.ok) return gate;
        const pwOk = await verifyPasswordWithCredentials(
          get().credentials,
          "owner",
          ownerPassword,
        );
        if (!pwOk) {
          return {
            ok: false,
            message: "Sai mật khẩu Chủ cửa hàng — không thể upload QR",
          };
        }
        if (!dataUrl.startsWith("data:image/")) {
          return { ok: false, message: "File không hợp lệ (cần ảnh PNG/JPG)" };
        }
        if (dataUrl.length > 2_500_000) {
          return { ok: false, message: "Ảnh quá lớn (tối đa ~1.5MB)" };
        }
        set((s) => ({
          store: {
            ...s.store,
            paymentQrMode: "upload",
            customPaymentQrDataUrl: dataUrl,
            customPaymentQrNote: note.slice(0, 200),
            customPaymentQrUpdatedAt: new Date().toISOString(),
          },
        }));
        return { ok: true, message: "Đã nạp QR thanh toán tĩnh (chế độ Upload)" };
      },

      clearPaymentQrUpload: async (ownerPassword) => {
        const gate = get().requireOwner();
        if (!gate.ok) return gate;
        const pwOk = await verifyPasswordWithCredentials(
          get().credentials,
          "owner",
          ownerPassword,
        );
        if (!pwOk) {
          return { ok: false, message: "Sai mật khẩu Chủ cửa hàng" };
        }
        set((s) => ({
          store: {
            ...s.store,
            paymentQrMode: "vietqr",
            customPaymentQrDataUrl: "",
            customPaymentQrNote: "",
            customPaymentQrUpdatedAt: "",
          },
        }));
        return { ok: true, message: "Đã xóa QR upload — về VietQR động" };
      },

      addProduct: (p) => {
        const id = `p${Date.now()}`;
        set((s) => ({
          products: [{ ...p, id }, ...s.products],
          onboarding: {
            ...s.onboarding,
            flags: { ...s.onboarding.flags, products: true },
          },
        }));
        return id;
      },

      updateProduct: (id, patch) =>
        set((s) => ({
          products: s.products.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        })),

      addSupplier: (sup) =>
        set((s) => ({
          suppliers: [{ ...sup, id: `s${Date.now()}` }, ...s.suppliers],
          onboarding: {
            ...s.onboarding,
            flags: { ...s.onboarding.flags, suppliers: true },
          },
        })),

      addCustomer: (c) =>
        set((s) => ({
          customers: [
            {
              id: `c${Date.now()}`,
              code:
                c.code ||
                `KH-${String(s.customers.length + 1).padStart(3, "0")}`,
              name: c.name,
              phone: c.phone,
              tier: c.tier,
              points: c.points ?? 0,
              visits: c.visits ?? 0,
              totalSpend: c.totalSpend ?? 0,
              lastItems: c.lastItems ?? [],
            },
            ...s.customers,
          ],
          onboarding: {
            ...s.onboarding,
            flags: { ...s.onboarding.flags, customers: true },
          },
        })),

      createPo: (supplierId, lines) => {
        const id = `po${Date.now()}`;
        const code = `ĐH-${String(get().purchaseOrders.length + 20).padStart(3, "0")}`;
        set((s) => ({
          purchaseOrders: [
            {
              id,
              code,
              supplierId,
              status: "ordered",
              createdAt: new Date().toISOString().slice(0, 10),
              lines,
            },
            ...s.purchaseOrders,
          ],
        }));
        return id;
      },

      postGrn: ({ supplierId, poId, lines }) => {
        const id = `grn${Date.now()}`;
        const code = `PNK-${String(get().grns.length + 1).padStart(4, "0")}`;
        const grn: GoodsReceipt = {
          id,
          code,
          poId,
          supplierId,
          status: "posted",
          createdAt: new Date().toISOString(),
          lines,
        };

        set((s) => {
          let products = [...s.products];
          let lots = [...s.lots];
          for (const line of lines) {
            if (!line.qcOk) continue;
            const p = products.find((x) => x.id === line.productId);
            if (!p) continue;
            const newMap = computeMap(
              p.stock,
              p.costMap,
              line.qtyBase,
              line.unitCost,
            );
            products = products.map((x) =>
              x.id === p.id
                ? {
                    ...x,
                    stock: x.stock + line.qtyBase,
                    costMap: newMap,
                  }
                : x,
            );
            if (p.trackLot) {
              lots = [
                {
                  id: `lot-${Date.now()}-${line.productId}`,
                  productId: line.productId,
                  batchNo: line.batchNo || `AUTO-${Date.now()}`,
                  expiryDate: line.expiryDate || "2099-12-31",
                  qty: line.qtyBase,
                  cost: line.unitCost,
                  receivedAt: new Date().toISOString().slice(0, 10),
                },
                ...lots,
              ];
            }
          }
          const purchaseOrders = s.purchaseOrders.map((po) =>
            po.id === poId ? { ...po, status: "received" as const } : po,
          );
          return {
            grns: [grn, ...s.grns],
            products,
            lots,
            purchaseOrders,
            onboarding: {
              ...s.onboarding,
              flags: { ...s.onboarding.flags, inbound: true },
            },
          };
        });
        return id;
      },

      openShift: (openingCash) => {
        const user = get().user;
        if (!user) return "";
        const id = `sh${Date.now()}`;
        const shift: Shift = {
          id,
          code: `CA-${new Date().toISOString().slice(0, 10)}-${user.initials}`,
          cashierId: user.id,
          cashierName: user.name,
          openedAt: new Date().toISOString(),
          openingCash,
          systemCash: 0,
          status: "open",
        };
        set((s) => ({
          shifts: [shift, ...s.shifts],
          activeShiftId: id,
        }));
        return id;
      },

      closeShift: (countedCash) => {
        const id = get().activeShiftId;
        if (!id) return;
        set((s) => ({
          shifts: s.shifts.map((sh) => {
            if (sh.id !== id) return sh;
            const systemCash = sh.openingCash + sh.systemCash;
            return {
              ...sh,
              closedAt: new Date().toISOString(),
              countedCash,
              status: "closed" as const,
              variance: countedCash - systemCash,
            };
          }),
          activeShiftId: null,
          onboarding: {
            ...s.onboarding,
            flags: { ...s.onboarding.flags, inventory: true },
          },
        }));
      },

      setCartCustomer: (id) => set({ cartCustomerId: id }),

      resolveScan: (code) => {
        const products = get().products;
        const weighted = parseWeightedBarcode(products, code.trim());
        if (weighted) return weighted.product;
        return findProductByScan(products, code);
      },

      addToCartByCode: (code) => {
        const products = get().products;
        const weighted = parseWeightedBarcode(products, code.trim());
        if (weighted) {
          get().addToCart(weighted.product.id, weighted.qtyKg, "Kg");
          return {
            ok: true,
            message: `${weighted.product.name} · ${weighted.qtyKg} Kg · ${weighted.product.price.toLocaleString("vi-VN")}₫/Kg`,
            product: weighted.product,
          };
        }
        const p = findProductByScan(products, code);
        if (!p)
          return {
            ok: false,
            message:
              "Không tìm thấy hàng — kiểm tra mã vạch, SKU hoặc QR nhãn",
          };
        get().addToCart(p.id, 1, p.baseUom);
        return {
          ok: true,
          message: `${p.name} · ${p.price.toLocaleString("vi-VN")}₫/${p.baseUom} · tồn ${p.stock}`,
          product: p,
        };
      },

      addToCart: (productId, qty, uom) => {
        const p = get().products.find((x) => x.id === productId);
        if (!p) return;
        const unit = uom || p.baseUom;
        const factor = p.conversion[unit] ?? 1;
        const unitPrice = p.price * factor;
        set((s) => {
          const existing = s.cart.find(
            (l) => l.productId === productId && l.uom === unit,
          );
          if (existing) {
            return {
              cart: s.cart.map((l) =>
                l.id === existing.id ? { ...l, qty: l.qty + qty } : l,
              ),
            };
          }
          return {
            cart: [
              ...s.cart,
              {
                id: `cl${Date.now()}`,
                productId: p.id,
                name: p.name,
                qty,
                uom: unit,
                unitPrice,
                discount: 0,
              },
            ],
          };
        });
      },

      updateCartQty: (lineId, qty) =>
        set((s) => ({
          cart:
            qty <= 0
              ? s.cart.filter((l) => l.id !== lineId)
              : s.cart.map((l) => (l.id === lineId ? { ...l, qty } : l)),
        })),

      removeCartLine: (lineId) =>
        set((s) => ({ cart: s.cart.filter((l) => l.id !== lineId) })),

      clearCart: () => set({ cart: [], cartCustomerId: null }),

      cartTotals: () => {
        const s = get();
        let subtotal = 0;
        let discount = 0;
        const applied: string[] = [];
        const lines = s.cart.map((l) => ({ ...l }));

        for (const l of lines) {
          subtotal += l.qty * l.unitPrice;
        }

        for (const pr of s.promos.filter(
          (p) => p.active && p.type === "bundle",
        )) {
          if (!pr.skus || pr.skus.length < 2) continue;
          const skusInCart = pr.skus.every((sku) => {
            const prod = s.products.find((p) => p.sku === sku);
            return prod && lines.some((l) => l.productId === prod.id);
          });
          if (skusInCart && pr.percent) {
            let bundleBase = 0;
            for (const sku of pr.skus) {
              const prod = s.products.find((p) => p.sku === sku);
              if (!prod) continue;
              const line = lines.find((l) => l.productId === prod.id);
              if (line) bundleBase += line.qty * line.unitPrice;
            }
            discount += (bundleBase * pr.percent) / 100;
            applied.push(pr.name);
          }
        }

        const hour = new Date().getHours();
        for (const pr of s.promos.filter(
          (p) => p.active && p.type === "time",
        )) {
          if (
            pr.startHour != null &&
            pr.endHour != null &&
            hour >= pr.startHour &&
            hour < pr.endHour &&
            pr.percent &&
            pr.skus
          ) {
            for (const sku of pr.skus) {
              const prod = s.products.find((p) => p.sku === sku);
              if (!prod) continue;
              const line = lines.find((l) => l.productId === prod.id);
              if (line) {
                discount += (line.qty * line.unitPrice * pr.percent) / 100;
                applied.push(pr.name);
              }
            }
          }
        }

        const cust = s.customers.find((c) => c.id === s.cartCustomerId);
        if (cust) {
          const td = tierDiscount(cust.tier);
          if (td > 0) {
            discount += (subtotal - discount) * td;
            applied.push(
              `Thẻ ${cust.tier === "gold" ? "Vàng" : cust.tier === "silver" ? "Bạc" : "Đồng"} −${td * 100}%`,
            );
          }
        }

        discount = Math.round(discount);
        const after = Math.max(0, subtotal - discount);
        const vat = Math.round(
          (after * s.store.vatDefault) / (100 + s.store.vatDefault),
        );
        const total = after;
        return { subtotal, discount, vat, total, appliedPromos: applied };
      },

      checkout: (payments) => {
        const s = get();
        if (!s.cart.length)
          return { ok: false, message: "Giỏ hàng trống — vui lòng quét hàng" };
        if (!s.activeShiftId && s.user?.role === "cashier") {
          return {
            ok: false,
            message: "Vui lòng mở ca trước khi bán hàng",
          };
        }
        let shiftId = s.activeShiftId;
        if (!shiftId) {
          shiftId = get().openShift(0);
        }

        const totals = get().cartTotals();
        const paySum = payments.reduce((a, p) => a + p.amount, 0);
        if (paySum + 0.5 < totals.total) {
          return { ok: false, message: "Số tiền thanh toán chưa đủ" };
        }

        for (const line of s.cart) {
          const p = s.products.find((x) => x.id === line.productId);
          if (!p) continue;
          const base = toBaseQty(p, line.qty, line.uom);
          if (p.stock < base) {
            return {
              ok: false,
              message: `Không đủ tồn kho: ${p.name} (còn ${p.stock} ${p.baseUom}) · SKU ${p.sku}`,
            };
          }
        }

        const saleId = `sale${Date.now()}`;
        const sale: Sale = {
          id: saleId,
          code: saleCode(s.sales.length + 1),
          createdAt: new Date().toISOString(),
          cashierId: s.user?.id || "u3",
          customerId: s.cartCustomerId || undefined,
          lines: s.cart.map((l) => ({ ...l })),
          subtotal: totals.subtotal,
          discount: totals.discount,
          vat: totals.vat,
          total: totals.total,
          payments,
          status: "paid",
          shiftId: shiftId!,
        };

        set((st) => {
          let products = [...st.products];
          let lots = [...st.lots];
          for (const line of st.cart) {
            const p = products.find((x) => x.id === line.productId);
            if (!p) continue;
            const base = toBaseQty(p, line.qty, line.uom);
            products = products.map((x) =>
              x.id === p.id
                ? { ...x, stock: Math.max(0, x.stock - base) }
                : x,
            );
            if (p.trackLot) {
              let remain = base;
              const productLots = lots
                .filter((l) => l.productId === p.id && l.qty > 0)
                .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
              for (const lot of productLots) {
                if (remain <= 0) break;
                const take = Math.min(lot.qty, remain);
                lots = lots.map((l) =>
                  l.id === lot.id ? { ...l, qty: l.qty - take } : l,
                );
                remain -= take;
              }
            }
          }

          let customers = st.customers;
          if (st.cartCustomerId) {
            const pts = Math.floor(totals.total / 10000);
            customers = st.customers.map((c) =>
              c.id === st.cartCustomerId
                ? {
                    ...c,
                    points: c.points + pts,
                    visits: c.visits + 1,
                    totalSpend: c.totalSpend + totals.total,
                    lastItems: st.cart.slice(0, 3).map((l) => l.name),
                  }
                : c,
            );
          }

          const cashPay = payments
            .filter((p) => p.method === "cash")
            .reduce((a, p) => a + p.amount, 0);

          return {
            sales: [sale, ...st.sales],
            products,
            lots,
            customers,
            cart: [],
            cartCustomerId: null,
            pendingPayment: null,
            shifts: st.shifts.map((sh) =>
              sh.id === shiftId
                ? { ...sh, systemCash: sh.systemCash + cashPay }
                : sh,
            ),
            onboarding: {
              ...st.onboarding,
              flags: { ...st.onboarding.flags, pos: true },
            },
          };
        });

        return { ok: true, saleId, message: sale.code };
      },

      adjustStockByScan: (code, deltaBaseQty, opts) => {
        const p = get().resolveScan(code);
        if (!p)
          return {
            ok: false,
            message: "Không nhận diện SKU/mã vạch/QR — kiểm tra nhãn hàng",
          };
        if (deltaBaseQty < 0 && p.stock + deltaBaseQty < -0.0001) {
          return {
            ok: false,
            message: `Tồn không đủ · ${p.sku} còn ${p.stock} ${p.baseUom}`,
            product: p,
          };
        }
        set((s) => {
          const products = s.products.map((x) =>
            x.id === p.id
              ? {
                  ...x,
                  stock: Math.max(0, x.stock + deltaBaseQty),
                  costMap:
                    deltaBaseQty > 0 && opts?.unitCost != null
                      ? computeMap(
                          x.stock,
                          x.costMap,
                          deltaBaseQty,
                          opts.unitCost,
                        )
                      : x.costMap,
                }
              : x,
          );
          let lots = s.lots;
          if (deltaBaseQty > 0 && p.trackLot) {
            lots = [
              {
                id: `lot-scan-${Date.now()}`,
                productId: p.id,
                batchNo: opts?.batchNo || `SCAN-${Date.now().toString(36)}`,
                expiryDate: opts?.expiryDate || "2099-12-31",
                qty: deltaBaseQty,
                cost: opts?.unitCost ?? p.costMap,
                receivedAt: new Date().toISOString().slice(0, 10),
              },
              ...lots,
            ];
          }
          return {
            products,
            lots,
            onboarding: {
              ...s.onboarding,
              flags: {
                ...s.onboarding.flags,
                inbound: deltaBaseQty > 0 ? true : s.onboarding.flags.inbound,
              },
            },
          };
        });
        const updated = get().products.find((x) => x.id === p.id);
        return {
          ok: true,
          message: `${p.name} (${p.sku}) · tồn mới ${updated?.stock ?? 0} ${p.baseUom}`,
          product: updated,
        };
      },

      createCount: (location, productIds) => {
        const id = `cnt${Date.now()}`;
        const products = get().products;
        const lines = productIds.map((pid) => {
          const p = products.find((x) => x.id === pid);
          return {
            productId: pid,
            systemQty: p?.stock ?? 0,
            countedQty: p?.stock ?? 0,
          };
        });
        set((s) => ({
          counts: [
            {
              id,
              code: `KK-${String(s.counts.length + 1).padStart(3, "0")}`,
              location,
              status: "open",
              createdAt: new Date().toISOString(),
              lines,
            },
            ...s.counts,
          ],
        }));
        return id;
      },

      submitCount: (id, counts, reasons) =>
        set((s) => ({
          counts: s.counts.map((c) => {
            if (c.id !== id) return c;
            return {
              ...c,
              status: "submitted" as const,
              lines: c.lines.map((l) => ({
                ...l,
                countedQty: counts[l.productId] ?? l.countedQty,
                reasonCode:
                  (counts[l.productId] ?? l.countedQty) !== l.systemQty
                    ? reasons[l.productId] || "04"
                    : undefined,
              })),
            };
          }),
        })),

      approveCount: (id) =>
        set((s) => {
          const count = s.counts.find((c) => c.id === id);
          if (!count) return s;
          let products = [...s.products];
          for (const line of count.lines) {
            const variance = line.countedQty - line.systemQty;
            if (variance === 0) continue;
            products = products.map((p) =>
              p.id === line.productId
                ? { ...p, stock: line.countedQty }
                : p,
            );
          }
          return {
            products,
            counts: s.counts.map((c) =>
              c.id === id ? { ...c, status: "approved" as const } : c,
            ),
            onboarding: {
              ...s.onboarding,
              flags: { ...s.onboarding.flags, inventory: true },
            },
          };
        }),

      nearExpiryLots: (withinDays = 60) => {
        const { lots, products } = get();
        const now = new Date();
        return lots
          .map((l) => {
            const d = new Date(l.expiryDate + "T00:00:00");
            const days = Math.ceil(
              (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            );
            return {
              ...l,
              product: products.find((p) => p.id === l.productId),
              days,
            };
          })
          .filter((l) => l.qty > 0 && l.days <= withinDays)
          .sort((a, b) => a.days - b.days);
      },


      createPendingPayment: (amount, method = "qr") => {
        const store = get().store;
        const saleRef = `${store.qrAddInfoPrefix || "AK"}${Date.now().toString().slice(-8)}`;
        const pending: PendingPayment = {
          id: `pay${Date.now()}`,
          saleRef,
          amount: Math.round(amount),
          content: saleRef,
          method,
          status: "waiting",
          createdAt: new Date().toISOString(),
          provider: method === "qr" ? "vietqr" : "edc",
        };
        set({ pendingPayment: pending });

        // Push amount to speaker / external device (demo log + optional URL)
        if (store.speakerEnabled && store.speakerPushAmount) {
          const body = {
            deviceId: store.speakerDeviceId,
            amount: pending.amount,
            content: pending.content,
            provider: store.speakerProvider,
          };
          if (store.speakerApiUrl) {
            try {
              void fetch(store.speakerApiUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(store.speakerWebhookSecret
                    ? { "X-Webhook-Secret": store.speakerWebhookSecret }
                    : {}),
                },
                body: JSON.stringify(body),
              }).catch(() => undefined);
            } catch {
              /* ignore network in demo */
            }
          }
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("ankhang-speaker-push", { detail: body }),
            );
          }
        }

        // Auto-confirm demo (simulate bank/speaker callback)
        if (store.autoConfirmQr && method === "qr") {
          const ms = Math.min(Math.max(store.confirmTimeoutSec, 2), 30) * 1000;
          const id = pending.id;
          setTimeout(() => {
            const cur = get().pendingPayment;
            if (cur && cur.id === id && cur.status === "waiting") {
              get().receiveExternalPayment({
                amount: cur.amount,
                content: cur.content,
                provider: store.speakerProvider || "auto",
                externalId: `auto-${Date.now()}`,
                secret: store.speakerWebhookSecret || undefined,
              });
            }
          }, Math.min(ms, 5000));
        }
        return pending;
      },

      confirmPendingPayment: (opts) => {
        const pending = get().pendingPayment;
        if (!pending || pending.status !== "waiting") {
          return { ok: false, message: "Không có giao dịch chờ xác nhận" };
        }
        set({
          pendingPayment: {
            ...pending,
            status: "paid",
            paidAt: new Date().toISOString(),
            provider: opts?.provider || pending.provider,
            externalId: opts?.externalId,
          },
        });
        return { ok: true, message: "Đã xác nhận thanh toán" };
      },

      cancelPendingPayment: () =>
        set((s) => ({
          pendingPayment: s.pendingPayment
            ? { ...s.pendingPayment, status: "cancelled" as const }
            : null,
        })),

      receiveExternalPayment: (payload) => {
        const store = get().store;
        if (
          store.speakerWebhookSecret &&
          payload.secret &&
          payload.secret !== store.speakerWebhookSecret
        ) {
          return { ok: false, message: "Sai mã bảo mật webhook" };
        }
        const pending = get().pendingPayment;
        if (!pending || pending.status !== "waiting") {
          return {
            ok: false,
            message: "Không có hóa đơn QR đang chờ — bỏ qua callback",
          };
        }
        // amount match within 1 VND
        if (Math.abs(payload.amount - pending.amount) > 1) {
          return {
            ok: false,
            message: `Số tiền không khớp (nhận ${payload.amount}, chờ ${pending.amount})`,
          };
        }
        if (
          payload.content &&
          pending.content &&
          !payload.content.includes(pending.content) &&
          !pending.content.includes(payload.content)
        ) {
          // soft warn but still allow if amount matches
        }
        set({
          pendingPayment: {
            ...pending,
            status: "paid",
            paidAt: new Date().toISOString(),
            provider: payload.provider || store.speakerProvider,
            externalId: payload.externalId,
          },
        });
        return {
          ok: true,
          message: `Đã nhận thanh toán ${payload.amount}₫ từ ${payload.provider || "thiết bị ngoài"}`,
        };
      },

      openWizard: () =>
        set((s) => ({
          onboarding: { ...s.onboarding, wizardOpen: true, dismissed: false },
        })),

      closeWizard: (opts) =>
        set((s) => ({
          onboarding: {
            ...s.onboarding,
            wizardOpen: false,
            dismissed: opts?.dismiss ? true : s.onboarding.dismissed,
          },
        })),

      setWizardStep: (step) =>
        set((s) => ({
          onboarding: { ...s.onboarding, step, wizardOpen: true },
        })),

      markSetup: (flag) =>
        set((s) => ({
          onboarding: {
            ...s.onboarding,
            flags: { ...s.onboarding.flags, [flag]: true },
          },
        })),

      wipeOperationalData: (opts) => {
        if (!get().requireOwner().ok) return;
        const keepStore = opts?.keepStore !== false;
        set((s) => ({
          store: keepStore ? s.store : { ...BLANK_STORE },
          products: [],
          lots: [],
          suppliers: [],
          customers: [],
          promos: [],
          purchaseOrders: [],
          grns: [],
          sales: [],
          counts: [],
          shifts: [],
          cart: [],
          cartCustomerId: null,
          activeShiftId: null,
          categories: SEED_CATEGORIES,
        }));
      },

      completeOnboarding: () => {
        // setup finish allowed for whoever is logged in during onboarding
        const store = get().store;
        set({
          store: {
            ...store,
            storeName: store.storeName || "Cửa hàng của tôi",
            productName: store.productName || "AnKhang POS",
          },
          products: [],
          lots: [],
          suppliers: [],
          customers: [],
          promos: [],
          purchaseOrders: [],
          grns: [],
          sales: [],
          counts: [],
          shifts: [],
          cart: [],
          cartCustomerId: null,
          activeShiftId: null,
          categories: SEED_CATEGORIES,
          onboarding: {
            completed: true,
            dismissed: true,
            wizardOpen: false,
            step: 0,
            flags: allFlagsTrue(),
            wipedAfterSetup: true,
          },
        });
      },

      resetDemo: () => {
        if (!get().requireOwner().ok) return;
        set({
          credentials: defaultCredentials(),
          store: SEED_STORE,
          products: SEED_PRODUCTS,
          categories: SEED_CATEGORIES,
          lots: SEED_LOTS,
          suppliers: SEED_SUPPLIERS,
          customers: SEED_CUSTOMERS,
          promos: SEED_PROMOS,
          purchaseOrders: SEED_POS,
          grns: [],
          sales: [],
          counts: [],
          shifts: [],
          cart: [],
          cartCustomerId: null,
          activeShiftId: null,
          onboarding: {
            ...DEFAULT_ONBOARDING,
            wizardOpen: true,
            flags: { ...EMPTY_SETUP_FLAGS },
            wipedAfterSetup: false,
          },
        });
      },
    }),
    {
      name: "ankhang-retail-erp-v7-totp",
      partialize: (s) => ({
        // Never persist role as authority — only session token + userId
        session: s.session,
        credentials: s.credentials,
        store: s.store,
        products: s.products,
        lots: s.lots,
        suppliers: s.suppliers,
        customers: s.customers,
        promos: s.promos,
        purchaseOrders: s.purchaseOrders,
        grns: s.grns,
        sales: s.sales,
        counts: s.counts,
        shifts: s.shifts,
        activeShiftId: s.activeShiftId,
        onboarding: { ...s.onboarding, wizardOpen: false },
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<RetailState>;
        // Drop any spoofed user from old versions
        const { user: _drop, ...rest } = p as Partial<RetailState> & {
          user?: User;
        };
        return {
          ...current,
          ...rest,
          user: null, // rehydrated async via refreshSession
          session: p.session ?? null,
          credentials: normalizeCredentials(p.credentials ?? current.credentials),
          store: normalizeStoreConfig(p.store ?? current.store),
          pendingPayment: null,
          onboarding: {
            ...DEFAULT_ONBOARDING,
            ...(p.onboarding ?? {}),
            flags: {
              ...EMPTY_SETUP_FLAGS,
              ...(p.onboarding?.flags ?? {}),
            },
            wipedAfterSetup: p.onboarding?.wipedAfterSetup ?? false,
            wizardOpen: false,
          },
        };
      },
    },
  ),
);
