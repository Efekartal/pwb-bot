import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TEAM_COOKIE_NAME, verifyTeamSession } from "@/lib/team-access";

export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get(TEAM_COOKIE_NAME)?.value;
  if (!verifyTeamSession(session)) {
    return response({ error: "Team session required." }, 401);
  }

  const db = getSupabaseAdmin();

  const [
    { data: people, error: peopleError },
    { data: topics, error: topicsError },
    { data: stats, error: statsError },
  ] = await Promise.all([
    db
      .from("people")
      .select(
        "id,full_name,role,status,community_state,last_activity_at,contribution_level",
      )
      .eq("community_state", "current")
      .order("last_activity_at", { ascending: false, nullsFirst: false }),
    db
      .from("person_topic_stats")
      .select("person_id,topic,message_count,last_message_at"),
    db
      .from("person_profile_stats")
      .select(
        "person_id,last_pwb_activity_at,last_operational_at,pwb_messages_90d,operational_events_90d,open_tasks,completed_tasks_90d",
      ),
  ]);

  const error = peopleError || topicsError || statsError;
  if (error) return response({ error: error.message }, 500);

  const topicMap = new Map<string, Array<{ topic: string; count: number }>>();
  for (const row of topics ?? []) {
    const list = topicMap.get(row.person_id) ?? [];
    list.push({ topic: row.topic, count: Number(row.message_count || 0) });
    topicMap.set(row.person_id, list);
  }

  const statsMap = new Map((stats ?? []).map((row) => [row.person_id, row]));

  const roster = (people ?? []).map((person) => ({
    id: person.id,
    name: person.full_name,
    role: person.role,
    status: person.status,
    communityState: person.community_state,
    lastActivityAt: person.last_activity_at,
    contribution: person.contribution_level,
    topTopics: (topicMap.get(person.id) ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((item) => item.topic),
    stats: statsMap.get(person.id) ?? null,
  }));

  const active30d = roster.filter((person) => {
    if (!person.lastActivityAt) return false;
    return Date.now() - new Date(person.lastActivityAt).getTime() <= 30 * 86400000;
  }).length;

  return response({
    roster,
    summary: {
      confirmedMembers: roster.length,
      active30d,
    },
  });
}
