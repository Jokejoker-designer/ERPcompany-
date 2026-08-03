/**
 * ERP auth — password + session + TOTP (Google Authenticator).
 * Role always from DEMO_USERS registry, never trusted from storage.
 */

import type { User } from "@/data/seed";

export const AUTH_SALT = "thanh-hoai-erp-v1-s3c";
export const RECOVERY_SALT = "thanh-hoai-recovery-v1";

export const DEMO_PASSWORD_HASHES: Record<string, string> = {
  admin: "d1a05b2dececbe015c1696a8df708b1f57c0e9e17e4638d62cfeeea664291de7",
  giamdoc: "37499d1b9959e3ec600b055acd487312f61a035a4bc0faa531d690fbdc5c7cc3",
  ketoan: "754cc5ed28092e23023422c0f478c663159b852bfcd19d0fa3090e2c49b194d5",
  kinhdoanh: "e9905a1e1e345c49699bec6d1c40a02e059f941befbb6a62c6b4c7ca70d4d4b8",
  ktt: "26ed416c5a6f7e68e8fdc1234d6e0314002248fce250eaf0d37a15f102ed93b5",
  ktv: "968436f5286e97b30a9c9408f4850fe3dc0b9b57b27078213b58fd3754fdbb50",
  thukho: "c0da99fda0cf4413baa95be2b152ed0a7744bd96f7fc45b72230bfbaea93195f",
};

export const DEMO_PLAIN_PASSWORDS: Record<string, string> = {
  admin: "Admin@2026",
  giamdoc: "Giamdoc@2026",
  ketoan: "Ketoan@2026",
  kinhdoanh: "Kinhdoanh@2026",
  ktt: "Ktt@2026",
  ktv: "Ktv@2026",
  thukho: "Thukho@2026",
};

export type CredentialRecord = {
  passwordHash: string;
  mustChangePassword: boolean;
  changedAt?: string;
  recoveryQuestion?: string;
  recoveryAnswerHash?: string;
  recoverySetupAt?: string;
  totpEnabled?: boolean;
  totpSecret?: string;
  totpPendingSecret?: string;
  totpBackupHashes?: string[];
};

export type CredentialsMap = Record<string, CredentialRecord>;

export type Session = {
  userId: string;
  username: string;
  token: string;
  issuedAt: number;
};

export function defaultCredentials(): CredentialsMap {
  const map: CredentialsMap = {};
  for (const [username, hash] of Object.entries(DEMO_PASSWORD_HASHES)) {
    map[username] = { passwordHash: hash, mustChangePassword: true };
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
      mustChangePassword: p.mustChangePassword !== false,
      changedAt: p.changedAt,
      recoveryQuestion: p.recoveryQuestion,
      recoveryAnswerHash: p.recoveryAnswerHash,
      recoverySetupAt: p.recoverySetupAt,
      totpEnabled: p.totpEnabled,
      totpSecret: p.totpSecret,
      totpPendingSecret: p.totpPendingSecret,
      totpBackupHashes: p.totpBackupHashes,
    };
    if (p.mustChangePassword === false) base[key].mustChangePassword = false;
    else if (
      p.mustChangePassword === undefined &&
      p.passwordHash !== DEMO_PASSWORD_HASHES[key]
    ) {
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

export async function hashRecoveryAnswer(answer: string): Promise<string> {
  const n = answer.trim().toLowerCase().replace(/\s+/g, " ");
  return sha256Hex(`${RECOVERY_SALT}:${n}`);
}

export async function makeSessionToken(
  userId: string,
  username: string,
  passHash: string,
): Promise<string> {
  return sha256Hex(`sess|${userId}|${username}|${passHash}|thanhhoai`);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function getCredential(credentials: CredentialsMap, username: string) {
  return credentials[username.toLowerCase()] ?? null;
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
  const token = await makeSessionToken(user.id, user.username, cred.passwordHash);
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
  if (user.username.toLowerCase() !== session.username.toLowerCase()) return null;
  const cred = getCredential(credentials, user.username);
  if (!cred) return null;
  const expected = await makeSessionToken(user.id, user.username, cred.passwordHash);
  if (!timingSafeEqual(expected, session.token)) return null;
  return { ...user };
}

export function mustChangePassword(credentials: CredentialsMap, username: string) {
  return getCredential(credentials, username)?.mustChangePassword ?? true;
}

export function validateNewPassword(
  password: string,
  opts?: { currentPassword?: string; username?: string },
): { ok: true } | { ok: false; message: string } {
  if (!password || password.length < 8)
    return { ok: false, message: "Mật khẩu tối thiểu 8 ký tự" };
  if (!/[A-Z]/.test(password))
    return { ok: false, message: "Cần ít nhất 1 chữ hoa" };
  if (!/[a-z]/.test(password))
    return { ok: false, message: "Cần ít nhất 1 chữ thường" };
  if (!/[0-9]/.test(password))
    return { ok: false, message: "Cần ít nhất 1 chữ số" };
  if (opts?.currentPassword && password === opts.currentPassword)
    return { ok: false, message: "Mật khẩu mới phải khác mật khẩu cũ" };
  if (Object.values(DEMO_PLAIN_PASSWORDS).includes(password))
    return { ok: false, message: "Không dùng mật khẩu mặc định hệ thống" };
  return { ok: true };
}

export const SECURITY_QUESTIONS = [
  "Tên công ty / thương hiệu của bạn?",
  "Thành phố bạn sinh ra?",
  "Trường cấp 3 bạn học?",
  "Món ăn yêu thích?",
  "Tên thú cưng đầu tiên?",
] as const;

export function hasRecoverySetup(credentials: CredentialsMap, username: string) {
  const c = getCredential(credentials, username);
  return Boolean(c?.recoveryQuestion && c?.recoveryAnswerHash);
}

export function getRecoveryQuestion(credentials: CredentialsMap, username: string) {
  return getCredential(credentials, username)?.recoveryQuestion ?? null;
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
