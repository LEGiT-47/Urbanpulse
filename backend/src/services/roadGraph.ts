/**
 * roadGraph.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches the road network for Greater Mumbai from the
 * Overpass API and builds an in-memory adjacency graph.
 *
 * Graph structure:
 *   nodes     : Map<nodeId, GraphNode>
 *   adjacency : Map<nodeId, GraphEdge[]>
 *
 * Edge weights are dynamic — they incorporate live risk scores from the
 * Convergence Risk Engine:
 *   • "high" risk zone      → cost ×2
 *   • "critical" risk zone  → cost ×4
 *   • flood-closed zone     → Infinity
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  lat: number;
  lng: number;
}

export interface GraphEdge {
  toNodeId: string;
  distanceM: number;
  baseSpeedKph: number;  // estimated from highway tag
  zoneName: string;      // nearest UrbanPulse zone
}

export interface RoadGraph {
  nodes: Map<string, GraphNode>;
  adjacency: Map<string, GraphEdge[]>;
  loadedAt: string;
  nodeCount: number;
  edgeCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pilot zone configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Bounding box: south, west, north, east — covers Greater Mumbai */
export const GRAPH_BBOX = {
  south: 18.89,
  west:  72.77,
  north: 19.27,
  east:  72.99,
};

/** Zone centres used for assigning edges to UrbanPulse monitoring zones */
const ZONE_CENTERS: Record<string, [number, number]> = {
  Dadar:     [19.0179, 72.8460],
  Sion:      [19.0403, 72.8615],
  Mahim:     [19.0369, 72.8394],
  Kurla:     [19.0692, 72.8810],
  Bandra:    [19.0640, 72.8493],
  Kalbadevi: [18.9499, 72.8250],
  Chembur:   [19.0618, 72.8998],
  Andheri:   [19.1136, 72.8697],
  Vikhroli:  [19.1088, 72.9231],
  Borivali:  [19.2307, 72.8567],
  Colaba:    [18.9067, 72.8147],
  Goregaon:  [19.1663, 72.8526],
};

/** Speed estimates (kph) keyed by OSM highway tag */
const SPEED_MAP: Record<string, number> = {
  motorway:      80,
  trunk:         60,
  primary:       50,
  secondary:     40,
  tertiary:      30,
  residential:   20,
  unclassified:  25,
  service:       15,
  living_street: 10,
};

// ─────────────────────────────────────────────────────────────────────────────
// Disk cache path (persisted so restarts are instant after first load)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_FILE = path.join(__dirname, '../../data/roadGraph.json');

// ─────────────────────────────────────────────────────────────────────────────
// In-memory state
// ─────────────────────────────────────────────────────────────────────────────

let _graph: RoadGraph | null = null;
let _loading = false;

export function getRoadGraph(): RoadGraph | null {
  return _graph;
}

export function isGraphLoading(): boolean {
  return _loading;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Haversine distance in metres
// ─────────────────────────────────────────────────────────────────────────────

export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: find nearest zone for a coordinate
// ─────────────────────────────────────────────────────────────────────────────

function nearestZone(lat: number, lng: number): string {
  let best = 'Dadar';
  let bestDist = Infinity;
  for (const [zone, [zLat, zLng]] of Object.entries(ZONE_CENTERS)) {
    const d = haversineMetres(lat, lng, zLat, zLng);
    if (d < bestDist) { bestDist = d; best = zone; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: get closest graph node to a lat/lng
// ─────────────────────────────────────────────────────────────────────────────

export function getClosestNode(lat: number, lng: number): GraphNode | null {
  if (!_graph) return null;
  let bestNode: GraphNode | null = null;
  let bestDist = Infinity;
  for (const node of _graph.nodes.values()) {
    const d = haversineMetres(lat, lng, node.lat, node.lng);
    if (d < bestDist) { bestDist = d; bestNode = node; }
  }
  // Only snap if within 500 m — otherwise the point is outside the graph area
  return bestDist <= 500 ? bestNode : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: dynamic edge weight factoring in zone risk
// ─────────────────────────────────────────────────────────────────────────────

export interface ZoneRiskSummary {
  zone_name: string;
  category: 'low' | 'moderate' | 'high' | 'critical';
  factors?: { water_level?: number };
}

export function getDynamicEdgeWeight(
  edge: GraphEdge,
  riskSummaries: ZoneRiskSummary[]
): number {
  // Base weight: travel time in seconds
  const baseSeconds = (edge.distanceM / 1000 / edge.baseSpeedKph) * 3600;

  const zoneRisk = riskSummaries.find(r => r.zone_name === edge.zoneName);
  if (!zoneRisk) return baseSeconds;

  // Flood-closed: water level > 60 cm → completely block this edge
  if (zoneRisk.factors?.water_level !== undefined && zoneRisk.factors.water_level > 60) {
    return Infinity;
  }

  switch (zoneRisk.category) {
    case 'critical': return baseSeconds * 4;
    case 'high':     return baseSeconds * 2;
    case 'moderate': return baseSeconds * 1.3;
    default:         return baseSeconds;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP fetch helper (native Node https — no extra deps)
// ─────────────────────────────────────────────────────────────────────────────

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'UrbanPulse/1.0 (emergency routing)' } }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} from Overpass API`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60_000, () => {
      req.destroy(new Error('Overpass API request timed out (60s)'));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Overpass query builder
// ─────────────────────────────────────────────────────────────────────────────

function buildOverpassQuery(): string {
  const { south, west, north, east } = GRAPH_BBOX;
  const bbox = `${south},${west},${north},${east}`;
  return encodeURIComponent(
    `[out:json][timeout:60];
(
  way["highway"~"^(primary|secondary|tertiary|residential|unclassified|trunk|service|living_street)$"](${bbox});
);
out body;
>;
out skel qt;`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Graph builder: parse Overpass JSON → nodes + adjacency
// ─────────────────────────────────────────────────────────────────────────────

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
}
interface OverpassWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags: Record<string, string>;
}
type OverpassElement = OverpassNode | OverpassWay;

function buildGraphFromOverpass(elements: OverpassElement[]): RoadGraph {
  const nodeMap = new Map<string, GraphNode>();
  const ways: OverpassWay[] = [];

  // First pass: collect all OSM nodes within bbox
  for (const el of elements) {
    if (el.type === 'node') {
      const n = el as OverpassNode;
      if (
        n.lat >= GRAPH_BBOX.south && n.lat <= GRAPH_BBOX.north &&
        n.lon >= GRAPH_BBOX.west  && n.lon <= GRAPH_BBOX.east
      ) {
        nodeMap.set(String(n.id), { id: String(n.id), lat: n.lat, lng: n.lon });
      }
    } else if (el.type === 'way') {
      ways.push(el as OverpassWay);
    }
  }

  const adjacency = new Map<string, GraphEdge[]>();
  for (const id of nodeMap.keys()) adjacency.set(id, []);

  let edgeCount = 0;

  // Second pass: build undirected edges from ways
  for (const way of ways) {
    const tag = way.tags?.highway ?? 'residential';
    const speed = SPEED_MAP[tag] ?? 20;
    const isOneWay = way.tags?.oneway === 'yes';

    for (let i = 0; i < way.nodes.length - 1; i++) {
      const aId = String(way.nodes[i]);
      const bId = String(way.nodes[i + 1]);
      const nodeA = nodeMap.get(aId);
      const nodeB = nodeMap.get(bId);
      if (!nodeA || !nodeB) continue;

      const dist = haversineMetres(nodeA.lat, nodeA.lng, nodeB.lat, nodeB.lng);
      const midLat = (nodeA.lat + nodeB.lat) / 2;
      const midLng = (nodeA.lng + nodeB.lng) / 2;
      const zone = nearestZone(midLat, midLng);

      adjacency.get(aId)!.push({ toNodeId: bId, distanceM: dist, baseSpeedKph: speed, zoneName: zone });
      edgeCount++;
      if (!isOneWay) {
        adjacency.get(bId)!.push({ toNodeId: aId, distanceM: dist, baseSpeedKph: speed, zoneName: zone });
        edgeCount++;
      }
    }
  }

  // Third pass: Filter to the Largest Connected Component (LCC) to guarantee 100% path connectivity
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of adjacency.keys()) {
    if (visited.has(nodeId)) continue;
    const component: string[] = [];
    const queue = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      const edges = adjacency.get(cur) ?? [];
      for (const e of edges) {
        if (!visited.has(e.toNodeId)) {
          visited.add(e.toNodeId);
          queue.push(e.toNodeId);
        }
      }
    }
    components.push(component);
  }

  // Find LCC
  let lcc: string[] = [];
  for (const comp of components) {
    if (comp.length > lcc.length) {
      lcc = comp;
    }
  }

  // Keep only LCC nodes and edges
  const lccSet = new Set(lcc);
  for (const nodeId of Array.from(adjacency.keys())) {
    if (!lccSet.has(nodeId)) {
      nodeMap.delete(nodeId);
      adjacency.delete(nodeId);
    } else {
      const edges = adjacency.get(nodeId) ?? [];
      adjacency.set(nodeId, edges.filter(e => lccSet.has(e.toNodeId)));
    }
  }

  return { nodes: nodeMap, adjacency, loadedAt: new Date().toISOString(), nodeCount: nodeMap.size, edgeCount: Array.from(adjacency.values()).reduce((sum, es) => sum + es.length, 0) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Disk cache helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SerializedGraph {
  nodes: GraphNode[];
  adjacency: [string, GraphEdge[]][];
  loadedAt: string;
}

function saveCacheToDisk(graph: RoadGraph): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const serial: SerializedGraph = {
      nodes: Array.from(graph.nodes.values()),
      adjacency: Array.from(graph.adjacency.entries()),
      loadedAt: graph.loadedAt,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(serial), 'utf8');
    console.log(`[RoadGraph] Disk cache saved → ${CACHE_FILE}`);
  } catch (err) {
    console.warn('[RoadGraph] Failed to write disk cache:', err);
  }
}

function loadCacheFromDisk(): RoadGraph | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed: SerializedGraph = JSON.parse(raw);
    // Treat cache as stale if older than 24 hours
    const ageMs = Date.now() - new Date(parsed.loadedAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      console.log('[RoadGraph] Disk cache is >24 h old — refreshing from Overpass.');
      return null;
    }
    const nodes = new Map<string, GraphNode>();
    for (const n of parsed.nodes) nodes.set(n.id, n);
    const adjacency = new Map<string, GraphEdge[]>();
    for (const [id, edges] of parsed.adjacency) adjacency.set(id, edges);
    const graph: RoadGraph = {
      nodes, adjacency,
      loadedAt: parsed.loadedAt,
      nodeCount: nodes.size,
      edgeCount: parsed.adjacency.reduce((s, [, es]) => s + es.length, 0),
    };
    console.log(`[RoadGraph] Loaded from disk cache: ${graph.nodeCount} nodes, ${graph.edgeCount} edges (cached ${parsed.loadedAt})`);
    return graph;
  } catch (err) {
    console.warn('[RoadGraph] Failed to read disk cache:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function loadRoadGraph(): Promise<RoadGraph> {
  if (_graph) return _graph;

  // Try disk cache first for instant startup
  const cached = loadCacheFromDisk();
  if (cached) {
    _graph = cached;
    return cached;
  }

  _loading = true;
  const url = `https://overpass-api.de/api/interpreter?data=${buildOverpassQuery()}`;
  console.log('[RoadGraph] Fetching road network from Overpass API...');

  try {
    const raw = await fetchText(url);
    const json = JSON.parse(raw);
    const graph = buildGraphFromOverpass(json.elements as OverpassElement[]);
    _graph = graph;
    _loading = false;
    console.log(`[RoadGraph] Loaded from Overpass: ${graph.nodeCount} nodes, ${graph.edgeCount} edges`);
    saveCacheToDisk(graph);
    return graph;
  } catch (err) {
    _loading = false;
    throw err;
  }
}

/**
 * Starts the graph loader in the background (non-blocking).
 * Retries every 30 seconds until successful.
 * Call once at server boot.
 */
export function startRoadGraphLoader(): void {
  const attempt = async () => {
    try {
      await loadRoadGraph();
    } catch (err) {
      console.error('[RoadGraph] Load failed:', (err as Error).message);
      console.warn('[RoadGraph] Retrying in 30 s...');
      setTimeout(attempt, 30_000);
    }
  };
  attempt();
}
