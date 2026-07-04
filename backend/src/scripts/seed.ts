/**
 * seed.ts — Run once to populate the `sensors` table in Supabase.
 *
 * Usage:
 *   npx ts-node src/scripts/seed.ts
 *   OR
 *   npm run seed
 *
 * Guard:  If sensors already exist, the script skips the insert and exits cleanly.
 *         Safe to re-run — it will never create duplicates.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { supabase } from '../lib/supabase';
import { SENSOR_SEEDS } from '../data/sensors';

async function seed(): Promise<void> {
  console.log('🌱  UrbanPulse seed script starting…');
  console.log(`    Supabase URL: ${process.env.SUPABASE_URL}`);

  // ── Guard: check if sensors already exist ─────────────────────────────────
  const { count, error: countError } = await supabase
    .from('sensors')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    console.error('❌  Failed to query sensors table:', countError.message);
    console.error('    Make sure you have run the migration SQL first.');
    process.exit(1);
  }

  const force = process.argv.includes('--force') || process.argv.includes('-f');

  if (force) {
    console.log('🗑️  Force flag detected. Clearing readings, risk_snapshots, and sensors tables...');
    await supabase.from('readings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('risk_snapshots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('sensors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('✅  Tables cleared.');
  } else if (count && count > 0) {
    console.log(`✅  Sensors table already has ${count} rows — skipping seed.`);
    console.log('    Run `npm run seed -- --force` (or `npx ts-node src/scripts/seed.ts --force`) to clear and re-seed with new locations.');
    process.exit(0);
  }

  // ── Insert sensors ─────────────────────────────────────────────────────────
  console.log(`📍  Inserting ${SENSOR_SEEDS.length} Mumbai sensors…`);

  const { data, error: insertError } = await supabase
    .from('sensors')
    .insert(SENSOR_SEEDS)
    .select();

  if (insertError) {
    console.error('❌  Seed failed:', insertError.message);
    process.exit(1);
  }

  console.log(`\n✅  Successfully seeded ${data?.length ?? 0} sensors:\n`);

  data?.forEach((s: { name: string; zone_name: string; type: string; id: string }) => {
    console.log(`    [${s.zone_name.padEnd(12)}] ${s.type.padEnd(12)} → ${s.name}  (id: ${s.id})`);
  });

  console.log('\n🚀  Seed complete. You can now run `npm run dev` to start the server.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Unhandled error in seed:', err);
  process.exit(1);
});
