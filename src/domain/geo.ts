/** Great-circle distance in meters (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Max GPS accuracy we give credit for (indoor fixes are often 30–80 m). */
export const MAX_ACCURACY_CREDIT_M = 100;

/**
 * Inside the venue's radius, allowing for the reported GPS accuracy
 * (capped so a fake "accuracy: 5000" cannot defeat the check).
 */
export function isWithinRadius(
  venue: { lat: number; lng: number },
  radiusM: number,
  pos: { lat: number; lng: number; accuracy?: number | null },
): { inside: boolean; distanceM: number } {
  const d = distanceMeters(venue, pos);
  const credit = Math.min(Math.max(pos.accuracy ?? 0, 0), MAX_ACCURACY_CREDIT_M);
  return { inside: d - credit <= radiusM, distanceM: Math.round(d) };
}
