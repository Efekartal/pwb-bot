import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const monthKey = new Date().toISOString().slice(0, 7);

  const { data: people, error } = await db
    .from("people")
    .select("*")
    .in("status", ["Aktif", "Gelişim"])
    .not("last_activity_at", "is", null)
    .lt("last_activity_at", cutoff.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let created = 0;

  for (const person of people ?? []) {
    const days = Math.floor(
      (Date.now() - new Date(person.last_activity_at).getTime()) /
        (24 * 60 * 60 * 1000),
    );

    const recommendation =
      days >= 90 && person.contribution_level === "Düşük"
        ? "Aday Havuzu"
        : "Geri Dönüş";

    const proposedMessage =
      recommendation === "Geri Dönüş"
        ? `Selam ${person.full_name}, PWB kadrosunu yeniden düzenliyoruz. Daha önce sürecin içinde olduğun için seni direkt pasife almak istemedik. Aktif olarak devam etmek istiyor musun? Bana bir haber verir misin?`
        : null;

    const { error: insertError } = await db.from("approvals").upsert(
      {
        person_id: person.id,
        type: "inactivity_review",
        reason: `${days} gündür doğrulanmış aktivite yok. Mevcut statü: ${person.status}.`,
        recommendation,
        proposed_message: proposedMessage,
        dedupe_key: `inactive:${person.id}:${monthKey}`,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );

    if (!insertError) created += 1;
  }

  return NextResponse.json({
    ok: true,
    reviewed: people?.length ?? 0,
    created,
    cutoff: cutoff.toISOString(),
  });
}
