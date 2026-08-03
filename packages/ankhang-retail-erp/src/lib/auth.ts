/**
 * Client-side auth helpers for local demo.
 *
 * IMPORTANT (honest security):
 * - Pure browser apps cannot fully stop DevTools / localStorage edits.
 * - Role always comes from DEMO_USERS via session token — never from storage.
 * - First login forces password change + recovery question setup.
 * - Forgot password uses security Q&A (hashed answer). Owner can reset staff.
 * - Production: server email/SMS OTP + JWT.
 */

import type { Role, User } from "@retail/data/retail";

export const AUTH_SALT = "ankhang-pos-v1-s3c";
export const RECOVERY_SALT = "ankhang-recovery-v1";

/** Precomputed SHA-256 hex of `${AUTH_SALT}:${password}` — default factory passwords */
export const DEMO_PASSWORD_HASHES: Record<string, string> = {
  owner: "e3027452e7c264179dd6715564484ab4b361dd236a4fae5100d574f801b3cbe4",
  manager: "bdbf1e6907af49ed0458fe57a8c540094f86535be6a67dc2b4e25bf5e8a84357",
  cashier: "cb5079e87bc0c680fa4752c454f5416935c16816ab6da966938f01136581b863",
  kho: "41d092a247fd0d24e0aa160ba3779ff11feaa87bf5291ec247fa691f87612e89",
};

export const DEMO_PLAIN_PASSWORDS: Record<string, string> = {
  owner: "Owner@2026",
  manager: "Manager@2026",
  cashier: "Cashier@2026",
  kho: "Kho@2026",
};

/** Predefined security questions (VI) */
export const SECURITY_QUESTIONS = [
  "Tên cửa hàng / thương hiệu bạn quản lý là gì?",
  "Thành phố bạn sinh ra?",
  "Tên thú cưng đầu tiên của bạn?",
  "Trường cấp 3 bạn học?",
  "Món ăn yêu thích của bạn?",
  "Số điện thoại liên hệ khẩn (chỉ nhớ 4 số cuối)?",
] as const;

export type CredentialRecord = {
  passwordHash: string;
  /** true until user completes mandatory first-login change */
  mustChangePassword: boolean;
  changedAt?: string;
  /** Recovery / forgot password */
  recoveryQuestion?: string;
  recoveryAnswerHash?: string;
  recoverySetupAt?: string;
  /** Google Authenticator / TOTP (RFC 6238) */
  totpEnabled?: boolean;
  totpSecret?: string;
  /** pending secret while confirming setup */
  totpPendingSecret?: string;
  /** hashed backup codes (one-time) */
  totpBackupHashes?: string[];
};

export type CredentialsMap = Record<string, CredentialRecord>;

export type Session = {
  userId: string;
  username: string;
  /** Bound to current password hash — role NOT stored */
  token: string;
  issuedAt: number;
};

export function defaultCredentials(): CredentialsMap {
  const map: CredentialsMap = {};
  for (const [username, hash] of Object.entries(DEMO_PASSWORD_HASHES)) {
    map[username] = {
      passwordHash: hash,
      mustChangePassword: true,
    };
  }
  return map;
}

export function normalizeCredentials(
  partial?: Partial<CredentialsMap> | null,
): CredentialsMap {
  const base = defaultCredentials();
  if (!partial) return base;
  for (const key of Object.keys(base)) {
    const p = partial[key];
    if (!p?.passwordHash) continue;
    base[key] = {
      passwordHash: p.passwordHash,
      mustChangePassword: true,
      changedAt: p.changedAt,
      recoveryQuestion: p.recoveryQuestion,
      recoveryAnswerHash: p.recoveryAnswerHash,
      recoverySetupAt: p.recoverySetupAt,
      totpEnabled: p.totpEnabled,
      totpSecret: p.totpSecret,
      totpPendingSecret: p.totpPendingSecret,
      totpBackupHashes: p.totpBackupHashes,
    };
    if (p.mustChangePassword === false) {
      base[key].mustChangePassword = false;
    } else if (p.mustChangePassword === true) {
      base[key].mustChangePassword = true;
    } else if (p.passwordHash !== DEMO_PASSWORD_HASHES[key]) {
      base[key].mustChangePassword = false;
    }
  }
  return base;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string): Promise<string> {
  return sha256Hex(`${AUTH_SALT}:${password}`);
}

export function normalizeRecoveryAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function hashRecoveryAnswer(answer: string): Promise<string> {
  return sha256Hex(
    `${RECOVERY_SALT}:${normalizeRecoveryAnswer(answer)}`,
  );
}

export async function makeSessionToken(
  userId: string,
  username: string,
  passHash: string,
): Promise<string> {
  return sha256Hex(`sess|${userId}|${username}|${passHash}|ankhang`);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function getCredential(
  credentials: CredentialsMap,
  username: string,
): CredentialRecord | null {
  return credentials[username.toLowerCase()] ?? null;
}

export function hasRecoverySetup(
  credentials: CredentialsMap,
  username: string,
): boolean {
  const c = getCredential(credentials, username);
  return Boolean(c?.recoveryQuestion && c?.recoveryAnswerHash);
}

export function getRecoveryQuestion(
  credentials: CredentialsMap,
  username: string,
): string | null {
  return getCredential(credentials, username)?.recoveryQuestion ?? null;
}

export async function verifyPasswordWithCredentials(
  credentials: CredentialsMap,
  username: string,
  password: string,
): Promise<boolean> {
  const cred = getCredential(credentials, username);
  if (!cred) return false;
  const got = await hashPassword(password);
  return timingSafeEqual(got, cred.passwordHash);
}

export async function verifyRecoveryAnswer(
  credentials: CredentialsMap,
  username: string,
  answer: string,
): Promise<boolean> {
  const cred = getCredential(credentials, username);
  if (!cred?.recoveryAnswerHash) return false;
  const got = await hashRecoveryAnswer(answer);
  return timingSafeEqual(got, cred.recoveryAnswerHash);
}

export async function createSession(
  user: Pick<User, "id" | "username">,
  password: string,
  credentials: CredentialsMap,
): Promise<Session | null> {
  const ok = await verifyPasswordWithCredentials(
    credentials,
    user.username,
    password,
  );
  if (!ok) return null;
  const cred = getCredential(credentials, user.username);
  if (!cred) return null;
  const token = await makeSessionToken(
    user.id,
    user.username,
    cred.passwordHash,
  );
  return {
    userId: user.id,
    username: user.username,
    token,
    issuedAt: Date.now(),
  };
}

export async function validateSession(
  session: Session | null | undefined,
  users: readonly User[],
  credentials: CredentialsMap,
): Promise<User | null> {
  if (!session?.userId || !session.token || !session.username) return null;
  const user = users.find((u) => u.id === session.userId);
  if (!user) return null;
  if (user.username.toLowerCase() !== session.username.toLowerCase()) {
    return null;
  }
  const cred = getCredential(credentials, user.username);
  if (!cred) return null;
  const expected = await makeSessionToken(
    user.id,
    user.username,
    cred.passwordHash,
  );
  if (!timingSafeEqual(expected, session.token)) return null;
  return { ...user };
}

export function mustChangePassword(
  credentials: CredentialsMap,
  username: string,
): boolean {
  return getCredential(credentials, username)?.mustChangePassword ?? true;
}

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateNewPassword(
  password: string,
  opts?: { currentPassword?: string; username?: string },
): PasswordPolicyResult {
  if (!password || password.length < 8) {
    return { ok: false, message: "Mật khẩu mới tối thiểu 8 ký tự" };
  }
  if (password.length > 64) {
    return { ok: false, message: "Mật khẩu tối đa 64 ký tự" };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: "Cần ít nhất 1 chữ hoa (A–Z)" };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: "Cần ít nhất 1 chữ thường (a–z)" };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: "Cần ít nhất 1 chữ số (0–9)" };
  }
  if (opts?.currentPassword && password === opts.currentPassword) {
    return {
      ok: false,
      message: "Mật khẩu mới phải khác mật khẩu hiện tại / mặc định",
    };
  }
  const defaults = Object.values(DEMO_PLAIN_PASSWORDS);
  if (defaults.includes(password)) {
    return {
      ok: false,
      message: "Không được dùng lại mật khẩu mặc định của hệ thống",
    };
  }
  if (
    opts?.username &&
    password.toLowerCase().includes(opts.username.toLowerCase())
  ) {
    return { ok: false, message: "Mật khẩu không được chứa tên tài khoản" };
  }
  return { ok: true };
}

export function validateRecoverySetup(
  question: string,
  answer: string,
): PasswordPolicyResult {
  if (!question.trim()) {
    return { ok: false, message: "Chọn câu hỏi bảo mật" };
  }
  if (normalizeRecoveryAnswer(answer).length < 2) {
    return {
      ok: false,
      message: "Câu trả lời bảo mật tối thiểu 2 ký tự",
    };
  }
  return { ok: true };
}

export function resolveUserFromRegistry(
  session: Session | null | undefined,
  users: readonly User[],
): User | null {
  if (!session?.userId) return null;
  const user = users.find((u) => u.id === session.userId);
  if (!user) return null;
  if (user.username.toLowerCase() !== (session.username || "").toLowerCase()) {
    return null;
  }
  return { ...user };
}

export function hasRole(user: User | null, roles: Role[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

export function isOwner(user: User | null): boolean {
  return user?.role === "owner";
}
