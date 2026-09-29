"use client";

import { useEffect, useMemo, useState } from "react";
import type { Person } from "@/lib/types";

type Props = {
  person: Person;
  onClose: () => void;
};

type ProfilePayload = {
  person: {
    id: string;
    full_name: string;
    role: string;
    status: string | null;
    community_state: Person["communityState"];
    contribution_level: string;
  };
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
  events: Array<{
    id: string;
    event_type: string;
    domain?: string | null;
    summary: string;
    state: "observed" | "inferred" | "confirmed" | "dismissed";
    occurred_at: string;
    confidence: number;
    sourceMessage?: {
      id: string;
      chat_name?: string | null;
      text_content?: string | null;
      sent_at: string;
    } | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    domain?: string | null;
    status: string;
    confidence: number;
    assigned_at?: string | null;
    due_at?: string | null;
    submitted_at?: string | null;
    completed_at?: string | null;
  }>;
  memberships: Array<{
    id: string;
    state: string;
    confidence: string;
    group?: { name?: string | null } | null;
  }>;
  recentMessages: Array<{
    id: string;
    chat_name?: string | null;
    text_content?: string | null;
    sent_at: string;
    topics?: string[];
  }>;
  participation: {
    yes: number;
    no: number;
    candidateInterest: number;
  };
  operational: {
    total90d: number;
    commitments90d: number;
    deliverables90d: number;
    ideas90d: number;
  };
};

const eventLabels: Record<string, string> = {
  availability_yes: "Katılacağını / müsait olduğunu belirtti",
  availability_no: "Katılamayacağını belirtti",
  commitment_made: "İş / teslim taahhüdü verdi",
  deliverable_submitted: "Teslim / çıktı sinyali",
  creative_idea: "Fikir veya öneri sundu",
  candidate_interest: "Güreş / antrenman ilgisi belirtti",
  resource_shared: "Kaynak veya bağlantı paylaştı",
  task_completed: "Görev tamamlandı",
};

function relative(value?: string | null) {
  if (!value) return "Kayıt yok";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Bugün";
  if (days === 1) return "1 gün önce";
  return `${days} gün önce`;
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function confidenceLabel(value: number) {
  if (value >= 0.88) return "yüksek";
  if (value >= 0.72) return "orta";
  return "düşük";
}

function membershipLabel(state: string) {
  if (state === "current") return "Mevcut";
  if (state === "left") return "Ayrıldı";
  if (state === "removed") return "Çıkarıldı";
  return "Bilinmiyor";
}

export default function PersonProfile({ person, onClose }: Props) {
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/people/${person.id}/profile`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Profil alınamadı.");
        if (!cancelled) setData(payload);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Profil alınamadı.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [person.id]);

  const maxTopic = useMemo(
    () => Math.max(1, ...(data?.topics.map((item) => Number(item.message_count)) ?? [1])),
    [data],
  );

  return (
    <div className="profile-backdrop" onMouseDown={onClose}>
      <aside
        className="profile-drawer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="profile-header">
          <div>
            <p className="eyebrow">PWB KİŞİ PROFİLİ</p>
            <h2>{person.name}</h2>
            <div className="profile-meta">
              <span>{person.role}</span>
              <span>{person.status || "Arşiv"}</span>
              <span>{membershipLabel(person.communityState)}</span>
            </div>
          </div>
          <button className="profile-close" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </header>

        {loading ? (
          <div className="profile-loading">Profil verisi hazırlanıyor…</div>
        ) : error ? (
          <div className="error-banner">{error}</div>
        ) : data ? (
          <div className="profile-body">
            <section className="activity-signal-grid">
              <article>
                <span>Son mesaj</span>
                <strong>{relative(data.stats?.last_message_at)}</strong>
              </article>
              <article>
                <span>Son anlamlı mesaj</span>
                <strong>{relative(data.stats?.last_substantive_at)}</strong>
              </article>
              <article>
                <span>Son PWB aktivitesi</span>
                <strong>{relative(data.stats?.last_pwb_activity_at)}</strong>
              </article>
              <article>
                <span>Son operasyonel katkı</span>
                <strong>{relative(data.stats?.last_operational_at)}</strong>
              </article>
            </section>

            <section className="profile-section">
              <div className="profile-section-title">
                <div>
                  <p className="eyebrow">SON 90 GÜN</p>
                  <h3>Operasyonel katkı</h3>
                </div>
                <span>ham davranış, tek puan değil</span>
              </div>
              <div className="profile-kpi-grid">
                <article>
                  <strong>{data.operational.total90d}</strong>
                  <span>operasyonel olay</span>
                </article>
                <article>
                  <strong>{data.operational.commitments90d}</strong>
                  <span>taahhüt sinyali</span>
                </article>
                <article>
                  <strong>{data.operational.deliverables90d}</strong>
                  <span>teslim sinyali</span>
                </article>
                <article>
                  <strong>{data.operational.ideas90d}</strong>
                  <span>fikir / öneri</span>
                </article>
              </div>
            </section>

            <section className="profile-section">
              <div className="profile-section-title">
                <div>
                  <p className="eyebrow">KONU PROFİLİ</p>
                  <h3>Ne konuşuyor?</h3>
                </div>
                <span>tüm arşiv</span>
              </div>
              <div className="profile-topic-list">
                {data.topics.length === 0 ? (
                  <p className="profile-empty">Henüz konu etiketi yok.</p>
                ) : (
                  data.topics.slice(0, 10).map((topic) => (
                    <div className="profile-topic-row" key={topic.topic}>
                      <div>
                        <strong>{topic.topic}</strong>
                        <span>{topic.message_count} mesaj</span>
                      </div>
                      <div className="profile-topic-bar">
                        <i
                          style={{
                            width: `${Math.max(
                              5,
                              (Number(topic.message_count) / maxTopic) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="profile-section profile-two-col">
              <div>
                <div className="profile-section-title">
                  <div>
                    <p className="eyebrow">KATILIM</p>
                    <h3>Sinyaller</h3>
                  </div>
                </div>
                <div className="participation-box">
                  <div>
                    <strong>{data.participation.yes}</strong>
                    <span>olumlu niyet</span>
                  </div>
                  <div>
                    <strong>{data.participation.no}</strong>
                    <span>gelememe sinyali</span>
                  </div>
                  <div>
                    <strong>{data.participation.candidateInterest}</strong>
                    <span>güreş / antrenman ilgisi</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="profile-section-title">
                  <div>
                    <p className="eyebrow">ÜYELİK</p>
                    <h3>Gruplar</h3>
                  </div>
                </div>
                <div className="membership-list">
                  {data.memberships.length === 0 ? (
                    <p className="profile-empty">Üyelik olayı henüz çıkarılmadı.</p>
                  ) : (
                    data.memberships.map((item) => (
                      <div key={item.id}>
                        <strong>{item.group?.name || "Grup"}</strong>
                        <span>
                          {membershipLabel(item.state)} · {item.confidence}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="profile-section">
              <div className="profile-section-title">
                <div>
                  <p className="eyebrow">GÖREV / TAAHHÜT</p>
                  <h3>Takip</h3>
                </div>
                <span>{data.tasks.length} kayıt</span>
              </div>
              {data.tasks.length === 0 ? (
                <div className="profile-empty-card">
                  <strong>Henüz doğrulanmış görev yok.</strong>
                  <p>
                    Mesajlardan çıkan taahhütler timeline’da sinyal olarak görünür.
                    Görev tablosuna geçmeden önce yönetici doğrulaması gerekir.
                  </p>
                </div>
              ) : (
                <div className="task-list">
                  {data.tasks.map((task) => (
                    <article key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{task.domain || "Genel"}</span>
                      </div>
                      <div>
                        <b>{task.status}</b>
                        <span>güven {Math.round(Number(task.confidence) * 100)}%</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="profile-section">
              <div className="profile-section-title">
                <div>
                  <p className="eyebrow">TIMELINE</p>
                  <h3>Önemli PWB olayları</h3>
                </div>
                <span>{data.events.length} sinyal</span>
              </div>
              <div className="event-timeline">
                {data.events.length === 0 ? (
                  <p className="profile-empty">Henüz olay çıkarılmadı.</p>
                ) : (
                  data.events.slice(0, 30).map((event) => (
                    <article key={event.id}>
                      <div className="event-dot" />
                      <div className="event-content">
                        <div className="event-head">
                          <strong>
                            {eventLabels[event.event_type] || event.event_type}
                          </strong>
                          <time>{dateTime(event.occurred_at)}</time>
                        </div>
                        <p>{event.summary}</p>
                        <div className="event-tags">
                          {event.domain && <span>{event.domain}</span>}
                          <span>{event.state}</span>
                          <span>
                            güven {Math.round(Number(event.confidence) * 100)}% ·{" "}
                            {confidenceLabel(Number(event.confidence))}
                          </span>
                        </div>
                        {event.sourceMessage?.text_content && (
                          <details className="source-message">
                            <summary>Kaynak mesajı gör</summary>
                            <blockquote>
                              {event.sourceMessage.text_content}
                            </blockquote>
                            <small>
                              {event.sourceMessage.chat_name || "WhatsApp"} ·{" "}
                              {dateTime(event.sourceMessage.sent_at)}
                            </small>
                          </details>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="profile-section">
              <div className="profile-section-title">
                <div>
                  <p className="eyebrow">SON MESAJLAR</p>
                  <h3>Bağlam</h3>
                </div>
              </div>
              <div className="recent-message-list">
                {data.recentMessages.slice(0, 12).map((message) => (
                  <article key={message.id}>
                    <div>
                      <strong>{message.chat_name || "WhatsApp"}</strong>
                      <time>{dateTime(message.sent_at)}</time>
                    </div>
                    <p>{message.text_content}</p>
                    {message.topics?.length ? (
                      <div className="event-tags">
                        {message.topics.map((topic) => (
                          <span key={topic}>{topic}</span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
