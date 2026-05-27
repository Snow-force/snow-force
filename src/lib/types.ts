export type Bilingual<T = string> = { en: T; zh: T };

export type EventStatus = "draft" | "published" | "archived";
export type RecapStatus = "draft" | "published" | "hidden";
export type RecapMediaType = "image";
export type RegistrationState = "open" | "closed" | "full";
export type EventQuestionType =
  | "text"
  | "single_choice"
  | "multiple_choice"
  | "yes_no"
  | "date"
  | "phone";
export type EventDetailModuleType =
  | "intro"
  | "highlights"
  | "itinerary"
  | "notes"
  | "fees"
  | "refund"
  | "contact"
  | "custom";
export type EventDetailDisplayMode = "rich_text" | "list";

export interface EventRegistrationQuestion {
  id: string;
  key: string;
  type: EventQuestionType;
  required: boolean;
  label: Bilingual;
  helpText: Bilingual;
  options: Bilingual<string[]>;
}

export interface EventDetailModule {
  id: string;
  type: EventDetailModuleType;
  displayMode: EventDetailDisplayMode;
  title: Bilingual;
  content: Bilingual;
  items: Bilingual<string[]>;
}

export type RegistrationAnswerValue = string | boolean | string[];
export type RegistrationAnswers = Record<string, RegistrationAnswerValue>;

export interface Event {
  slug: string;
  status: EventStatus;
  registrationState: RegistrationState;
  title: Bilingual;
  eventDate: string;
  meetTime: string;
  meetLocation: Bilingual;
  activityLocation: Bilingual;
  locationUrl: string;
  coverImage: string;
  capacity: number;
  registrationCount: number;
  registrationCloseAt: string;
  requiresApproval: boolean;
  allowWaitlist: boolean;
  allowCancellation: boolean;
  feeAmount: string;
  paymentInstructions: Bilingual;
  seoTitle: Bilingual;
  seoDescription: Bilingual;
  registrationQuestions: EventRegistrationQuestion[];
  detailModules: EventDetailModule[];
}

export interface Registration {
  id: string;
  eventSlug: string;
  memberId: string | null;
  answers: RegistrationAnswers;
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

export interface RecapMediaItem {
  id: string;
  type: RecapMediaType;
  url: string;
  storagePath: string;
  caption?: Partial<Bilingual>;
  order: number;
  isCover: boolean;
}

export interface EventRecap {
  slug: string;
  status: RecapStatus;
  title: Bilingual;
  summary: Bilingual;
  content: Bilingual;
  date: string;
  location: Bilingual;
  coverImage: string;
  media: RecapMediaItem[];
  tags: Bilingual<string[]>;
  seoTitle: Bilingual;
  seoDescription: Bilingual;
  eventSlug?: string | null;
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
