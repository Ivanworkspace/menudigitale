import "server-only";
import { headers } from "next/headers";

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function userAgent(): Promise<string> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? "";
}
