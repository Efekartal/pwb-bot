import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TEAM_COOKIE_NAME, verifyTeamSession } from "@/lib/team-access";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = request.cookies.get(TEAM_COOKIE_NAME)?.value;
  if (!verifyTeamSession(session)) {
    return json({ error: "Team session required." }, 401);
  }

  const { id } = await context.params;
  const db = getSupabaseAdmin();

  const [
    { data: person, error: personError },
    { data: stats, error: statsError },
    { data: topics, error: topicsError },
  ] = await Promise.all([
    db
      .from("people")
      .select(
        "id,full_name,role,status,community_state,last_activity_at,contribution_level",
      )
      .eq("id", id)
      .eq("community_state", "current")
      .maybeSingle(),
    db
      .from("person_profile_stats")
      .select(
        "person_id,last_message_at,last_substantive_at,last_pwb_activity_at,last_operational_at,substantive_messages_90d,pwb_messages_90d,operational_events_90d,open_tasks,completed_tasks_90d",
      )
      .eq("person_id", id)
      .maybeSingle(),
    db
      .from("person_topic_stats")
      .select("topic,message_count,last_message_at")
      .eq("person_id", id)
      .order("message_count", { ascending: false })
      .limit(8),
  ]);

  const error = personError || statsError || topicsError;
  if (error) return json({ error: error.message }, 500);
  if (!person) return json({ error: "Person not found." }, 404);

  return json({
    person: {
      id: person.id,
      name: person.full_name,
      role: person.role,
      status: person.status,
      communityState: person.community_state,
      lastActivityAt: person.last_activity_at,
      contribution: person.contribution_level,
    },
    stats: stats ?? null,
    topics: topics ?? [],
  });
}
