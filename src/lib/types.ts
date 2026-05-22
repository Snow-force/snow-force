export type Bilingual<T = string> = { en: T; zh: T };

export type EventStatus = "draft" | "published";
export type RegistrationState = "open" | "closed" | "full";

export interface Event {
  slug: string;
  status: EventStatus;
  registrationState: RegistrationState;
  title: Bilingual;
  subtitle: Bilingual;
  description: Bilingual;
  highlights: Bilingual<string[]>;
  audienceLevel: Bilingual;
  schedule: Bilingual;
  location: Bilingual;
  locationUrl: string;
  feeInfo: Bilingual;
  notices: Bilingual<string[]>;
  coverImage: string;
  media: string[];
  capacity: number;
  registrationCount: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  eventStartAt: string;
  eventEndAt: string;
  registrationFields: RegistrationFieldConfig[];
  tags: Bilingual<string[]>;
  seoTitle: Bilingual;
  seoDescription: Bilingual;
}

export interface RegistrationFieldConfig {
  key: string;
  label: Bilingual;
  type: "text" | "email" | "tel" | "textarea" | "select";
  required: boolean;
  options?: Bilingual<string[]>;
  placeholder?: Bilingual;
}

export interface Registration {
  id: string;
  eventSlug: string;
  memberId: string | null;
  answers: Record<string, string>;
  consentGiven: boolean;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  status: "confirmed" | "cancelled" | "waitlist";
  createdAt: string;
  updatedAt: string;
}

export interface MemberProfile {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  riderLevel: Bilingual;
  emergencyContact: string;
  emergencyPhone: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecap {
  slug: string;
  status: EventStatus;
  title: Bilingual;
  summary: Bilingual;
  content: Bilingual;
  date: string;
  location: Bilingual;
  coverImage: string;
  media: { url: string; caption: Bilingual }[];
  tags: Bilingual<string[]>;
  seoTitle: Bilingual;
  seoDescription: Bilingual;
}

export interface FAQItem {
  id: string;
  question: Bilingual;
  answer: Bilingual;
  category: Bilingual;
  order: number;
}

export interface PartnerInquiry {
  id: string;
  organizationName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  inquiryType: Bilingual;
  message: string;
  createdAt: string;
  status: "new" | "contacted" | "archived";
}

export interface StaffUser {
  id: string;
  email: string;
  role: "admin" | "manager";
}
