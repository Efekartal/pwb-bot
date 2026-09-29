"use client";

import { useEffect, useMemo, useState } from "react";

type TeamPerson = {
  id: string;
  name: string;
  role: string;
  status: string | null;
  communityState: "current";
  lastActivityAt: string | null;
  contribution: string;
  topTopics: string[];
  stats: {
    last_pwb_activity_at?: string | null;
    last_operational_at?: string | null;
    operational_events_90d?: number;
    open_tasks?: number;
    completed_tasks_90d?: number;
  } | null;
};

type TeamPayload = {
  roster: TeamPerson[];
  summary: {
    confirmedMembers: number;
    active30d: number;
  };
};

type ProfilePayload = {
  person: TeamPerson;
  stats: {
    last_message_at?: string | null;
    last_substantive_at?: string | null;
    last_pwb_activity_at?: string | null;
    last_operational_at?: string | null;
    substantive_messages_90d?: number;
    pwb_messages_90d?: number;
    operational_events_90d?: number;
    open_tasks?: number;
    completed_tasks_90d?: number;
  } | null;
  topics: Array<{
    topic: string;
    message_count: number;
    last_message_at?: string | null;
  }>;
};

function relative(value?: string | null) {
  if (!value) return "Kayıt yok";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86400000),
  );
  if (days === 0) return "Bugün";
  if (days === 1) return "1 gün önce";
  return `${days} gün önce`;
}

export default function TeamPageClient() {
  const [data, setData] = useState<TeamPayload | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("Tümü");
  const [selected, setSelected] = useState<ProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team/roster", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Ekip alınamadı.");
        setData(payload);
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Ekip alınamadı."),
      );
  }, []);

  const roles = useMemo(
    () => ["Tümü", ...new Set((data?.roster ?? []).map((person) => person.role))],
    [data],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return (data?.roster ?? []).filter((person) => {
      const roleMatch = role === "Tümü" || person.role === role;
      const queryMatch =
        !needle ||
        person.name.toLocaleLowerCase("tr-TR").includes(needle) ||
        person.topTopics.some((topic) =>
          topic.toLocaleLowerCase("tr-TR").includes(needle),
        );
      return roleMatch && queryMatch;
    });
  }, [data, query, role]);

  async function openProfile(id: string) {
    setError(null);
    const response = await fetch(`/api/team/people/${id}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Profil alınamadı.");
      return;
    }
    setSelected(payload);
  }

  return (
    <main className="team-shell">
      <header className="team-hero">
        <div>
          <p className="eyebrow">PRO WRESTLING BOSPHORUS</p>
          <h1>PWB Ekip</h1>
          <p>Salt-okunur ekip görünümü. Yönetim aksiyonları ve özel mesajlar burada yer almaz.</p>
        </div>
        {data && (
          <div className="team-summary">
            <article>
              <strong>{data.summary.confirmedMembers}</strong>
              <span>doğrulanmış üye</span>
            </article>
            <article>
              <strong>{data.summary.active30d}</strong>
              <span>son 30 gün aktif</span>
            </article>
          </div>
        )}
      </header>

      <section className="team-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="İsim veya konu ara..."
          type="search"
        />
        <div className="team-role-tabs">
          {roles.map((item) => (
            <button
              className={role === item ? "team-role-active" : ""}
              key={item}
              onClick={() => setRole(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      {!data ? (
        <div className="team-loading">Ekip yükleniyor…</div>
      ) : (
        <section className="team-grid">
          {filtered.map((person) => (
            <button
              className="team-card"
              key={person.id}
              onClick={() => void openProfile(person.id)}
              type="button"
            >
              <div className="team-card-head">
                <div>
                  <strong>{person.name}</strong>
                  <span>{person.role}</span>
                </div>
                <b>Mevcut</b>
              </div>

              <div className="team-card-activity">
                <span>Son aktivite</span>
                <strong>{relative(person.lastActivityAt)}</strong>
              </div>

              <div className="team-card-topics">
                {person.topTopics.length ? (
                  person.topTopics.map((topic) => <span key={topic}>{topic}</span>)
                ) : (
                  <span>Konu etiketi yok</span>
                )}
              </div>

              <div className="team-card-foot">
                <span>
                  {Number(person.stats?.operational_events_90d || 0)} operasyonel sinyal
                </span>
                <span>
                  {Number(person.stats?.completed_tasks_90d || 0)} tamamlanan görev
                </span>
              </div>
            </button>
          ))}
        </section>
      )}

      {selected && (
        <div className="team-profile-backdrop" onMouseDown={() => setSelected(null)}>
          <aside
            className="team-profile"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="profile-close"
              onClick={() => setSelected(null)}
              type="button"
            >
              ×
            </button>
            <p className="eyebrow">EKİP PROFİLİ</p>
            <h2>{selected.person.name}</h2>
            <p className="team-profile-role">
              {selected.person.role} · {selected.person.status || "PWB Ekip"}
            </p>

            <div className="team-profile-kpis">
              <article>
                <span>Son PWB aktivitesi</span>
                <strong>{relative(selected.stats?.last_pwb_activity_at)}</strong>
              </article>
              <article>
                <span>Son operasyonel katkı</span>
                <strong>{relative(selected.stats?.last_operational_at)}</strong>
              </article>
              <article>
                <span>90 gün PWB mesajı</span>
                <strong>{Number(selected.stats?.pwb_messages_90d || 0)}</strong>
              </article>
              <article>
                <span>90 gün operasyon</span>
                <strong>{Number(selected.stats?.operational_events_90d || 0)}</strong>
              </article>
            </div>

            <section className="team-profile-section">
              <h3>Ana konular</h3>
              <div className="team-card-topics">
                {selected.topics.length ? (
                  selected.topics.map((topic) => (
                    <span key={topic.topic}>
                      {topic.topic} · {topic.message_count}
                    </span>
                  ))
                ) : (
                  <span>Konu etiketi yok</span>
                )}
              </div>
            </section>

            <section className="team-profile-section">
              <h3>Görev özeti</h3>
              <div className="team-profile-kpis compact">
                <article>
                  <span>Açık görev</span>
                  <strong>{Number(selected.stats?.open_tasks || 0)}</strong>
                </article>
                <article>
                  <span>90 gün tamamlanan</span>
                  <strong>{Number(selected.stats?.completed_tasks_90d || 0)}</strong>
                </article>
              </div>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
