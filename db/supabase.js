const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    '\nMissing SUPABASE_URL or SUPABASE_SERVICE_KEY.\n' +
    'Copy .env.example to .env and fill these in from your Supabase project ' +
    '(Project Settings > API). Use the "service_role" secret key, not the anon key.\n'
  );
  process.exit(1);
}

// The service_role key bypasses Row Level Security, which is expected here:
// this client is only ever used from the trusted Node server, never sent to
// the browser. See supabase/schema.sql for the RLS setup.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

module.exports = supabase;
