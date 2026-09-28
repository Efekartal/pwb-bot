export type TalentStatus =
  | "Aktif"
  | "Gelişim"
  | "Geri Dönüş"
  | "Yeni Aday"
  | "Beklemede"
  | "Aday Havuzu";

export type Person = {
  id: string;
  name: string;
  status: TalentStatus;
  role: "Güreşçi" | "Creative" | "Yönetim" | "Topluluk";
  creative?: string;
  lastActivity: string;
  lastActivityDays: number;
  contribution: "Yüksek" | "Orta" | "Düşük" | "Yeni";
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
