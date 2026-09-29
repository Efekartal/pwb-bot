import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isSupabaseConfigured();

  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        service: "pwb-bot",
        supabaseConfigured: false,
        databaseConnected: false,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from("people").select("id").limit(1);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      service: "pwb-bot",
      supabaseConfigured: true,
      databaseConnected: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "pwb-bot",
        supabaseConfigured: true,
        databaseConnected: false,
        error: error instanceof Error ? error.message : "Database check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
