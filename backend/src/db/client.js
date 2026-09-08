import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — API will fail on first query.');
}

// PostgREST over HTTPS, not raw Postgres wire protocol — some networks reset raw
// Postgres connections at the packet level regardless of host/port. service_role
// bypasses RLS (tables are RLS-enabled with no policies, deny-all for anon/authenticated).
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Throws with a consistent message shape so route handlers can just `await unwrap(...)`.
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data;
}
