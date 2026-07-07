import { supabase } from '../lib/supabase';
import { Sensor, SensorType } from '../types';

// ────────────────────────────────────────────────────────────────────────────
// Value-range definitions per sensor type
// These mirror realistic Mumbai monsoon / urban conditions
// ────────────────────────────────────────────────────────────────────────────
interface ValueRange {
  min: number;
  max: number;
  /** Spike probability: chance a single reading will be extra high */
  spikeProbability: number;
  spikeMultiplier: number;
}

const VALUE_RANGES: Record<SensorType, ValueRange> = {
  /**
   * Rainfall in mm/hr:
   *  0–2   → dry / trace
   *  2–15  → light rain
   *  15–35 → moderate (IMD category)
   *  35–64 → heavy
   *  64–115 → very heavy  (Mumbai averages during peak monsoon)
   *  >115  → extremely heavy — rare, use spike mechanism
   */
  rainfall: {
    min: 0,
    max: 80,
    spikeProbability: 0.08,
    spikeMultiplier: 1.6,
  },

  /**
   * Traffic density 0–100 (dimensionless index):
   *  0–30  → free-flow
   *  30–60 → moderate congestion
   *  60–85 → heavy
   *  85–100 → gridlock
   */
  traffic: {
    min: 0,
    max: 100,
    spikeProbability: 0.12,
    spikeMultiplier: 1.3,
  },

  /**
   * AQI (0–500 US EPA scale):
   *  0–50   → Good
   *  51–100 → Moderate
   *  101–150 → Unhealthy for sensitive groups
   *  151–200 → Unhealthy
   *  201–300 → Very unhealthy
   *  301–400 → Hazardous (winter morning rush; industrial zones)
   */
  aqi: {
    min: 50,
    max: 400,
    spikeProbability: 0.05,
    spikeMultiplier: 1.4,
  },

  /**
   * Water level in cm above normal drainage capacity:
   *  0–15  → normal
   *  15–40 → watch
   *  40–70 → warning
   *  70–100 → flood alert
   */
  water_level: {
    min: 0,
    max: 100,
    spikeProbability: 0.10,
    spikeMultiplier: 1.5,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Random helpers
// ────────────────────────────────────────────────────────────────────────────

/** Gaussian (Box–Muller) — produces bell-curve values centred around mean */
function gaussianRandom(mean: number, std: number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Generate a single realistic sensor value */
function generateValue(type: SensorType): number {
  const range = VALUE_RANGES[type];
  const mean = (range.max - range.min) * 0.35 + range.min; // skew toward lower values
  const std = (range.max - range.min) * 0.2;

  let value = gaussianRandom(mean, std);

  // Occasional spikes simulate rush-hour / rain bursts
  if (Math.random() < range.spikeProbability) {
    value *= range.spikeMultiplier;
  }

  // Clamp to valid range and round to 2 decimal places
  return Math.round(Math.min(Math.max(value, range.min), range.max) * 100) / 100;
}

// ────────────────────────────────────────────────────────────────────────────
// State — tracks the last generated value per sensor for smooth drift
// ────────────────────────────────────────────────────────────────────────────
const lastValues = new Map<string, number>();

/** Generate next value with ±10% drift from previous reading for realism */
function nextValue(sensorId: string, type: SensorType): number {
  const prev = lastValues.get(sensorId);

  if (prev === undefined) {
    const fresh = generateValue(type);
    lastValues.set(sensorId, fresh);
    return fresh;
  }

  const range = VALUE_RANGES[type];
  const drift = (Math.random() - 0.5) * 0.2 * (range.max - range.min) * 0.3;
  const next = Math.round(Math.min(Math.max(prev + drift, range.min), range.max) * 100) / 100;
  lastValues.set(sensorId, next);
  return next;
}

// ────────────────────────────────────────────────────────────────────────────
// Generator loop & Simulation Control
// ────────────────────────────────────────────────────────────────────────────

import { realtimeBus } from './realtimeService';

let generatorHandle: ReturnType<typeof setInterval> | null = null;
let isSimulationPaused = false;

/**
 * Pauses the automatic generation of mock data (for simulation scenarios)
 */
export function pauseMockDataGenerator(): void {
  isSimulationPaused = true;
  realtimeBus.emit('simulation', { paused: true });
  console.log('[MockGen] Mock data generation PAUSED');
}

/**
 * Resumes the automatic generation of mock data
 */
export function resumeMockDataGenerator(): void {
  isSimulationPaused = false;
  realtimeBus.emit('simulation', { paused: false });
  console.log('[MockGen] Mock data generation RESUMED');
}

/**
 * Returns whether the mock data generator is paused
 */
export function isMockDataGeneratorPaused(): boolean {
  return isSimulationPaused;
}

import { fetchAllLiveReadings } from './liveDataService';
import { insertReadingsBatch } from '../lib/supabase';

/**
 * Start the mock-data / live-data generator.
 * Inserts one reading per sensor every `intervalMs` milliseconds (default 5 s).
 * Idempotent — calling multiple times returns the existing handle.
 */
export async function startMockDataGenerator(intervalMs = 5_000): Promise<void> {
  if (generatorHandle) {
    console.log('[MockGen] Already running — skipping duplicate start');
    return;
  }

  // Fetch all sensors once at startup
  const { data: sensors, error } = await supabase
    .from('sensors')
    .select('id, type, zone_name, name, lat, lng');

  if (error || !sensors || sensors.length === 0) {
    console.error('[MockGen] Could not load sensors — is the DB seeded?', error?.message);
    return;
  }

  console.log(`[MockGen] Starting — will generate/fetch readings for ${sensors.length} sensors every ${intervalMs / 1000}s`);

  generatorHandle = setInterval(async () => {
    // If simulation is paused, do not auto-generate/fetch readings
    if (isSimulationPaused) {
      return;
    }

    const now = new Date().toISOString();

    try {
      // Fetch live readings (or fallback mock) for all sensors
      const liveReadings = await fetchAllLiveReadings(sensors as Sensor[]);

      const batch = liveReadings.map(r => ({
        sensor_id: r.sensor_id,
        value: r.value,
        recorded_at: now,
        data_source: r.data_source,
      }));

      // Insert into database with automatic graceful column-not-found fallback
      const insertedReadings = await insertReadingsBatch(batch);

      console.log(`[MockGen] ✓ Ingested ${batch.length} readings at ${now} (${batch.filter(b => b.data_source === 'live').length} live, ${batch.filter(b => b.data_source === 'mock').length} mock)`);
      
      // Emit the readings to the SSE event bus
      if (insertedReadings && insertedReadings.length > 0) {
        insertedReadings.forEach((reading: any) => {
          // Attach sensor metadata for frontend convenience
          const sensor = (sensors as Sensor[]).find((s) => s.id === reading.sensor_id);
          if (sensor) {
            realtimeBus.emit('reading', {
              ...reading,
              data_source: reading.data_source ?? 'mock', // default to mock if column wasn't returned
              sensor: {
                id: sensor.id,
                name: sensor.name,
                type: sensor.type,
                zone_name: sensor.zone_name
              }
            });
          }
        });
      }
    } catch (err: any) {
      console.error('[MockGen] Error in generation cycle:', err.message);
    }
  }, intervalMs);
}


/**
 * Stop the mock-data generator (useful for clean shutdown / tests).
 */
export function stopMockDataGenerator(): void {
  if (generatorHandle) {
    clearInterval(generatorHandle);
    generatorHandle = null;
    console.log('[MockGen] Stopped');
  }
}
