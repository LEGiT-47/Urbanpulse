import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/events
// Returns all seeded/curated events
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('start_time', { ascending: true });

    if (error) {
      console.error('[GET /api/events] DB error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch events', detail: error.message });
    }

    return res.json({
      count: data?.length || 0,
      events: data || []
    });
  } catch (err: any) {
    console.error('[GET /api/events] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/events/active
// Returns events that are currently active (start_time <= now <= end_time)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/active', async (_req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .lte('start_time', now)
      .gte('end_time', now)
      .order('expected_footfall', { ascending: false });

    if (error) {
      console.error('[GET /api/events/active] DB error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch active events', detail: error.message });
    }

    return res.json({
      count: data?.length || 0,
      activeEvents: data || []
    });
  } catch (err: any) {
    console.error('[GET /api/events/active] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
