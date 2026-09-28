import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const db = getSupabaseAdmin();

  const [{ data: people, error: peopleError }, { data: approvals, error: approvalsError }, { data: activity, error: activityError }] =
    await Promise.all([
      db
        .from("people")
        .select("*")
        .order("last_activity_at", { ascending: false, nullsFirst: false }),
      db
        .from("approvals")
        .select("*, person:people(*)")
        .eq("state", "pending")
        .order("created_at", { ascending: true }),
      db
        .from("activity_log")
        .select("*, person:people(full_name)")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const error = peopleError || approvalsError || activityError;
  if (error) {
    return NextResponse.json(
      { configured: true, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    configured: true,
    people: people ?? [],
    approvals: approvals ?? [],
    activity: activity ?? [],
    fetchedAt: new Date().toISOString(),
  });
}
