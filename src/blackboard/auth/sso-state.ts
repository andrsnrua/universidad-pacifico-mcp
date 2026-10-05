import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { Cookie } from '../types.js';
import { BLACKBOARD_HOST, SESSION_DIR } from '../config.js';

/** Estado SSO opcional. Windows: DPAPI del usuario; macOS/Linux: AES-256-GCM.
 * El proveedor determina si acepta la sesión y puede volver a exigir MFA.
 */
const SSO_STATE_FILE = path.join(SESSION_DIR, 'sso-state.bin');

/** Anything that is not Blackboard's. Microsoft's flow spans several hosts and rotates names. */
export function ssoCookies(cookies: Cookie[]): Cookie[] {
  const now = Date.now() / 1000;
  return cookies.filter((cookie) => {
    const domain = (cookie.domain ?? '').replace(/^\./, '').toLowerCase();
    const isBlackboard = BLACKBOARD_HOST === domain || BLACKBOARD_HOST.endsWith(`.${domain}`);
    const isMicrosoft = domain === 'microsoftonline.com' || domain.endsWith('.microsoftonline.com')
      || domain === 'login.live.com' || domain.endsWith('.login.live.com');
    return !isBlackboard && isMicrosoft && (cookie.expires === undefined || cookie.expires < 0 || cookie.expires > now);
  });
}

/**
 * Off Windows there is no DPAPI, and this used to fall back to writing the cookies as they were —
 * plain JSON that opens the student's Microsoft account. A server now seals them with a key only it
 * holds (UP_MCP_SECRET_KEY, e.g. `openssl rand -base64 32`, kept in a 0600 environment file):
 * scrypt with a salt per file, then AES-256-GCM. Without that key nothing is written at all.
 */
const SEALED_MAGIC = Buffer.from('UPM1');

export class SecretKeyMissing extends Error {
  code = 'SECRET_KEY_MISSING';
  constructor() {
    super('UP_MCP_SECRET_KEY no está configurada: la sesión de Microsoft no se guarda sin cifrar.');
    this.name = 'SecretKeyMissing';
  }
}

function serverSecret(): string | null {
  const value = process.env.UP_MCP_SECRET_KEY?.trim();
  return value && value.length >= 16 ? value : null;
}

export function sealWithSecret(plain: Buffer, secret: string): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([SEALED_MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function openWithSecret(sealed: Buffer, secret: string): Buffer {
  if (sealed.length < 48 || !sealed.subarray(0, 4).equals(SEALED_MAGIC)) throw new Error('Formato de sesión sellada desconocido.');
  const salt = sealed.subarray(4, 20);
  const iv = sealed.subarray(20, 32);
  const tag = sealed.subarray(32, 48);
  const key = crypto.scryptSync(secret, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(48)), decipher.final()]);
}

function protect(plain: Buffer): Buffer {
  if (process.platform !== 'win32') {
    const secret = serverSecret();
    if (!secret) throw new SecretKeyMissing();
    return sealWithSecret(plain, secret);
  }
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -AssemblyName System.Security; $in = [Console]::In.ReadToEnd().Trim(); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Convert]::FromBase64String($in), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))',
  ], { input: plain.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`DPAPI protect failed: ${result.stderr || result.status}`);
  return Buffer.from(result.stdout.trim(), 'base64');
}

function unprotect(sealed: Buffer): Buffer {
  if (process.platform !== 'win32') {
    // A file written by the old fallback is plain JSON; it is not trusted, only ignored.
    const secret = serverSecret();
    if (!secret) throw new SecretKeyMissing();
    return openWithSecret(sealed, secret);
  }
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -AssemblyName System.Security; $in = [Console]::In.ReadToEnd().Trim(); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($in), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))',
  ], { input: sealed.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`DPAPI unprotect failed: ${result.stderr || result.status}`);
  return Buffer.from(result.stdout.trim(), 'base64');
}

export function saveSsoState(cookies: Cookie[]): number {
  const kept = ssoCookies(cookies);
  if (kept.length === 0) return 0;
  if (fs.existsSync(SESSION_DIR) && fs.lstatSync(SESSION_DIR).isSymbolicLink()) {
    throw new Error(`Refusing to store credentials through a symbolic link: ${SESSION_DIR}`);
  }
  fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
  let sealed: Buffer;
  try {
    sealed = protect(Buffer.from(JSON.stringify({ savedAt: Date.now(), cookies: kept })));
  } catch (err) {
    if (err instanceof SecretKeyMissing) return 0;
    throw err;
  }
  const temporary = `${SSO_STATE_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, sealed, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, SSO_STATE_FILE);
  fs.chmodSync(SSO_STATE_FILE, 0o600);
  return kept.length;
}

export function loadSsoState(): { savedAt: number; cookies: Cookie[] } | null {
  try {
    if (!fs.existsSync(SSO_STATE_FILE) || fs.lstatSync(SSO_STATE_FILE).isSymbolicLink()) return null;
    const parsed = JSON.parse(unprotect(fs.readFileSync(SSO_STATE_FILE)).toString('utf8'));
    if (!Array.isArray(parsed?.cookies)) return null;
    return { savedAt: parsed.savedAt ?? 0, cookies: ssoCookies(parsed.cookies) };
  } catch {
    return null;
  }
}

export function clearSsoState(): void {
  try { if (fs.existsSync(SSO_STATE_FILE)) fs.unlinkSync(SSO_STATE_FILE); } catch {}
}
