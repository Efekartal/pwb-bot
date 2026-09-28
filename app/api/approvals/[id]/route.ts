import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Decision = "approve" | "hold" | "reject";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { decision } = (await request.json()) as { decision?: Decision };

  if (!decision || !["approve", "hold", "reject"].includes(decision)) {
    return NextResponse.json({ error: "invalid decision" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: approval, error: approvalError } = await db
    .from("approvals")
    .select("*, person:people(*)")
    .eq("id", id)
    .eq("state", "pending")
    .single();

  if (approvalError || !approval) {
    return NextResponse.json(
      { error: approvalError?.message || "approval not found" },
      { status: 404 },
    );
  }

  const state =
    decision === "approve"
      ? "approved"
      : decision === "hold"
        ? "held"
        : "rejected";

  const { error: updateApprovalError } = await db
    .from("approvals")
    .update({ state, decided_at: new Date().toISOString() })
    .eq("id", id);

  if (updateApprovalError) {
    return NextResponse.json(
      { error: updateApprovalError.message },
      { status: 500 },
    );
  }

  if (decision === "approve" && approval.recommendation) {
    const { error: personError } = await db
      .from("people")
      .update({
        status: approval.recommendation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", approval.person_id);

    if (personError) {
      return NextResponse.json({ error: personError.message }, { status: 500 });
    }
  }

  if (
    decision === "approve" &&
    approval.proposed_message &&
    approval.person?.whatsapp_id
  ) {
    const { error: outboxError } = await db.from("outbox").insert({
      person_id: approval.person_id,
      to_jid: approval.person.whatsapp_id,
      body: approval.proposed_message,
      metadata: { approval_id: approval.id },
    });

    if (outboxError) {
      return NextResponse.json({ error: outboxError.message }, { status: 500 });
    }
  }

  await db.from("activity_log").insert({
    person_id: approval.person_id,
    action: `approval_${state}`,
    metadata: {
      approval_id: approval.id,
      type: approval.type,
      recommendation: approval.recommendation,
    },
  });

  return NextResponse.json({ ok: true, state });
}
