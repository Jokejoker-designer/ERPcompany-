import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CT_TEMPLATES } from "@/data/ct-registry";
import {
  type BankLine,
  type CompanyConfig,
  type Customer,
  type DocStatus,
  type MaterialItem,
  type OnboardingState,
  type Project,
  type ProjectStage,
  type Quotation,
  type QuotationLine,
  type Receivable,
  type ScanHit,
  type ScanState,
  type SetupFlags,
  type User,
  type WorkflowFlags,
  type WorkflowStepId,
  DEFAULT_ONBOARDING,
  DEMO_USERS,
  EMPTY_SCAN,
  EMPTY_SETUP_FLAGS,
  EMPTY_WORKFLOW,
  SEED_BANK,
  SEED_COMPANY,
  SEED_CUSTOMERS,
  SEED_MATERIALS,
  SEED_PROJECTS,
  SEED_QUOTATIONS,
  SEED_RECEIVABLES,
  buildScanHits,
  makeProject,
  normalizeLine,
  normalizeProject,
  quoteTotal,
  demoDocStatus,
} from "@/data/seed";
import { useDocsStore } from "@/store/docs-store";
import {
  DEFAULT_UI_PREFS,
  type UiPrefs,
  type Density,
  applyBrandToDocument,
  applyDensityToDocument,
  applyMotionPref,
  applyHighContrastToDocument,
} from "@/lib/ui-prefs";
import {
  resolveDataSource,
  setPreferredDataSource,
  type DataSource,
} from "@/lib/api-client";
import {
  createRuntimeCustomer,
  fetchRuntimeBundle,
  fetchRuntimeScanHits,
  fetchRuntimeScanStatus,
  runRuntimeDiskScan,
  runtimeLogin,
  runtimeLogout,
  runtimeMe,
} from "@/lib/runtime-data";
import type { RuntimeDashboard } from "@/lib/api-mappers";
import {
  type CredentialsMap,
  type Session,
  createSession,
  validateSession,
  verifyPasswordWithCredentials,
  verifyRecoveryAnswer,
  validateNewPassword,
  mustChangePassword as credMustChange,
  hasRecoverySetup,
  getRecoveryQuestion,
  defaultCredentials,
  normalizeCredentials,
  hashPassword,
  hashRecoveryAnswer,
  makeSessionToken,
  SECURITY_QUESTIONS,
} from "@/lib/erp-auth";
import {
  generateTotpSecret,
  verifyTotp,
  buildOtpauthUri,
  otpauthQrImageUrl,
  generateBackupCodes,
} from "@/lib/totp";

type ErpState = {
  user: User | null;
  session: Session | null;
  credentials: CredentialsMap;
  pendingTotpUser: string | null;
  _totpPending: { user: User; session: Session; mustChange: boolean } | null;
  /** demo = localStorage seed; runtime = thanh-hoai-runtime cookie API */
  dataSource: DataSource;
  runtimeConnected: boolean;
  runtimeSyncing: boolean;
  runtimeError: string | null;
  runtimeDashboard: RuntimeDashboard | null;
  company: CompanyConfig;
  uiPrefs: UiPrefs;
  customers: Customer[];
  projects: Project[];
  materials: MaterialItem[];
  quotations: Quotation[];
  receivables: Receivable[];
  bankLines: BankLine[];
  docOverrides: Record<string, DocStatus>;
  onboarding: OnboardingState;
  activeProjectId: string | null;
  scan: ScanState;

  login: (username: string, password: string) => Promise<{ ok: boolean; message: string; mustChangePassword?: boolean; needsTotp?: boolean }>;
  logout: () => void;
  needsPasswordChange: () => boolean;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
    recovery?: { question: string; answer: string },
  ) => Promise<{ ok: boolean; message: string }>;
  peekRecoveryQuestion: (username: string) => { ok: boolean; question?: string; message: string };
  resetPasswordWithRecovery: (
    username: string,
    answer: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<{ ok: boolean; message: string }>;
  verifyLoginTotp: (code: string) => Promise<{ ok: boolean; message: string }>;
  cancelPendingTotp: () => void;
  beginTotpSetup: (password: string) => Promise<{ ok: boolean; message: string; secret?: string; qrUrl?: string }>;
  confirmTotpSetup: (code: string) => Promise<{ ok: boolean; message: string; backupCodes?: string[] }>;
  disableTotp: (password: string, code: string) => Promise<{ ok: boolean; message: string }>;
  isTotpEnabled: (username?: string) => boolean;
  refreshSession: () => Promise<boolean>;
  /** Resolve demo vs runtime, restore cookie session if any */
  bootDataSource: () => Promise<DataSource>;
  setDataSource: (source: DataSource) => Promise<void>;
  syncFromRuntime: () => Promise<{ ok: boolean; message: string }>;
  updateCompany: (patch: Partial<CompanyConfig>) => void;
  setDensity: (density: Density) => void;
  setReducedMotion: (v: boolean) => void;
  setHighContrast: (v: boolean) => void;
  completeTour: (role: string) => void;
  restartTour: (role: string) => void;

  addCustomer: (input: Omit<Customer, "id" | "code" | "createdAt"> & { code?: string }) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  removeCustomer: (id: string) => void;

  setActiveProject: (id: string | null) => void;
  addProject: (input: {
    code: string;
    name: string;
    customerId: string;
    address?: string;
    value?: number;
  }) => Project | null;
  updateProject: (id: string, patch: Partial<Project>) => void;
  setProjectStage: (id: string, stage: ProjectStage, progress?: number) => void;
  markWorkflow: (projectId: string, step: WorkflowStepId, done?: boolean) => void;
  setProjectDocStatus: (projectId: string, code: string, status: DocStatus) => void;
  markPhaseDocs: (projectId: string, phase: string, status?: DocStatus) => void;

  addMaterial: (input: Omit<MaterialItem, "id">) => void;
  importPurchaseDemo: () => void;

  addQuotation: (input: {
    customer: string;
    projectCode: string;
    projectName: string;
    vat?: number;
    note?: string;
    lines: Array<Partial<QuotationLine> & Pick<QuotationLine, "name" | "qty" | "unit" | "unitPrice">>;
  }) => string;
  updateQuotationMeta: (
    id: string,
    patch: Partial<
      Pick<
        Quotation,
        "customer" | "projectCode" | "projectName" | "vat" | "note" | "status"
      >
    >,
  ) => void;
  addQuotationLine: (quoteId: string, line?: Partial<QuotationLine>) => void;
  updateQuotationLine: (
    quoteId: string,
    lineId: string,
    patch: Partial<QuotationLine>,
  ) => void;
  removeQuotationLine: (quoteId: string, lineId: string) => void;
  setQuotationStatus: (id: string, status: Quotation["status"]) => void;
  bumpRevision: (id: string) => void;
  promoteQuoteToContract: (quoteId: string) => { contract: string; receivableId: string } | null;

  collectReceivable: (id: string, amount: number) => void;
  setBankStatus: (id: string, status: BankLine["status"]) => void;
  setDocStatus: (code: string, status: DocStatus) => void;

  setScanRoots: (roots: string) => void;
  runEnterpriseScan: () => Promise<number>;
  importScanHits: (ids?: string[]) => {
    customers: number;
    projects: number;
    docs: number;
  };
  clearScan: () => void;

  openWizard: (step?: number) => void;
  closeWizard: (opts?: { dismiss?: boolean }) => void;
  setWizardStep: (step: number) => void;
  markSetup: (flag: keyof SetupFlags) => void;
  completeOnboarding: () => void;
  wipeOperationalData: (opts?: { keepCompany?: boolean }) => void;
  resetDemo: () => void;
};

function scanStatsFromHits(hits: ScanHit[]) {
  return {
    files: hits.length,
    customers: new Set(hits.map((h) => h.customerHint)).size,
    projects: new Set(hits.map((h) => h.projectHint)).size,
    mapped: hits.filter((h) => h.mapped).length,
    imported: hits.filter((h) => h.imported).length,
  };
}

function nextQuoteCode(existing: Quotation[]): string {
  const year = 2026;
  const nums = existing
    .map((q) => {
      const m = q.code.match(/BG-(\d+)-(\d+)/);
      return m ? Number(m[2]) : 0;
    })
    .filter(Boolean);
  const n = (nums.length ? Math.max(...nums) : 60) + 1;
  return `BG-${year}-${String(n).padStart(3, "0")}`;
}

function nextCustomerCode(existing: Customer[]): string {
  const nums = existing
    .map((c) => {
      const m = c.code.match(/KH-(\d+)/);
      return m ? Number(m[1]) : 0;
    })
    .filter(Boolean);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `KH-${String(n).padStart(3, "0")}`;
}

function nextContractCode(receivables: Receivable[]): string {
  const year = 2026;
  const nums = receivables
    .map((r) => {
      const m = r.contract.match(/HĐ-(\d+)-(\d+)/);
      return m ? Number(m[2]) : 0;
    })
    .filter(Boolean);
  const n = (nums.length ? Math.max(...nums) : 20) + 1;
  return `HĐ-${year}-${String(n).padStart(3, "0")}`;
}

function mapQuote(q: Quotation): Quotation {
  return {
    ...q,
    note: q.note ?? "",
    lines: (q.lines ?? []).map((l) => normalizeLine(l, q.vat ?? 8)),
  };
}

function initDocsForStage(stage: ProjectStage): Record<string, DocStatus> {
  const order: ProjectStage[] = ["bao_gia", "thi_cong", "nghiem_thu", "hoan_thanh"];
  const idx = order.indexOf(stage);
  const unlocked =
    idx <= 0
      ? new Set(["00", "01", "04"])
      : idx === 1
        ? new Set(["00", "01", "02", "03", "04", "05"])
        : idx === 2
          ? new Set(["00", "01", "02", "03", "04", "05", "06", "07"])
          : new Set(["00", "01", "02", "03", "04", "05", "06", "07", "08", "09"]);

  const docs: Record<string, DocStatus> = {};
  for (const t of CT_TEMPLATES) {
    if (!unlocked.has(t.phase_code)) docs[t.code] = "missing";
    else if (idx >= 2 && ["00", "01", "04"].includes(t.phase_code))
      docs[t.code] = "enough";
    else if (idx >= 1 && t.phase_code === "04") {
      const d = demoDocStatus(t.code);
      docs[t.code] = d === "missing" ? "pending" : d;
    } else docs[t.code] = demoDocStatus(t.code);
  }
  return docs;
}

function hydrateProject(p: Project): Project {
  const base = normalizeProject(p);
  const docs =
    Object.keys(base.docStatuses || {}).length > 0
      ? base.docStatuses
      : initDocsForStage(base.stage);
  return { ...base, docStatuses: docs };
}

function allFlagsTrue(): SetupFlags {
  return {
    company: true,
    roles: true,
    customers: true,
    projects: true,
    materials: true,
    templates: true,
    scan: true,
    ops: true,
  };
}

function wipeDocsSafe() {
  try {
    useDocsStore.getState().wipeDocs();
  } catch {
    /* docs store may not be ready */
  }
}

export const useErpStore = create<ErpState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      credentials: defaultCredentials(),
      pendingTotpUser: null,
      _totpPending: null,
      dataSource: "demo",
      runtimeConnected: false,
      runtimeSyncing: false,
      runtimeError: null,
      runtimeDashboard: null,
      company: SEED_COMPANY,
      uiPrefs: { ...DEFAULT_UI_PREFS },
      customers: SEED_CUSTOMERS,
      projects: SEED_PROJECTS.map(hydrateProject),
      materials: SEED_MATERIALS,
      quotations: SEED_QUOTATIONS.map(mapQuote),
      receivables: SEED_RECEIVABLES,
      bankLines: SEED_BANK,
      docOverrides: {},
      onboarding: { ...DEFAULT_ONBOARDING },
      activeProjectId: SEED_PROJECTS[2]?.id ?? SEED_PROJECTS[0]?.id ?? null,
      scan: { ...EMPTY_SCAN },

      login: async (username, password) => {
        if (get().dataSource === "runtime") {
          try {
            const { user, mustChange } = await runtimeLogin(username, password);
            const session: Session = {
              userId: user.id,
              username: user.username,
              token: "runtime-cookie",
              issuedAt: Date.now(),
            };
            set({
              user,
              session,
              pendingTotpUser: null,
              _totpPending: null,
              runtimeConnected: true,
              runtimeError: null,
              onboarding: {
                ...get().onboarding,
                wizardOpen: false,
              },
            });
            await get().syncFromRuntime();
            return {
              ok: true,
              message: mustChange
                ? `Xin chào ${user.name} — đổi mật khẩu trên runtime`
                : `Xin chào ${user.name} (runtime)`,
              mustChangePassword: mustChange,
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Đăng nhập thất bại";
            set({ runtimeError: msg, runtimeConnected: false });
            return { ok: false, message: msg };
          }
        }

        const uname = username.trim().toLowerCase();
        const found = DEMO_USERS.find((u) => u.username.toLowerCase() === uname);
        if (!found) return { ok: false, message: "Tài khoản không tồn tại" };
        const credentials = get().credentials;
        const session = await createSession(found, password, credentials);
        if (!session) return { ok: false, message: "Mật khẩu không đúng" };
        const user = { ...found };
        const must = credMustChange(credentials, uname);
        const totpOn = Boolean(credentials[uname]?.totpEnabled && credentials[uname]?.totpSecret);
        if (totpOn) {
          set({
            pendingTotpUser: uname,
            _totpPending: { user, session, mustChange: must },
            user: null,
            session: null,
          });
          return { ok: true, message: "Nhập mã Google Authenticator", needsTotp: true };
        }
        const onboarding = get().onboarding;
        set({
          user,
          session,
          pendingTotpUser: null,
          _totpPending: null,
          onboarding: {
            ...onboarding,
            wizardOpen: !must && !onboarding.completed && !onboarding.dismissed,
          },
        });
        return {
          ok: true,
          message: must ? `Xin chào ${user.name} — đổi mật khẩu` : `Xin chào ${user.name}`,
          mustChangePassword: must,
        };
      },

      logout: () => {
        const wasRuntime = get().dataSource === "runtime";
        if (wasRuntime) void runtimeLogout();
        set({
          user: null,
          session: null,
          pendingTotpUser: null,
          _totpPending: null,
          runtimeDashboard: wasRuntime ? null : get().runtimeDashboard,
          runtimeError: null,
        });
      },

      needsPasswordChange: () => {
        if (get().dataSource === "runtime") return false;
        const s = get().session;
        if (!s) return false;
        return credMustChange(get().credentials, s.username);
      },

      changePassword: async (currentPassword, newPassword, confirmPassword, recovery) => {
        const session = get().session;
        const user = get().user;
        if (!session || !user) return { ok: false, message: "Chưa đăng nhập" };
        const uname = session.username.toLowerCase();
        if (!(await verifyPasswordWithCredentials(get().credentials, uname, currentPassword))) {
          return { ok: false, message: "Mật khẩu hiện tại không đúng" };
        }
        if (newPassword !== confirmPassword) return { ok: false, message: "Xác nhận không khớp" };
        const policy = validateNewPassword(newPassword, { currentPassword, username: uname });
        if (!policy.ok) return policy;
        const prev = get().credentials[uname];
        const needsRecovery = !prev?.recoveryQuestion || !prev?.recoveryAnswerHash;
        if (needsRecovery && (!recovery?.question || !recovery?.answer)) {
          return { ok: false, message: "Bắt buộc thiết lập câu hỏi bảo mật" };
        }
        const newHash = await hashPassword(newPassword);
        let recoveryQuestion = prev?.recoveryQuestion;
        let recoveryAnswerHash = prev?.recoveryAnswerHash;
        let recoverySetupAt = prev?.recoverySetupAt;
        if (recovery?.question && recovery?.answer) {
          recoveryQuestion = recovery.question.trim();
          recoveryAnswerHash = await hashRecoveryAnswer(recovery.answer);
          recoverySetupAt = new Date().toISOString();
        }
        const token = await makeSessionToken(user.id, user.username, newHash);
        set((s) => ({
          credentials: {
            ...s.credentials,
            [uname]: {
              ...prev,
              passwordHash: newHash,
              mustChangePassword: false,
              changedAt: new Date().toISOString(),
              recoveryQuestion,
              recoveryAnswerHash,
              recoverySetupAt,
            },
          },
          session: { userId: user.id, username: user.username, token, issuedAt: Date.now() },
          onboarding: {
            ...s.onboarding,
            wizardOpen: !s.onboarding.completed && !s.onboarding.dismissed,
          },
        }));
        return { ok: true, message: "Đã đổi mật khẩu" };
      },

      peekRecoveryQuestion: (username) => {
        const uname = username.trim().toLowerCase();
        if (!DEMO_USERS.some((u) => u.username.toLowerCase() === uname)) {
          return { ok: false, message: "Không tìm thấy tài khoản" };
        }
        if (!hasRecoverySetup(get().credentials, uname)) {
          return { ok: false, message: "Chưa có câu hỏi bảo mật — nhờ Admin/GĐ reset hoặc đăng nhập lần đầu" };
        }
        return { ok: true, question: getRecoveryQuestion(get().credentials, uname) || undefined, message: "ok" };
      },

      resetPasswordWithRecovery: async (username, answer, newPassword, confirmPassword) => {
        const uname = username.trim().toLowerCase();
        if (!DEMO_USERS.some((u) => u.username.toLowerCase() === uname)) {
          return { ok: false, message: "Tài khoản không tồn tại" };
        }
        if (!(await verifyRecoveryAnswer(get().credentials, uname, answer))) {
          return { ok: false, message: "Câu trả lời không đúng" };
        }
        if (newPassword !== confirmPassword) return { ok: false, message: "Xác nhận không khớp" };
        const policy = validateNewPassword(newPassword, { username: uname });
        if (!policy.ok) return policy;
        const newHash = await hashPassword(newPassword);
        const prev = get().credentials[uname];
        set({
          credentials: {
            ...get().credentials,
            [uname]: { ...prev, passwordHash: newHash, mustChangePassword: false, changedAt: new Date().toISOString() },
          },
          user: null,
          session: null,
        });
        return { ok: true, message: "Đã đặt lại mật khẩu — đăng nhập bằng MK mới" };
      },

      verifyLoginTotp: async (code) => {
        const pending = get()._totpPending;
        if (!pending || !get().pendingTotpUser) return { ok: false, message: "Không có phiên chờ 2FA" };
        const uname = get().pendingTotpUser!;
        const cred = get().credentials[uname];
        if (!cred?.totpSecret) return { ok: false, message: "Chưa bật Authenticator" };
        let ok = await verifyTotp(cred.totpSecret, code);
        if (!ok && cred.totpBackupHashes?.length) {
          const hash = await hashPassword(`backup:${code.trim().toUpperCase()}`);
          const idx = cred.totpBackupHashes.indexOf(hash);
          if (idx >= 0) {
            ok = true;
            const next = [...cred.totpBackupHashes];
            next.splice(idx, 1);
            set({ credentials: { ...get().credentials, [uname]: { ...cred, totpBackupHashes: next } } });
          }
        }
        if (!ok) return { ok: false, message: "Mã Authenticator không đúng" };
        const { user, session, mustChange } = pending;
        set((s) => ({
          user,
          session,
          pendingTotpUser: null,
          _totpPending: null,
          onboarding: {
            ...s.onboarding,
            wizardOpen: !mustChange && !s.onboarding.completed && !s.onboarding.dismissed,
          },
        }));
        return { ok: true, message: `Xin chào ${user.name}` };
      },

      cancelPendingTotp: () => set({ pendingTotpUser: null, _totpPending: null }),

      beginTotpSetup: async (password) => {
        const session = get().session;
        if (!session) return { ok: false, message: "Cần đăng nhập" };
        const uname = session.username.toLowerCase();
        if (!(await verifyPasswordWithCredentials(get().credentials, uname, password))) {
          return { ok: false, message: "Sai mật khẩu" };
        }
        const secret = generateTotpSecret();
        const otpauth = buildOtpauthUri({
          secret,
          account: uname,
          issuer: get().company.productName || "ThanhHoai ERP",
        });
        set({
          credentials: {
            ...get().credentials,
            [uname]: { ...get().credentials[uname], totpPendingSecret: secret },
          },
        });
        return { ok: true, message: "Quét QR bằng Google Authenticator", secret, qrUrl: otpauthQrImageUrl(otpauth) };
      },

      confirmTotpSetup: async (code) => {
        const session = get().session;
        if (!session) return { ok: false, message: "Chưa đăng nhập" };
        const uname = session.username.toLowerCase();
        const cred = get().credentials[uname];
        const secret = cred?.totpPendingSecret;
        if (!secret) return { ok: false, message: "Chưa bắt đầu 2FA" };
        if (!(await verifyTotp(secret, code))) return { ok: false, message: "Mã không đúng" };
        const backups = generateBackupCodes(8);
        const backupHashes = [];
        for (const b of backups) backupHashes.push(await hashPassword(`backup:${b}`));
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
        return { ok: true, message: "Đã bật Google Authenticator", backupCodes: backups };
      },

      disableTotp: async (password, code) => {
        const session = get().session;
        if (!session) return { ok: false, message: "Chưa đăng nhập" };
        const uname = session.username.toLowerCase();
        if (!(await verifyPasswordWithCredentials(get().credentials, uname, password))) {
          return { ok: false, message: "Sai mật khẩu" };
        }
        const cred = get().credentials[uname];
        if (cred?.totpEnabled && cred.totpSecret) {
          if (!(await verifyTotp(cred.totpSecret, code))) return { ok: false, message: "Sai mã Authenticator" };
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
        const c = get().credentials[uname];
        return Boolean(c?.totpEnabled && c?.totpSecret);
      },

      refreshSession: async () => {
        if (get().dataSource === "runtime") {
          try {
            const me = await runtimeMe();
            if (!me.authenticated) {
              set({
                user: null,
                session: null,
                runtimeConnected: true,
                runtimeError: null,
              });
              return false;
            }
            set({
              user: me.user,
              session: {
                userId: me.user.id,
                username: me.user.username,
                token: "runtime-cookie",
                issuedAt: Date.now(),
              },
              runtimeConnected: true,
              runtimeError: null,
            });
            return true;
          } catch (e) {
            set({
              runtimeConnected: false,
              runtimeError:
                e instanceof Error ? e.message : "Mất kết nối runtime",
            });
            return false;
          }
        }
        const user = await validateSession(get().session, DEMO_USERS, get().credentials);
        if (!user) {
          set({ user: null, session: null });
          return false;
        }
        set({ user: { ...user } });
        return true;
      },

      bootDataSource: async () => {
        const source = await resolveDataSource();
        set({ dataSource: source });
        if (source === "runtime") {
          const ok = await get().refreshSession();
          if (ok) await get().syncFromRuntime();
        }
        return source;
      },

      setDataSource: async (source) => {
        setPreferredDataSource(source);
        if (source === "demo") {
          await runtimeLogout();
          set({
            dataSource: "demo",
            user: null,
            session: null,
            runtimeConnected: false,
            runtimeDashboard: null,
            runtimeError: null,
            customers: SEED_CUSTOMERS,
            projects: SEED_PROJECTS.map(hydrateProject),
            quotations: SEED_QUOTATIONS.map(mapQuote),
            receivables: SEED_RECEIVABLES,
            bankLines: SEED_BANK,
            activeProjectId: SEED_PROJECTS[2]?.id ?? SEED_PROJECTS[0]?.id ?? null,
          });
          return;
        }
        set({ dataSource: "runtime", user: null, session: null });
        try {
          const ok = await get().refreshSession();
          set({ runtimeConnected: true });
          if (ok) await get().syncFromRuntime();
        } catch (e) {
          set({
            runtimeConnected: false,
            runtimeError: e instanceof Error ? e.message : "Runtime không sẵn sàng",
          });
        }
      },

      syncFromRuntime: async () => {
        if (get().dataSource !== "runtime") {
          return { ok: false, message: "Không ở chế độ runtime" };
        }
        set({ runtimeSyncing: true, runtimeError: null });
        try {
          const bundle = await fetchRuntimeBundle();
          const projects = bundle.projects.map(hydrateProject);
          set({
            customers: bundle.customers,
            projects,
            quotations: bundle.quotations.map(mapQuote),
            receivables: bundle.receivables,
            runtimeDashboard: bundle.dashboard,
            runtimeConnected: true,
            runtimeSyncing: false,
            activeProjectId:
              get().activeProjectId &&
              projects.some((p) => p.id === get().activeProjectId)
                ? get().activeProjectId
                : (projects[0]?.id ?? null),
            onboarding: {
              ...get().onboarding,
              wizardOpen: false,
              completed: true,
            },
          });
          try {
            const status = await fetchRuntimeScanStatus();
            if (status.has_scan) {
              const { hits, lastScan, sourceDir } = await fetchRuntimeScanHits();
              if (hits.length) {
                set({
                  scan: {
                    mode: "runtime",
                    lastRunAt: lastScan ?? get().scan.lastRunAt,
                    running: false,
                    hits,
                    rootsUsed:
                      (status.scan_roots?.join("; ") || sourceDir) ??
                      get().company.scanRoots,
                    stats: scanStatsFromHits(hits),
                  },
                });
              }
            }
          } catch {
            /* scan index optional */
          }
          return {
            ok: true,
            message: `Đã đồng bộ ${bundle.customers.length} KH · ${projects.length} CT · ${bundle.quotations.length} BG`,
          };
        } catch (e) {
          const message = e instanceof Error ? e.message : "Đồng bộ thất bại";
          set({
            runtimeSyncing: false,
            runtimeConnected: false,
            runtimeError: message,
          });
          return { ok: false, message };
        }
      },

      updateCompany: (patch) => {
        set((s) => ({ company: { ...s.company, ...patch } }));
        const next = { ...get().company, ...patch };
        if (patch.brandColor !== undefined) {
          applyBrandToDocument(next.brandColor || null);
        }
      },

      setDensity: (density) => {
        set((s) => ({ uiPrefs: { ...s.uiPrefs, density } }));
        applyDensityToDocument(density);
      },

      setReducedMotion: (v) => {
        set((s) => ({ uiPrefs: { ...s.uiPrefs, reducedMotion: v } }));
        applyMotionPref(v);
      },

      setHighContrast: (v) => {
        set((s) => ({ uiPrefs: { ...s.uiPrefs, highContrast: v } }));
        applyHighContrastToDocument(v);
      },

      completeTour: (role) =>
        set((s) => ({
          uiPrefs: {
            ...s.uiPrefs,
            tourDone: { ...s.uiPrefs.tourDone, [role]: true },
          },
        })),

      restartTour: (role) =>
        set((s) => ({
          uiPrefs: {
            ...s.uiPrefs,
            tourDone: { ...s.uiPrefs.tourDone, [role]: false },
          },
        })),

      addCustomer: (input) => {
        const id = `c${Date.now()}`;
        const customer: Customer = {
          id,
          code: input.code?.trim() || nextCustomerCode(get().customers),
          name: input.name.trim(),
          taxId: input.taxId.trim(),
          contact: input.contact.trim(),
          phone: input.phone.trim(),
          email: input.email.trim(),
          address: input.address.trim(),
          notes: input.notes.trim(),
          createdAt: new Date().toISOString().slice(0, 10),
        };

        if (get().dataSource === "runtime") {
          void (async () => {
            try {
              const created = await createRuntimeCustomer({
                name: customer.name,
                taxId: customer.taxId,
                contact: customer.contact,
                phone: customer.phone,
                email: customer.email,
                address: customer.address,
                notes: customer.notes,
              });
              if (created.id) {
                set((s) => ({
                  customers: s.customers.map((c) =>
                    c.id === id ? { ...c, id: created.id } : c,
                  ),
                }));
              }
              await get().syncFromRuntime();
            } catch {
              /* optimistic row stays; user can sync manually */
            }
          })();
        }

        set((s) => ({
          customers: [customer, ...s.customers],
          onboarding: {
            ...s.onboarding,
            flags: { ...s.onboarding.flags, customers: true },
          },
        }));
        return customer;
      },

      updateCustomer: (id, patch) =>
        set((s) => ({
          customers: s.customers.map((c) =>
            c.id === id ? { ...c, ...patch } : c,
          ),
        })),

      removeCustomer: (id) =>
        set((s) => ({
          customers: s.customers.filter((c) => c.id !== id),
        })),

      setActiveProject: (id) => set({ activeProjectId: id }),

      addProject: (input) => {
        const customer = get().customers.find((c) => c.id === input.customerId);
        if (!customer) return null;
        const project = makeProject({
          id: `p${Date.now()}`,
          code: input.code.trim() || `CT-${Date.now().toString().slice(-4)}`,
          name: input.name.trim(),
          customerId: customer.id,
          customer: customer.name,
          stage: "bao_gia",
          progress: 5,
          value: input.value ?? 0,
          address: input.address?.trim() || customer.address,
          workflow: { ...EMPTY_WORKFLOW, profile: true },
          docStatuses: initDocsForStage("bao_gia"),
        });
        set((s) => ({
          projects: [project, ...s.projects],
          activeProjectId: project.id,
          onboarding: {
            ...s.onboarding,
            flags: { ...s.onboarding.flags, projects: true },
          },
        }));
        return project;
      },

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? hydrateProject({ ...p, ...patch }) : p,
          ),
        })),

      setProjectStage: (id, stage, progress) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== id) return p;
            return hydrateProject({
              ...p,
              stage,
              progress: progress ?? p.progress,
            });
          }),
        })),

      markWorkflow: (projectId, step, done = true) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              workflow: { ...EMPTY_WORKFLOW, ...p.workflow, [step]: done },
            };
          }),
        })),

      setProjectDocStatus: (projectId, code, status) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              docStatuses: { ...p.docStatuses, [code]: status },
            };
          }),
          docOverrides:
            s.activeProjectId === projectId
              ? { ...s.docOverrides, [code]: status }
              : s.docOverrides,
        })),

      markPhaseDocs: (projectId, phase, status = "enough") =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            const next = { ...p.docStatuses };
            for (const t of CT_TEMPLATES) {
              if (t.phase_code === phase) next[t.code] = status;
            }
            const stepId = `docs${phase}` as WorkflowStepId;
            return {
              ...p,
              docStatuses: next,
              workflow: {
                ...p.workflow,
                ...(stepId in p.workflow
                  ? { [stepId]: status === "enough" }
                  : {}),
              },
            };
          }),
        })),

      addMaterial: (input) =>
        set((s) => ({
          materials: [{ ...input, id: `m${Date.now()}` }, ...s.materials],
          onboarding: {
            ...s.onboarding,
            flags: { ...s.onboarding.flags, materials: true },
          },
        })),

      importPurchaseDemo: () =>
        set((s) => ({
          materials: [
            {
              id: `m${Date.now()}`,
              sku: "VT-IMP-" + String(s.materials.length + 1).padStart(3, "0"),
              name: "Vật tư import HĐ mua (mẫu)",
              unit: "cái",
              unitCost: 1_250_000,
              stock: 40,
              supplier: "NCC Demo Import",
              source: "import_hd",
            },
            ...s.materials,
          ],
          onboarding: {
            ...s.onboarding,
            flags: { ...s.onboarding.flags, materials: true },
          },
        })),

      addQuotation: (input) => {
        const id = `q${Date.now()}`;
        const code = nextQuoteCode(get().quotations);
        const vat = input.vat ?? 8;
        const q: Quotation = {
          id,
          code,
          revision: 1,
          customer: input.customer,
          projectCode: input.projectCode,
          projectName: input.projectName,
          vat,
          note: input.note ?? "",
          status: "draft",
          createdAt: new Date().toISOString().slice(0, 10),
          lines: input.lines.map((l, i) =>
            normalizeLine({ ...l, id: `${id}-l${i}` }, vat),
          ),
        };
        set((s) => {
          const projects = s.projects.map((p) => {
            if (p.code !== input.projectCode) return p;
            return {
              ...p,
              name: input.projectName || p.name,
              customer: input.customer || p.customer,
              workflow: {
                ...p.workflow,
                profile: true,
                quote: true,
                docs04: true,
              },
            };
          });
          const match = projects.find((p) => p.code === input.projectCode);
          return {
            quotations: [q, ...s.quotations],
            projects,
            activeProjectId: match?.id ?? s.activeProjectId,
          };
        });
        return id;
      },

      updateQuotationMeta: (id, patch) =>
        set((s) => ({
          quotations: s.quotations.map((q) =>
            q.id === id ? { ...q, ...patch } : q,
          ),
        })),

      addQuotationLine: (quoteId, line) =>
        set((s) => ({
          quotations: s.quotations.map((q) => {
            if (q.id !== quoteId) return q;
            return {
              ...q,
              lines: [
                ...q.lines,
                normalizeLine(
                  {
                    name: line?.name ?? "",
                    description: line?.description ?? "",
                    qty: line?.qty ?? 1,
                    unit: line?.unit ?? "cái",
                    unitPrice: line?.unitPrice ?? 0,
                    taxRate: line?.taxRate ?? q.vat,
                    notes: line?.notes ?? "",
                    id: `${quoteId}-l${Date.now()}`,
                  },
                  q.vat,
                ),
              ],
            };
          }),
        })),

      updateQuotationLine: (quoteId, lineId, patch) =>
        set((s) => ({
          quotations: s.quotations.map((q) => {
            if (q.id !== quoteId) return q;
            return {
              ...q,
              lines: q.lines.map((l) =>
                l.id === lineId
                  ? normalizeLine({ ...l, ...patch, id: l.id }, q.vat)
                  : normalizeLine(l, q.vat),
              ),
            };
          }),
        })),

      removeQuotationLine: (quoteId, lineId) =>
        set((s) => ({
          quotations: s.quotations.map((q) => {
            if (q.id !== quoteId) return q;
            if (q.lines.length <= 1) return q;
            return { ...q, lines: q.lines.filter((l) => l.id !== lineId) };
          }),
        })),

      setQuotationStatus: (id, status) => {
        set((s) => ({
          quotations: s.quotations.map((q) =>
            q.id === id ? { ...q, status } : q,
          ),
        }));
        if (status === "won") get().promoteQuoteToContract(id);
      },

      bumpRevision: (id) =>
        set((s) => ({
          quotations: s.quotations.map((q) =>
            q.id === id
              ? { ...q, revision: q.revision + 1, status: "draft" }
              : q,
          ),
        })),

      promoteQuoteToContract: (quoteId) => {
        const q = get().quotations.find((x) => x.id === quoteId);
        if (!q) return null;
        const project = get().projects.find((p) => p.code === q.projectCode);
        const total = quoteTotal(mapQuote(q));
        const existing = get().receivables.find(
          (r) => r.projectCode === q.projectCode && r.customer === q.customer,
        );
        if (existing && project?.contractCode) {
          set((s) => ({
            quotations: s.quotations.map((x) =>
              x.id === quoteId ? { ...x, status: "won" } : x,
            ),
            projects: s.projects.map((p) =>
              p.code === q.projectCode
                ? {
                    ...p,
                    stage: p.stage === "bao_gia" ? "thi_cong" : p.stage,
                    progress: Math.max(p.progress, 25),
                    value: total || p.value,
                    workflow: {
                      ...p.workflow,
                      quote: true,
                      contract: true,
                      docs01: true,
                      docs04: true,
                      ar: true,
                    },
                  }
                : p,
            ),
            activeProjectId: project?.id ?? s.activeProjectId,
          }));
          return { contract: existing.contract, receivableId: existing.id };
        }

        const contract = nextContractCode(get().receivables);
        const receivableId = `r${Date.now()}`;
        const due = new Date();
        due.setDate(due.getDate() + 30);
        const receivable: Receivable = {
          id: receivableId,
          customer: q.customer,
          contract,
          projectCode: q.projectCode,
          projectId: project?.id,
          value: total,
          collected: 0,
          status: "pending",
          dueDate: due.toISOString().slice(0, 10),
        };

        set((s) => ({
          quotations: s.quotations.map((x) =>
            x.id === quoteId ? { ...x, status: "won" } : x,
          ),
          receivables: [receivable, ...s.receivables],
          projects: s.projects.map((p) => {
            if (p.code !== q.projectCode) return p;
            const docs = { ...p.docStatuses };
            for (const t of CT_TEMPLATES) {
              if (t.phase_code === "01" && t.code.startsWith("HD"))
                docs[t.code] = "enough";
            }
            return {
              ...p,
              contractCode: contract,
              stage: "thi_cong" as ProjectStage,
              progress: Math.max(p.progress, 25),
              value: total || p.value,
              customer: q.customer,
              name: q.projectName || p.name,
              workflow: {
                ...p.workflow,
                profile: true,
                quote: true,
                contract: true,
                docs01: true,
                docs04: true,
                ar: true,
              },
              docStatuses: docs,
            };
          }),
          activeProjectId: project?.id ?? s.activeProjectId,
        }));

        return { contract, receivableId };
      },

      collectReceivable: (id, amount) =>
        set((s) => {
          let projectCode: string | undefined;
          const receivables = s.receivables.map((r) => {
            if (r.id !== id) return r;
            projectCode = r.projectCode;
            const collected = Math.min(r.value, r.collected + amount);
            const remaining = r.value - collected;
            return {
              ...r,
              collected,
              status:
                remaining <= 0
                  ? ("paid" as const)
                  : r.status === "overdue"
                    ? ("overdue" as const)
                    : ("pending" as const),
            };
          });
          return {
            receivables,
            projects: s.projects.map((p) => {
              if (!projectCode || p.code !== projectCode) return p;
              return {
                ...p,
                workflow: { ...p.workflow, ar: true, bank: true },
              };
            }),
          };
        }),

      setBankStatus: (id, status) =>
        set((s) => {
          const line = s.bankLines.find((b) => b.id === id);
          return {
            bankLines: s.bankLines.map((b) =>
              b.id === id ? { ...b, status } : b,
            ),
            projects: s.projects.map((p) => {
              if (
                line?.projectCode &&
                p.code === line.projectCode &&
                status === "matched"
              ) {
                return { ...p, workflow: { ...p.workflow, bank: true } };
              }
              return p;
            }),
          };
        }),

      setDocStatus: (code, status) => {
        const active = get().activeProjectId;
        if (active) get().setProjectDocStatus(active, code, status);
        else
          set((s) => ({
            docOverrides: { ...s.docOverrides, [code]: status },
          }));
      },

      setScanRoots: (roots) =>
        set((s) => ({ company: { ...s.company, scanRoots: roots } })),

      runEnterpriseScan: async () => {
        const state = get();
        const rootsRaw =
          state.company.scanRoots || "D:\\HoSoDoanhNghiep";
        const rootsList = rootsRaw
          .split(/[;|]/)
          .map((s) => s.trim())
          .filter(Boolean);

        if (state.dataSource === "runtime" && state.runtimeConnected) {
          set({ scan: { ...state.scan, running: true, mode: "runtime" } });
          try {
            await runRuntimeDiskScan(rootsList, true);
            const { hits, lastScan, sourceDir } = await fetchRuntimeScanHits();
            set({
              scan: {
                mode: "runtime",
                lastRunAt: lastScan ?? new Date().toISOString(),
                running: false,
                hits,
                rootsUsed: rootsList.join("; ") || sourceDir,
                stats: scanStatsFromHits(hits),
              },
              onboarding: {
                ...get().onboarding,
                flags: { ...get().onboarding.flags, scan: true },
              },
            });
            await get().syncFromRuntime();
            return hits.length;
          } catch (e) {
            set({ scan: { ...get().scan, running: false } });
            throw e;
          }
        }

        const hits = buildScanHits(rootsRaw);
        set({
          scan: {
            mode: "simulated",
            lastRunAt: new Date().toISOString(),
            running: false,
            hits,
            rootsUsed: rootsRaw,
            stats: {
              ...scanStatsFromHits(hits),
              imported: 0,
            },
          },
          onboarding: {
            ...get().onboarding,
            flags: { ...get().onboarding.flags, scan: true },
          },
        });
        return hits.length;
      },

      importScanHits: (ids) => {
        const state = get();
        if (state.dataSource === "runtime" && state.runtimeConnected) {
          const n = state.scan.hits.length;
          void get().syncFromRuntime();
          return { customers: state.customers.length, projects: state.projects.length, docs: n };
        }
        const targets = state.scan.hits.filter((h) =>
          ids ? ids.includes(h.id) : !h.imported,
        );
        if (!targets.length) return { customers: 0, projects: 0, docs: 0 };

        let customers = [...state.customers];
        let projects = [...state.projects];
        let materials = [...state.materials];
        let custAdded = 0;
        let projAdded = 0;
        let docs = 0;

        const byCustomer = new Map<string, typeof targets>();
        for (const h of targets) {
          const list = byCustomer.get(h.customerHint) ?? [];
          list.push(h);
          byCustomer.set(h.customerHint, list);
        }

        for (const [custName, hits] of byCustomer) {
          let cust = customers.find(
            (c) => c.name.toLowerCase() === custName.toLowerCase(),
          );
          if (!cust) {
            cust = {
              id: `c-scan-${Date.now()}-${custAdded}`,
              code: nextCustomerCode(customers),
              name: custName,
              taxId: "",
              contact: "",
              phone: "",
              email: "",
              address: "",
              notes: "Import từ quét dữ liệu DN",
              createdAt: new Date().toISOString().slice(0, 10),
            };
            customers = [cust, ...customers];
            custAdded++;
          }

          const byProject = new Map<string, typeof hits>();
          for (const h of hits) {
            const list = byProject.get(h.projectHint) ?? [];
            list.push(h);
            byProject.set(h.projectHint, list);
          }

          for (const [projLabel, phits] of byProject) {
            const codeMatch = projLabel.match(/CT-[\w-]+/i);
            const code =
              codeMatch?.[0]?.toUpperCase() ||
              `CT-S${String(projects.length + 1).padStart(3, "0")}`;
            const name = projLabel.replace(code, "").trim() || projLabel;
            let proj = projects.find(
              (p) =>
                p.code === code ||
                (p.customerId === cust!.id && p.name === name),
            );
            if (!proj) {
              proj = makeProject({
                id: `p-scan-${Date.now()}-${projAdded}`,
                code,
                name,
                customerId: cust.id,
                customer: cust.name,
                stage: "bao_gia",
                progress: 10,
                value: 0,
                note: "Tạo từ quét folder DN",
                workflow: { ...EMPTY_WORKFLOW, profile: true },
                docStatuses: initDocsForStage("bao_gia"),
              });
              projects = [proj, ...projects];
              projAdded++;
            }

            const docsMap = { ...proj.docStatuses };
            for (const h of phits) {
              if (h.ctCode) {
                docsMap[h.ctCode] = "enough";
                docs++;
              }
            }
            proj = {
              ...proj,
              docStatuses: docsMap,
              workflow: { ...proj.workflow, profile: true },
            };
            projects = projects.map((p) => (p.id === proj!.id ? proj! : p));
          }
        }

        if (!materials.some((m) => m.source === "scan")) {
          materials = [
            {
              id: `m-scan-${Date.now()}`,
              sku: "VT-SCAN-001",
              name: "Vật tư nhận diện từ quét DN",
              unit: "bộ",
              unitCost: 0,
              stock: 0,
              supplier: "Từ folder scan",
              source: "scan",
            },
            ...materials,
          ];
        }

        const importedIds = new Set(targets.map((t) => t.id));
        const nextHits = state.scan.hits.map((h) =>
          importedIds.has(h.id) ? { ...h, imported: true } : h,
        );

        set({
          customers,
          projects,
          materials,
          activeProjectId: projects[0]?.id ?? null,
          scan: {
            ...state.scan,
            hits: nextHits,
            stats: {
              ...state.scan.stats,
              imported: nextHits.filter((h) => h.imported).length,
            },
          },
          onboarding: {
            ...state.onboarding,
            flags: {
              ...state.onboarding.flags,
              customers: true,
              projects: true,
              materials: true,
              scan: true,
            },
          },
        });

        return { customers: custAdded, projects: projAdded, docs };
      },

      clearScan: () => set({ scan: { ...EMPTY_SCAN } }),

      openWizard: (step) =>
        set((s) => ({
          onboarding: {
            ...s.onboarding,
            wizardOpen: true,
            dismissed: false,
            step: typeof step === "number" ? step : s.onboarding.step,
          },
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
        const keepCompany = opts?.keepCompany !== false;
        wipeDocsSafe();
        set((s) => ({
          company: keepCompany ? s.company : SEED_COMPANY,
          customers: [],
          projects: [],
          materials: [],
          quotations: [],
          receivables: [],
          bankLines: [],
          docOverrides: {},
          activeProjectId: null,
          scan: { ...EMPTY_SCAN },
        }));
      },

      completeOnboarding: () => {
        const company = get().company;
        wipeDocsSafe();
        set({
          company,
          customers: [],
          projects: [],
          materials: [],
          quotations: [],
          receivables: [],
          bankLines: [],
          docOverrides: {},
          activeProjectId: null,
          scan: { ...EMPTY_SCAN },
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
        wipeDocsSafe();
        set({
          credentials: defaultCredentials(),
          session: null,
          user: null,
          company: SEED_COMPANY,
          customers: SEED_CUSTOMERS,
          projects: SEED_PROJECTS.map(hydrateProject),
          materials: SEED_MATERIALS,
          quotations: SEED_QUOTATIONS.map(mapQuote),
          receivables: SEED_RECEIVABLES,
          bankLines: SEED_BANK,
          docOverrides: {},
          activeProjectId: SEED_PROJECTS[2]?.id ?? SEED_PROJECTS[0]?.id ?? null,
          scan: { ...EMPTY_SCAN },
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
      name: "thanh-hoai-erp-demo-v7-ui",
      partialize: (s) => ({
        session: s.dataSource === "runtime" ? s.session : s.session,
        dataSource: s.dataSource,
        credentials: s.credentials,
        company: s.company,
        uiPrefs: s.uiPrefs,
        // Only persist domain lists in demo mode — runtime re-syncs from API
        customers: s.dataSource === "demo" ? s.customers : [],
        projects: s.dataSource === "demo" ? s.projects.map(hydrateProject) : [],
        materials: s.dataSource === "demo" ? s.materials : [],
        quotations: s.dataSource === "demo" ? s.quotations.map(mapQuote) : [],
        receivables: s.dataSource === "demo" ? s.receivables : [],
        bankLines: s.dataSource === "demo" ? s.bankLines : [],
        docOverrides: s.docOverrides,
        activeProjectId: s.activeProjectId,
        scan: s.scan,
        onboarding: { ...s.onboarding, wizardOpen: false },
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ErpState>;
        const dataSource = p.dataSource === "runtime" ? "runtime" : "demo";
        return {
          ...current,
          ...p,
          dataSource,
          user: null,
          session: p.session ?? null,
          credentials: normalizeCredentials(p.credentials ?? current.credentials),
          pendingTotpUser: null,
          _totpPending: null,
          runtimeConnected: false,
          runtimeSyncing: false,
          runtimeError: null,
          runtimeDashboard: null,
          projects: (p.projects ?? current.projects).map(hydrateProject),
          quotations: (p.quotations ?? current.quotations).map(mapQuote),
          company: { ...SEED_COMPANY, ...(p.company ?? {}) },
          uiPrefs: {
            ...DEFAULT_UI_PREFS,
            ...(p.uiPrefs ?? {}),
            tourDone: {
              ...DEFAULT_UI_PREFS.tourDone,
              ...(p.uiPrefs?.tourDone ?? {}),
            },
          },
          scan: { ...EMPTY_SCAN, ...(p.scan ?? {}) },
          onboarding: {
            ...DEFAULT_ONBOARDING,
            ...(p.onboarding ?? {}),
            wizardOpen: false,
            wipedAfterSetup: p.onboarding?.wipedAfterSetup ?? false,
            flags: {
              ...EMPTY_SETUP_FLAGS,
              ...(p.onboarding?.flags ?? {}),
            },
          },
        };
      },
    },
  ),
);
