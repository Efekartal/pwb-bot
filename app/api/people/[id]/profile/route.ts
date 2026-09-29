import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const OPERATIONAL_TYPES = [
  "deliverable_submitted",
  "task_completed",
  "commitment_made",
  "resource_shared",
  "creative_idea",
];

const PARTICIPATION_TYPES = [
  "availability_yes",
  "availability_no",
  "candidate_interest",
];

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const db = getSupabaseAdmin();

  const [
    personResult,
    statsResult,
    topicsResult,
    eventsResult,
    tasksResult,
    membershipsResult,
    recentMessagesResult,
  ] = await Promise.all([
    db.from("people").select("*").eq("id", id).single(),
    db.from("person_profile_stats").select("*").eq("person_id", id).maybeSingle(),
    db
      .from("person_topic_stats")
      .select("topic, message_count, last_message_at")
      .eq("person_id", id)
      .order("message_count", { ascending: false }),
    db
      .from("person_events")
      .select("*")
      .eq("person_id", id)
      .neq("state", "dismissed")
      .order("occurred_at", { ascending: false })
      .limit(80),
    db
      .from("tasks")
      .select("*")
      .eq("assignee_person_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("group_memberships")
      .select("*, group:wa_groups(name)")
      .eq("person_id", id)
      .order("updated_at", { ascending: false }),
    db
      .from("messages")
      .select("id, chat_name, text_content, sent_at, topics, is_substantive")
      .eq("person_id", id)
      .eq("is_substantive", true)
      .order("sent_at", { ascending: false })
      .limit(30),
  ]);

  const error =
    personResult.error ||
    statsResult.error ||
    topicsResult.error ||
    eventsResult.error ||
    tasksResult.error ||
    membershipsResult.error ||
    recentMessagesResult.error;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const events = eventsResult.data ?? [];
  const sourceIds = [
    ...new Set(
      events
        .map((event) => event.source_message_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  let sourceMessages: Record<string, unknown> = {};
  if (sourceIds.length) {
    const { data, error: sourceError } = await db
      .from("messages")
      .select("id, chat_name, text_content, sent_at")
      .in("id", sourceIds);

    if (sourceError) {
      return NextResponse.json({ error: sourceError.message }, { status: 500 });
    }

    sourceMessages = Object.fromEntries((data ?? []).map((message) => [message.id, message]));
  }

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recentEvents = events.filter(
    (event) => new Date(event.occurred_at).getTime() >= cutoff,
  );

  const participation = {
    yes: recentEvents.filter((event) => event.event_type === "availability_yes").length,
    no: recentEvents.filter((event) => event.event_type === "availability_no").length,
    candidateInterest: recentEvents.filter(
      (event) => event.event_type === "candidate_interest",
    ).length,
  };

  const operational = {
    total90d: recentEvents.filter((event) =>
      OPERATIONAL_TYPES.includes(event.event_type),
    ).length,
    commitments90d: recentEvents.filter(
      (event) => event.event_type === "commitment_made",
    ).length,
    deliverables90d: recentEvents.filter(
      (event) => event.event_type === "deliverable_submitted",
    ).length,
    ideas90d: recentEvents.filter((event) => event.event_type === "creative_idea")
      .length,
  };

  return NextResponse.json({
    person: personResult.data,
    stats: statsResult.data ?? null,
    topics: topicsResult.data ?? [],
    events: events.map((event) => ({
      ...event,
      sourceMessage: event.source_message_id
        ? sourceMessages[event.source_message_id] ?? null
        : null,
    })),
    tasks: tasksResult.data ?? [],
    memberships: membershipsResult.data ?? [],
    recentMessages: recentMessagesResult.data ?? [],
    participation,
    operational,
    eventTypes: {
      operational: OPERATIONAL_TYPES,
      participation: PARTICIPATION_TYPES,
    },
  });
}
