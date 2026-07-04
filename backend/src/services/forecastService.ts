import { supabase } from '../lib/supabase';
import * as ss from 'simple-statistics';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ForecastPoint {
  predicted: number;
  lower: number;
  upper: number;
}

export interface ForecastResult {
  zone: string;
  /** Horizons in minutes: [15, 30, 45, 60] */
  horizon_minutes: number[];
  /** Predicted score at each horizon (clamped 0-100) */
  predicted: number[];
  /** Lower confidence bound (predicted - 1.5σ, clamped 0-100) */
  lower: number[];
  /** Upper confidence bound (predicted + 1.5σ, clamped 0-100) */
  upper: number[];
  /** Linear slope in score-units per second */
  slope: number;
  /** Human-readable trend direction */
  trend: 'rising' | 'stable' | 'falling';
  /** Confidence quality label based on R² */
  confidence: 'high' | 'medium' | 'low';
  /** Number of historical data points used to fit the model */
  data_points: number;
  /** Points used for the forecast (compact representation for sparkline overlay) */
  sparkline_forecast: ForecastPoint[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

/** How many recent snapshots to use for regression. 30 snapshots @ 10s each = 5 min of data. */
const N_POINTS = 30;

/** Forecast horizons expressed in seconds */
const HORIZONS_SECONDS = [15 * 60, 30 * 60, 45 * 60, 60 * 60];
const HORIZONS_MINUTES = [15, 30, 45, 60];

/** Minimum data points required before we attempt a forecast */
const MIN_POINTS = 5;

/** Confidence multiplier for the uncertainty band */
const SIGMA_MULTIPLIER = 1.5;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Compute the root-mean-square error of a linear fit against actual values.
 * This is our proxy for the standard deviation of residuals (σ).
 */
function computeRMSE(
  xs: number[],
  ys: number[],
  lineFn: (x: number) => number
): number {
  const residuals = xs.map((x, i) => ys[i] - lineFn(x));
  const mse = residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length;
  return Math.sqrt(mse);
}

/**
 * Determine trend label from slope (score units per second).
 * A slope > 0.01/s (≈ 0.6 pts/min) is considered "rising".
 */
function slopeToTrend(slope: number): 'rising' | 'stable' | 'falling' {
  const perMinute = slope * 60;
  if (perMinute > 0.5) return 'rising';
  if (perMinute < -0.5) return 'falling';
  return 'stable';
}

/**
 * Map R² to a confidence label.
 */
function r2ToConfidence(r2: number): 'high' | 'medium' | 'low' {
  if (r2 >= 0.7) return 'high';
  if (r2 >= 0.4) return 'medium';
  return 'low';
}

// ─────────────────────────────────────────────────────────────────────────────
// Core forecast function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the last N risk_snapshots for a zone and fits a linear regression
 * to project the risk score 15–60 minutes into the future.
 *
 * Returns null if there aren't enough data points.
 */
export async function forecastZone(
  zoneName: string
): Promise<ForecastResult | null> {
  // 1. Fetch the last N snapshots from Supabase (ascending order for regression)
  const { data, error } = await supabase
    .from('risk_snapshots')
    .select('score, created_at')
    .eq('zone_name', zoneName)
    .order('created_at', { ascending: false })
    .limit(N_POINTS);

  if (error) {
    console.error(`[Forecast] DB error for zone ${zoneName}:`, error.message);
    return null;
  }

  if (!data || data.length < MIN_POINTS) {
    console.warn(`[Forecast] Not enough data for zone ${zoneName}: ${data?.length ?? 0} points`);
    return null;
  }

  // Reverse so oldest → newest (left → right)
  const snapshots = [...data].reverse();

  // 2. Build (x, y) pairs — x is Unix epoch in seconds, y is the risk score
  const xs = snapshots.map((s) => new Date(s.created_at).getTime() / 1000);
  const ys = snapshots.map((s) => s.score);

  // 3. Fit linear regression using simple-statistics
  const pairs: [number, number][] = xs.map((x, i) => [x, ys[i]]);
  const regression = ss.linearRegression(pairs);
  const lineFn = ss.linearRegressionLine(regression);

  // 4. Compute RMSE (σ) and R²
  const sigma = computeRMSE(xs, ys, lineFn);
  const r2 = ss.rSquared(pairs, lineFn);

  // 5. Project forward from the latest timestamp
  const lastTimestamp = xs[xs.length - 1];
  const predicted: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];

  for (const horizonSec of HORIZONS_SECONDS) {
    const futureX = lastTimestamp + horizonSec;
    const raw = lineFn(futureX);
    const band = SIGMA_MULTIPLIER * sigma;

    predicted.push(round2(clamp(raw)));
    lower.push(round2(clamp(raw - band)));
    upper.push(round2(clamp(raw + band)));
  }

  // 6. Build sparkline_forecast (4 points matching the 4 horizons)
  const sparkline_forecast: ForecastPoint[] = predicted.map((p, i) => ({
    predicted: p,
    lower: lower[i],
    upper: upper[i],
  }));

  const slope = regression.m;
  const trend = slopeToTrend(slope);
  const confidence = r2ToConfidence(r2);

  return {
    zone: zoneName,
    horizon_minutes: HORIZONS_MINUTES,
    predicted,
    lower,
    upper,
    slope: round2(slope),
    trend,
    confidence,
    data_points: snapshots.length,
    sparkline_forecast,
  };
}
