import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TeamPageClient from "@/components/TeamPageClient";
import { TEAM_COOKIE_NAME, verifyTeamSession } from "@/lib/team-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PWB Ekip",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string; denied?: string }>;
}) {
  const params = await searchParams;

  if (params.k) {
    redirect(`/api/team/access?k=${encodeURIComponent(params.k)}`);
  }

  const store = await cookies();
  const session = store.get(TEAM_COOKIE_NAME)?.value;

  if (!verifyTeamSession(session)) {
    return (
      <main className="team-access-screen">
        <section>
          <div className="brand-mark">PWB</div>
          <p className="eyebrow">PWB EKİP</p>
          <h1>Erişim bağlantısı gerekli</h1>
          <p>
            Bu alan yalnızca PWB ekibine gönderilen özel davet bağlantısıyla açılır.
          </p>
          {params.denied && (
            <div className="error-banner">Bağlantı geçersiz veya süresi dolmuş.</div>
          )}
        </section>
      </main>
    );
  }

  return <TeamPageClient />;
}
