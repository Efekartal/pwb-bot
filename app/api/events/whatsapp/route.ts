import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listenerAuthorized } from "@/lib/security";

type WhatsAppEvent = {
  message_id: string;
  chat_jid: string;
  chat_name?: string | null;
  group_jid?: string | null;
  sender_wa_id: string;
  sender_name?: string | null;
  timestamp: string;
  message_type: string;
  text?: string | null;
  media_metadata?: Record<string, unknown>;
  raw_metadata?: Record<string, unknown>;
};

function activityAction(event: WhatsAppEvent) {
  const name = (event.chat_name ?? "").toLocaleLowerCase("tr-TR");
  if (name.includes("creative") || name.includes("yaratıcı")) {
    return "creative_whatsapp_message";
  }
  if (name.includes("antrenman") || name.includes("training")) {
    return "training_whatsapp_message";
  }
  if (event.message_type === "video") {
    return "video_shared";
  }
  return "whatsapp_message";
}

export async function POST(request: Request) {
  if (!listenerAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const event = (await request.json()) as WhatsAppEvent;

  if (
    !event.message_id ||
    !event.chat_jid ||
    !event.sender_wa_id ||
    !event.timestamp ||
    !event.message_type
  ) {
    return NextResponse.json({ error: "invalid event" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  let groupId: string | null = null;

  if (event.group_jid) {
    const { data: group, error: groupError } = await db
      .from("wa_groups")
      .upsert(
        {
          wa_jid: event.group_jid,
          name: event.chat_name || event.group_jid,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "wa_jid" },
      )
      .select("id")
      .single();

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 500 });
    }
    groupId = group.id;
  }

  const { data: existingPerson, error: lookupError } = await db
    .from("people")
    .select("*")
    .eq("whatsapp_id", event.sender_wa_id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  let person = existingPerson;
  if (!person) {
    const { data: inserted, error: insertError } = await db
      .from("people")
      .insert({
        full_name: event.sender_name || event.sender_wa_id,
        whatsapp_id: event.sender_wa_id,
        whatsapp_name: event.sender_name || null,
        role: "Topluluk",
        status: "Aday Havuzu",
        last_activity_at: event.timestamp,
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    person = inserted;
  } else {
    const { data: updated, error: updateError } = await db
      .from("people")
      .update({
        whatsapp_name: event.sender_name || existingPerson.whatsapp_name,
        last_activity_at: event.timestamp,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingPerson.id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    person = updated;
  }

  const { error: messageError } = await db.from("messages").upsert(
    {
      wa_message_id: event.message_id,
      group_id: groupId,
      person_id: person.id,
      sender_wa_id: event.sender_wa_id,
      chat_jid: event.chat_jid,
      chat_name: event.chat_name || null,
      message_type: event.message_type,
      text_content: event.text || null,
      media_metadata: event.media_metadata || {},
      raw_metadata: event.raw_metadata || {},
      sent_at: event.timestamp,
    },
    { onConflict: "wa_message_id", ignoreDuplicates: true },
  );

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }

  await db.from("activity_log").insert({
    person_id: person.id,
    action: activityAction(event),
    metadata: {
      message_id: event.message_id,
      chat_jid: event.chat_jid,
      chat_name: event.chat_name,
      message_type: event.message_type,
    },
  });

  return NextResponse.json({ ok: true, person_id: person.id });
}
