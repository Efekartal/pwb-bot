import crypto from "node:crypto";
import { secureEqual } from "@/lib/security";

export const TEAM_COOKIE_NAME = "pwb_team_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type TeamSessionPayload = {
  scope: "team_readonly";
  version: number;
  iat: number;
  exp: number;
};

function sessionVersion() {
  return Number(process.env.PWB_TEAM_SESSION_VERSION || "1");
}

function sessionSecret() {
  return process.env.PWB_TEAM_SESSION_SECRET || "";
}

function sign(body: string) {
  const secret = sessionSecret();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

export function teamAccessConfigured() {
  return Boolean(
    process.env.PWB_TEAM_ACCESS_KEY &&
      process.env.PWB_TEAM_SESSION_SECRET &&
      process.env.PWB_TEAM_SESSION_VERSION,
  );
}

export function validTeamAccessKey(value?: string | null) {
  return secureEqual(value, process.env.PWB_TEAM_ACCESS_KEY);
}

export function createTeamSession() {
  if (!teamAccessConfigured()) {
    throw new Error("Team access is not configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: TeamSessionPayload = {
    scope: "team_readonly",
    version: sessionVersion(),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyTeamSession(value?: string | null) {
  if (!value || !teamAccessConfigured()) return false;

  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra) return false;

  const expected = sign(body);
  if (!expected || !secureEqual(signature, expected)) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as TeamSessionPayload;

    const now = Math.floor(Date.now() / 1000);

    return (
      payload.scope === "team_readonly" &&
      payload.version === sessionVersion() &&
      Number.isFinite(payload.exp) &&
      payload.exp > now
    );
  } catch {
    return false;
  }
}

const attempts = new Map<string, { count: number; resetAt: number }>();

export function allowTeamAccessAttempt(ip: string) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const current = attempts.get(ip);

  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= 10) return false;

  current.count += 1;
  attempts.set(ip, current);
  return true;
}

export const TEAM_SESSION_MAX_AGE = SESSION_TTL_SECONDS;
