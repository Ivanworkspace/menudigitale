import "server-only";
import { serverEnv } from "@/lib/env";
import { decryptWithKey, encryptWithKey } from "@/lib/crypto-core";

export { randomToken, sha256, generatePin, isWeakPin } from "@/lib/crypto-core";

export const encrypt = (plain: string) => encryptWithKey(plain, serverEnv().APP_ENCRYPTION_KEY);
export const decrypt = (payload: string) => decryptWithKey(payload, serverEnv().APP_ENCRYPTION_KEY);
