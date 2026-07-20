const COOKIE_NAME = "bt_session";
const SESSION_SECONDS = 60 * 60 * 24 * 90;

interface SessionPayload {
  v: 1;
  exp: number;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const bytes = new Uint8Array(signature);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let result = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    result |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return result === 0;
}

async function digest(value: string): Promise<string> {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(secret: string): Promise<string> {
  const payload: SessionPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  return `${encoded}.${await hmac(encoded, secret)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!token || !secret || secret.length < 32) return false;
  const [payload, suppliedSignature, ...rest] = token.split(".");
  if (!payload || !suppliedSignature || rest.length) return false;

  const expectedSignature = await hmac(payload, secret);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return false;

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as SessionPayload;
    return parsed.v === 1 && Number.isFinite(parsed.exp) && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function verifyPassword(input: string, expected: string): Promise<boolean> {
  const [inputDigest, expectedDigest] = await Promise.all([digest(input), digest(expected)]);
  return constantTimeEqual(inputDigest, expectedDigest);
}

export function isSameOriginPost(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const sessionConfig = {
  cookieName: COOKIE_NAME,
  maxAge: SESSION_SECONDS,
};
