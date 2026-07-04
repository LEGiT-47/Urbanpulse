import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { forecastZone } from '../services/forecastService';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/risk/forecast
// Returns a short-horizon (15–60 min) linear regression forecast for a zone
// Query params:
//   - zone: string (required, e.g. "Dadar", "Kurla")
// ─────────────────────────────────────────────────────────────────────────────
router.get('/forecast', async (req: Request, res: Response) => {
  const zone = req.query.zone as string | undefined;

  if (!zone) {
    return res.status(422).json({ error: "Missing required query parameter 'zone'" });
  }

  try {
    const forecast = await forecastZone(zone);

    if (!forecast) {
      return res.status(404).json({
        error: 'Not enough historical data to generate a forecast for this zone.',
        zone,
        hint: 'Wait for the risk engine to accumulate at least 5 snapshots (~50 seconds).'
      });
    }

    return res.json(forecast);
  } catch (err: any) {
    console.error(`[GET /risk/forecast] zone=${zone}:`, err);
    return res.status(500).json({ error: 'Internal server error during forecast computation' });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/risk/current
// Returns the single most-recent risk snapshot for each unique zone
// ─────────────────────────────────────────────────────────────────────────────
router.get('/current', async (_req: Request, res: Response) => {
  try {
    // We pull the last 100 snapshots. Since all 8 zones are written in batches,
    // the last 100 snapshots will easily contain the latest for all zones.
    const { data, error } = await supabase
      .from('risk_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[GET /risk/current]', error.message);
      return res.status(500).json({ error: 'Failed to fetch current risks', detail: error.message });
    }

    // Filter in JS to get the first (most recent) snapshot per unique zone
    const latestByZone: Record<string, any> = {};
    if (data) {
      data.forEach((snapshot) => {
        if (!latestByZone[snapshot.zone_name]) {
          latestByZone[snapshot.zone_name] = snapshot;
        }
      });
    }

    return res.json({
      count: Object.keys(latestByZone).length,
      snapshots: Object.values(latestByZone)
    });
  } catch (err: any) {
    console.error('Unexpected error in current risk endpoint:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/risk/history
// Returns historical risk snapshots for a specific zone within a time window
// Query params:
//   - zone: string (required, e.g. "Dadar", "Kurla")
//   - hours: number (optional, default 1)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history', async (req: Request, res: Response) => {
  const zone = req.query.zone as string | undefined;
  const hours = Number(req.query.hours) || 1;

  if (!zone) {
    return res.status(400).json({ error: "Missing required query parameter 'zone'" });
  }

  try {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('risk_snapshots')
      .select('*')
      .eq('zone_name', zone)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`[GET /risk/history] for zone ${zone}:`, error.message);
      return res.status(500).json({ error: 'Failed to fetch risk history', detail: error.message });
    }

    return res.json({
      zone,
      hours,
      since: cutoff,
      count: data?.length || 0,
      history: data || []
    });
  } catch (err: any) {
    console.error('Unexpected error in risk history endpoint:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
