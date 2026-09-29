import { NextRequest, NextResponse } from "next/server";
import {
  allowTeamAccessAttempt,
  createTeamSession,
  TEAM_COOKIE_NAME,
  TEAM_SESSION_MAX_AGE,
  teamAccessConfigured,
  validTeamAccessKey,
} from "@/lib/team-access";

export const dynamic = "force-dynamic";

function teamHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export async function GET(request: NextRequest) {
  if (!teamAccessConfigured()) {
    return teamHeaders(
      NextResponse.json({ error: "Team access is not configured." }, { status: 503 }),
    );
  }

  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";

  if (!allowTeamAccessAttempt(ip)) {
    return teamHeaders(
      NextResponse.json({ error: "Too many attempts." }, { status: 429 }),
    );
  }

  const key = request.nextUrl.searchParams.get("k");

  if (!validTeamAccessKey(key)) {
    return teamHeaders(
      NextResponse.redirect(new URL("/ekip?denied=1", request.url), 303),
    );
  }

  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/ekip",
    },
  });
  response.cookies.set({
    name: TEAM_COOKIE_NAME,
    value: createTeamSession(),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TEAM_SESSION_MAX_AGE,
  });

  return teamHeaders(response);
}
