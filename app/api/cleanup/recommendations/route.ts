import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function ageDays(value?: string | null) {
  if (!value) return null;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86400000),
  );
}

export async function GET() {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from("person_profile_stats")
    .select(
      "person_id,last_message_at,last_substantive_at,last_pwb_activity_at,last_operational_at,substantive_messages_90d,pwb_messages_90d,operational_events_90d,open_tasks,completed_tasks_90d",
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (data ?? []).map((row) => row.person_id);
  const { data: people, error: peopleError } = ids.length
    ? await db
        .from("people")
        .select("id,full_name,role,status,community_state,last_activity_at")
        .in("id", ids)
    : { data: [], error: null };

  if (peopleError) {
    return NextResponse.json({ error: peopleError.message }, { status: 500 });
  }

  const peopleMap = new Map((people ?? []).map((person) => [person.id, person]));

  const rows = (data ?? [])
    .map((stats) => {
      const person = peopleMap.get(stats.person_id);
      if (!person) return null;

      const substantiveDays = ageDays(
        stats.last_substantive_at || person.last_activity_at,
      );
      const pwbDays = ageDays(stats.last_pwb_activity_at);
      const operationalDays = ageDays(stats.last_operational_at);
      const openTasks = Number(stats.open_tasks || 0);
      const completed90 = Number(stats.completed_tasks_90d || 0);
      const op90 = Number(stats.operational_events_90d || 0);
      const pwb90 = Number(stats.pwb_messages_90d || 0);

      let bucket: "remove_candidate" | "review" | "keep" | "already_gone" =
        "review";

      if (["left", "removed"].includes(person.community_state)) {
        bucket = "already_gone";
      } else if (
        openTasks > 0 ||
        completed90 > 0 ||
        op90 >= 2 ||
        (operationalDays !== null && operationalDays <= 60) ||
        (pwb90 >= 3 && pwbDays !== null && pwbDays <= 45)
      ) {
        bucket = "keep";
      } else if (
        (substantiveDays === null || substantiveDays > 60) &&
        (pwbDays === null || pwbDays > 90) &&
        (operationalDays === null || operationalDays > 90) &&
        openTasks === 0
      ) {
        bucket = "remove_candidate";
      } else if (
        (pwbDays === null || pwbDays > 60) &&
        (operationalDays === null || operationalDays > 90)
      ) {
        bucket = "review";
      } else {
        bucket = "keep";
      }

      const reasons: string[] = [];
      if (substantiveDays === null) reasons.push("Anlamlı aktivite kaydı yok");
      else if (substantiveDays > 60) reasons.push(`${substantiveDays} gündür anlamlı aktivite yok`);

      if (pwbDays === null) reasons.push("PWB konulu aktivite bulunamadı");
      else if (pwbDays > 90) reasons.push(`${pwbDays} gündür PWB konusu yok`);

      if (operationalDays === null) reasons.push("Operasyonel katkı bulunamadı");
      else if (operationalDays > 90) reasons.push(`${operationalDays} gündür operasyonel katkı yok`);

      if (openTasks > 0) reasons.push(`${openTasks} açık görev var`);
      if (completed90 > 0) reasons.push(`Son 90 günde ${completed90} tamamlanan görev`);
      if (op90 > 0) reasons.push(`Son 90 günde ${op90} operasyonel sinyal`);
      if (pwb90 > 0) reasons.push(`Son 90 günde ${pwb90} PWB mesajı`);

      return {
        person,
        stats,
        bucket,
        actionable:
          bucket === "remove_candidate" && person.community_state === "current",
        requiresMembershipCheck:
          bucket === "remove_candidate" && person.community_state === "unknown",
        reasons,
        ages: {
          substantiveDays,
          pwbDays,
          operationalDays,
        },
      };
    })
    .filter(Boolean);

  const priority = {
    remove_candidate: 0,
    review: 1,
    keep: 2,
    already_gone: 3,
  } as const;

  rows.sort((a, b) => {
    if (!a || !b) return 0;
    const bucketDiff = priority[a.bucket] - priority[b.bucket];
    if (bucketDiff !== 0) return bucketDiff;

    const aDays = a.ages.substantiveDays ?? 99999;
    const bDays = b.ages.substantiveDays ?? 99999;
    return bDays - aDays;
  });

  const summary = rows.reduce(
    (acc, row) => {
      if (!row) return acc;
      acc[row.bucket] += 1;
      if (row.actionable) acc.actionable += 1;
      if (row.requiresMembershipCheck) acc.membershipCheck += 1;
      return acc;
    },
    {
      remove_candidate: 0,
      review: 0,
      keep: 0,
      already_gone: 0,
      actionable: 0,
      membershipCheck: 0,
    },
  );

  return NextResponse.json({ summary, rows });
}
