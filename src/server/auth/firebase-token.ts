import "server-only";
import { adminAuth } from "@/server/firebase";

/**
 * Mints a Firebase custom token whose claims drive the Firestore security
 * rules (request.auth.token.kind / tenantId / role). The browser exchanges it
 * with signInWithCustomToken and then subscribes to realtime listeners.
 */
export async function mintStaffToken(c: { staffId: string; tenantId: string; role: string; sessionId: string }) {
  return adminAuth().createCustomToken(`staff_${c.staffId}`, {
    kind: "staff",
    tenantId: c.tenantId,
    role: c.role,
    sid: c.sessionId.slice(0, 16),
  });
}

export async function mintGuestToken(c: { tenantId: string; tableSessionId: string; deviceId: string }) {
  return adminAuth().createCustomToken(`guest_${c.deviceId}`, {
    kind: "guest",
    tenantId: c.tenantId,
    tableSessionId: c.tableSessionId,
  });
}
