/**
 * routeEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A* pathfinder over the UrbanPulse road graph.
 *
 * Dynamic risk penalties (from Convergence Risk Engine):
 *   • moderate  → ×1.3
 *   • high      → ×2.0
 *   • critical  → ×4.0
 *   • flood (water_level > 60) → edge blocked (Infinity)
 */

import {
  getRoadGraph,
  getClosestNode,
  getDynamicEdgeWeight,
  haversineMetres,
  GRAPH_BBOX,
  type GraphNode,
  type GraphEdge,
  type ZoneRiskSummary,
} from './roadGraph';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteRequest {
  from: { lat: number; lng: number };
  to:   { lat: number; lng: number };
}

export interface RouteResult {
  coordinates: [number, number][];    // Ordered [lat, lng] pairs
  distanceM: number;                  // Total route distance in metres
  estimatedMinutes: number;           // ETA in minutes
  blockedZones: string[];             // Zones with Infinity cost (flood-closed)
  penalizedZones: string[];           // Zones with elevated but passable cost
  routeWarning?: string;              // Human-readable rerouting notice
  fromNode: { lat: number; lng: number };
  toNode:   { lat: number; lng: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Min-heap priority queue (simple binary heap)
// ─────────────────────────────────────────────────────────────────────────────

interface PQEntry { nodeId: string; fScore: number; }

class MinHeap {
  private data: PQEntry[] = [];

  push(entry: PQEntry): void {
    this.data.push(entry);
    this._bubbleUp(this.data.length - 1);
  }

  pop(): PQEntry | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size(): number { return this.data.length; }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].fScore <= this.data[i].fScore) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l].fScore < this.data[smallest].fScore) smallest = l;
      if (r < n && this.data[r].fScore < this.data[smallest].fScore) smallest = r;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic: straight-line travel time in seconds
// ─────────────────────────────────────────────────────────────────────────────

function heuristic(a: GraphNode, b: GraphNode): number {
  const distM = haversineMetres(a.lat, a.lng, b.lat, b.lng);
  const assumedSpeedKph = 30; // conservative mixed-road speed
  return (distM / 1000 / assumedSpeedKph) * 3600;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core A* algorithm
// ─────────────────────────────────────────────────────────────────────────────

function aStar(
  fromNodeId: string,
  toNodeId: string,
  riskSummaries: ZoneRiskSummary[]
): { path: string[]; totalCostSeconds: number; totalDistM: number } | null {
  const graph = getRoadGraph();
  if (!graph) return null;

  const { nodes, adjacency } = graph;

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const distanceMap = new Map<string, number>();

  const toNode = nodes.get(toNodeId);
  const fromNode = nodes.get(fromNodeId);
  if (!toNode || !fromNode) return null;

  gScore.set(fromNodeId, 0);
  fScore.set(fromNodeId, heuristic(fromNode, toNode));
  distanceMap.set(fromNodeId, 0);

  const openSet = new MinHeap();
  openSet.push({ nodeId: fromNodeId, fScore: fScore.get(fromNodeId)! });
  const inOpen = new Set<string>([fromNodeId]);

  while (openSet.size > 0) {
    const { nodeId: current } = openSet.pop()!;
    inOpen.delete(current);

    if (current === toNodeId) {
      // Reconstruct path
      const path: string[] = [];
      let node: string | undefined = toNodeId;
      while (node) {
        path.unshift(node);
        node = cameFrom.get(node);
      }
      return {
        path,
        totalCostSeconds: gScore.get(toNodeId)!,
        totalDistM: distanceMap.get(toNodeId)!,
      };
    }

    const currentNode = nodes.get(current);
    if (!currentNode) continue;

    const edges: GraphEdge[] = adjacency.get(current) ?? [];
    for (const edge of edges) {
      const weight = getDynamicEdgeWeight(edge, riskSummaries);
      if (weight === Infinity) continue; // flood-blocked

      const tentativeG = (gScore.get(current) ?? Infinity) + weight;
      if (tentativeG < (gScore.get(edge.toNodeId) ?? Infinity)) {
        cameFrom.set(edge.toNodeId, current);
        gScore.set(edge.toNodeId, tentativeG);
        distanceMap.set(
          edge.toNodeId,
          (distanceMap.get(current) ?? 0) + edge.distanceM
        );

        const neighborNode = nodes.get(edge.toNodeId);
        if (!neighborNode) continue;
        const f = tentativeG + heuristic(neighborNode, toNode);
        fScore.set(edge.toNodeId, f);

        if (!inOpen.has(edge.toNodeId)) {
          openSet.push({ nodeId: edge.toNodeId, fScore: f });
          inOpen.add(edge.toNodeId);
        }
      }
    }
  }

  return null; // No path found
}

// ─────────────────────────────────────────────────────────────────────────────
// Public routing function
// ─────────────────────────────────────────────────────────────────────────────

export function isInsideBbox(lat: number, lng: number): boolean {
  return (
    lat >= GRAPH_BBOX.south && lat <= GRAPH_BBOX.north &&
    lng >= GRAPH_BBOX.west  && lng <= GRAPH_BBOX.east
  );
}

export function computeRoute(
  request: RouteRequest,
  riskSummaries: ZoneRiskSummary[]
): RouteResult | { error: string; code: number } {
  const graph = getRoadGraph();
  if (!graph) {
    return { error: 'Road graph not yet loaded. Please try again in a few seconds.', code: 503 };
  }

  // Validate both points are within the pilot zone bbox
  if (!isInsideBbox(request.from.lat, request.from.lng)) {
    return { error: 'Origin is outside the supported routing area (Greater Mumbai).', code: 400 };
  }
  if (!isInsideBbox(request.to.lat, request.to.lng)) {
    return { error: 'Destination is outside the supported routing area (Greater Mumbai).', code: 400 };
  }

  // Snap to nearest graph nodes
  const fromNode = getClosestNode(request.from.lat, request.from.lng);
  const toNode = getClosestNode(request.to.lat, request.to.lng);

  if (!fromNode) {
    return { error: 'Could not snap origin to the road network. Try a different location.', code: 400 };
  }
  if (!toNode) {
    return { error: 'Could not snap destination to the road network. Try a different location.', code: 400 };
  }

  // Determine blocked and penalised zones for the response
  const blockedZones: string[] = [];
  const penalizedZones: string[] = [];
  for (const z of riskSummaries) {
    if (z.factors?.water_level !== undefined && z.factors.water_level > 60) {
      blockedZones.push(z.zone_name);
    } else if (z.category === 'high' || z.category === 'critical') {
      penalizedZones.push(z.zone_name);
    }
  }

  // Run A*
  const result = aStar(fromNode.id, toNode.id, riskSummaries);

  if (!result) {
    return {
      error: 'No route found between the selected points. The path may be blocked by flood conditions.',
      code: 404
    };
  }

  // Convert node IDs back to coordinates
  const coordinates: [number, number][] = result.path
    .map(id => graph.nodes.get(id))
    .filter((n): n is GraphNode => !!n)
    .map(n => [n.lat, n.lng]);

  // Estimated minutes: use totalCostSeconds (already accounts for penalties)
  // But clamp to at least the real physical travel time so it's credible
  const physicalMinutes = (result.totalDistM / 1000 / 30) * 60; // 30 kph avg
  const estimatedMinutes = Math.max(
    Math.round((result.totalCostSeconds / 60) * 10) / 10,
    Math.round(physicalMinutes * 10) / 10
  );

  // Build human-readable warning
  let routeWarning: string | undefined;
  if (blockedZones.length > 0) {
    routeWarning = `Route avoids flood-closed area${blockedZones.length > 1 ? 's' : ''}: ${blockedZones.join(', ')}. Emergency detour applied.`;
  } else if (penalizedZones.length > 0) {
    routeWarning = `Route passes through elevated-risk zone${penalizedZones.length > 1 ? 's' : ''}: ${penalizedZones.join(', ')}. Expect delays.`;
  }

  return {
    coordinates,
    distanceM: Math.round(result.totalDistM),
    estimatedMinutes,
    blockedZones,
    penalizedZones,
    routeWarning,
    fromNode: { lat: fromNode.lat, lng: fromNode.lng },
    toNode:   { lat: toNode.lat, lng: toNode.lng },
  };
}
