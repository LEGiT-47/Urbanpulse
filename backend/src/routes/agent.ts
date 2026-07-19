import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { getRecentAgentLog, getAgentStatus } from '../agent/sentinel';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agent/status
// Returns current agent stage and cycle metadata
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', (_req: Request, res: Response) => {
  res.json(getAgentStatus());
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agent/history?limit=50
// Returns recent agent log entries (in-memory + DB fallback)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);

  // Try DB first for persistent history
  try {
    const { data, error } = await supabase
      .from('agent_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return res.json({
      source: 'database',
      count: data?.length ?? 0,
      entries: data ?? [],
    });
  } catch (dbErr: any) {
    // Fall back to in-memory log (DB might not be seeded/available)
    console.warn('[GET /api/agent/history] DB unavailable, using in-memory:', dbErr.message);
    const entries = getRecentAgentLog().slice(0, limit);
    return res.json({
      source: 'memory',
      count: entries.length,
      entries,
    });
  }
});

export default router;
