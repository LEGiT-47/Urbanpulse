// ────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types used across the backend
// ────────────────────────────────────────────────────────────────────────────

export type SensorType = 'rainfall' | 'traffic' | 'aqi' | 'water_level';

export interface Sensor {
  id: string;
  name: string;
  type: SensorType;
  lat: number;
  lng: number;
  zone_name: string;
}

export interface Reading {
  id: string;
  sensor_id: string;
  value: number;
  recorded_at: string; // ISO 8601
  data_source: 'live' | 'mock';
}

export interface RiskSnapshot {
  id: string;
  zone_name: string;
  score: number;           // 0–100
  category: 'low' | 'moderate' | 'high' | 'critical';
  factors: Record<string, number>; // jsonb in DB
  created_at: string;
}

/** Seed record shape (no id — Supabase generates it) */
export interface SensorSeed {
  name: string;
  type: SensorType;
  lat: number;
  lng: number;
  zone_name: string;
}

export type EventType = 'festival' | 'rally' | 'concert' | 'sports';

export interface Event {
  id: string;
  name: string;
  type: EventType;
  zone_name: string;
  lat: number;
  lng: number;
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
  expected_footfall: number;
  created_at: string;
}

export interface EventSeed {
  name: string;
  type: EventType;
  zone_name: string;
  lat: number;
  lng: number;
  start_time: string;
  end_time: string;
  expected_footfall: number;
}

