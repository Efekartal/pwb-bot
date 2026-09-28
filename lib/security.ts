import crypto from "node:crypto";

export function secureEqual(left?: string | null, right?: string | null) {
  if (!left || !right) return false;

  const a = Buffer.from(left);
  const b = Buffer.from(right);

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function listenerAuthorized(request: Request) {
  return secureEqual(
    request.headers.get("x-pwb-listener-secret"),
    process.env.LISTENER_SHARED_SECRET,
  );
}

export function cronAuthorized(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return secureEqual(auth, `Bearer ${expected}`);
}
