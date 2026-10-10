"use server";

import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { adminAuth } from "@/server/firebase";
import { refs, nowIso } from "@/server/db";
import { closeAdminSession, completeMfa, getAdminSession, openAdminSession } from "@/server/auth/platform-admin";
import { checkLockout, recordAttempt } from "@/server/auth/rate-limit";
import { decrypt, encrypt } from "@/server/crypto";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { PIN_LOCKOUT } from "@/domain/lockout";
import { publicEnv } from "@/lib/env";
import { logPlatformAction } from "@/server/audit";

/** Step 1: exchange a fresh Firebase ID token for a pending admin session. */
export async function startAdminLogin(idToken: string): Promise<string | null> {
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    return "Accesso non valido.";
  }
  // Require a recent password sign-in (not a long-lived refreshed token).
  if (Date.now() / 1000 - decoded.auth_time > 300) return "Sessione scaduta, accedi di nuovo.";
  const admin = await refs.platformAdmins().doc(decoded.uid).get();
  if (!admin.exists || admin.get("disabled")) return "Questo account non è autorizzato.";
  await openAdminSession(decoded.uid, decoded.email ?? "");
  redirect("/superadmin/mfa");
}

export type MfaState =
  | { kind: "enroll"; qr: string; secret: string }
  | { kind: "verify" }
  | { kind: "none" };

/** Step 2a: what the MFA page should show (creates a pending secret if needed). */
export async function getMfaState(): Promise<MfaState> {
  const s = await getAdminSession();
  if (!s) return { kind: "none" };
  const admin = (await refs.platformAdmins().doc(s.data.uid).get()).data();
  if (admin?.totpSecretEnc) return { kind: "verify" };
  let secret: string;
  if (s.data.pendingSecretEnc) secret = decrypt(s.data.pendingSecretEnc);
  else {
    secret = generateTotpSecret();
    await s.ref.update({ pendingSecretEnc: encrypt(secret) });
  }
  const qr = await QRCode.toDataURL(totpUri(secret, s.data.email, publicEnv.brandName), { margin: 1, width: 220 });
  return { kind: "enroll", qr, secret };
}

/** Step 2b: verify the TOTP code (enrollment or login). */
export async function verifyAdminMfa(code: string): Promise<string | null> {
  const s = await getAdminSession();
  if (!s) redirect("/superadmin/login");
  const uid: string = s.data.uid;
  const lock = await checkLockout("totp", uid, PIN_LOCKOUT);
  if (lock.locked) return "Troppi tentativi. Riprova tra qualche minuto.";

  const adminRef = refs.platformAdmins().doc(uid);
  const admin = (await adminRef.get()).data() ?? {};
  const enrolled = !!admin.totpSecretEnc;
  const secretEnc: string | null = enrolled ? admin.totpSecretEnc : s.data.pendingSecretEnc;
  if (!secretEnc) return "Configurazione non trovata, ricarica la pagina.";

  const step = verifyTotp(decrypt(secretEnc), code.replace(/\s/g, ""), Date.now(), admin.totpLastStep ?? -1);
  await recordAttempt("totp", uid, step !== null);
  if (step === null) return "Codice non valido. Riprova.";

  await adminRef.update({
    totpLastStep: step,
    ...(enrolled ? {} : { totpSecretEnc: secretEnc, totpEnabledAt: nowIso() }),
    lastLoginAt: nowIso(),
  });
  await completeMfa(s.ref);
  await logPlatformAction(uid, enrolled ? "admin.login" : "admin.mfa_enrolled", null);
  redirect("/superadmin");
}

export async function cancelAdminLogin() {
  await closeAdminSession();
  redirect("/superadmin/login");
}
