import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import sensorRoutes from './routes/sensors';
import riskRoutes from './routes/risk';
import { 
  startMockDataGenerator, 
  pauseMockDataGenerator, 
  resumeMockDataGenerator, 
  isMockDataGeneratorPaused 
} from './services/mockDataGenerator';
import { 
  startRiskEngine, 
  getRiskWeights, 
  updateRiskWeights, 
  evaluateZoneRisks 
} from './services/riskEngine';
import { registerSSEClient } from './services/realtimeService';
import { supabase } from './lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// App setup
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Security & utility middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'UrbanPulse API',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Real-time Event Stream (SSE)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/realtime/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Establish connection

  registerSSEClient(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Weight Tuning Endpoints
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/risk/weights', (_req, res) => {
  res.json(getRiskWeights());
});

app.post('/api/risk/weights', (req, res) => {
  try {
    const updated = updateRiskWeights(req.body);
    // Recalculate risk immediately with new weights
    evaluateZoneRisks().catch((e) => console.error('[API] recalc risk fail:', e));
    res.json({ success: true, weights: updated });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to update weights', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Simulation Control Endpoints
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/simulation/status', (_req, res) => {
  res.json({ paused: isMockDataGeneratorPaused() });
});

app.post('/api/simulation/start', (_req, res) => {
  resumeMockDataGenerator();
  res.json({ success: true, paused: false });
});

app.post('/api/simulation/stop', (_req, res) => {
  pauseMockDataGenerator();
  res.json({ success: true, paused: true });
});

app.post('/api/simulation/inject', async (req, res) => {
  const { readings } = req.body; // Array of { sensor_id: string, value: number }

  if (!readings || !Array.isArray(readings) || readings.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty readings array' });
  }

  try {
    const now = new Date().toISOString();
    const batch = readings.map((r) => ({
      sensor_id: r.sensor_id,
      value: r.value,
      recorded_at: now,
    }));

    // 1. Insert into database
    const { data: inserted, error: dbErr } = await supabase
      .from('readings')
      .insert(batch)
      .select();

    if (dbErr) throw dbErr;

    // 2. Broadcast inserted readings to SSE
    const { data: sensors } = await supabase.from('sensors').select('*');
    if (inserted && sensors) {
      const { realtimeBus } = require('./services/realtimeService');
      inserted.forEach((reading: any) => {
        const sensor = sensors.find((s) => s.id === reading.sensor_id);
        if (sensor) {
          realtimeBus.emit('reading', {
            ...reading,
            sensor: {
              id: sensor.id,
              name: sensor.name,
              type: sensor.type,
              zone_name: sensor.zone_name
            }
          });
        }
      });
    }

    // 3. Immediately evaluate risk scores with the injected values
    await evaluateZoneRisks();

    return res.json({ success: true, count: inserted.length });
  } catch (err: any) {
    console.error('[API] Injection fail:', err);
    return res.status(500).json({ error: 'Failed to inject readings', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API routes
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/sensors', sensorRoutes);
app.use('/api/risk', riskRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// 404 fallback
// ─────────────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Start server + mock generator + risk engine
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║        UrbanPulse API  v1.0.0           ║
  ║  Mumbai Urban Digital Twin — Backend    ║
  ╚══════════════════════════════════════════╝
  🚀  Server listening on http://localhost:${PORT}
  📡  Endpoints:
       GET /health
       GET /api/sensors
       GET /api/sensors/:id/readings
       GET /api/sensors/:id/readings/latest
       GET /api/risk/current
       GET /api/risk/history
  `);

  // Start the mock data generator (produces a reading every 5s)
  await startMockDataGenerator(5_000);

  // Start the convergence risk engine (runs every 10s)
  startRiskEngine(10_000);
});

export default app;
