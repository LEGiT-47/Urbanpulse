-- =============================================================================
-- UrbanPulse — Supabase PostgreSQL Migration
-- File: migrations/001_initial_schema.sql
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- OR via the Supabase CLI:
--   supabase db push  (if using local supabase config)
-- =============================================================================

-- Enable UUID generation (available by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. sensors
--    One row per physical (or virtual) sensor installed in the city.
--    lat/lng stored as DOUBLE PRECISION for PostGIS compatibility later.
-- =============================================================================
CREATE TABLE IF NOT EXISTS sensors (
    id          UUID            DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT            NOT NULL,
    type        TEXT            NOT NULL
                    CHECK (type IN ('rainfall', 'traffic', 'aqi', 'water_level')),
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    zone_name   TEXT            NOT NULL,
    created_at  TIMESTAMPTZ     DEFAULT NOW() NOT NULL
);

-- Index for fast zone-based lookups (used in risk computation)
CREATE INDEX IF NOT EXISTS idx_sensors_zone ON sensors (zone_name);
CREATE INDEX IF NOT EXISTS idx_sensors_type ON sensors (type);

COMMENT ON TABLE  sensors             IS 'Physical or virtual urban sensors across Mumbai zones';
COMMENT ON COLUMN sensors.type        IS 'rainfall | traffic | aqi | water_level';
COMMENT ON COLUMN sensors.lat         IS 'WGS-84 latitude';
COMMENT ON COLUMN sensors.lng         IS 'WGS-84 longitude';
COMMENT ON COLUMN sensors.zone_name   IS 'Human-readable neighbourhood name (e.g. Dadar, Andheri)';

-- =============================================================================
-- 2. readings
--    Time-series table: one row per sensor measurement.
--    Designed for high insert throughput — keep indexes lean.
-- =============================================================================
CREATE TABLE IF NOT EXISTS readings (
    id          UUID            DEFAULT gen_random_uuid() PRIMARY KEY,
    sensor_id   UUID            NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    value       DOUBLE PRECISION NOT NULL,
    recorded_at TIMESTAMPTZ     DEFAULT NOW() NOT NULL
);

-- Composite index covering the most common query pattern:
--   WHERE sensor_id = ? ORDER BY recorded_at DESC LIMIT N
CREATE INDEX IF NOT EXISTS idx_readings_sensor_time
    ON readings (sensor_id, recorded_at DESC);

-- Partial index for the /latest endpoint (only the newest row matters)
CREATE INDEX IF NOT EXISTS idx_readings_latest
    ON readings (sensor_id, recorded_at DESC);

COMMENT ON TABLE  readings            IS 'Raw time-series readings from sensors';
COMMENT ON COLUMN readings.value      IS 'Raw numeric value — units depend on sensor.type';
COMMENT ON COLUMN readings.recorded_at IS 'UTC timestamp when the value was captured';

-- =============================================================================
-- 3. risk_snapshots
--    Computed risk score per zone, stored at each evaluation interval.
--    The risk engine (to be implemented) writes here; the dashboard reads here.
-- =============================================================================
CREATE TABLE IF NOT EXISTS risk_snapshots (
    id          UUID            DEFAULT gen_random_uuid() PRIMARY KEY,
    zone_name   TEXT            NOT NULL,
    score       DOUBLE PRECISION NOT NULL
                    CHECK (score >= 0 AND score <= 100),
    category    TEXT            NOT NULL
                    CHECK (category IN ('low', 'moderate', 'high', 'critical')),
    factors     JSONB           NOT NULL DEFAULT '{}'::JSONB,
    created_at  TIMESTAMPTZ     DEFAULT NOW() NOT NULL
);

-- Fast lookup: latest snapshot per zone
CREATE INDEX IF NOT EXISTS idx_risk_zone_time
    ON risk_snapshots (zone_name, created_at DESC);

COMMENT ON TABLE  risk_snapshots          IS 'Rolling risk scores computed per zone';
COMMENT ON COLUMN risk_snapshots.score    IS '0 (safe) – 100 (critical) composite risk index';
COMMENT ON COLUMN risk_snapshots.category IS 'low | moderate | high | critical';
COMMENT ON COLUMN risk_snapshots.factors  IS 'JSON breakdown: {"rainfall": 0.4, "traffic": 0.2, ...}';

-- =============================================================================
-- Row-Level Security (RLS)
-- Disable RLS for all three tables since the backend uses the service-role key.
-- If you later expose a public API, enable RLS with appropriate policies.
-- =============================================================================
ALTER TABLE sensors         DISABLE ROW LEVEL SECURITY;
ALTER TABLE readings        DISABLE ROW LEVEL SECURITY;
ALTER TABLE risk_snapshots  DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Verification query (run separately to confirm tables exist)
-- =============================================================================
-- SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name)))
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('sensors', 'readings', 'risk_snapshots')
-- ORDER BY table_name;
