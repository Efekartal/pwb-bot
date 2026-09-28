import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listenerAuthorized } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!listenerAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  await db
    .from("outbox")
    .update({
      state: "pending",
      claim_token: null,
      claimed_at: null,
      error: "stale claim requeued",
    })
    .eq("state", "claimed")
    .lt("claimed_at", staleBefore);

  const { data: pending, error: fetchError } = await db
    .from("outbox")
    .select("*")
    .eq("state", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!pending) {
    return new Response(null, { status: 204 });
  }

  const claimToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await db
    .from("outbox")
    .update({
      state: "claimed",
      claim_token: claimToken,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", pending.id)
    .eq("state", "pending")
    .select("*")
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  if (!claimed) {
    return new Response(null, { status: 204 });
  }

  return NextResponse.json({ item: claimed });
}
