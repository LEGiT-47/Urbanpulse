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

/**
 * Inserts a batch of readings into Supabase, with automatic graceful fallback
 * if the `data_source` column has not been added to the database yet.
 */
export async function insertReadingsBatch(
  batch: Array<{ sensor_id: string; value: number; recorded_at: string; data_source: 'live' | 'mock' }>
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('readings')
      .insert(batch)
      .select();

    if (error) {
      // Check if error is due to missing data_source column (PostgREST code 42703 or message match)
      if (error.code === '42703' || error.message?.includes('data_source')) {
        console.warn(
          "[DB] Warning: 'data_source' column does not exist in 'readings' table. Please run the SQL in migrations/003_add_data_source.sql. Retrying insert without 'data_source' field..."
        );
        // Strip data_source and retry
        const fallbackBatch = batch.map(({ data_source, ...rest }) => rest);
        const { data: fbData, error: fbError } = await supabase
          .from('readings')
          .insert(fallbackBatch)
          .select();

        if (fbError) {
          throw fbError;
        }
        // Map data_source back as 'mock' for local return value so frontend still works
        return (fbData || []).map(r => ({ ...r, data_source: 'mock' }));
      }
      throw error;
    }
    return data || [];
  } catch (err: any) {
    console.error('[DB] Failed to insert readings batch:', err.message);
    throw err;
  }
}

