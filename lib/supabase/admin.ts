import { createClient } from "@supabase/supabase-js";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        (
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
          process.env.PWB_BACKEND_SECRET
        )
      ),
  );
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const privilegedKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && privilegedKey) {
    return createClient(url, privilegedKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const backendSecret = process.env.PWB_BACKEND_SECRET;

  if (!url || !publishableKey || !backendSecret) {
    throw new Error(
      "Supabase server environment variables are missing (URL + privileged key, or publishable key + PWB_BACKEND_SECRET).",
    );
  }

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-pwb-backend-secret": backendSecret,
      },
    },
  });
}
