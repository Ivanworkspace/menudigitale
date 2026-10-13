/**
 * Firestore document shapes. Dates are stored as ISO-8601 UTC strings
 * (lexicographically sortable, serializable to client components); TTL
 * fields named `expireAt` are Firestore Timestamps for automatic cleanup.
 */
import type { TenantStatus } from "@/domain/subscription";
import type { MenuMode, ModuleFlags } from "@/domain/modules";
import type { StaffRole } from "@/domain/permissions";
import type { AyceConfig } from "@/domain/ayce";
import type { ReservationConfig } from "@/domain/reservations";
import type { LoyaltyConfig } from "@/domain/loyalty";
import type { TakeawayConfig } from "@/domain/takeaway";
import type { ReviewConfig } from "@/domain/reviews";

export type Branding = {
  logoPath: string | null;
  coverPath: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
};

export type OrderProtection = {
  requireOpenTable: boolean;
  autoOpenOnScan: boolean;
  geofence: "off" | "block" | "waiter_confirm";
  tableCode: boolean;
  manualFirstApproval: boolean;
  maxOrdersPerMinute: number;
};

export type OpeningHours = { weekdays: number[]; open: string; close: string }[];

export type TenantSettings = {
  timezone: string;
  languages: string[];
  defaultLanguage: string;
  soldOutBehavior: "show" | "hide";
  coverChargeCents: number;
  servicePctBp: number;
  orderProtection: OrderProtection;
  openingHours: OpeningHours;
  closures: { from: string; to: string; note?: string }[];
  reviewUrl: string | null;
  socials: Record<string, string>;
  privacyText: string | null;
  cookieText: string | null;
  frozenNote: Record<string, string>;
  /** Menu mode by time slot (e.g. lunch à la carte, dinner AYCE). */
  modeSchedules?: { weekdays: number[]; from: string; to: string; mode: MenuMode }[];
  ayce?: AyceConfig;
  /** Payment methods offered at the till. */
  paymentMethods?: string[];
  reservations?: ReservationConfig;
  loyalty?: LoyaltyConfig;
  takeaway?: TakeawayConfig;
  reviews?: ReviewConfig;
};

export type Tenant = {
  id: string;
  slug: string;
  status: TenantStatus;
  planId: string | null;
  legalName: string;
  displayName: string;
  vatNumber: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  lat: number | null;
  lng: number | null;
  geofenceRadiusM: number;
  defaultMenuMode: MenuMode;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  graceDays: number;
  suspendedReason: string | null;
  showPoweredBy: boolean;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  modules: ModuleFlags;
  branding: Branding;
  settings: TenantSettings;
  /** Denormalized counters used for plan limits and dashboards. */
  stats: { ordersThisMonth: number; ordersMonth: string };
  /** Bumped on every menu change; open public menus poll it to refresh. */
  menuVersion?: string;
};

export type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthCents: number;
  maxTables: number | null;
  maxProducts: number | null;
  maxStaff: number | null;
  includedModules: string[];
  active: boolean;
  sort: number;
};

export type PlatformSettings = {
  brandName: string;
  brandUrl: string | null;
  defaultGraceDays: number;
  expiryWarningDays: number[];
};

export type StaffMember = {
  id: string;
  tenantId: string;
  displayName: string;
  role: StaffRole;
  active: boolean;
  color: string;
  sort: number;
  lastLoginAt: string | null;
  createdAt: string;
};

export type SubscriptionEvent = {
  id: string;
  type: "created" | "renewed" | "plan_changed" | "suspended" | "reactivated" | "expired" | "grace_started" | "warning_sent";
  periodEnd: string | null;
  amountCents: number | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  actorKind: "staff" | "platform_admin" | "guest" | "system";
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  diff: unknown;
  ip: string | null;
  createdAt: string;
};

export type PlatformAuditEntry = {
  id: string;
  adminId: string | null;
  action: string;
  tenantId: string | null;
  payload: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
};

export const DEFAULT_ORDER_PROTECTION: OrderProtection = {
  requireOpenTable: true,
  autoOpenOnScan: false,
  geofence: "block",
  tableCode: false,
  manualFirstApproval: false,
  maxOrdersPerMinute: 3,
};

export const DEFAULT_SETTINGS: TenantSettings = {
  timezone: "Europe/Rome",
  languages: ["it"],
  defaultLanguage: "it",
  soldOutBehavior: "show",
  coverChargeCents: 0,
  servicePctBp: 0,
  orderProtection: DEFAULT_ORDER_PROTECTION,
  openingHours: [],
  closures: [],
  reviewUrl: null,
  socials: {},
  privacyText: null,
  cookieText: null,
  frozenNote: {
    it: "* Prodotto surgelato o abbattuto all'origine",
    en: "* Frozen or blast-chilled product",
  },
};

export const DEFAULT_BRANDING: Branding = {
  logoPath: null,
  coverPath: null,
  primaryColor: "#b91c1c",
  accentColor: "#f59e0b",
  backgroundColor: "#fffaf5",
  fontFamily: "Inter",
};
