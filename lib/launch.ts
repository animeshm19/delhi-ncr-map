/**
 * Organisations added after the initial import. The first batch was loaded in one go,
 * so anything created within an hour of the earliest record is part of it, not "new".
 */
export function addedSinceLaunch<T extends { created_at?: string | null }>(orgs: T[]): T[] {
  const times = orgs.map((o) => (o.created_at ? Date.parse(o.created_at) : NaN)).filter(Number.isFinite);
  if (!times.length) return [];
  const imported = Math.min(...times) + 3600_000;
  return orgs.filter((o) => o.created_at && Date.parse(o.created_at) > imported);
}
