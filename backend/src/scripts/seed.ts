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
import { getEventSeeds } from '../data/events';

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
    console.log('🗑️  Force flag detected. Clearing readings, risk_snapshots, events, and sensors tables...');
    await supabase.from('readings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('risk_snapshots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('sensors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    try {
      await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch (e) {
      console.log('⚠️  Failed to clear events table (might not exist yet).');
    }
    console.log('✅  Tables cleared.');
  } else if (count && count > 0) {
    console.log(`✅  Sensors table already has ${count} rows — checking events next.`);
  }

  // ── Insert sensors (if forced or empty) ──────────────────────────────────
  if (force || !count || count === 0) {
    console.log(`📍  Inserting ${SENSOR_SEEDS.length} Mumbai sensors…`);
    const { data: sensorData, error: insertError } = await supabase
      .from('sensors')
      .insert(SENSOR_SEEDS)
      .select();

    if (insertError) {
      console.error('❌  Sensor seed failed:', insertError.message);
      process.exit(1);
    }

    console.log(`\n✅  Successfully seeded ${sensorData?.length ?? 0} sensors:\n`);
    sensorData?.forEach((s: { name: string; zone_name: string; type: string; id: string }) => {
      console.log(`    [${s.zone_name.padEnd(12)}] ${s.type.padEnd(12)} → ${s.name}  (id: ${s.id})`);
    });
  }

  // ── Insert events ──────────────────────────────────────────────────────────
  console.log('\n📍  Checking events table…');
  try {
    const { count: eventCount, error: eventCountError } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true });

    if (eventCountError) {
      console.warn('⚠️  Could not query events table. Make sure migrations/002_event_schema.sql is applied.');
    } else if (force || !eventCount || eventCount === 0) {
      const eventSeeds = getEventSeeds();
      console.log(`📍  Inserting ${eventSeeds.length} Mumbai events…`);
      const { data: seededEvents, error: eventInsertError } = await supabase
        .from('events')
        .insert(eventSeeds)
        .select();

      if (eventInsertError) {
        console.error('❌  Events seed failed:', eventInsertError.message);
      } else {
        console.log(`\n✅  Successfully seeded ${seededEvents?.length ?? 0} events:\n`);
        seededEvents?.forEach((e: any) => {
          console.log(`    [${e.zone_name.padEnd(12)}] ${e.type.padEnd(12)} → ${e.name} (${e.expected_footfall} expected footfall)`);
        });
      }
    } else {
      console.log(`✅  Events table already has ${eventCount} rows — skipping events seed.`);
    }
  } catch (err: any) {
    console.warn('⚠️  Error seeding events table (it may not exist yet):', err.message);
  }

  console.log('\n🚀  Seed complete. You can now run `npm run dev` to start the server.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Unhandled error in seed:', err);
  process.exit(1);
});
