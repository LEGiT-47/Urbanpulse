-- =============================================================================
-- UrbanPulse — Migration 002: Event Impact Intelligence
-- File: migrations/002_event_schema.sql
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

CREATE TABLE IF NOT EXISTS events (
    id                 UUID            DEFAULT gen_random_uuid() PRIMARY KEY,
    name               TEXT            NOT NULL,
    type               TEXT            NOT NULL
                        CHECK (type IN ('festival', 'rally', 'concert', 'sports')),
    zone_name          TEXT            NOT NULL,
    lat                DOUBLE PRECISION NOT NULL,
    lng                DOUBLE PRECISION NOT NULL,
    start_time         TIMESTAMPTZ     NOT NULL,
    end_time           TIMESTAMPTZ     NOT NULL,
    expected_footfall  INTEGER         NOT NULL CHECK (expected_footfall >= 0),
    created_at         TIMESTAMPTZ     DEFAULT NOW() NOT NULL
);

-- Index for fast zone-based active event lookups
CREATE INDEX IF NOT EXISTS idx_events_zone ON events (zone_name);
CREATE INDEX IF NOT EXISTS idx_events_times ON events (start_time, end_time);

COMMENT ON TABLE  events                   IS 'Seeded/curated public events in Mumbai zones';
COMMENT ON COLUMN events.type              IS 'festival | rally | concert | sports';
COMMENT ON COLUMN events.lat               IS 'Latitude of the event location';
COMMENT ON COLUMN events.lng               IS 'Longitude of the event location';
COMMENT ON COLUMN events.zone_name         IS 'Name of the zone (neighborhood) where the event occurs';
COMMENT ON COLUMN events.start_time        IS 'Scheduled start time of the event';
COMMENT ON COLUMN events.end_time          IS 'Scheduled end time of the event';
COMMENT ON COLUMN events.expected_footfall IS 'Expected visitor footfall (used as a composite risk contributor)';
