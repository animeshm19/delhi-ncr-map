/** Public URL for a stored logo path like "spinny/logo.png?v=123". Safe on the client. */
export function logoUrl(path?: string | null) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base || !/^[a-z0-9-]+\/logo\.(png|jpg|webp)(\?v=\d+)?$/.test(path)) return null;
  return `${base}/storage/v1/object/public/logos/${path}`;
}
