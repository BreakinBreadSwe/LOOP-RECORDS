// GET /api/config -> small script that hands the browser the public Supabase settings.
// Only the URL and the anon (public) key go out; the service key never leaves the server.
export default function handler(req, res) {
  const cfg = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  };
  res.setHeader("content-type", "application/javascript; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=300");
  res.status(200).send(`window.LOOP_CONFIG=${JSON.stringify(cfg)};`);
}
