import { Response } from 'express';
import { EventEmitter } from 'events';

// Realtime Event Emitter serving as the internal event bus
export const realtimeBus = new EventEmitter();

// Registry of active SSE client connections
const clients = new Set<Response>();

/**
 * Registers an Express response object as an active SSE client
 */
export function registerSSEClient(res: Response): void {
  clients.add(res);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', clientsCount: clients.size })}\n\n`);

  // Remove on close
  res.on('close', () => {
    clients.delete(res);
    console.log(`[SSE] Client disconnected. Active clients: ${clients.size}`);
  });
}

/**
 * Broadcasts a typed message payload to all active SSE clients
 */
export function broadcastSSE(type: string, payload: any): void {
  const message = { type, timestamp: new Date().toISOString(), data: payload };
  const chunk = `data: ${JSON.stringify(message)}\n\n`;

  clients.forEach((client) => {
    try {
      client.write(chunk);
    } catch (err) {
      console.error('[SSE] Failed to write to client, removing:', err);
      clients.delete(client);
    }
  });
}

// Wire the internal event bus to broadcast SSE messages automatically
realtimeBus.on('reading', (reading) => {
  broadcastSSE('reading', reading);
});

realtimeBus.on('snapshots', (snapshots) => {
  broadcastSSE('snapshots', snapshots);
});

realtimeBus.on('forecast', (forecast) => {
  broadcastSSE('forecast', forecast);
});

realtimeBus.on('weights', (weights) => {
  broadcastSSE('weights', weights);
});

realtimeBus.on('simulation', (state) => {
  broadcastSSE('simulation', state);
});

realtimeBus.on('agent_stage', (stage) => {
  broadcastSSE('agent_stage', stage);
});

realtimeBus.on('agent_cycle', (cycle) => {
  broadcastSSE('agent_cycle', cycle);
});

realtimeBus.on('agent_reroute', (reroute) => {
  broadcastSSE('agent_reroute', reroute);
});
