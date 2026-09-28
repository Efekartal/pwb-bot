import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listenerAuthorized } from "@/lib/security";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!listenerAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    claim_token?: string;
    ok?: boolean;
    error?: string;
    wa_message_id?: string;
  };

  if (!body.claim_token || typeof body.ok !== "boolean") {
    return NextResponse.json({ error: "invalid completion" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const state = body.ok ? "sent" : "failed";

  const { data: updated, error } = await db
    .from("outbox")
    .update({
      state,
      sent_at: body.ok ? new Date().toISOString() : null,
      error: body.ok ? null : body.error || "send failed",
      metadata: {
        wa_message_id: body.wa_message_id || null,
      },
    })
    .eq("id", id)
    .eq("state", "claimed")
    .eq("claim_token", body.claim_token)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: "claim mismatch" }, { status: 409 });
  }

  await db.from("activity_log").insert({
    person_id: updated.person_id,
    action: body.ok ? "whatsapp_message_sent" : "whatsapp_message_failed",
    metadata: {
      outbox_id: updated.id,
      wa_message_id: body.wa_message_id || null,
      error: body.error || null,
    },
  });

  return NextResponse.json({ ok: true, state });
}
