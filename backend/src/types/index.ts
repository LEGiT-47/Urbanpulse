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
