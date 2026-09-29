export type TalentStatus =
  | "Aktif"
  | "Gelişim"
  | "Geri Dönüş"
  | "Yeni Aday"
  | "Beklemede"
  | "Aday Havuzu";

export type CommunityState = "unknown" | "current" | "left" | "removed";

export type Person = {
  id: string;
  name: string;
  status: TalentStatus | null;
  isPipelineTracked: boolean;
  communityState: CommunityState;
  role: "Güreşçi" | "Creative" | "Yönetim" | "Topluluk";
  creative?: string;
  lastActivity: string;
  lastActivityDays: number;
  contribution: "Yüksek" | "Orta" | "Düşük" | "Yeni";
  topTopics: string[];
  note?: string;
};

export type Approval = {
  id: string;
  personId: string;
  title: string;
  reason: string;
  recommendation: TalentStatus;
  actionLabel: string;
  risk: "Düşük" | "Orta" | "Yüksek";
};
