"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { initialApprovals, initialPeople } from "@/lib/mock-data";
import PersonProfile from "@/components/PersonProfile";
import type { Approval, Person, TalentStatus } from "@/lib/types";

const statusOrder: TalentStatus[] = [
  "Aktif",
  "Gelişim",
  "Geri Dönüş",
  "Yeni Aday",
  "Beklemede",
  "Aday Havuzu",
];

type ApiPerson = {
  id: string;
  full_name: string;
  role: Person["role"];
  status: TalentStatus | null;
  is_pipeline_tracked?: boolean;
  community_state?: Person["communityState"];
  creative_owner?: string | null;
  last_activity_at?: string | null;
  contribution_level: Person["contribution"];
  top_topics?: string[];
};

type ApiApproval = {
  id: string;
  person_id: string;
  type: string;
  reason: string;
  recommendation: TalentStatus | null;
  proposed_message?: string | null;
  person?: ApiPerson | null;
};

type ApiActivity = {
  id: string;
  action: string;
  created_at: string;
  person?: { full_name?: string | null } | null;
};

type DashboardSummary = {
  archivePeople: number;
  pipelinePeople: number;
  active30d: number;
  active60d: number;
  currentMembers: number;
  leftMembers: number;
  unknownMembership: number;
};

type TopicSummary = { topic: string; count: number };

function statusClass(status: TalentStatus | null) {
  if (!status) return "status status-archive";
  return `status status-${status
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")}`;
}

function membershipLabel(state: Person["communityState"]) {
  if (state === "current") return "Mevcut";
  if (state === "left") return "Ayrıldı";
  if (state === "removed") return "Çıkarıldı";
  return "Bilinmiyor";
}

function relativeActivity(date?: string | null) {
  if (!date) return { label: "Kayıt yok", days: 9999 };
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000)),
  );
  if (days === 0) return { label: "Bugün", days };
  if (days === 1) return { label: "1 gün önce", days };
  return { label: `${days} gün önce`, days };
}

function mapPerson(person: ApiPerson): Person {
  const activity = relativeActivity(person.last_activity_at);
  return {
    id: person.id,
    name: person.full_name,
    status: person.status,
    isPipelineTracked: Boolean(person.is_pipeline_tracked),
    communityState: person.community_state || "unknown",
    role: person.role,
    creative: person.creative_owner || undefined,
    lastActivity: activity.label,
    lastActivityDays: activity.days,
    contribution: person.contribution_level || "Yeni",
    topTopics: person.top_topics || [],
  };
}

function mapApproval(approval: ApiApproval): Approval {
  const recommendation = approval.recommendation || "Beklemede";
  const title =
    approval.type === "inactivity_review"
      ? "Aktivite kontrolü"
      : approval.type.replaceAll("_", " ");

  return {
    id: approval.id,
    personId: approval.person_id,
    title,
    reason: approval.reason,
    recommendation,
    actionLabel: approval.proposed_message
      ? `${recommendation} + mesaj gönder`
      : `${recommendation} olarak güncelle`,
    risk: "Düşük",
  };
}

export default function Dashboard() {
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [approvals, setApprovals] = useState<Approval[]>(initialApprovals);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({
    archivePeople: 0,
    pipelinePeople: 0,
    active30d: 0,
    active60d: 0,
    currentMembers: 0,
    leftMembers: 0,
    unknownMembership: 0,
  });
  const [globalTopics, setGlobalTopics] = useState<TopicSummary[]>([]);
  const [tab, setTab] = useState<"dashboard" | "roster" | "imports">("dashboard");
  const [importRuns, setImportRuns] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [loadingDecision, setLoadingDecision] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Dashboard verisi alınamadı.");
      }

      if (!payload.configured) {
        setLive(false);
        return;
      }

      setLive(true);
      setPeople((payload.people as ApiPerson[]).map(mapPerson));
      setApprovals((payload.approvals as ApiApproval[]).map(mapApproval));
      setSummary(payload.summary);
      setGlobalTopics(payload.globalTopics ?? []);
      setActivityLog(
        (payload.activity as ApiActivity[]).map((item) => {
          const who = item.person?.full_name || "Sistem";
          const when = new Date(item.created_at).toLocaleString("tr-TR", {
            dateStyle: "short",
            timeStyle: "short",
          });
          return `${who}: ${item.action} · ${when}`;
        }),
      );
      try {
        const importsResponse = await fetch("/api/import/runs", { cache: "no-store" });
        if (importsResponse.ok) {
          const importsPayload = await importsResponse.json();
          setImportRuns(importsPayload.runs ?? []);
        }
      } catch {
        // Import history is non-critical for the main dashboard.
      }
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Bağlantı hatası");
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const timer = window.setInterval(() => void loadDashboard(), 5000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const counts = useMemo(() => {
    return statusOrder.map((status) => ({
      status,
      count: people.filter(
        (person) => person.isPipelineTracked && person.status === status,
      ).length,
    }));
  }, [people]);

  const resolveApproval = async (
    approval: Approval,
    decision: "approve" | "hold" | "reject",
  ) => {
    if (!live) {
      const person = people.find((item) => item.id === approval.personId);
      if (!person) return;

      if (decision === "approve") {
        setPeople((currentPeople) =>
          currentPeople.map((item) =>
            item.id === person.id
              ? { ...item, status: approval.recommendation }
              : item,
          ),
        );
      }

      setApprovals((currentApprovals) =>
        currentApprovals.filter((item) => item.id !== approval.id),
      );
      setActivityLog((currentLog) => [
        `${person.name}: demo kararı → ${decision}`,
        ...currentLog,
      ]);
      return;
    }

    setLoadingDecision(approval.id);
    try {
      const response = await fetch(`/api/approvals/${approval.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Karar uygulanamadı.");
      }
      await loadDashboard();
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "Karar uygulanamadı.",
      );
    } finally {
      setLoadingDecision(null);
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">PWB</div>
          <div>
            <strong>PWB Bot</strong>
            <span>Operasyon Merkezi</span>
          </div>
        </div>

        <nav>
          <button className={tab === "dashboard" ? "nav-active" : ""} onClick={() => setTab("dashboard")}>
            Genel Bakış
          </button>
          <button className={tab === "roster" ? "nav-active" : ""} onClick={() => setTab("roster")}>
            Kadro
          </button>
          <button className={tab === "imports" ? "nav-active" : ""} onClick={() => setTab("imports")}>
            WhatsApp Arşivi
          </button>
          <button disabled>
            Yeni Başvurular
            <small>{people.filter((p) => p.isPipelineTracked && p.status === "Yeni Aday").length}</small>
          </button>
          <button disabled>Görevler</button>
          <button disabled>
            WhatsApp <span className="soon">{live ? "canlı" : "demo"}</span>
          </button>
        </nav>

        <div className="sidebar-foot">
          <span className="dot" /> Bot yalnızca öneri üretir
          <small>İşlem için yönetici onayı gerekir.</small>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">PRO WRESTLING BOSPHORUS</p>
            <h1>{tab === "dashboard" ? "Operasyon Paneli" : tab === "roster" ? "Kadro" : "WhatsApp Arşivi"}</h1>
          </div>
          <div className="admin-pill">{live ? "CANLI VERİ" : "DEMO MODU"}</div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {tab === "dashboard" ? (
          <>
            <section className="hero-card">
              <div>
                <p className="eyebrow">{live ? "CANLI KARAR KUYRUĞU" : "DEMO"}</p>
                <h2>{approvals.length} işlem senin onayını bekliyor.</h2>
                <p>
                  Listener mesajları kaydeder ve kurallar öneri üretir. Sen
                  onaylamadan statü değişmez, kimseye otomatik mesaj gitmez.
                </p>
              </div>
              <div className="hero-number">{approvals.length}</div>
            </section>

            <section className="archive-summary-grid">
              <article>
                <span>Arşivde görülen</span>
                <strong>{summary.archivePeople}</strong>
                <small>tarih boyunca adı geçen kişi</small>
              </article>
              <article>
                <span>Pipeline</span>
                <strong>{summary.pipelinePeople}</strong>
                <small>gerçek PWB statüsü atanmış kişi</small>
              </article>
              <article>
                <span>Doğrulanmış aktif · 60 gün</span>
                <strong>{summary.active60d}</strong>
                <small>üyeliği mevcut + son 60 günde gerçek mesaj</small>
              </article>
              <article>
                <span>Üyelik olayıyla mevcut</span>
                <strong>{summary.currentMembers}</strong>
                <small>katılım/eklenme verisinden çıkarılan</small>
              </article>
            </section>

            {globalTopics.length > 0 && (
              <section className="topic-overview">
                <div>
                  <p className="eyebrow">KONU HARİTASI</p>
                  <h2>Topluluk ne konuşuyor?</h2>
                </div>
                <div className="topic-cloud">
                  {globalTopics.slice(0, 10).map((item) => (
                    <span className="topic-pill" key={item.topic}>
                      {item.topic} <b>{item.count}</b>
                    </span>
                  ))}
                </div>
              </section>
            )}

            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">PWB PIPELINE</p>
                <h2>Statüler</h2>
              </div>
              <span>Arşiv kişilerinden ayrı</span>
            </div>

            <section className="stat-grid">
              {counts.map(({ status, count }) => (
                <article className="stat-card" key={status}>
                  <span className={statusClass(status)}>{status}</span>
                  <strong>{count}</strong>
                  <small>kişi</small>
                </article>
              ))}
            </section>

            <div className="section-heading">
              <div>
                <p className="eyebrow">KARAR KUTUSU</p>
                <h2>Onay Bekleyenler</h2>
              </div>
              <span>{approvals.length} açık karar</span>
            </div>

            <section className="approval-list">
              {approvals.length === 0 ? (
                <div className="empty-card">
                  <strong>Karar kutusu temiz.</strong>
                  <p>Şimdilik senden onay bekleyen bir işlem yok.</p>
                </div>
              ) : (
                approvals.map((approval) => {
                  const person = people.find((item) => item.id === approval.personId);
                  if (!person) return null;

                  const busy = loadingDecision === approval.id;

                  return (
                    <article className="approval-card" key={approval.id}>
                      <div className="approval-main">
                        <div className="avatar">{person.name.slice(0, 1)}</div>
                        <div>
                          <div className="approval-title-row">
                            <h3>{person.name}</h3>
                            <span className={statusClass(person.status)}>
                              {person.status || "Arşiv"}
                            </span>
                          </div>
                          <strong>{approval.title}</strong>
                          <p>{approval.reason}</p>
                          <div className="recommendation">
                            Öneri: <b>{approval.actionLabel}</b>
                          </div>
                        </div>
                      </div>
                      <div className="approval-actions">
                        <button
                          className="btn-primary"
                          disabled={busy}
                          onClick={() => void resolveApproval(approval, "approve")}
                        >
                          Onayla
                        </button>
                        <button
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => void resolveApproval(approval, "hold")}
                        >
                          Beklet
                        </button>
                        <button
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() => void resolveApproval(approval, "reject")}
                        >
                          Reddet
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </section>

            {activityLog.length > 0 && (
              <section className="log-card">
                <p className="eyebrow">SON İŞLEMLER</p>
                {activityLog.slice(0, 8).map((item, index) => (
                  <div key={`${item}-${index}`}>{item}</div>
                ))}
              </section>
            )}
          </>
        ) : tab === "roster" ? (
          <section className="roster-card">
            <div className="roster-head">
              <span>Kişi</span>
              <span>Rol</span>
              <span>Statü</span>
              <span>Üyelik</span>
              <span>Son Aktivite</span>
              <span>Konular</span>
              <span>Katkı</span>
            </div>
            {people.map((person) => (
              <button
                className="roster-row roster-row-button"
                key={person.id}
                onClick={() => setSelectedPerson(person)}
                type="button"
              >
                <strong className="person-link">{person.name}</strong>
                <span>{person.role}</span>
                <span className={statusClass(person.status)}>
                  {person.status || "Arşiv"}
                </span>
                <span>{membershipLabel(person.communityState)}</span>
                <span>{person.lastActivity}</span>
                <span className="topic-cell">
                  {person.topTopics.length
                    ? person.topTopics.slice(0, 2).join(" · ")
                    : "—"}
                </span>
                <span>{person.contribution}</span>
              </button>
            ))}
          </section>
        ) : (
          <section className="imports-page">
            <div className="import-drop-card">
              <div>
                <p className="eyebrow">WHATSAPP EXPORT</p>
                <h2>Arşivi içe aktar</h2>
                <p>
                  WhatsApp’tan “Sohbeti dışa aktar → Medyasız” ile aldığın ZIP’i yükle.
                  Sistem kişileri eşleştirir, yeni mesajları kaydeder ve son aktivite tarihlerini günceller.
                </p>
              </div>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const input = form.elements.namedItem("archive") as HTMLInputElement;
                  const file = input.files?.[0];
                  if (!file) return;

                  setImporting(true);
                  setImportResult(null);
                  setError(null);

                  try {
                    const data = new FormData();
                    data.append("file", file);

                    const response = await fetch("/api/import/whatsapp", {
                      method: "POST",
                      body: data,
                    });
                    const payload = await response.json();

                    if (!response.ok) {
                      throw new Error(payload.error || "İçe aktarma başarısız.");
                    }

                    setImportResult(
                      payload.duplicate
                        ? "Bu ZIP daha önce işlenmiş. Yeni kayıt eklenmedi."
                        : `${payload.groupName}: ${payload.insertedMessages} mesaj, ${payload.systemEvents ?? 0} üyelik/sistem olayı, ${payload.participants} arşiv kişisi işlendi${payload.reprocessed ? " (yeniden işlendi)" : ""}.`,
                    );

                    form.reset();
                    await loadDashboard();
                  } catch (uploadError) {
                    setError(
                      uploadError instanceof Error
                        ? uploadError.message
                        : "İçe aktarma başarısız.",
                    );
                  } finally {
                    setImporting(false);
                  }
                }}
              >
                <input name="archive" type="file" accept=".zip,application/zip" />
                <button className="btn-primary import-button" disabled={importing} type="submit">
                  {importing ? "İşleniyor…" : "ZIP’i içe aktar"}
                </button>
              </form>
              {importResult && <div className="import-success">{importResult}</div>}
            </div>

            <div className="section-heading import-history-heading">
              <div>
                <p className="eyebrow">GEÇMİŞ</p>
                <h2>Son içe aktarmalar</h2>
              </div>
              <span>{importRuns.length} kayıt</span>
            </div>

            <div className="import-history">
              {importRuns.length === 0 ? (
                <div className="empty-card">
                  <strong>Henüz arşiv yüklenmedi.</strong>
                  <p>İlk PWB WhatsApp ZIP’ini yukarıdan ekleyebilirsin.</p>
                </div>
              ) : (
                importRuns.map((run) => (
                  <article className="import-run" key={run.id}>
                    <div>
                      <strong>{run.group_name}</strong>
                      <span>{run.source_file_name}</span>
                    </div>
                    <div className="import-run-stats">
                      <b>{run.inserted_message_count}</b> yeni mesaj
                      <b>{run.participant_count}</b> kişi
                    </div>
                    <time>
                      {new Date(run.created_at).toLocaleString("tr-TR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </time>
                  </article>
                ))
              )}
            </div>
          </section>
        )}
      </section>

      {selectedPerson && (
        <PersonProfile
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
        />
      )}
    </main>
  );
}
