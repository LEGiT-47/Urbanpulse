import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sensors
// Returns all 15 sensors with their metadata
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('sensors')
    .select('*')
    .order('zone_name', { ascending: true });

  if (error) {
    console.error('[GET /sensors]', error.message);
    return res.status(500).json({ error: 'Failed to fetch sensors', detail: error.message });
  }

  return res.json({ count: data.length, sensors: data });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sensors/:id/readings
// Returns historical readings for a sensor (default last 100, configurable via
// query param ?limit=N and ?since=ISO_TIMESTAMP)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/readings', async (req: Request, res: Response) => {
  const { id } = req.params;
  const limit = Math.min(Number(req.query.limit) || 100, 1000); // cap at 1000
  const since = req.query.since as string | undefined;

  // Verify sensor exists
  const { data: sensor, error: sensorErr } = await supabase
    .from('sensors')
    .select('id, name, zone_name, type')
    .eq('id', id)
    .single();

  if (sensorErr || !sensor) {
    return res.status(404).json({ error: `Sensor ${id} not found` });
  }

  let query = supabase
    .from('readings')
    .select('id, sensor_id, value, recorded_at')
    .eq('sensor_id', id)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte('recorded_at', since);
  }

  const { data: readings, error } = await query;

  if (error) {
    console.error(`[GET /sensors/${id}/readings]`, error.message);
    return res.status(500).json({ error: 'Failed to fetch readings', detail: error.message });
  }

  return res.json({ sensor, count: readings.length, readings });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sensors/:id/readings/latest
// Returns the single most-recent reading for a sensor
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/readings/latest', async (req: Request, res: Response) => {
  const { id } = req.params;

  // Verify sensor exists
  const { data: sensor, error: sensorErr } = await supabase
    .from('sensors')
    .select('id, name, zone_name, type')
    .eq('id', id)
    .single();

  if (sensorErr || !sensor) {
    return res.status(404).json({ error: `Sensor ${id} not found` });
  }

  const { data: reading, error } = await supabase
    .from('readings')
    .select('id, sensor_id, value, recorded_at')
    .eq('sensor_id', id)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // PGRST116 means no rows — sensor exists but has no readings yet
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: `No readings yet for sensor ${id}` });
    }
    console.error(`[GET /sensors/${id}/readings/latest]`, error.message);
    return res.status(500).json({ error: 'Failed to fetch latest reading', detail: error.message });
  }

  return res.json({ sensor, reading });
});

export default router;
