/**
 * Creates (or promotes) a platform super admin.
 *   npm run create-superadmin -- email@example.com 'PasswordLunga!' "Nome"
 * On first login the admin is forced to enroll TOTP (2FA).
 */
import { adminAuth, adminDb, nowIso, requireEnv } from "./_shared";

async function main() {
  requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const [email, password, name = "Amministratore"] = process.argv.slice(2);
  if (!email || !password || password.length < 12) {
    console.error("Uso: npm run create-superadmin -- <email> <password (min 12 caratteri)> [nome]");
    process.exit(1);
  }
  let uid: string;
  try {
    uid = (await adminAuth().getUserByEmail(email)).uid;
    await adminAuth().updateUser(uid, { password });
    console.log("Utente già esistente: password aggiornata e promosso ad amministratore.");
  } catch {
    uid = (await adminAuth().createUser({ email, password, emailVerified: true, displayName: name })).uid;
  }
  await adminDb()
    .collection("platform_admins")
    .doc(uid)
    .set({ displayName: name, email, disabled: false, createdAt: nowIso() }, { merge: true });
  console.log(`✓ Super admin pronto: ${email}. Accedi su /superadmin/login e configura il 2FA.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
