import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[UrbanPulse] SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env'
  );
}

/**
 * Supabase admin client using the service-role key.
 * This bypasses Row-Level Security, suitable for server-side use only.
 * Never expose this client or the service key to the browser.
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
