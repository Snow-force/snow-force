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

export type MerchantBoothCurrency = "usd" | "cny" | "eur" | "gbp" | "jpy";

export interface EventMerchantBoothPlan {
  id: string;
  name: Bilingual;
  description: Bilingual;
  priceAmount: number;
  priceCurrency: MerchantBoothCurrency;
}

export interface EventMerchantBoothPhysicalBooth {
  id: string;
  boothPlanId: string;
  boothCode: string;
}

export interface EventMerchantBoothProgram {
  enabled: boolean;
  paymentInstructions: Bilingual;
  plans: EventMerchantBoothPlan[];
  booths: EventMerchantBoothPhysicalBooth[];
}

export type RegistrationAnswerValue = string | boolean | string[];
export type RegistrationAnswers = Record<string, RegistrationAnswerValue>;

export type RegistrationDepositStatus = "pending" | "paid" | "refunded" | "waived";
export type RegistrationSettlementStatus =
  | "not_started"
  | "pending_balance"
  | "pending_refund"
  | "settled";

export interface RegistrationFinance {
  depositAmount: number | null;
  depositStatus: RegistrationDepositStatus;
  depositPaidAt: string;
  paymentMethod: string;
  paymentNote: string;
  lodgingAssignment: string;
  finalAmount: number | null;
  settlementAmount: number | null;
  settlementStatus: RegistrationSettlementStatus;
  settlementNote: string;
  couponCode?: string;
  discountAmount?: number;
}

export interface Event {
  slug: string;
  status: EventStatus;
  registrationState: RegistrationState;
  title: Bilingual;
  summary?: Bilingual;
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
  paymentModel: "free" | "deposit" | "full_prepay";
  depositAmount: number | null;
  depositCurrency: "usd" | "cny" | "eur" | "gbp" | "jpy";
  fullPaymentAmount: number | null;
  paymentInstructions: Bilingual;
  seoTitle: Bilingual;
  seoDescription: Bilingual;
  registrationQuestions: EventRegistrationQuestion[];
  detailModules: EventDetailModule[];
  waiverTextEn: string | null;
  waiverTextSha: string | null;
  merchantBoothProgram: EventMerchantBoothProgram | null;
}

export interface WaiverAcceptance {
  id: number;
  registrationId: string;
  legalTextSnapshot: string;
  waiverTextSha: string;
  typedName: string;
  handwrittenSignatureDataUrl: string | null;
  acceptedAt: string;
  createdAt: string;
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
  finance?: RegistrationFinance;
  createdAt: string;
  updatedAt: string;
}

export interface MemberEquipment {
  ownsSkis: boolean;
  ownsSnowboard: boolean;
  ownsBoots: boolean;
  needsRentalHelp: boolean;
}

export interface MemberNotificationPreferences {
  eventReminders: boolean;
  newTrips: boolean;
  recapPosted: boolean;
  communityUpdates: boolean;
}

export interface MemberProfile {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  riderLevel: Bilingual;
  riderType: "" | "skier" | "snowboarder" | "both" | "learning";
  structuredRiderLevel: "" | "first_timer" | "beginner" | "intermediate" | "advanced" | "expert";
  homeMountain: string;
  bio: string;
  carpoolInterest: boolean;
  lodgingInterest: boolean;
  preferredLanguage: "en" | "zh";
  instagram: string;
  discord: string;
  avatarUrl: string;
  passes: string[];
  equipment: MemberEquipment;
  savedEventSlugs: string[];
  notificationPreferences: MemberNotificationPreferences;
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

export interface MemberPass {
  id: string;
  profileId: string;
  passType: "ikon" | "epic" | "big_bear" | "mountain_high" | "other";
  label: string;
  createdAt: string;
}

export interface MemberEquipmentRow {
  id: string;
  profileId: string;
  ownsSkis: boolean;
  ownsSnowboard: boolean;
  ownsBoots: boolean;
  needsRentalHelp: boolean;
  note: string;
  updatedAt: string;
}

export interface SavedEvent {
  id: string;
  profileId: string;
  eventSlug: string;
  savedAt: string;
}

export type NotificationType =
  | "email_verification"
  | "profile_completion"
  | "event_opened"
  | "waitlist_confirmed"
  | "event_cancelled"
  | "recap_published"
  | "registration_changed"
  | "payment_reminder";

export interface MemberNotification {
  id: string;
  profileId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
}
