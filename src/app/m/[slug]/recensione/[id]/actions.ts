"use server";

import { resolveTenantBySlug } from "@/server/tenancy/resolve";
import { openReviewLink } from "@/server/reviews";
import { redirect } from "next/navigation";

export async function confirmStop(slug: string, id: string) {
  const t = await resolveTenantBySlug(slug);
  if (t) await openReviewLink(t, id, true);
  redirect(`/m/${slug}/recensione/${id}?stop=done`);
}
