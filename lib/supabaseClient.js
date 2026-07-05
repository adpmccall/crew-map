// Creates the Supabase client the browser uses to READ crew data.
//
// IMPORTANT: this uses the PUBLIC "anon" / publishable key only — the key that
// is safe to ship in a website. It can do only what our Row Level Security
// allows, which is read the `crews` table. The secret / service_role key is
// NEVER used here (it lives only in the local import script, import_to_supabase.py).

import { createClient } from "@supabase/supabase-js";

// `NEXT_PUBLIC_` is a Next.js convention: only variables with that prefix are
// sent to the browser. That's exactly what we want for the public anon key.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // A clear nudge during development if the env vars aren't set up yet.
  console.warn(
    "Supabase env vars are missing. Copy .env.example to .env.local and fill in " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "");
