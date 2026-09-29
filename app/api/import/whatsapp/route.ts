import crypto from "node:crypto";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  inferGroupName,
  messageFingerprint,
  normalizeAlias,
  parseWhatsAppExport,
} from "@/lib/whatsapp-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARSER_VERSION = 2;

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const upload = form.get("file");

  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "ZIP dosyası bulunamadı." }, { status: 400 });
  }

  if (!upload.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "WhatsApp export ZIP dosyası bekleniyor." }, { status: 400 });
  }

  const bytes = Buffer.from(await upload.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const db = getSupabaseAdmin();

  const { data: existingRun, error: existingRunError } = await db
    .from("import_runs")
    .select("*")
    .eq("source_sha256", sha256)
    .maybeSingle();

  if (existingRunError) {
    return NextResponse.json({ error: existingRunError.message }, { status: 500 });
  }

  const existingParserVersion = Number(existingRun?.metadata?.parser_version || 1);

  if (existingRun && existingParserVersion >= PARSER_VERSION) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      importRun: existingRun,
      message: "Bu ZIP güncel parser ile daha önce içe aktarılmış.",
    });
  }

  const zip = await JSZip.loadAsync(bytes);
  const chatEntry =
    Object.values(zip.files).find(
      (entry) => !entry.dir && /(^|\/)_(chat|sohbet)\.txt$/i.test(entry.name),
    ) ??
    Object.values(zip.files).find(
      (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".txt"),
    );

  if (!chatEntry) {
    return NextResponse.json(
      { error: "ZIP içinde WhatsApp _chat.txt bulunamadı." },
      { status: 400 },
    );
  }

  const chatText = await chatEntry.async("string");
  const { messages, events } = parseWhatsAppExport(chatText);
  const groupName = inferGroupName(upload.name);

  if (!messages.length && !events.length) {
    return NextResponse.json({ error: "İşlenebilir kayıt bulunamadı." }, { status: 400 });
  }

  const syntheticGroupJid =
    "export:" +
    crypto.createHash("sha256").update(groupName, "utf8").digest("hex").slice(0, 32);

  const { data: group, error: groupError } = await db
    .from("wa_groups")
    .upsert(
      {
        wa_jid: syntheticGroupJid,
        name: groupName,
        enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "wa_jid" },
    )
    .select("*")
    .single();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  const aliases = [
    ...new Set(
      [
        ...messages.map((message) => message.sender),
        ...events.map((event) => event.subjectAlias).filter(Boolean),
      ] as string[],
    ),
  ];

  const aliasMap = new Map<string, string>();

  for (const alias of aliases) {
    const aliasNormalized = normalizeAlias(alias).toLocaleLowerCase("tr-TR");

    const { data: existingAlias, error: aliasLookupError } = await db
      .from("people_aliases")
      .select("person_id")
      .eq("alias_normalized", aliasNormalized)
      .maybeSingle();

    if (aliasLookupError) {
      return NextResponse.json({ error: aliasLookupError.message }, { status: 500 });
    }

    if (existingAlias) {
      aliasMap.set(aliasNormalized, existingAlias.person_id);
      continue;
    }

    const { data: person, error: personError } = await db
      .from("people")
      .insert({
        full_name: alias,
        whatsapp_name: alias,
        role: "Topluluk",
        status: null,
        is_pipeline_tracked: false,
        community_state: "unknown",
        contribution_level: "Yeni",
      })
      .select("id")
      .single();

    if (personError) {
      return NextResponse.json({ error: personError.message }, { status: 500 });
    }

    const { error: aliasInsertError } = await db.from("people_aliases").insert({
      person_id: person.id,
      alias,
      alias_normalized: aliasNormalized,
      source: "whatsapp_export",
    });

    if (aliasInsertError) {
      return NextResponse.json({ error: aliasInsertError.message }, { status: 500 });
    }

    aliasMap.set(aliasNormalized, person.id);
  }

  let importRun = existingRun;

  if (existingRun) {
    const cleanupResults = await Promise.all([
      db.from("messages").delete().eq("import_run_id", existingRun.id),
      db.from("group_events").delete().eq("import_run_id", existingRun.id),
      db.from("activity_log").delete().contains("metadata", { import_run_id: existingRun.id }),
    ]);

    const cleanupError = cleanupResults.find((result) => result.error)?.error;
    if (cleanupError) {
      return NextResponse.json({ error: cleanupError.message }, { status: 500 });
    }

    const { data, error } = await db
      .from("import_runs")
      .update({
        source_file_name: upload.name,
        group_name: groupName,
        parsed_message_count: messages.length,
        inserted_message_count: 0,
        participant_count: aliases.length,
        metadata: {
          zip_entry: chatEntry.name,
          parser_version: PARSER_VERSION,
          system_event_count: events.length,
          first_message_at: messages[0]?.sentAt ?? null,
          last_message_at: messages.at(-1)?.sentAt ?? null,
          reprocessed_at: new Date().toISOString(),
        },
      })
      .eq("id", existingRun.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    importRun = data;
  } else {
    const { data, error } = await db
      .from("import_runs")
      .insert({
        source_file_name: upload.name,
        source_sha256: sha256,
        group_name: groupName,
        parsed_message_count: messages.length,
        participant_count: aliases.length,
        metadata: {
          zip_entry: chatEntry.name,
          parser_version: PARSER_VERSION,
          system_event_count: events.length,
          first_message_at: messages[0]?.sentAt ?? null,
          last_message_at: messages.at(-1)?.sentAt ?? null,
        },
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    importRun = data;
  }

  if (!importRun) {
    return NextResponse.json({ error: "Import kaydı oluşturulamadı." }, { status: 500 });
  }

  const rows = messages.map((message) => {
    const personId = aliasMap.get(message.senderNormalized);
    const fingerprint = messageFingerprint({
      groupName,
      senderNormalized: message.senderNormalized,
      sentAt: message.sentAt,
      text: message.text,
    });

    return {
      wa_message_id: `export:${fingerprint}`,
      group_id: group.id,
      person_id: personId ?? null,
      sender_wa_id: null,
      chat_jid: syntheticGroupJid,
      chat_name: groupName,
      message_type: message.messageType,
      text_content: message.text,
      media_metadata: {},
      raw_metadata: {
        source_file_name: upload.name,
        sender_alias: message.sender,
        parser_version: PARSER_VERSION,
      },
      sent_at: message.sentAt,
      source_type: "whatsapp_export",
      import_run_id: importRun.id,
      topics: message.topics,
      is_substantive: message.isSubstantive,
    };
  });

  let insertedCount = 0;
  for (const batch of chunks(rows, 500)) {
    const { data, error } = await db
      .from("messages")
      .upsert(batch, { onConflict: "wa_message_id", ignoreDuplicates: true })
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    insertedCount += data?.length ?? 0;
  }

  if (events.length) {
    const eventRows = events.map((event) => ({
      group_id: group.id,
      import_run_id: importRun.id,
      event_type: event.eventType,
      subject_alias: event.subjectAlias ?? null,
      subject_person_id: event.subjectAlias
        ? aliasMap.get(normalizeAlias(event.subjectAlias).toLocaleLowerCase("tr-TR")) ?? null
        : null,
      actor_alias: event.actorAlias ?? null,
      raw_text: event.rawText,
      occurred_at: event.sentAt,
    }));

    for (const batch of chunks(eventRows, 500)) {
      const { error } = await db.from("group_events").insert(batch);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  const newestByPerson = new Map<string, string>();
  for (const message of messages) {
    const personId = aliasMap.get(message.senderNormalized);
    if (!personId) continue;
    const current = newestByPerson.get(personId);
    if (!current || message.sentAt > current) newestByPerson.set(personId, message.sentAt);
  }

  for (const [personId, lastActivityAt] of newestByPerson) {
    const { error } = await db
      .from("people")
      .update({
        last_activity_at: lastActivityAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", personId)
      .or(`last_activity_at.is.null,last_activity_at.lt.${lastActivityAt}`);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await db.from("activity_log").insert({
      person_id: personId,
      action: "whatsapp_export_imported",
      metadata: {
        import_run_id: importRun.id,
        group_name: groupName,
        last_activity_at: lastActivityAt,
        parser_version: PARSER_VERSION,
      },
    });
  }

  const { error: membershipError } = await db.rpc("rebuild_group_memberships", {
    target_group_id: group.id,
  });

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  await db
    .from("import_runs")
    .update({ inserted_message_count: insertedCount })
    .eq("id", importRun.id);

  return NextResponse.json({
    ok: true,
    duplicate: false,
    reprocessed: Boolean(existingRun),
    parserVersion: PARSER_VERSION,
    groupName,
    parsedMessages: messages.length,
    systemEvents: events.length,
    insertedMessages: insertedCount,
    participants: aliases.length,
    importRunId: importRun.id,
  });
}
