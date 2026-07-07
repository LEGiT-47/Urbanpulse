/**
 * liveDataService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-time live data service for UrbanPulse.
 * Connects to public APIs for live weather, traffic, and air quality in Mumbai.
 *
 * Supported signals:
 *   1. Rainfall: Open-Meteo API (free, bboxes, batched coordinates, no key required).
 *   2. Traffic: TomTom Traffic Flow API (free key required, 60s+ caching to stay under 2.5k limit).
 *   3. Air Quality: CPCB via data.gov.in (free key required, 5-minute caching).
 *
 * Water level and transit delay remain simulated as no public APIs exist.
 * Fallbacks to mock data are automatically applied when keys are missing or APIs fail.
 */

import { Sensor, SensorType } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Cache Interfaces & Constants
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// TTL configs (milliseconds)
const CACHE_TTL_RAINFALL = 60 * 1000;       // 60 seconds
const CACHE_TTL_TRAFFIC = 5 * 60 * 1000;     // 5 minutes (stays safely within 2.5k limit)
const CACHE_TTL_AQI = 5 * 60 * 1000;         // 5 minutes (CPCB updates hourly anyway)

// In-memory caches
let _rainfallCache: CacheEntry<Map<string, number>> | null = null;
const _trafficCache = new Map<string, CacheEntry<number>>();
let _aqiCache: CacheEntry<Map<string, number>> | null = null;

// Mock state tracker for smooth drifts during fallback
const mockValuesState = new Map<string, number>();

// ─────────────────────────────────────────────────────────────────────────────
// CPCB Station Mapping Substrings
// ─────────────────────────────────────────────────────────────────────────────
const ZONE_TO_STATION_SUBSTRING: Record<string, string[]> = {
  Dadar: ['dadar'],
  Bandra: ['bandra'],
  Kurla: ['kurla'],
  Sion: ['sion'],
  Borivali: ['borivali'],
  Colaba: ['colaba'],
  Chembur: ['deonar', 'chembur'],
  Goregaon: ['goregaon'],
  Andheri: ['andheri', 'vile parle'],
  Vikhroli: ['vikhroli', 'mulund'],
  Kalbadevi: ['cst', 'chhatrapati', 'worli'],
  Mahim: ['mahim', 'bandra', 'dadar'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Gaussian Mock Generator Helpers (from mockDataGenerator.ts)
// ─────────────────────────────────────────────────────────────────────────────

const VALUE_RANGES = {
  rainfall: { min: 0, max: 80, meanSkew: 0.35, stdSkew: 0.2, spikeProb: 0.08, spikeMult: 1.6 },
  traffic: { min: 0, max: 100, meanSkew: 0.35, stdSkew: 0.2, spikeProb: 0.12, spikeMult: 1.3 },
  aqi: { min: 50, max: 400, meanSkew: 0.35, stdSkew: 0.2, spikeProb: 0.05, spikeMult: 1.4 },
  water_level: { min: 0, max: 100, meanSkew: 0.35, stdSkew: 0.2, spikeProb: 0.10, spikeMult: 1.5 },
};

function gaussianRandom(mean: number, std: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function getFallbackMockValue(sensorId: string, type: SensorType): number {
  const prev = mockValuesState.get(sensorId);
  const cfg = VALUE_RANGES[type];

  if (prev !== undefined) {
    const drift = (Math.random() - 0.5) * 0.2 * (cfg.max - cfg.min) * 0.3;
    const next = Math.round(Math.min(Math.max(prev + drift, cfg.min), cfg.max) * 100) / 100;
    mockValuesState.set(sensorId, next);
    return next;
  }

  const mean = (cfg.max - cfg.min) * cfg.meanSkew + cfg.min;
  const std = (cfg.max - cfg.min) * cfg.stdSkew;
  let val = gaussianRandom(mean, std);
  if (Math.random() < cfg.spikeProb) {
    val *= cfg.spikeMult;
  }
  const fresh = Math.round(Math.min(Math.max(val, cfg.min), cfg.max) * 100) / 100;
  mockValuesState.set(sensorId, fresh);
  return fresh;
}

// ─────────────────────────────────────────────────────────────────────────────
// Open-Meteo Rainfall Batch Fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function fetchLiveRainfall(sensors: Sensor[]): Promise<Map<string, number>> {
  const rainfallSensors = sensors.filter(s => s.type === 'rainfall');
  const result = new Map<string, number>();
  if (rainfallSensors.length === 0) return result;

  // Check cache first
  if (_rainfallCache && (Date.now() - _rainfallCache.timestamp < CACHE_TTL_RAINFALL)) {
    return _rainfallCache.data;
  }

  try {
    const lats = rainfallSensors.map(s => s.lat).join(',');
    const lngs = rainfallSensors.map(s => s.lng).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=precipitation`;

    console.log(`[Live Rainfall] Querying Open-Meteo for ${rainfallSensors.length} locations...`);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Open-Meteo HTTP error: ${resp.status}`);
    }

    const data = (await resp.json()) as any;
    const records = Array.isArray(data) ? data : [data];

    records.forEach((rec: any, idx: number) => {
      const sensor = rainfallSensors[idx];
      if (sensor && rec.current?.precipitation !== undefined) {
        result.set(sensor.id, rec.current.precipitation);
      }
    });

    _rainfallCache = { data: result, timestamp: Date.now() };
    console.log(`[Live Rainfall] Successfully updated cache for ${result.size} sensors.`);
  } catch (err: any) {
    console.error('[Live Rainfall] Failed to fetch. Using cached/fallback values.', err.message);
    if (_rainfallCache) return _rainfallCache.data;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// TomTom Traffic Flow Fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function fetchLiveTraffic(sensor: Sensor): Promise<number | null> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    return null; // Fallback to mock
  }

  // Check cache first
  const cached = _trafficCache.get(sensor.id);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_TRAFFIC)) {
    return cached.data;
  }

  try {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${sensor.lat},${sensor.lng}&key=${apiKey}`;
    console.log(`[Live Traffic] Querying TomTom for sensor: ${sensor.name}...`);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`TomTom HTTP error: ${resp.status}`);
    }

    const data = (await resp.json()) as any;
    const flow = data.flowSegmentData;
    if (flow && flow.currentSpeed !== undefined && flow.freeFlowSpeed !== undefined) {
      // Calculate congestion index (0 to 100) where 100 is complete gridlock
      const freeFlow = flow.freeFlowSpeed || 1;
      const congestion = Math.max(0, Math.min(100, Math.round((1 - flow.currentSpeed / freeFlow) * 100)));
      _trafficCache.set(sensor.id, { data: congestion, timestamp: Date.now() });
      return congestion;
    }
  } catch (err: any) {
    console.error(`[Live Traffic] Failed for sensor ${sensor.id}. Using cache/fallback.`, err.message);
    if (cached) return cached.data;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CPCB data.gov.in Air Quality Fetcher
// ─────────────────────────────────────────────────────────────────────────────

function calculateIndianAQI(pm25: number | null, pm10: number | null): number | null {
  if (pm25 === null && pm10 === null) return null;

  let aqiPM25 = 0;
  if (pm25 !== null) {
    if (pm25 <= 30) aqiPM25 = pm25 * (50 / 30);
    else if (pm25 <= 60) aqiPM25 = 50 + (pm25 - 30) * (50 / 30);
    else if (pm25 <= 90) aqiPM25 = 100 + (pm25 - 60) * (100 / 30);
    else if (pm25 <= 120) aqiPM25 = 200 + (pm25 - 90) * (100 / 30);
    else if (pm25 <= 250) aqiPM25 = 300 + (pm25 - 120) * (100 / 130);
    else aqiPM25 = 400 + (pm25 - 250) * (100 / 250);
  }

  let aqiPM10 = 0;
  if (pm10 !== null) {
    if (pm10 <= 50) aqiPM10 = pm10 * (50 / 50);
    else if (pm10 <= 100) aqiPM10 = 50 + (pm10 - 50) * (50 / 50);
    else if (pm10 <= 250) aqiPM10 = 100 + (pm10 - 100) * (100 / 150);
    else if (pm10 <= 350) aqiPM10 = 200 + (pm10 - 250) * (100 / 100);
    else if (pm10 <= 430) aqiPM10 = 300 + (pm10 - 350) * (100 / 80);
    else aqiPM10 = 400 + (pm10 - 430) * (100 / 70);
  }

  return Math.round(Math.min(500, Math.max(0, Math.max(aqiPM25, aqiPM10))));
}

async function fetchLiveAQI(): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const apiKey = process.env.DATA_GOV_API_KEY;

  if (!apiKey) {
    return result; // Fallback to mock
  }

  // Check cache first
  if (_aqiCache && (Date.now() - _aqiCache.timestamp < CACHE_TTL_AQI)) {
    return _aqiCache.data;
  }

  try {
    const url = `https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69?api-key=${apiKey}&format=json&limit=500&filters[city]=Mumbai`;
    console.log('[Live AQI] Querying data.gov.in for Mumbai monitoring stations...');
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`data.gov.in HTTP error: ${resp.status}`);
    }

    const data = (await resp.json()) as any;
    const records = data.records ?? [];

    // Group pollutants by station name
    interface StationPollutants {
      pm25: number | null;
      pm10: number | null;
      fallbackAvg: number | null;
    }
    const stationData = new Map<string, StationPollutants>();

    records.forEach((rec: any) => {
      const station = rec.station;
      const pollutant = rec.pollutant_id;
      const avg = Number(rec.pollutant_avg);
      if (!station || isNaN(avg)) return;

      if (!stationData.has(station)) {
        stationData.set(station, { pm25: null, pm10: null, fallbackAvg: null });
      }

      const s = stationData.get(station)!;
      if (pollutant === 'PM2.5') s.pm25 = avg;
      else if (pollutant === 'PM10') s.pm10 = avg;
      else if (s.fallbackAvg === null) s.fallbackAvg = avg;
    });

    // Map stations to overall AQI
    const stationAQI = new Map<string, number>();
    stationData.forEach((vals, station) => {
      const calculated = calculateIndianAQI(vals.pm25, vals.pm10);
      if (calculated !== null) {
        stationAQI.set(station, calculated);
      } else if (vals.fallbackAvg !== null) {
        stationAQI.set(station, Math.min(500, Math.max(0, Math.round(vals.fallbackAvg))));
      }
    });

    // Map UrbanPulse zones to nearest station
    for (const [zone, substrings] of Object.entries(ZONE_TO_STATION_SUBSTRING)) {
      let matchedAQI = null;
      // Search station name containing one of the substrings
      for (const [station, aqi] of stationAQI.entries()) {
        const lowerStation = station.toLowerCase();
        if (substrings.some(sub => lowerStation.includes(sub))) {
          matchedAQI = aqi;
          break;
        }
      }
      if (matchedAQI !== null) {
        result.set(zone, matchedAQI);
      }
    }

    _aqiCache = { data: result, timestamp: Date.now() };
    console.log(`[Live AQI] Successfully mapped AQI for ${result.size} zones.`);
  } catch (err: any) {
    console.error('[Live AQI] Failed to fetch. Using cached/fallback.', err.message);
    if (_aqiCache) return _aqiCache.data;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: getLiveReadings
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveReadingResult {
  sensor_id: string;
  value: number;
  data_source: 'live' | 'mock';
}

export async function fetchAllLiveReadings(sensors: Sensor[]): Promise<LiveReadingResult[]> {
  // Fetch rainfall and AQI in parallel
  const [rainfallMap, aqiMap] = await Promise.all([
    fetchLiveRainfall(sensors),
    fetchLiveAQI(),
  ]);

  const results: LiveReadingResult[] = [];

  for (const s of sensors) {
    if (s.type === 'rainfall') {
      const liveVal = rainfallMap.get(s.id);
      if (liveVal !== undefined) {
        results.push({ sensor_id: s.id, value: liveVal, data_source: 'live' });
      } else {
        results.push({ sensor_id: s.id, value: getFallbackMockValue(s.id, 'rainfall'), data_source: 'mock' });
      }
    } else if (s.type === 'traffic') {
      const liveVal = await fetchLiveTraffic(s);
      if (liveVal !== null) {
        results.push({ sensor_id: s.id, value: liveVal, data_source: 'live' });
      } else {
        results.push({ sensor_id: s.id, value: getFallbackMockValue(s.id, 'traffic'), data_source: 'mock' });
      }
    } else if (s.type === 'aqi') {
      const liveVal = aqiMap.get(s.zone_name);
      if (liveVal !== undefined) {
        results.push({ sensor_id: s.id, value: liveVal, data_source: 'live' });
      } else {
        results.push({ sensor_id: s.id, value: getFallbackMockValue(s.id, 'aqi'), data_source: 'mock' });
      }
    } else {
      // water_level (no live API available)
      results.push({ sensor_id: s.id, value: getFallbackMockValue(s.id, 'water_level'), data_source: 'mock' });
    }
  }

  return results;
}
