"use client";

import { useEffect, useState } from "react";
import PersonProfile from "@/components/PersonProfile";
import type { Person, TalentStatus } from "@/lib/types";

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

function relativeActivity(date?: string | null) {
  if (!date) return { label: "Kayıt yok", days: 9999 };
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000),
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

function membershipLabel(state: Person["communityState"]) {
  if (state === "current") return "Mevcut";
  if (state === "left") return "Ayrıldı";
  if (state === "removed") return "Çıkarıldı";
  return "Bilinmiyor";
}

function statusLabel(person: Person) {
  return person.status || "Arşiv";
}

export default function KadroPageClient() {
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Kadro alınamadı.");
        if (!cancelled) {
          setPeople((payload.people as ApiPerson[]).map(mapPerson));
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Kadro alınamadı.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
          <a href="/">Genel Bakış</a>
          <a className="nav-active" href="/kadro">Kadro</a>
          <a href="/temizlik">Kadro Temizliği</a>
          <a href="/">WhatsApp Arşivi</a>
        </nav>

        <div className="sidebar-foot">
          Kişiye tıklayınca detaylı PWB profili açılır.
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">PRO WRESTLING BOSPHORUS</p>
            <h1>Kadro</h1>
          </div>
          <div className="admin-pill">CANLI VERİ</div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="empty-card">Kadro yükleniyor…</div>
        ) : (
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
                <span>{statusLabel(person)}</span>
                <span>{membershipLabel(person.communityState)}</span>
                <span>{person.lastActivity}</span>
                <span className="topic-cell">
                  {(person.topTopics ?? []).length
                    ? (person.topTopics ?? []).slice(0, 2).join(" · ")
                    : "—"}
                </span>
                <span>{person.contribution}</span>
              </button>
            ))}
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
