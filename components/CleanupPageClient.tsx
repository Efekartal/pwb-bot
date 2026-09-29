"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  person: {
    id: string;
    full_name: string;
    role: string;
    status: string | null;
    community_state: "unknown" | "current" | "left" | "removed";
  };
  stats: {
    open_tasks: number;
    completed_tasks_90d: number;
    operational_events_90d: number;
    pwb_messages_90d: number;
  };
  bucket: "remove_candidate" | "review" | "keep" | "already_gone";
  actionable: boolean;
  requiresMembershipCheck: boolean;
  reasons: string[];
  ages: {
    substantiveDays: number | null;
    pwbDays: number | null;
    operationalDays: number | null;
  };
};

type Payload = {
  summary: {
    remove_candidate: number;
    review: number;
    keep: number;
    already_gone: number;
    actionable: number;
    membershipCheck: number;
  };
  rows: Row[];
};

function stateLabel(state: Row["person"]["community_state"]) {
  if (state === "current") return "Mevcut";
  if (state === "left") return "Ayrıldı";
  if (state === "removed") return "Çıkarıldı";
  return "Bilinmiyor";
}

function recommendation(row: Row) {
  if (row.bucket === "already_gone") return "Zaten ayrılmış";
  if (row.bucket === "keep") return "TUT";
  if (row.bucket === "review") return "İNCELE";
  if (row.actionable) return "ÇIKARMA ADAYI";
  return "ÜYELİĞİ DOĞRULA";
}

export default function CleanupPageClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<"remove_candidate" | "review" | "keep">(
    "remove_candidate",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cleanup/recommendations", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Liste alınamadı.");
        setData(payload);
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Liste alınamadı."),
      );
  }, []);

  const rows = useMemo(
    () => (data?.rows ?? []).filter((row) => row.bucket === filter),
    [data, filter],
  );

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
          <a href="/kadro">Kadro</a>
          <a className="nav-active" href="/temizlik">Kadro Temizliği</a>
        </nav>

        <div className="sidebar-foot">
          Bot sadece öneri üretir. Kimse otomatik çıkarılmaz.
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">KARAR DESTEK</p>
            <h1>Kadro Temizliği</h1>
          </div>
          <div className="admin-pill">ONAY GEREKLİ</div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {!data ? (
          <div className="empty-card">Adaylar hesaplanıyor…</div>
        ) : (
          <>
            <section className="cleanup-summary">
              <article>
                <span>Güçlü temizlik adayı</span>
                <strong>{data.summary.remove_candidate}</strong>
                <small>pasiflik + katkı yokluğu</small>
              </article>
              <article>
                <span>İncele</span>
                <strong>{data.summary.review}</strong>
                <small>karar için bağlam gerekli</small>
              </article>
              <article>
                <span>Tut</span>
                <strong>{data.summary.keep}</strong>
                <small>yakın dönem PWB / operasyon sinyali</small>
              </article>
              <article>
                <span>Doğrudan çıkarılabilir</span>
                <strong>{data.summary.actionable}</strong>
                <small>üyeliği mevcut olarak doğrulanmış</small>
              </article>
            </section>

            <div className="cleanup-warning">
              <strong>Önemli:</strong> Üyelik durumu bilinmeyen kişilerde sistem
              “çıkar” demez. Önce kişinin hâlâ ilgili grupta olduğu doğrulanmalı.
              Şu an {data.summary.membershipCheck} güçlü aday bu kontrolden geçmeli.
            </div>

            <div className="cleanup-tabs">
              <button
                className={filter === "remove_candidate" ? "cleanup-active" : ""}
                onClick={() => setFilter("remove_candidate")}
              >
                Temizlik Adayları ({data.summary.remove_candidate})
              </button>
              <button
                className={filter === "review" ? "cleanup-active" : ""}
                onClick={() => setFilter("review")}
              >
                İncele ({data.summary.review})
              </button>
              <button
                className={filter === "keep" ? "cleanup-active" : ""}
                onClick={() => setFilter("keep")}
              >
                Tut ({data.summary.keep})
              </button>
            </div>

            <section className="cleanup-list">
              {rows.map((row) => (
                <article className="cleanup-row" key={row.person.id}>
                  <div className="cleanup-person">
                    <a href={`/kadro`}>
                      <strong>{row.person.full_name}</strong>
                    </a>
                    <span>
                      {row.person.role} · üyelik {stateLabel(row.person.community_state)}
                    </span>
                  </div>

                  <div className="cleanup-reasons">
                    {row.reasons.slice(0, 4).map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>

                  <div className="cleanup-signal">
                    <small>Anlamlı aktivite</small>
                    <strong>
                      {row.ages.substantiveDays === null
                        ? "yok"
                        : `${row.ages.substantiveDays} gün`}
                    </strong>
                  </div>

                  <div
                    className={
                      row.actionable
                        ? "cleanup-decision cleanup-remove"
                        : row.bucket === "keep"
                          ? "cleanup-decision cleanup-keep"
                          : row.bucket === "review"
                            ? "cleanup-decision cleanup-review"
                            : "cleanup-decision cleanup-check"
                    }
                  >
                    {recommendation(row)}
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
