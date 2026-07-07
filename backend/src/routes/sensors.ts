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
    .select('id, sensor_id, value, recorded_at, data_source')
    .eq('sensor_id', id)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte('recorded_at', since);
  }

  let readings: any[] | null = null;
  let error: any = null;

  const queryRes = await query;
  readings = queryRes.data;
  error = queryRes.error;

  if (error && (error.code === '42703' || error.message?.includes('data_source'))) {
    let fallbackQuery = supabase
      .from('readings')
      .select('id, sensor_id, value, recorded_at')
      .eq('sensor_id', id)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (since) {
      fallbackQuery = fallbackQuery.gte('recorded_at', since);
    }
    const fbRes = await fallbackQuery;
    readings = fbRes.data;
    error = fbRes.error;
  }

  if (error) {
    console.error(`[GET /sensors/${id}/readings]`, error.message);
    return res.status(500).json({ error: 'Failed to fetch readings', detail: error.message });
  }

  // Ensure data_source is present (defaulting to 'mock' if null in db)
  const processedReadings = (readings ?? []).map(r => ({
    ...r,
    data_source: (r as any).data_source ?? 'mock'
  }));

  return res.json({ sensor, count: processedReadings.length, readings: processedReadings });
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

  let reading: any = null;
  let error: any = null;

  const initialRes = await supabase
    .from('readings')
    .select('id, sensor_id, value, recorded_at, data_source')
    .eq('sensor_id', id)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  reading = initialRes.data;
  error = initialRes.error;

  if (error && (error.code === '42703' || error.message?.includes('data_source'))) {
    const fbRes = await supabase
      .from('readings')
      .select('id, sensor_id, value, recorded_at')
      .eq('sensor_id', id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    reading = fbRes.data;
    error = fbRes.error;
  }

  if (error) {
    console.error(`[GET /sensors/${id}/readings/latest]`, error.message);
    return res.status(500).json({ error: 'Failed to fetch latest reading', detail: error.message });
  }

  if (!reading) {
    return res.status(404).json({ error: `No readings yet for sensor ${id}` });
  }

  return res.json({
    sensor,
    reading: { ...reading, data_source: (reading as any).data_source ?? 'mock' }
  });
});

export default router;

