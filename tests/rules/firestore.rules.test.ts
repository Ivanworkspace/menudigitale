/**
 * Firestore security rules: tenant isolation and "server writes only".
 * Runs against the emulator:  npm run test:rules
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, collection, getDocs, query, where, updateDoc } from "firebase/firestore";

const RUN = !!process.env.FIRESTORE_EMULATOR_HOST;
const d = RUN ? describe : describe.skip;

let env: RulesTestEnvironment;

const staff = (tenantId: string, role = "waiter") => env.authenticatedContext(`staff_${tenantId}_${role}`, { kind: "staff", tenantId, role });
const guest = (tenantId: string, tableSessionId: string) =>
  env.authenticatedContext(`guest_${tableSessionId}`, { kind: "guest", tenantId, tableSessionId });

d("firestore.rules", () => {
  beforeAll(async () => {
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
    });
  });
  afterAll(async () => env?.cleanup());

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const t of ["A", "B"]) {
        await setDoc(doc(db, "tenants", t), { displayName: `Tenant ${t}` });
        await setDoc(doc(db, "tenants", t, "staff", "s1"), { displayName: "Luca" });
        await setDoc(doc(db, "tenants", t, "orders", "o1"), { tableSessionId: "ts1", total: 10 });
        await setDoc(doc(db, "tenants", t, "orders", "o2"), { tableSessionId: "ts2", total: 20 });
        await setDoc(doc(db, "tenants", t, "table_sessions", "ts1"), { tableId: "t1" });
        await setDoc(doc(db, "tenants", t, "audit_log", "a1"), { action: "x" });
        await setDoc(doc(db, "tenants", t, "bills", "b1"), { tableSessionId: "ts1", totals: { totalCents: 100 } });
        await setDoc(doc(db, "tenants", t, "reservations", "r1"), { name: "Rossi" });
        await setDoc(doc(db, "tenants", t, "customers", "c1"), { name: "Mario", phone: "+39333" });
      }
      await setDoc(doc(db, "access_tokens", "hash"), { tenantId: "A", tokenEnc: "secret" });
      await setDoc(doc(db, "staff_credentials", "s1"), { tenantId: "A", pinHash: "x" });
      await setDoc(doc(db, "platform_admins", "u1"), { displayName: "Admin" });
      await setDoc(doc(db, "plans", "p1"), { name: "Base" });
    });
  });

  it("unauthenticated users can read nothing", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "tenants", "A")));
    await assertFails(getDoc(doc(db, "plans", "p1")));
    await assertFails(getDoc(doc(db, "access_tokens", "hash")));
  });

  it("staff read their own tenant only", async () => {
    const db = staff("A").firestore();
    await assertSucceeds(getDoc(doc(db, "tenants", "A")));
    await assertSucceeds(getDoc(doc(db, "tenants", "A", "staff", "s1")));
    await assertSucceeds(getDocs(collection(db, "tenants", "A", "orders")));
    await assertFails(getDoc(doc(db, "tenants", "B")));
    await assertFails(getDoc(doc(db, "tenants", "B", "staff", "s1")));
    await assertFails(getDocs(collection(db, "tenants", "B", "orders")));
  });

  it("staff cannot read audit logs, secrets, credentials or platform data", async () => {
    const db = staff("A", "owner").firestore();
    await assertFails(getDoc(doc(db, "tenants", "A", "audit_log", "a1")));
    await assertFails(getDoc(doc(db, "access_tokens", "hash")));
    await assertFails(getDoc(doc(db, "staff_credentials", "s1")));
    await assertFails(getDoc(doc(db, "platform_admins", "u1")));
    await assertFails(getDoc(doc(db, "plans", "p1")));
  });

  it("nobody can write from the client, not even the owner", async () => {
    const db = staff("A", "owner").firestore();
    await assertFails(setDoc(doc(db, "tenants", "A", "orders", "new"), { total: 0 }));
    await assertFails(updateDoc(doc(db, "tenants", "A"), { status: "active" }));
    await assertFails(setDoc(doc(db, "tenants", "A", "staff", "s2"), { role: "owner" }));
  });

  it("guests only read their own table session and orders", async () => {
    const db = guest("A", "ts1").firestore();
    await assertSucceeds(getDoc(doc(db, "tenants", "A", "table_sessions", "ts1")));
    await assertSucceeds(getDocs(query(collection(db, "tenants", "A", "orders"), where("tableSessionId", "==", "ts1"))));
    await assertSucceeds(getDoc(doc(db, "tenants", "A", "orders", "o1")));
    await assertFails(getDoc(doc(db, "tenants", "A", "orders", "o2")));
    await assertFails(getDocs(collection(db, "tenants", "A", "orders")));
    await assertFails(getDoc(doc(db, "tenants", "A")));
    await assertFails(getDoc(doc(db, "tenants", "A", "staff", "s1")));
    await assertFails(getDoc(doc(db, "tenants", "B", "table_sessions", "ts1")));
    await assertFails(getDocs(query(collection(db, "tenants", "B", "orders"), where("tableSessionId", "==", "ts1"))));
  });

  it("bills and reservations: staff of the tenant only; customers: server only", async () => {
    const a = staff("A").firestore();
    await assertSucceeds(getDoc(doc(a, "tenants", "A", "bills", "b1")));
    await assertSucceeds(getDoc(doc(a, "tenants", "A", "reservations", "r1")));
    await assertFails(getDoc(doc(a, "tenants", "B", "bills", "b1")));
    await assertFails(getDoc(doc(a, "tenants", "A", "customers", "c1")));
    const g = guest("A", "ts1").firestore();
    await assertFails(getDoc(doc(g, "tenants", "A", "bills", "b1")));
    await assertFails(getDoc(doc(g, "tenants", "A", "reservations", "r1")));
  });

  it("a token without kind is not staff", async () => {
    const db = env.authenticatedContext("someone", { tenantId: "A" }).firestore();
    await assertFails(getDoc(doc(db, "tenants", "A")));
  });
});
