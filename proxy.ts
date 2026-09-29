import { NextRequest, NextResponse } from "next/server";
import { secureEqual } from "@/lib/security";

const publicPaths = [
  "/api/health",
  "/api/events/whatsapp",
  "/api/outbox/next",
  "/api/outbox/",
  "/api/cron/",
];

const teamPaths = ["/ekip", "/api/team/"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (teamPaths.some((path) => pathname.startsWith(path))) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const username = process.env.PWB_ADMIN_USER;
  const password = process.env.PWB_ADMIN_PASSWORD;

  if (!username || !password) {
    if (process.env.VERCEL_ENV === "production") {
      return new NextResponse("PWB admin credentials are not configured.", {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      const suppliedUser = decoded.slice(0, separator);
      const suppliedPassword = decoded.slice(separator + 1);

      if (
        secureEqual(suppliedUser, username) &&
        secureEqual(suppliedPassword, password)
      ) {
        return NextResponse.next();
      }
    } catch {
      // Fall through to challenge.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="PWB Bot"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
