import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { computeRoute, isInsideBbox } from '../services/routeEngine';
import { getRoadGraph, isGraphLoading } from '../services/roadGraph';
import type { ZoneRiskSummary } from '../services/roadGraph';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/route
// Body: { from: { lat, lng }, to: { lat, lng } }
//
// Returns a risk-aware shortest path between two points in the pilot zone,
// following real OSM road segments.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  const { from, to } = req.body ?? {};

  // ── Validate payload ───────────────────────────────────────────────────────
  if (
    !from || typeof from.lat !== 'number' || typeof from.lng !== 'number' ||
    !to   || typeof to.lat   !== 'number' || typeof to.lng   !== 'number'
  ) {
    return res.status(400).json({
      error: 'Invalid request body. Expected: { from: {lat, lng}, to: {lat, lng} }',
    });
  }

  // ── Check graph readiness ──────────────────────────────────────────────────
  if (!getRoadGraph()) {
    if (isGraphLoading()) {
      return res.status(503).json({
        error: 'Road graph is still loading. Please try again in a few seconds.',
        hint: 'The server fetches road data from OpenStreetMap at startup. This only takes ~10–30s.',
      });
    }
    return res.status(503).json({
      error: 'Road graph unavailable. The server is retrying the OpenStreetMap fetch.',
    });
  }

  // ── Bbox pre-check (cheap, before the DB query) ───────────────────────────
  if (!isInsideBbox(from.lat, from.lng) || !isInsideBbox(to.lat, to.lng)) {
    return res.status(400).json({
      error: 'One or both points are outside the Dadar–Kurla–Sion pilot routing area.',
      bbox: { south: 18.99, west: 72.82, north: 19.10, east: 72.91 },
    });
  }

  try {
    // ── Fetch live risk snapshots ──────────────────────────────────────────
    let riskSummaries: ZoneRiskSummary[] = [];
    try {
      const { data } = await supabase
        .from('risk_snapshots')
        .select('zone_name, category, factors')
        .order('created_at', { ascending: false })
        .limit(200);

      if (data) {
        // Deduplicate to latest per zone
        const seen = new Set<string>();
        for (const row of data) {
          if (!seen.has(row.zone_name)) {
            seen.add(row.zone_name);
            riskSummaries.push({
              zone_name: row.zone_name,
              category: row.category,
              factors: row.factors ?? {},
            });
          }
        }
      }
    } catch (dbErr) {
      // Non-fatal: route with no risk data (all edges at base weight)
      console.warn('[POST /api/route] Failed to fetch risk data — routing without penalties:', dbErr);
    }

    // ── Compute route ──────────────────────────────────────────────────────
    const result = computeRoute({ from, to }, riskSummaries);

    if ('error' in result) {
      return res.status(result.code).json({ error: result.error });
    }

    return res.json(result);
  } catch (err: any) {
    console.error('[POST /api/route] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error during route computation.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/route/status
// Returns graph load status and statistics
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', (_req: Request, res: Response) => {
  const graph = getRoadGraph();
  if (!graph) {
    return res.json({
      ready: false,
      loading: isGraphLoading(),
      message: isGraphLoading()
        ? 'Fetching road network from OpenStreetMap...'
        : 'Graph not loaded yet.',
    });
  }
  return res.json({
    ready: true,
    loading: false,
    nodeCount: graph.nodeCount,
    edgeCount: graph.edgeCount,
    loadedAt: graph.loadedAt,
    bbox: { south: 18.99, west: 72.82, north: 19.10, east: 72.91 },
  });
});

export default router;
