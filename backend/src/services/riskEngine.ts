import { supabase } from '../lib/supabase';
import weightsConfig from '../config/riskWeights.json';
import { realtimeBus } from './realtimeService';
import { forecastZone } from './forecastService';

interface Sensor {
  id: string;
  name: string;
  type: 'rainfall' | 'traffic' | 'aqi' | 'water_level';
  lat: number;
  lng: number;
  zone_name: string;
}

interface Weights {
  rainfall: number;
  traffic: number;
  aqi: number;
  water_level: number;
  event?: number;
}

let weights: Weights = { ...weightsConfig };

export function getRiskWeights(): Weights {
  return weights;
}

export function updateRiskWeights(newWeights: Partial<Weights>): Weights {
  weights = {
    ...weights,
    ...newWeights
  };
  // Broadcast weights update to frontend
  realtimeBus.emit('weights', weights);
  return weights;
}

// Normalization helper: maps raw values to 0-100 range
function normalizeValue(type: string, val: number): number {
  let norm = 0;
  switch (type) {
    case 'rainfall':
      // rainfall max range is 80 mm/hr
      norm = (val / 80) * 100;
      break;
    case 'traffic':
      // traffic density is already 0-100
      norm = val;
      break;
    case 'aqi':
      // AQI range is 50-400
      norm = ((val - 50) / 350) * 100;
      break;
    case 'water_level':
      // water level is 0-100 cm
      norm = val;
      break;
    case 'event':
      // normalize footfall. Capped at 50,000 for maximum risk impact.
      norm = (val / 50000) * 100;
      break;
    default:
      norm = val;
  }
  return Math.min(Math.max(norm, 0), 100);
}

// Helper to construct a natural-language explanation string
function generateExplanation(zoneName: string, factors: Record<string, number>): string {
  const elevatedFactors: string[] = [];

  if (factors.rainfall > 35) {
    elevatedFactors.push('heavy rainfall');
  } else if (factors.rainfall > 15) {
    elevatedFactors.push('rising rainfall');
  }

  if (factors.water_level > 50) {
    elevatedFactors.push('critical flooding');
  } else if (factors.water_level > 20) {
    elevatedFactors.push('rising water levels');
  }

  if (factors.traffic > 75) {
    elevatedFactors.push('severe traffic gridlock');
  } else if (factors.traffic > 40) {
    elevatedFactors.push('elevated traffic congestion');
  }

  if (factors.aqi > 200) {
    elevatedFactors.push('hazardous air pollution');
  } else if (factors.aqi > 100) {
    elevatedFactors.push('elevated air quality index');
  }

  if (factors.event && factors.event > 0) {
    if (factors.event > 50000) {
      elevatedFactors.push(`large public event (${factors.event.toLocaleString()} expected footfall)`);
    } else {
      elevatedFactors.push(`active public event (${factors.event.toLocaleString()} expected footfall)`);
    }
  }

  if (elevatedFactors.length === 0) {
    return `Normal conditions monitored in ${zoneName}.`;
  }

  if (elevatedFactors.length === 1) {
    const capitalized = elevatedFactors[0].charAt(0).toUpperCase() + elevatedFactors[0].slice(1);
    return `${capitalized} detected in ${zoneName}.`;
  }

  if (elevatedFactors.length === 2) {
    const capitalized = elevatedFactors[0].charAt(0).toUpperCase() + elevatedFactors[0].slice(1);
    return `${capitalized} combined with ${elevatedFactors[1]} in ${zoneName}.`;
  }

  // If 3 or more factors are elevated
  const list = elevatedFactors.slice(0, -1).join(', ') + `, and ${elevatedFactors[elevatedFactors.length - 1]}`;
  const capitalized = list.charAt(0).toUpperCase() + list.slice(1);
  return `${capitalized} impacting ${zoneName} concurrently.`;
}

// AI recommendation rule engine keyed to factor combinations
function getAIRecommendations(zoneName: string, factors: Record<string, number>): Array<{ text: string; priority: 'high' | 'medium' | 'low'; trigger: string }> {
  const recs: Array<{ text: string; priority: 'high' | 'medium' | 'low'; trigger: string }> = [];

  // Rainfall
  if (factors.rainfall > 35) {
    recs.push({
      text: `Pre-position emergency water pumps at waterlogging hotspots in ${zoneName}.`,
      priority: 'high',
      trigger: 'heavy rainfall'
    });
  } else if (factors.rainfall > 15) {
    recs.push({
      text: `Monitor drainage inlets for potential blockage in ${zoneName}.`,
      priority: 'medium',
      trigger: 'rising rainfall'
    });
  }

  // Water Level
  if (factors.water_level > 50) {
    recs.push({
      text: `Close flood-prone underpasses and deploy water rescue teams in ${zoneName}.`,
      priority: 'high',
      trigger: 'critical flooding'
    });
  } else if (factors.water_level > 20) {
    recs.push({
      text: `Alert emergency response teams of rising flood risks in ${zoneName}.`,
      priority: 'high',
      trigger: 'rising water levels'
    });
  }

  // Traffic
  if (factors.traffic > 75) {
    recs.push({
      text: `Activate dynamic signal coordination and deploy traffic marshals to relieve gridlock in ${zoneName}.`,
      priority: 'high',
      trigger: 'severe traffic gridlock'
    });
  } else if (factors.traffic > 40) {
    recs.push({
      text: `Advise commuters to use alternative arterial roads in ${zoneName} to bypass congestion.`,
      priority: 'medium',
      trigger: 'elevated traffic congestion'
    });
  }

  // AQI
  if (factors.aqi > 200) {
    recs.push({
      text: `Restrict local industrial emissions and advise residents in ${zoneName} to wear N95 masks outdoors.`,
      priority: 'high',
      trigger: 'hazardous air pollution'
    });
  } else if (factors.aqi > 100) {
    recs.push({
      text: `Recommend sensitive groups in ${zoneName} avoid prolonged outdoor exposure.`,
      priority: 'medium',
      trigger: 'elevated air quality index'
    });
  }

  // Active Event
  if (factors.event && factors.event > 0) {
    if (factors.event > 50000) {
      recs.push({
        text: `Activate major event crowd dispersal protocols at transit nodes in ${zoneName}.`,
        priority: 'high',
        trigger: 'large public event'
      });
    } else {
      recs.push({
        text: `Deploy crowd control teams at local transit stations in ${zoneName}.`,
        priority: 'medium',
        trigger: 'active public event'
      });
    }

    // Compounding (Convergence) Rules
    if (factors.traffic > 50) {
      recs.push({
        text: `Divert transit and general traffic away from event venue routes in ${zoneName}.`,
        priority: 'high',
        trigger: 'compounding event + traffic'
      });
    }
    if (factors.water_level > 30) {
      recs.push({
        text: `Waterlogging detected near event venue: coordinate evacuation assembly points with event staff in ${zoneName}.`,
        priority: 'high',
        trigger: 'compounding event + flooding'
      });
    }
  }

  return recs.slice(0, 3); // limit to 1-3 recommendations
}

/**
 * Evaluates the risk score for all unique zones in Mumbai,
 * maps scores to categories, generates explanations, and saves snapshots in Supabase.
 */
export async function evaluateZoneRisks(): Promise<void> {
  console.log('[RiskEngine] Evaluating zone risks...');

  // 1. Fetch all sensors
  const { data: sensors, error: sensorErr } = await supabase
    .from('sensors')
    .select('*');

  if (sensorErr || !sensors || sensors.length === 0) {
    console.error('[RiskEngine] Failed to load sensors for evaluation:', sensorErr?.message);
    return;
  }

  // 2. Fetch active events
  let activeEvents: any[] = [];
  try {
    const nowStr = new Date().toISOString();
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .lte('start_time', nowStr)
      .gte('end_time', nowStr);
    if (!error && data) {
      activeEvents = data;
    }
  } catch (e: any) {
    console.warn('[RiskEngine] Failed to load active events for evaluation:', e.message);
  }

  const activeEventsByZone: Record<string, any[]> = {};
  activeEvents.forEach((event) => {
    if (!activeEventsByZone[event.zone_name]) {
      activeEventsByZone[event.zone_name] = [];
    }
    activeEventsByZone[event.zone_name].push(event);
  });

  // 3. Fetch the latest reading for each sensor in parallel
  const latestReadings: Record<string, number> = {};
  await Promise.all(
    (sensors as Sensor[]).map(async (sensor) => {
      const { data, error } = await supabase
        .from('readings')
        .select('value')
        .eq('sensor_id', sensor.id)
        .order('recorded_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        latestReadings[sensor.id] = data[0].value;
      }
    })
  );

  // 4. Group sensors by zone
  const zones: Record<string, Sensor[]> = {};
  sensors.forEach((sensor: Sensor) => {
    if (!zones[sensor.zone_name]) {
      zones[sensor.zone_name] = [];
    }
    zones[sensor.zone_name].push(sensor);
  });

  const now = new Date().toISOString();
  const snapshotsToInsert: any[] = [];

  // 5. Calculate risk score for each zone
  for (const [zoneName, zoneSensors] of Object.entries(zones)) {
    let weightedSum = 0;
    let sumOfWeights = 0;
    const factors: Record<string, number> = {};

    zoneSensors.forEach((sensor) => {
      const val = latestReadings[sensor.id];
      if (val !== undefined) {
        factors[sensor.type] = val;
        const normVal = normalizeValue(sensor.type, val);
        const weight = weights[sensor.type] || 0.25;

        weightedSum += weight * normVal;
        sumOfWeights += weight;
      }
    });

    // Fold active events expected footfall as an additional factor
    const zoneEvents = activeEventsByZone[zoneName] || [];
    const totalFootfall = zoneEvents.reduce((sum, e) => sum + e.expected_footfall, 0);
    if (totalFootfall > 0) {
      factors['event'] = totalFootfall;
      const normVal = normalizeValue('event', totalFootfall);
      const weight = weights['event'] || 0.20;

      weightedSum += weight * normVal;
      sumOfWeights += weight;
    }

    // If we have readings or active events in this zone, compute weighted score. Else score is 0.
    const score = sumOfWeights > 0 
      ? Math.round((weightedSum / sumOfWeights) * 100) / 100 
      : 0;

    // Map score to category: Low (0-25) / Moderate (26-50) / High (51-75) / Critical (76-100)
    let category: 'low' | 'moderate' | 'high' | 'critical' = 'low';
    if (score > 75) {
      category = 'critical';
    } else if (score > 50) {
      category = 'high';
    } else if (score > 25) {
      category = 'moderate';
    }

    const explanation = generateExplanation(zoneName, factors);
    const recommendations = getAIRecommendations(zoneName, factors);

    snapshotsToInsert.push({
      zone_name: zoneName,
      score,
      category,
      factors: {
        ...factors,
        explanation, // Store the human explanation inside the factors JSONB object
        recommendations // Store the recommendations list
      },
      created_at: now
    });
  }

  // 5. Bulk insert snapshots to Supabase
  if (snapshotsToInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('risk_snapshots')
      .insert(snapshotsToInsert);

    if (insertErr) {
      console.error('[RiskEngine] Failed to save risk snapshots:', insertErr.message);
    } else {
      console.log(`[RiskEngine] ✓ Computed and stored ${snapshotsToInsert.length} risk snapshots at ${now}`);

      // Broadcast snapshots to all connected SSE clients
      const { data: latestSnapshots, error: currentErr } = await supabase
        .from('risk_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!currentErr && latestSnapshots) {
        const latestByZone: Record<string, any> = {};
        latestSnapshots.forEach((snapshot) => {
          if (!latestByZone[snapshot.zone_name]) {
            latestByZone[snapshot.zone_name] = snapshot;
          }
        });
        realtimeBus.emit('snapshots', Object.values(latestByZone));
      }

      // Calculate and broadcast forecasts for all zones in parallel
      const uniqueZones = Object.keys(zones);
      Promise.all(
        uniqueZones.map(async (zone) => {
          try {
            const forecast = await forecastZone(zone);
            if (forecast) {
              realtimeBus.emit('forecast', forecast);
            }
          } catch (e) {
            console.error(`[RiskEngine] Forecast fail for ${zone}:`, e);
          }
        })
      ).catch((err) => {
        console.error('[RiskEngine] Unhandled error during forecast broadcasting:', err);
      });
    }
  }
}

// Scheduler handle
let engineIntervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the risk engine scheduled job.
 */
export function startRiskEngine(intervalMs = 10_000): void {
  if (engineIntervalHandle) {
    console.log('[RiskEngine] Risk Engine already running.');
    return;
  }

  console.log(`[RiskEngine] Starting Convergence Risk Engine (every ${intervalMs / 1000}s)`);
  
  // Run immediately once
  evaluateZoneRisks();

  // Schedule loop
  engineIntervalHandle = setInterval(() => {
    evaluateZoneRisks();
  }, intervalMs);
}

/**
 * Stops the risk engine.
 */
export function stopRiskEngine(): void {
  if (engineIntervalHandle) {
    clearInterval(engineIntervalHandle);
    engineIntervalHandle = null;
    console.log('[RiskEngine] Risk Engine stopped.');
  }
}
