import "server-only";
import { FieldValue, Timestamp, type DocumentSnapshot, type QuerySnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebase";
import { COL, SUB } from "@/lib/firebase/paths";

export { FieldValue, Timestamp };
export const db = adminDb;
export const nowIso = () => new Date().toISOString();

/** Typed snapshot -> object with id. */
export function withId<T>(snap: DocumentSnapshot): T | null {
  return snap.exists ? ({ id: snap.id, ...snap.data() } as T) : null;
}
export function allWithId<T>(snap: QuerySnapshot): T[] {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export const refs = {
  tenant: (id: string) => db().collection(COL.tenants).doc(id),
  tenants: () => db().collection(COL.tenants),
  staff: (t: string) => refs.tenant(t).collection(SUB.staff),
  rolePermissions: (t: string) => refs.tenant(t).collection(SUB.rolePermissions),
  audit: (t: string) => refs.tenant(t).collection(SUB.audit),
  subscriptionEvents: (t: string) => refs.tenant(t).collection(SUB.subscriptionEvents),
  menuModeSchedules: (t: string) => refs.tenant(t).collection(SUB.menuModeSchedules),
  menus: (t: string) => refs.tenant(t).collection(SUB.menus),
  categories: (t: string) => refs.tenant(t).collection(SUB.categories),
  products: (t: string) => refs.tenant(t).collection(SUB.products),
  modifierGroups: (t: string) => refs.tenant(t).collection(SUB.modifierGroups),
  departments: (t: string) => refs.tenant(t).collection(SUB.departments),
  rooms: (t: string) => refs.tenant(t).collection(SUB.rooms),
  tables: (t: string) => refs.tenant(t).collection(SUB.tables),
  tableSessions: (t: string) => refs.tenant(t).collection(SUB.tableSessions),
  orders: (t: string) => refs.tenant(t).collection(SUB.orders),
  serviceRequests: (t: string) => refs.tenant(t).collection(SUB.serviceRequests),
  notifications: (t: string) => refs.tenant(t).collection(SUB.notifications),
  orderBlocks: (t: string) => refs.tenant(t).collection(SUB.orderBlocks),
  tableTokens: () => db().collection(COL.tableTokens),
  takeawayTokens: () => db().collection(COL.takeawayTokens),
  pushSubscriptions: () => db().collection(COL.pushSubscriptions),
  printers: (t: string) => refs.tenant(t).collection(SUB.printers),
  printJobs: (t: string) => refs.tenant(t).collection(SUB.printJobs),
  printKeys: () => db().collection(COL.printKeys),
  bills: (t: string) => refs.tenant(t).collection(SUB.bills),
  counters: (t: string) => refs.tenant(t).collection(SUB.counters),
  analytics: (t: string) => refs.tenant(t).collection(SUB.analytics),
  reservations: (t: string) => refs.tenant(t).collection(SUB.reservations),
  customers: (t: string) => refs.tenant(t).collection(SUB.customers),
  loyaltyTransactions: (t: string) => refs.tenant(t).collection(SUB.loyaltyTransactions),
  promotions: (t: string) => refs.tenant(t).collection(SUB.promotions),
  ingredients: (t: string) => refs.tenant(t).collection(SUB.ingredients),
  stockMovements: (t: string) => refs.tenant(t).collection(SUB.stockMovements),
  reviewRequests: (t: string) => refs.tenant(t).collection(SUB.reviewRequests),
  reviewOptouts: (t: string) => refs.tenant(t).collection(SUB.reviewOptouts),
  plans: () => db().collection(COL.plans),
  platformSettings: () => db().collection(COL.platform).doc("settings"),
  platformAdmins: () => db().collection(COL.platformAdmins),
  adminSessions: () => db().collection(COL.adminSessions),
  platformAudit: () => db().collection(COL.platformAudit),
  impersonations: () => db().collection(COL.impersonations),
  slugs: () => db().collection(COL.slugs),
  accessTokens: () => db().collection(COL.accessTokens),
  staffCredentials: () => db().collection(COL.staffCredentials),
  staffSessions: () => db().collection(COL.staffSessions),
  authAttempts: () => db().collection(COL.authAttempts),
};

/** Firestore TTL helper: Timestamp `ms` from now. */
export const expireIn = (ms: number) => Timestamp.fromMillis(Date.now() + ms);
