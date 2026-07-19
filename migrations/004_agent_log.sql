-- =============================================================================
-- UrbanPulse — Migration 004: Sentinel Agent Log
-- File: migrations/004_agent_log.sql
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_log (
    id            UUID            DEFAULT gen_random_uuid() PRIMARY KEY,
    zone_name     TEXT            NOT NULL,
    risk_score    NUMERIC         NOT NULL,
    risk_category TEXT            NOT NULL,
    llm_decision  JSONB           NOT NULL,
    action_taken  TEXT            NOT NULL DEFAULT 'none',
    triggered_by  TEXT            NOT NULL DEFAULT 'sentinel_agent',
    created_at    TIMESTAMPTZ     DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_log_created  ON agent_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_log_zone     ON agent_log (zone_name);

COMMENT ON TABLE  agent_log              IS 'Autonomous Sentinel Agent decision log — one row per zone per cycle';
COMMENT ON COLUMN agent_log.llm_decision IS 'JSON: { action_needed, action_type, explanation, confidence }';
COMMENT ON COLUMN agent_log.action_taken IS 'alert_sent | reroute_computed | alert_and_reroute | none | error';
