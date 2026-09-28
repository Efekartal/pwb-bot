import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "pwb-bot",
    supabaseConfigured: isSupabaseConfigured(),
    timestamp: new Date().toISOString(),
  });
}
