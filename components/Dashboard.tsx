"use client";

import { useMemo, useState } from "react";
import { initialApprovals, initialPeople } from "@/lib/mock-data";
import type { Approval, Person, TalentStatus } from "@/lib/types";

const statusOrder: TalentStatus[] = [
  "Aktif",
  "Gelişim",
  "Geri Dönüş",
  "Yeni Aday",
  "Beklemede",
  "Aday Havuzu",
];

function statusClass(status: TalentStatus) {
  return `status status-${status.toLowerCase().replaceAll(" ", "-").replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ş", "s")}`;
}

export default function Dashboard() {
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [approvals, setApprovals] = useState<Approval[]>(initialApprovals);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [tab, setTab] = useState<"dashboard" | "roster">("dashboard");

  const counts = useMemo(() => {
    return statusOrder.map((status) => ({
      status,
      count: people.filter((person) => person.status === status).length,
    }));
  }, [people]);

  const resolveApproval = (approval: Approval, decision: "approve" | "hold" | "reject") => {
    const person = people.find((item) => item.id === approval.personId);
    if (!person) return;

    if (decision === "approve") {
      setPeople((current) =>
        current.map((item) =>
          item.id === person.id ? { ...item, status: approval.recommendation } : item,
        ),
      );
      setActivityLog((current) => [
        `${person.name}: “${approval.title}” onaylandı → ${approval.recommendation}`,
        ...current,
      ]);
    }

    if (decision === "hold") {
      setPeople((current) =>
        current.map((item) =>
          item.id === person.id ? { ...item, status: "Beklemede" } : item,
        ),
      );
      setActivityLog((current) => [`${person.name}: karar beklemeye alındı.`, ...current]);
    }

    if (decision === "reject") {
      setActivityLog((current) => [`${person.name}: öneri reddedildi, mevcut statü korundu.`, ...current]);
    }

    setApprovals((current) => current.filter((item) => item.id !== approval.id));
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
          <button className={tab === "dashboard" ? "nav-active" : ""} onClick={() => setTab("dashboard")}>Genel Bakış</button>
          <button className={tab === "roster" ? "nav-active" : ""} onClick={() => setTab("roster")}>Kadro</button>
          <button disabled>Yeni Başvurular <small>{people.filter((p) => p.status === "Yeni Aday").length}</small></button>
          <button disabled>Görevler</button>
          <button disabled>WhatsApp <span className="soon">yakında</span></button>
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
            <h1>{tab === "dashboard" ? "Operasyon Paneli" : "Kadro"}</h1>
          </div>
          <div className="admin-pill">Yönetici Modu</div>
        </header>

        {tab === "dashboard" ? (
          <>
            <section className="hero-card">
              <div>
                <p className="eyebrow">BUGÜN</p>
                <h2>{approvals.length} işlem senin onayını bekliyor.</h2>
                <p>Bot adayları sınıflandırır ve öneri üretir. Sen onaylamadan hiçbir statü veya iletişim işlemi uygulanmaz.</p>
              </div>
              <div className="hero-number">{approvals.length}</div>
            </section>

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
                  const person = people.find((item) => item.id === approval.personId)!;
                  return (
                    <article className="approval-card" key={approval.id}>
                      <div className="approval-main">
                        <div className="avatar">{person.name.slice(0, 1)}</div>
                        <div>
                          <div className="approval-title-row">
                            <h3>{person.name}</h3>
                            <span className={statusClass(person.status)}>{person.status}</span>
                          </div>
                          <strong>{approval.title}</strong>
                          <p>{approval.reason}</p>
                          <div className="recommendation">
                            Öneri: <b>{approval.actionLabel}</b>
                          </div>
                        </div>
                      </div>
                      <div className="approval-actions">
                        <button className="btn-primary" onClick={() => resolveApproval(approval, "approve")}>Onayla</button>
                        <button className="btn-secondary" onClick={() => resolveApproval(approval, "hold")}>Beklet</button>
                        <button className="btn-ghost" onClick={() => resolveApproval(approval, "reject")}>Reddet</button>
                      </div>
                    </article>
                  );
                })
              )}
            </section>

            {activityLog.length > 0 && (
              <section className="log-card">
                <p className="eyebrow">SON İŞLEMLER</p>
                {activityLog.slice(0, 5).map((item, index) => <div key={`${item}-${index}`}>{item}</div>)}
              </section>
            )}
          </>
        ) : (
          <section className="roster-card">
            <div className="roster-head">
              <span>Kişi</span><span>Rol</span><span>Statü</span><span>Creative</span><span>Son Aktivite</span><span>Katkı</span>
            </div>
            {people.map((person) => (
              <div className="roster-row" key={person.id}>
                <strong>{person.name}</strong>
                <span>{person.role}</span>
                <span className={statusClass(person.status)}>{person.status}</span>
                <span>{person.creative ?? "—"}</span>
                <span>{person.lastActivity}</span>
                <span>{person.contribution}</span>
              </div>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
