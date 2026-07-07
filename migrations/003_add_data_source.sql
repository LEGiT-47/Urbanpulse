-- =============================================================================
-- UrbanPulse — Add data_source column to readings
-- File: migrations/003_add_data_source.sql
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

ALTER TABLE readings ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'mock' CHECK (data_source IN ('live', 'mock')) NOT NULL;

COMMENT ON COLUMN readings.data_source IS 'Source of the reading: live (real API data) or mock (simulated)';
