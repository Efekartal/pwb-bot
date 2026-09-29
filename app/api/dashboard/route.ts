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

  const [
    { data: people, error: peopleError },
    { data: approvals, error: approvalsError },
    { data: activity, error: activityError },
    { data: topicRows, error: topicError },
  ] = await Promise.all([
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
    db
      .from("person_topic_stats")
      .select("person_id, topic, message_count, last_message_at"),
  ]);

  const error = peopleError || approvalsError || activityError || topicError;
  if (error) {
    return NextResponse.json(
      { configured: true, error: error.message },
      { status: 500 },
    );
  }

  const topicMap = new Map<string, Array<{ topic: string; count: number }>>();
  const globalTopics = new Map<string, number>();

  for (const row of topicRows ?? []) {
    const personId = String(row.person_id);
    const topic = String(row.topic);
    const count = Number(row.message_count || 0);

    const current = topicMap.get(personId) ?? [];
    current.push({ topic, count });
    topicMap.set(personId, current);

    globalTopics.set(topic, (globalTopics.get(topic) ?? 0) + count);
  }

  const enrichedPeople = (people ?? []).map((person) => ({
    ...person,
    top_topics: (topicMap.get(person.id) ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((item) => item.topic),
  }));

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const withinDays = (value: string | null, days: number) =>
    Boolean(value && now - new Date(value).getTime() <= days * day);

  const summary = {
    archivePeople: enrichedPeople.length,
    pipelinePeople: enrichedPeople.filter((person) => person.is_pipeline_tracked).length,
    active30d: enrichedPeople.filter((person) => withinDays(person.last_activity_at, 30)).length,
    active60d: enrichedPeople.filter((person) => withinDays(person.last_activity_at, 60)).length,
    currentMembers: enrichedPeople.filter((person) => person.community_state === "current").length,
    leftMembers: enrichedPeople.filter((person) =>
      ["left", "removed"].includes(person.community_state),
    ).length,
    unknownMembership: enrichedPeople.filter((person) => person.community_state === "unknown").length,
  };

  return NextResponse.json({
    configured: true,
    people: enrichedPeople,
    approvals: approvals ?? [],
    activity: activity ?? [],
    summary,
    globalTopics: [...globalTopics.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count),
    fetchedAt: new Date().toISOString(),
  });
}
