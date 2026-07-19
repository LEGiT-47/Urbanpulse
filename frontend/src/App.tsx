import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  CloudRain, 
  Car, 
  Wind, 
  Droplet, 
  RefreshCw, 
  AlertTriangle, 
  ListFilter,
  Activity,
  Sun,
  Moon,
  ShieldAlert,
  Flame,
  LayoutDashboard,
  Bell,
  Sliders,
  Bot,
  LogOut
} from 'lucide-react';
import { getSeverity, getUnit, getSensorLabel, getRiskCategory, getRiskColor, getRiskBgClass } from './utils/severity';
import type { RiskCategory } from './utils/severity';
import Sparkline from './components/Sparkline';
import type { ForecastPoint } from './components/Sparkline';
import NotificationDrawer from './components/NotificationDrawer';
import type { AlertNotification } from './components/NotificationDrawer';
import SimulationPanel from './components/SimulationPanel';
import SensorHistoryModal from './components/SensorHistoryModal';
import LoginPage from './pages/LoginPage';
import type { AuthUser } from './pages/LoginPage';
import AgentConsolePage from './pages/AgentConsolePage';

// TypeScript interfaces
interface Sensor {
  id: string;
  name: string;
  type: 'rainfall' | 'traffic' | 'aqi' | 'water_level';
  lat: number;
  lng: number;
  zone_name: string;
}

interface Reading {
  id: string;
  sensor_id: string;
  value: number;
  recorded_at: string;
  data_source?: 'live' | 'mock';
}

interface RiskSnapshot {
  id: string;
  zone_name: string;
  score: number;
  category: RiskCategory;
  factors: {
    rainfall?: number;
    traffic?: number;
    aqi?: number;
    water_level?: number;
    event?: number;
    explanation?: string;
    recommendations?: Array<{ text: string; priority: 'high' | 'medium' | 'low'; trigger: string }>;
  };
  created_at: string;
}

interface Event {
  id: string;
  name: string;
  type: 'festival' | 'rally' | 'concert' | 'sports';
  zone_name: string;
  lat: number;
  lng: number;
  start_time: string;
  end_time: string;
  expected_footfall: number;
  created_at: string;
}

interface ForecastResult {
  zone: string;
  horizon_minutes: number[];
  predicted: number[];
  lower: number[];
  upper: number[];
  slope: number;
  trend: 'rising' | 'stable' | 'falling';
  confidence: 'high' | 'medium' | 'low';
  data_points: number;
  sparkline_forecast: ForecastPoint[];
}

interface RouteResult {
  coordinates: [number, number][];
  distanceM: number;
  estimatedMinutes: number;
  blockedZones: string[];
  penalizedZones: string[];
  routeWarning?: string;
  fromNode: { lat: number; lng: number };
  toNode:   { lat: number; lng: number };
}

const ZONE_CENTERS: Record<string, [number, number]> = {
  Dadar: [19.0179, 72.8460],
  Andheri: [19.1181, 72.8465],
  Bandra: [19.0640, 72.8493],
  Kurla: [19.0692, 72.8810],
  Sion: [19.0403, 72.8615],
  Kalbadevi: [18.9499, 72.8250],
  Mahim: [19.0369, 72.8394],
  Vikhroli: [19.1068, 72.9258],
  Borivali: [19.2288, 72.8541],
  Chembur: [19.0618, 72.8998],
  Colaba: [18.9067, 72.8147],
  Goregaon: [19.1663, 72.8526],
};

const MOCK_SENSORS: Sensor[] = [
  { id: 'mock-1', name: 'Hindmata Rainfall Gauge', type: 'rainfall', lat: 19.0176, lng: 72.8431, zone_name: 'Dadar' },
  { id: 'mock-2', name: 'Dadar TT Traffic Node', type: 'traffic', lat: 19.0183, lng: 72.8488, zone_name: 'Dadar' },
  { id: 'mock-3', name: 'Andheri WEH Traffic Camera', type: 'traffic', lat: 19.1136, lng: 72.8697, zone_name: 'Andheri' },
  { id: 'mock-4', name: 'Andheri Lokhandwala AQI Station', type: 'aqi', lat: 19.1308, lng: 72.8271, zone_name: 'Andheri' },
  { id: 'mock-5', name: 'Andheri Millat Nagar Water Level', type: 'water_level', lat: 19.1100, lng: 72.8426, zone_name: 'Andheri' },
  { id: 'mock-6', name: 'Bandra Waterfront Rainfall', type: 'rainfall', lat: 19.0596, lng: 72.8295, zone_name: 'Bandra' },
  { id: 'mock-7', name: 'Bandra-Kurla Complex Traffic', type: 'traffic', lat: 19.0683, lng: 72.8692, zone_name: 'Bandra' },
  { id: 'mock-8', name: 'Kurla LBS Road Traffic Cam', type: 'traffic', lat: 19.0726, lng: 72.8796, zone_name: 'Kurla' },
  { id: 'mock-9', name: 'Kurla Mithi River Water Level', type: 'water_level', lat: 19.0659, lng: 72.8823, zone_name: 'Kurla' },
  { id: 'mock-10', name: 'Sion Hospital Junction Rainfall', type: 'rainfall', lat: 19.0396, lng: 72.8619, zone_name: 'Sion' },
  { id: 'mock-11', name: 'Sion Circle Water Level', type: 'water_level', lat: 19.0411, lng: 72.8611, zone_name: 'Sion' },
  { id: 'mock-12', name: 'Kalbadevi AQI Monitor', type: 'aqi', lat: 18.9479, lng: 72.8310, zone_name: 'Kalbadevi' },
  { id: 'mock-13', name: 'Kalbadevi Charni Rd Rainfall', type: 'rainfall', lat: 18.9519, lng: 72.8190, zone_name: 'Kalbadevi' },
  { id: 'mock-14', name: 'Mahim Creek Water Level', type: 'water_level', lat: 19.0369, lng: 72.8394, zone_name: 'Mahim' },
  { id: 'mock-15', name: 'Vikhroli Industrial AQI', type: 'aqi', lat: 19.1068, lng: 72.9258, zone_name: 'Vikhroli' },
  { id: 'mock-16', name: 'Borivali National Park Rainfall', type: 'rainfall', lat: 19.2215, lng: 72.8631, zone_name: 'Borivali' },
  { id: 'mock-17', name: 'Borivali Station Traffic Camera', type: 'traffic', lat: 19.2290, lng: 72.8480, zone_name: 'Borivali' },
  { id: 'mock-18', name: 'Borivali Link Road AQI Station', type: 'aqi', lat: 19.2320, lng: 72.8360, zone_name: 'Borivali' },
  { id: 'mock-19', name: 'Dahisar River Water Level', type: 'water_level', lat: 19.2250, lng: 72.8590, zone_name: 'Borivali' },
  { id: 'mock-20', name: 'Chembur Fine Arts Traffic Node', type: 'traffic', lat: 19.0520, lng: 72.9020, zone_name: 'Chembur' },
  { id: 'mock-21', name: 'Chembur Industrial AQI Monitor', type: 'aqi', lat: 19.0650, lng: 72.8910, zone_name: 'Chembur' },
  { id: 'mock-22', name: 'Chembur Rainfall Station', type: 'rainfall', lat: 19.0580, lng: 72.8980, zone_name: 'Chembur' },
  { id: 'mock-23', name: 'Colaba Observatory Rainfall', type: 'rainfall', lat: 18.9080, lng: 72.8120, zone_name: 'Colaba' },
  { id: 'mock-24', name: 'Gateway of India Water Level', type: 'water_level', lat: 18.9220, lng: 72.8340, zone_name: 'Colaba' },
  { id: 'mock-25', name: 'Marine Drive Traffic Camera', type: 'traffic', lat: 18.9430, lng: 72.8230, zone_name: 'Colaba' },
  { id: 'mock-26', name: 'Goregaon Aarey Colony Rainfall', type: 'rainfall', lat: 19.1485, lng: 72.8715, zone_name: 'Goregaon' },
  { id: 'mock-27', name: 'Goregaon WEH Highway Traffic', type: 'traffic', lat: 19.1585, lng: 72.8566, zone_name: 'Goregaon' },
  { id: 'mock-28', name: 'Goregaon West Link Rd AQI', type: 'aqi', lat: 19.1620, lng: 72.8390, zone_name: 'Goregaon' },
  { id: 'mock-29', name: 'Aarey Lake Water Level Sensor', type: 'water_level', lat: 19.1520, lng: 72.8750, zone_name: 'Goregaon' },
];

const generateMockReading = (sensor: Sensor, prevValue?: number): Reading => {
  const ranges = {
    rainfall: { min: 0, max: 80 },
    traffic: { min: 0, max: 100 },
    aqi: { min: 50, max: 400 },
    water_level: { min: 0, max: 100 },
  };

  const range = ranges[sensor.type];
  let value;

  if (prevValue === undefined) {
    value = range.min + Math.random() * (range.max - range.min) * 0.5;
  } else {
    const drift = (Math.random() - 0.5) * 0.1 * (range.max - range.min);
    value = Math.min(Math.max(prevValue + drift, range.min), range.max);
  }

  if (Math.random() < 0.08) {
    value = Math.min(value * 1.5, range.max);
  }

  return {
    id: `reading-${sensor.id}-${Date.now()}`,
    sensor_id: sensor.id,
    value: Math.round(value * 100) / 100,
    recorded_at: new Date().toISOString(),
  };
};

function generateLocalExplanation(zoneName: string, factors: Record<string, number>): string {
  const elevatedFactors: string[] = [];
  if (factors.rainfall > 35) elevatedFactors.push('heavy rainfall');
  else if (factors.rainfall > 15) elevatedFactors.push('rising rainfall');

  if (factors.water_level > 50) elevatedFactors.push('critical flooding');
  else if (factors.water_level > 20) elevatedFactors.push('rising water levels');

  if (factors.traffic > 75) elevatedFactors.push('severe traffic gridlock');
  else if (factors.traffic > 40) elevatedFactors.push('elevated traffic congestion');

  if (factors.aqi > 200) elevatedFactors.push('hazardous air pollution');
  else if (factors.aqi > 100) elevatedFactors.push('elevated air quality');

  if (factors.event && factors.event > 0) {
    if (factors.event > 50000) {
      elevatedFactors.push(`large public event (${factors.event.toLocaleString()} expected footfall)`);
    } else {
      elevatedFactors.push(`active public event (${factors.event.toLocaleString()} expected footfall)`);
    }
  }

  if (elevatedFactors.length === 0) return `Normal conditions monitored in ${zoneName}.`;
  if (elevatedFactors.length === 1) return `${elevatedFactors[0].charAt(0).toUpperCase() + elevatedFactors[0].slice(1)} detected in ${zoneName}.`;
  if (elevatedFactors.length === 2) return `${elevatedFactors[0].charAt(0).toUpperCase() + elevatedFactors[0].slice(1)} combined with ${elevatedFactors[1]} in ${zoneName}.`;

  const list = elevatedFactors.slice(0, -1).join(', ') + `, and ${elevatedFactors[elevatedFactors.length - 1]}`;
  return `${list.charAt(0).toUpperCase() + list.slice(1)} impacting ${zoneName} concurrently.`;
}

function getLocalRecommendations(zoneName: string, factors: Record<string, number>): Array<{ text: string; priority: 'high' | 'medium' | 'low'; trigger: string }> {
  const recs: Array<{ text: string; priority: 'high' | 'medium' | 'low'; trigger: string }> = [];

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

  if (factors.aqi > 200) {
    recs.push({
      text: `Restrict local emissions and advise residents in ${zoneName} to wear N95 masks outdoors.`,
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

    if (factors.traffic > 50) {
      recs.push({
        text: `Divert transit and general traffic away from event venue routes in ${zoneName}.`,
        priority: 'high',
        trigger: 'compounding event + traffic'
      });
    }
  }

  return recs.slice(0, 3);
}

export default function App() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  
  // Auth state
  const [user, setUser] = useState<AuthUser | null>(() => {
    try { return JSON.parse(localStorage.getItem('up_user') || 'null'); } catch { return null; }
  });

  // Dashboard states
  const [activeTab, setActiveTab] = useState<'sensors' | 'risk' | 'routing' | 'agent'>(() => {
    const saved = localStorage.getItem('up_active_tab');
    return (saved as any) || 'risk';
  });
  const [currentAgentStage, setCurrentAgentStage] = useState<string>('idle');
  const [riskSnapshots, setRiskSnapshots] = useState<RiskSnapshot[]>([]);
  const [riskHistory, setRiskHistory] = useState<Record<string, number[]>>({});
  const [riskForecasts, setRiskForecasts] = useState<Record<string, ForecastResult>>({});
  const [selectedZoneName, setSelectedZoneName] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // New Simulation, Weight & Alerts states
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [isWeightsOpen, setIsWeightsOpen] = useState(false);
  const [selectedSensorHistory, setSelectedSensorHistory] = useState<Sensor | null>(null);
  const [isSimulationPaused, setIsSimulationPaused] = useState(false);
  const [weights, setWeights] = useState<Record<string, number>>({
    rainfall: 0.3,
    traffic: 0.2,
    aqi: 0.15,
    water_level: 0.35,
    event: 0.2,
  });

  // Layer toggles
  const [activeTypes, setActiveTypes] = useState<Record<string, boolean>>({
    rainfall: true,
    traffic: true,
    aqi: true,
    water_level: true,
  });
  const [showRiskOverlay, setShowRiskOverlay] = useState(true);

  // Search & Demo
  const [searchQuery, setSearchQuery] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Map references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const circlesRef = useRef<Record<string, L.Circle>>({});
  const eventMarkersRef = useRef<Record<string, L.Marker>>({});

  // Emergency routing state
  const [isRoutingMode, setIsRoutingMode] = useState(() => {
    const saved = localStorage.getItem('up_active_tab');
    return saved === 'routing';
  });
  const [routeFrom, setRouteFrom] = useState<[number, number] | null>(() => {
    const saved = localStorage.getItem('up_route_from');
    return saved ? JSON.parse(saved) : null;
  });
  const [routeTo, setRouteTo] = useState<[number, number] | null>(() => {
    const saved = localStorage.getItem('up_route_to');
    return saved ? JSON.parse(saved) : null;
  });
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [graphReady, setGraphReady] = useState(false);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const routePinFromRef = useRef<L.Marker | null>(null);
  const routePinToRef = useRef<L.Marker | null>(null);

  // Coordinate input fields temp state
  const [tempLatA, setTempLatA] = useState('');
  const [tempLngA, setTempLngA] = useState('');
  const [tempLatB, setTempLatB] = useState('');
  const [tempLngB, setTempLngB] = useState('');

  // 1. Fetch sensors and metadata on mount (ONLY when user is logged in)
  useEffect(() => {
    if (!user) return;

    async function fetchSensors() {
      try {
        const res = await fetch('/api/sensors');
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) {
          setError('⚡ Waking up UrbanPulse Cloud API... Please wait 20 seconds.');
          setLoading(false);
          return;
        }
        const data = await res.json();
        setSensors(data.sensors || []);
        setError(null);
        
        await fetchEvents();
        await fetchLatestReadings(data.sensors || []);
        await fetchRiskData();
        await fetchInitialMeta();
      } catch (err: any) {
        console.warn('Backend waking up or connecting...', err.message);
        setError('Connecting to UrbanPulse Cloud API...');
      } finally {
        setLoading(false);
      }
    }

    async function fetchEvents() {
      try {
        const res = await fetch('/api/events');
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch (e) {}
    }

    async function fetchInitialMeta() {
      try {
        const resSim = await fetch('/api/simulation/status');
        const ctSim = resSim.headers.get('content-type') || '';
        if (resSim.ok && ctSim.includes('application/json')) {
          const data = await resSim.json();
          setIsSimulationPaused(data.paused);
        }
        const resWeights = await fetch('/api/risk/weights');
        const ctW = resWeights.headers.get('content-type') || '';
        if (resWeights.ok && ctW.includes('application/json')) {
          const data = await resWeights.json();
          setWeights(data);
        }
      } catch (e) {}
    }

    fetchSensors();
  }, [user]);

  // 2. Fetch Latest readings
  const fetchLatestReadings = async (currentSensors: Sensor[]) => {
    if (isDemoMode) {
      triggerLocalDemoUpdates(currentSensors);
      return;
    }
    try {
      const updatedReadings: Record<string, Reading> = {};
      await Promise.all(
        currentSensors.map(async (sensor) => {
          try {
            const res = await fetch(`/api/sensors/${sensor.id}/readings/latest`);
            if (res.ok) {
              const data = await res.json();
              if (data.reading) updatedReadings[sensor.id] = data.reading;
            }
          } catch (e) {}
        })
      );
      setReadings((prev) => ({ ...prev, ...updatedReadings }));
    } catch (err) {}
  };

  // 3. Fetch Risk snapshots, history & forecasts
  const fetchRiskData = async () => {
    if (isDemoMode || !user) return;
    try {
      // Fetch current snapshots
      const resCurrent = await fetch('/api/risk/current');
      const ctCurr = resCurrent.headers.get('content-type') || '';
      if (resCurrent.ok && ctCurr.includes('application/json')) {
        const data = await resCurrent.json();
        setRiskSnapshots(data.snapshots || []);
        
        // Fetch history (1 hour) for each zone in parallel
        const historyData: Record<string, number[]> = {};
        await Promise.all(
          Object.keys(ZONE_CENTERS).map(async (zone) => {
            try {
              const resHistory = await fetch(`/api/risk/history?zone=${zone}&hours=1`);
              const ctHist = resHistory.headers.get('content-type') || '';
              if (resHistory.ok && ctHist.includes('application/json')) {
                const historyRes = await resHistory.json();
                historyData[zone] = (historyRes.history || []).map((h: any) => h.score);
              }
            } catch (err) {}
          })
        );
        setRiskHistory(historyData);
      }
    } catch (err) {}
  };


  // 3c. Set up Server-Sent Events (SSE) listener for real-time updates
  useEffect(() => {
    if (isDemoMode || !user) return;

    let eventSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connectSSE() {
      eventSource = new EventSource('/api/realtime/stream');

      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { type, data } = message;

          if (type === 'reading') {
            setReadings((prev) => ({ ...prev, [data.sensor_id]: data }));
          } else if (type === 'snapshots') {
            setRiskSnapshots(data || []);
            (data || []).forEach((snapshot: RiskSnapshot) => {
              if (snapshot.score >= 75) {
                setAlerts((prev) => {
                  const exists = prev.some(
                    (a) => a.zoneName === snapshot.zone_name && 
                           a.type === 'critical' && 
                           Date.now() - new Date(a.timestamp).getTime() < 120_000
                  );
                  if (exists) return prev;
                  const newAlert: AlertNotification = {
                    id: `alert-${snapshot.zone_name}-crit-${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    type: 'critical',
                    message: `CRITICAL risk level detected in ${snapshot.zone_name} (Score: ${snapshot.score}).`,
                    zoneName: snapshot.zone_name,
                    score: snapshot.score,
                  };
                  return [newAlert, ...prev].slice(0, 50);
                });
              }
            });
            setRiskHistory((prev) => {
              const updated = { ...prev };
              (data || []).forEach((snapshot: RiskSnapshot) => {
                const currentHistory = updated[snapshot.zone_name] || [];
                const nextHistory = [...currentHistory, snapshot.score];
                if (nextHistory.length > 12) nextHistory.shift();
                updated[snapshot.zone_name] = nextHistory;
              });
              return updated;
            });
          } else if (type === 'forecast') {
            setRiskForecasts((prev) => ({ ...prev, [data.zone]: data }));
          } else if (type === 'weights') {
            setWeights(data);
          } else if (type === 'simulation') {
            setIsSimulationPaused(data.paused);
          } else if (type === 'agent_stage') {
            setCurrentAgentStage(data.stage);
          } else if (type === 'agent_cycle') {
            if (data.results && data.results.length > 0) {
              const actionable = (data.results as any[]).filter((r: any) => r.llm_decision?.action_needed);
              actionable.forEach((r: any) => {
                setAlerts(prev => {
                  const exists = prev.some(a => a.zoneName === r.zone_name && a.type === 'sentinel' &&
                    Date.now() - new Date(a.timestamp).getTime() < 120_000);
                  if (exists) return prev;
                  return [{
                    id: `sentinel-${r.zone_name}-${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    type: 'sentinel' as any,
                    message: `🤖 Sentinel Agent: ${r.llm_decision?.explanation ?? 'Action triggered'} (${r.zone_name})`,
                    zoneName: r.zone_name,
                    score: r.risk_score,
                  }, ...prev].slice(0, 50);
                });
              });
            }
          }
        } catch (err) {}
      };

      eventSource.onerror = () => {
        if (eventSource) eventSource.close();
        // Silent retry after 10 seconds if backend is waking up
        retryTimer = setTimeout(connectSSE, 10000);
      };
    }

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [isDemoMode, user]);

  // 4. Polling updates (Only runs in Demo Mode for client-side local loops)
  useEffect(() => {
    if (sensors.length === 0 || !isDemoMode) return;
    const interval = setInterval(() => {
      fetchLatestReadings(sensors);
    }, 5000);
    return () => clearInterval(interval);
  }, [sensors, isDemoMode]);

  // 5. Compute local risks for Demo Mode
  useEffect(() => {
    if (!isDemoMode || sensors.length === 0) return;

    // Group sensors by zone
    const zones: Record<string, Sensor[]> = {};
    sensors.forEach((s) => {
      if (!zones[s.zone_name]) zones[s.zone_name] = [];
      zones[s.zone_name].push(s);
    });

    const computedSnapshots: RiskSnapshot[] = [];
    const updatedHistory = { ...riskHistory };

    Object.entries(zones).forEach(([zoneName, zoneSensors]) => {
      let sumOfWeights = 0;
      let weightedSum = 0;
      const factors: Record<string, number> = {};

      // Fold active events expected footfall as an additional factor
      const nowStr = new Date().toISOString();
      const zoneEvents = events.filter(
        (e) => e.zone_name === zoneName && e.start_time <= nowStr && nowStr <= e.end_time
      );
      const totalFootfall = zoneEvents.reduce((sum, e) => sum + e.expected_footfall, 0);

      zoneSensors.forEach((sensor) => {
        const r = readings[sensor.id];
        if (r) {
          factors[sensor.type] = r.value;
          // Normalizations
          let norm = 0;
          if (sensor.type === 'rainfall') norm = (r.value / 80) * 100;
          else if (sensor.type === 'traffic') norm = r.value;
          else if (sensor.type === 'aqi') norm = ((r.value - 50) / 350) * 100;
          else if (sensor.type === 'water_level') norm = r.value;

          const w = weights[sensor.type] ?? 0.25;
          weightedSum += w * norm;
          sumOfWeights += w;
        }
      });

      if (totalFootfall > 0) {
        factors['event'] = totalFootfall;
        const norm = (totalFootfall / 50000) * 100;
        const w = weights['event'] ?? 0.20;
        weightedSum += w * norm;
        sumOfWeights += w;
      }

      const score = sumOfWeights > 0 ? Math.round((weightedSum / sumOfWeights) * 100) / 100 : 0;
      const category = getRiskCategory(score);
      const explanation = generateLocalExplanation(zoneName, factors);
      const recommendations = getLocalRecommendations(zoneName, factors);

      computedSnapshots.push({
        id: `mock-risk-${zoneName}`,
        zone_name: zoneName,
        score,
        category,
        factors: { ...factors, explanation, recommendations },
        created_at: new Date().toISOString()
      });

      // Update local history array
      const history = updatedHistory[zoneName] || [];
      const newHistory = [...history, score];
      if (newHistory.length > 12) newHistory.shift(); // keep last 12 points
      updatedHistory[zoneName] = newHistory;
    });

    setRiskSnapshots(computedSnapshots);
    setRiskHistory(updatedHistory);

    // Compute local linear-regression forecast for demo mode
    const forecastData: Record<string, ForecastResult> = {};
    Object.keys(zones).forEach((zoneName) => {
      const history = updatedHistory[zoneName] || [];
      if (history.length < 3) return;

      // Simple least-squares linear fit over history indices
      const n = history.length;
      const sumX = (n * (n - 1)) / 2;
      const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
      const sumY = history.reduce((a, b) => a + b, 0);
      const sumXY = history.reduce((acc, y, i) => acc + i * y, 0);
      const denom = n * sumX2 - sumX * sumX;
      const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
      const intercept = (sumY - slope * sumX) / n;

      // RMSE for confidence band
      const residuals = history.map((y, i) => y - (intercept + slope * i));
      const rmse = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / n);
      const sigma = 1.5 * rmse;

      // Project 4 horizons: each unit = 1 history tick (~5s in demo)
      // We map 15/30/45/60 min → 3/6/9/12 ticks proportionally
      const horizonTicks = [3, 6, 9, 12];
      const predicted: number[] = [];
      const lower: number[] = [];
      const upper: number[] = [];
      horizonTicks.forEach((dt) => {
        const raw = intercept + slope * (n - 1 + dt);
        const clamped = Math.max(0, Math.min(100, raw));
        predicted.push(Math.round(clamped * 100) / 100);
        lower.push(Math.round(Math.max(0, clamped - sigma) * 100) / 100);
        upper.push(Math.round(Math.min(100, clamped + sigma) * 100) / 100);
      });

      const perMinute = slope * 12; // 12 ticks ≈ 1 min in demo
      const trend: 'rising' | 'stable' | 'falling' =
        perMinute > 0.5 ? 'rising' : perMinute < -0.5 ? 'falling' : 'stable';

      forecastData[zoneName] = {
        zone: zoneName,
        horizon_minutes: [15, 30, 45, 60],
        predicted,
        lower,
        upper,
        slope: Math.round(slope * 100) / 100,
        trend,
        confidence: n >= 10 ? 'high' : n >= 5 ? 'medium' : 'low',
        data_points: n,
        sparkline_forecast: predicted.map((p, i) => ({
          predicted: p,
          lower: lower[i],
          upper: upper[i],
        })),
      };
    });
    setRiskForecasts(forecastData);
  }, [readings, isDemoMode]);

  // 6. Setup local updates triggers
  const triggerLocalDemoUpdates = (currentSensors: Sensor[]) => {
    setReadings((prev) => {
      const updated = { ...prev };
      currentSensors.forEach((sensor) => {
        const prevReading = prev[sensor.id];
        updated[sensor.id] = generateMockReading(sensor, prevReading?.value);
      });
      return updated;
    });
  };

  const handleWeightChange = async (type: string, value: number) => {
    const nextWeights = { ...weights, [type]: value };
    setWeights(nextWeights);

    if (isDemoMode) {
      return;
    }

    try {
      await fetch('/api/risk/weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextWeights),
      });
    } catch (e) {
      console.error('Failed to post weights to API:', e);
    }
  };

  const handleToggleSimulation = async (pause: boolean) => {
    setIsSimulationPaused(pause);
    if (isDemoMode) return;

    try {
      await fetch(`/api/simulation/${pause ? 'stop' : 'start'}`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to toggle simulation loop:', e);
    }
  };

  const handleInjectReadings = async (readingsArray: Array<{ sensor_id: string; value: number }>) => {
    if (isDemoMode) {
      const updatedReadings: Record<string, Reading> = {};
      readingsArray.forEach((r) => {
        const sensor = sensors.find((s) => s.id === r.sensor_id);
        if (sensor) {
          updatedReadings[r.sensor_id] = {
            id: `injected-${r.sensor_id}-${Date.now()}`,
            sensor_id: r.sensor_id,
            value: r.value,
            recorded_at: new Date().toISOString(),
          };
        }
      });
      setReadings((prev) => ({ ...prev, ...updatedReadings }));
      return;
    }

    try {
      await fetch('/api/simulation/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readings: readingsArray }),
      });
    } catch (e) {
      console.error('Failed to inject readings:', e);
    }
  };

  const startDemoMode = () => {
    setError(null);
    setIsDemoMode(true);
    setSensors(MOCK_SENSORS);
    
    // Seed initial readings
    const initialReadings: Record<string, Reading> = {};
    MOCK_SENSORS.forEach(s => {
      initialReadings[s.id] = generateMockReading(s);
    });
    setReadings(initialReadings);

    // Seed mock events
    const demoSeeds: Event[] = [
      {
        id: 'event-demo-1',
        name: 'Lalbaugcha Raja Ganeshotsav',
        type: 'festival',
        zone_name: 'Dadar',
        lat: 19.0125,
        lng: 72.8410,
        start_time: new Date(Date.now() - 3 * 3600000).toISOString(),
        end_time: new Date(Date.now() + 6 * 3600000).toISOString(),
        expected_footfall: 80000,
        created_at: new Date().toISOString()
      },
      {
        id: 'event-demo-2',
        name: 'BKC Ground Music Concert',
        type: 'concert',
        zone_name: 'Bandra',
        lat: 19.0655,
        lng: 72.8632,
        start_time: new Date(Date.now() - 1 * 3600000).toISOString(),
        end_time: new Date(Date.now() + 4 * 3600000).toISOString(),
        expected_footfall: 35000,
        created_at: new Date().toISOString()
      },
      {
        id: 'event-demo-3',
        name: 'Mithi River Clean-up Rally',
        type: 'rally',
        zone_name: 'Kurla',
        lat: 19.0665,
        lng: 72.8850,
        start_time: new Date(Date.now() - 2 * 3600000).toISOString(),
        end_time: new Date(Date.now() + 1 * 3600000).toISOString(),
        expected_footfall: 5000,
        created_at: new Date().toISOString()
      },
      {
        id: 'event-demo-4',
        name: 'Wankhede IPL T20 Match',
        type: 'sports',
        zone_name: 'Colaba',
        lat: 18.9389,
        lng: 72.8258,
        start_time: new Date(Date.now() + 24 * 3600000).toISOString(),
        end_time: new Date(Date.now() + 28 * 3600000).toISOString(),
        expected_footfall: 40000,
        created_at: new Date().toISOString()
      }
    ];
    setEvents(demoSeeds);

    // Seed mock sparkline history (12 items)
    const initialHistory: Record<string, number[]> = {};
    Object.keys(ZONE_CENTERS).forEach((zone) => {
      const points = [];
      let baseVal = 20 + Math.random() * 60;
      for (let i = 0; i < 12; i++) {
        baseVal = Math.min(Math.max(baseVal + (Math.random() - 0.5) * 8, 5), 95);
        points.push(Math.round(baseVal));
      }
      initialHistory[zone] = points;
    });
    setRiskHistory(initialHistory);
  };

  // ─── Emergency Routing ─────────────────────────────────────────────────────

  /**
   * Minimal hardcoded 12-node road graph for Demo Mode (no backend needed).
   * Nodes represent real Dadar–Sion–Kurla junctions on OSM.
   */
  const DEMO_NODES: Record<string, [number, number]> = {
    'D1': [19.0176, 72.8431], // Hindmata Jn
    'D2': [19.0183, 72.8488], // Dadar TT
    'D3': [19.0230, 72.8550], // Dadar Station East
    'S1': [19.0403, 72.8619], // Sion Hospital Jn
    'S2': [19.0411, 72.8650], // Sion Circle
    'S3': [19.0370, 72.8700], // Sion-Trombay Rd
    'K1': [19.0659, 72.8823], // Kurla Mithi River
    'K2': [19.0726, 72.8796], // Kurla LBS Rd
    'K3': [19.0780, 72.8850], // Kurla Station
    'M1': [19.0369, 72.8394], // Mahim Creek
    'M2': [19.0310, 72.8450], // Mahim Causeway
    'B1': [19.0683, 72.8692], // BKC Traffic Node
  };
  const DEMO_EDGES: Array<[string, string, number, string]> = [
    // [fromId, toId, distanceM, zoneName]
    ['D1','D2',600,'Dadar'],['D2','D1',600,'Dadar'],
    ['D2','D3',800,'Dadar'],['D3','D2',800,'Dadar'],
    ['D3','S1',2200,'Sion'],['S1','D3',2200,'Sion'],
    ['S1','S2',500,'Sion'],['S2','S1',500,'Sion'],
    ['S2','S3',600,'Sion'],['S3','S2',600,'Sion'],
    ['S3','K1',3200,'Kurla'],['K1','S3',3200,'Kurla'],
    ['K1','K2',500,'Kurla'],['K2','K1',500,'Kurla'],
    ['K2','K3',600,'Kurla'],['K3','K2',600,'Kurla'],
    ['D1','M1',3000,'Mahim'],['M1','D1',3000,'Mahim'],
    ['M1','M2',800,'Mahim'],['M2','M1',800,'Mahim'],
    ['M2','D2',1200,'Dadar'],['D2','M2',1200,'Dadar'],
    ['B1','K2',4000,'Kurla'],['K2','B1',4000,'Kurla'],
    ['B1','D3',4500,'Bandra'],['D3','B1',4500,'Bandra'],
  ];

  function demoHaversine(a: [number, number], b: [number, number]): number {
    const R = 6371000;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLng = (b[1] - a[1]) * Math.PI / 180;
    const sin2 = Math.sin(dLat/2)**2 + Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1-sin2));
  }

  function demoEdgeWeight(distM: number, zoneName: string): number {
    const base = (distM / 1000 / 30) * 3600; // 30kph base
    const snap = riskSnapshots.find(r => r.zone_name === zoneName);
    if (!snap) return base;
    if (snap.factors?.water_level !== undefined && (snap.factors.water_level as number) > 60) return Infinity;
    if (snap.category === 'critical') return base * 4;
    if (snap.category === 'high') return base * 2;
    if (snap.category === 'moderate') return base * 1.3;
    return base;
  }

  function demoAstar(fromId: string, toId: string): string[] | null {
    const g = new Map<string, number>();
    const came = new Map<string, string>();
    const open = new Set<string>([fromId]);
    g.set(fromId, 0);
    while (open.size > 0) {
      const toCoord = DEMO_NODES[toId];
      let cur = '';
      let best = Infinity;
      for (const n of open) {
        const f = (g.get(n) ?? Infinity) + demoHaversine(DEMO_NODES[n], toCoord);
        if (f < best) { best = f; cur = n; }
      }
      if (cur === toId) {
        const path: string[] = [];
        let n: string | undefined = toId;
        while (n) { path.unshift(n); n = came.get(n); }
        return path;
      }
      open.delete(cur);
      for (const [a, b, dist, zone] of DEMO_EDGES) {
        if (a !== cur) continue;
        const w = demoEdgeWeight(dist, zone);
        if (w === Infinity) continue;
        const ng = (g.get(cur) ?? Infinity) + w;
        if (ng < (g.get(b) ?? Infinity)) {
          g.set(b, ng); came.set(b, cur); open.add(b);
        }
      }
    }
    return null;
  }

  function getClosestDemoNode(lat: number, lng: number): string {
    let best = 'D2'; let bestDist = Infinity;
    for (const [id, coord] of Object.entries(DEMO_NODES)) {
      const d = demoHaversine([lat, lng], coord);
      if (d < bestDist) { bestDist = d; best = id; }
    }
    return best;
  }

  /** Draw or update the route polyline on the Leaflet map */
  function drawRoutePolyline(coords: [number, number][], color = '#06b6d4') {
    const map = mapRef.current;
    if (!map || coords.length < 2) return;
    if (routePolylineRef.current) { routePolylineRef.current.remove(); }
    routePolylineRef.current = L.polyline(coords, {
      color,
      weight: 5,
      opacity: 0.85,
      dashArray: color === '#06b6d4' ? undefined : '8,6',
    }).addTo(map);
  }

  /** Place a pin marker on the map */
  function placePin(lat: number, lng: number, color: string, label: string): L.Marker {
    const map = mapRef.current!;
    const icon = L.divIcon({
      html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px ${color};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:white">${label}</div>`,
      className: 'route-pin',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    return L.marker([lat, lng], { icon }).addTo(map);
  }

  /** Clear all routing overlays */
  const clearRoute = () => {
    if (routePolylineRef.current) { routePolylineRef.current.remove(); routePolylineRef.current = null; }
    if (routePinFromRef.current) { routePinFromRef.current.remove(); routePinFromRef.current = null; }
    if (routePinToRef.current) { routePinToRef.current.remove(); routePinToRef.current = null; }
    setRouteFrom(null);
    setRouteTo(null);
    setRouteResult(null);
    setRouteError(null);
  };

  const clearOrigin = () => {
    if (routePinFromRef.current) {
      routePinFromRef.current.remove();
      routePinFromRef.current = null;
    }
    setRouteFrom(null);
    setRouteResult(null);
    setRouteError(null);
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }
  };

  const clearDestination = () => {
    if (routePinToRef.current) {
      routePinToRef.current.remove();
      routePinToRef.current = null;
    }
    setRouteTo(null);
    setRouteResult(null);
    setRouteError(null);
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }
  };

  const updateOriginCoords = (lat: number, lng: number) => {
    setRouteFrom([lat, lng]);
    if (routePinFromRef.current) { routePinFromRef.current.remove(); }
    const map = mapRef.current;
    if (map) {
      routePinFromRef.current = placePin(lat, lng, '#10b981', 'A');
    }
    if (routeTo) {
      fetchRoute([lat, lng], routeTo);
    }
  };

  const updateDestinationCoords = (lat: number, lng: number) => {
    setRouteTo([lat, lng]);
    if (routePinToRef.current) { routePinToRef.current.remove(); }
    const map = mapRef.current;
    if (map) {
      routePinToRef.current = placePin(lat, lng, '#ef4444', 'B');
    }
    if (routeFrom) {
      fetchRoute(routeFrom, [lat, lng]);
    }
  };

  const handleApplyA = () => {
    const lat = parseFloat(tempLatA);
    const lng = parseFloat(tempLngA);
    if (!isNaN(lat) && !isNaN(lng)) {
      updateOriginCoords(lat, lng);
    }
  };

  const handleApplyB = () => {
    const lat = parseFloat(tempLatB);
    const lng = parseFloat(tempLngB);
    if (!isNaN(lat) && !isNaN(lng)) {
      updateDestinationCoords(lat, lng);
    }
  };

  // Sync map clicks with local text states
  useEffect(() => {
    if (routeFrom) {
      setTempLatA(routeFrom[0].toFixed(6));
      setTempLngA(routeFrom[1].toFixed(6));
    } else {
      setTempLatA('');
      setTempLngA('');
    }
  }, [routeFrom]);

  useEffect(() => {
    if (routeTo) {
      setTempLatB(routeTo[0].toFixed(6));
      setTempLngB(routeTo[1].toFixed(6));
    } else {
      setTempLatB('');
      setTempLngB('');
    }
  }, [routeTo]);

  /** Fetch route (live mode → API, demo mode → in-browser A*) */
  const fetchRoute = async (from: [number, number], to: [number, number]) => {
    setRouteLoading(true);
    setRouteError(null);
    setRouteResult(null);

    try {
      if (isDemoMode) {
        // Client-side A* over the demo mini-graph
        const fromId = getClosestDemoNode(from[0], from[1]);
        const toId = getClosestDemoNode(to[0], to[1]);
        const path = demoAstar(fromId, toId);
        if (!path) {
          setRouteError('No route found — path may be blocked by flood conditions.');
          setRouteLoading(false);
          return;
        }
        const coords: [number, number][] = path.map(id => DEMO_NODES[id]);
        const totalDistM = path.reduce((sum, id, i) =>
          i === 0 ? 0 : sum + demoHaversine(DEMO_NODES[path[i-1]], DEMO_NODES[id]), 0
        );
        const blockedZones = riskSnapshots
          .filter(r => r.factors?.water_level !== undefined && (r.factors.water_level as number) > 60)
          .map(r => r.zone_name);
        const penalizedZones = riskSnapshots
          .filter(r => (r.category === 'high' || r.category === 'critical') && !blockedZones.includes(r.zone_name))
          .map(r => r.zone_name);
        const result: RouteResult = {
          coordinates: coords,
          distanceM: Math.round(totalDistM),
          estimatedMinutes: Math.round((totalDistM / 1000 / 30) * 60 * 10) / 10,
          blockedZones,
          penalizedZones,
          routeWarning: blockedZones.length > 0
            ? `Route avoids flood-closed: ${blockedZones.join(', ')}.`
            : penalizedZones.length > 0
              ? `Elevated risk in: ${penalizedZones.join(', ')}. Expect delays.`
              : undefined,
          fromNode: { lat: coords[0][0], lng: coords[0][1] },
          toNode:   { lat: coords[coords.length-1][0], lng: coords[coords.length-1][1] },
        };
        setRouteResult(result);
        drawRoutePolyline(coords);
      } else {
        // Live API call
        const resp = await fetch('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: { lat: from[0], lng: from[1] }, to: { lat: to[0], lng: to[1] } }),
        });
        if (!resp.ok) {
          const err = await resp.json();
          setRouteError(err.error ?? 'Route computation failed.');
          setRouteLoading(false);
          return;
        }
        const result: RouteResult = await resp.json();
        setRouteResult(result);
        drawRoutePolyline(result.coordinates);
      }
    } catch (e: any) {
      setRouteError('Network error during route computation.');
    }
    setRouteLoading(false);
  };

  // Poll graph readiness in live mode
  useEffect(() => {
    if (isDemoMode) { setGraphReady(true); return; }
    const check = async () => {
      try {
        const r = await fetch('/api/route/status');
        if (r.ok) { const d = await r.json(); setGraphReady(d.ready); }
      } catch { /* silent */ }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [isDemoMode]);

  // Save routeFrom to localStorage and sync inputs
  useEffect(() => {
    if (routeFrom) {
      localStorage.setItem('up_route_from', JSON.stringify(routeFrom));
      setTempLatA(routeFrom[0].toFixed(5));
      setTempLngA(routeFrom[1].toFixed(5));
    } else {
      localStorage.removeItem('up_route_from');
      setTempLatA('');
      setTempLngA('');
    }
  }, [routeFrom]);

  // Save routeTo to localStorage and sync inputs
  useEffect(() => {
    if (routeTo) {
      localStorage.setItem('up_route_to', JSON.stringify(routeTo));
      setTempLatB(routeTo[0].toFixed(5));
      setTempLngB(routeTo[1].toFixed(5));
    } else {
      localStorage.removeItem('up_route_to');
      setTempLatB('');
      setTempLngB('');
    }
  }, [routeTo]);

  // Save activeTab to localStorage
  useEffect(() => {
    localStorage.setItem('up_active_tab', activeTab);
  }, [activeTab]);

  // Save user to localStorage
  useEffect(() => {
    if (user) localStorage.setItem('up_user', JSON.stringify(user));
    else localStorage.removeItem('up_user');
  }, [user]);

  // Draw polyline when routeResult changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeResult && routeResult.coordinates.length > 0) {
      drawRoutePolyline(routeResult.coordinates);
    } else {
      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
        routePolylineRef.current = null;
      }
    }
  }, [routeResult]);

  // Auto-reroute when risk snapshots change or when coordinates are initialized
  useEffect(() => {
    if (routeFrom && routeTo) {
      fetchRoute(routeFrom, routeTo);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskSnapshots, routeFrom, routeTo]);

  // Attach map click handler for routing mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isRoutingMode) {
      // Remove cursor hint when not routing
      map.getContainer().style.cursor = '';
      return;
    }
    map.getContainer().style.cursor = 'crosshair';

    const onClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (!routeFrom) {
        setRouteFrom([lat, lng]);
        if (routePinFromRef.current) { routePinFromRef.current.remove(); }
        routePinFromRef.current = placePin(lat, lng, '#10b981', 'A');
        if (routeTo) {
          fetchRoute([lat, lng], routeTo);
        }
      } else if (!routeTo) {
        setRouteTo([lat, lng]);
        if (routePinToRef.current) { routePinToRef.current.remove(); }
        routePinToRef.current = placePin(lat, lng, '#ef4444', 'B');
        fetchRoute(routeFrom, [lat, lng]);
      }
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRoutingMode, routeFrom, routeTo]);

  // 7. Leaflet Map setup
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [19.0550, 72.8650],
      zoom: 12,
      zoomControl: true,
      attributionControl: true
    });

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    tileLayerRef.current = osmLayer;
    mapRef.current = map;

    // Draw saved routing markers from localStorage if present on map mount
    const savedFrom = localStorage.getItem('up_route_from');
    if (savedFrom) {
      const fromCoords = JSON.parse(savedFrom);
      const icon = L.divIcon({
        html: `<div style="background:#10b981;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px #10b981;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:white">A</div>`,
        className: 'route-pin',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      routePinFromRef.current = L.marker(fromCoords, { icon }).addTo(map);
    }
    const savedTo = localStorage.getItem('up_route_to');
    if (savedTo) {
      const toCoords = JSON.parse(savedTo);
      const icon = L.divIcon({
        html: `<div style="background:#ef4444;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px #ef4444;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:white">B</div>`,
        className: 'route-pin',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      routePinToRef.current = L.marker(toCoords, { icon }).addTo(map);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 8. Dark/Light tiles filter trigger
  useEffect(() => {
    const tileLayer = tileLayerRef.current;
    if (!tileLayer) return;

    const container = tileLayer.getContainer();
    if (container) {
      if (isDarkMode) {
        container.classList.add('dark-tiles');
      } else {
        container.classList.remove('dark-tiles');
      }
    }
  }, [isDarkMode]);

  // 9. Render Markers & Overlays
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // A. Clean old sensors markers
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const sensor = sensors.find(s => s.id === id);
      const isVisible = sensor && activeTypes[sensor.type] && activeTab === 'sensors';
      if (!isVisible) {
        marker.remove();
        delete markersRef.current[id];
      }
    });

    // B. Clean old circles
    Object.entries(circlesRef.current).forEach(([zoneName, circle]) => {
      const snapshot = riskSnapshots.find(s => s.zone_name === zoneName);
      const isVisible = snapshot && showRiskOverlay && activeTab === 'risk';
      if (!isVisible) {
        circle.remove();
        delete circlesRef.current[zoneName];
      }
    });

    // C. Clean old event markers
    Object.entries(eventMarkersRef.current).forEach(([id, marker]) => {
      const event = events.find(e => e.id === id);
      if (!event) {
        marker.remove();
        delete eventMarkersRef.current[id];
      }
    });

    // D. Draw active sensors (Sensor Net view)
    if (activeTab === 'sensors') {
      sensors.forEach((sensor) => {
        if (!activeTypes[sensor.type]) return;

        const reading = readings[sensor.id];
        const value = reading ? reading.value : 0;
        const severity = reading ? getSeverity(sensor.type, value) : 'green';
        const markerColor = severity === 'red' ? '#ef4444' : severity === 'yellow' ? '#f59e0b' : '#10b981';
        const pulseClass = severity === 'red' ? 'animate-ping opacity-75' : '';

        const iconHtml = `
          <div class="relative flex items-center justify-center w-8 h-8">
            ${severity !== 'green' ? `<span class="absolute inline-flex h-full w-full rounded-full bg-[${markerColor}] ${pulseClass}"></span>` : ''}
            <div class="relative w-4.5 h-4.5 rounded-full border border-slate-900 shadow-md flex items-center justify-center" 
                 style="background-color: ${markerColor}; box-shadow: 0 0 10px ${markerColor};">
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: 'custom-sensor-icon',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const popupContent = `
          <div class="p-3 font-sans w-52 bg-slate-900 rounded-lg text-slate-200">
            <div class="text-xs uppercase font-bold tracking-wider text-slate-400 border-b border-slate-800 pb-1 mb-2">${getSensorLabel(sensor.type)}</div>
            <div class="font-semibold text-white leading-tight">${sensor.name}</div>
            <div class="text-[11px] text-slate-500 mt-1">${sensor.zone_name}</div>
            <div class="mt-2.5 p-2 bg-slate-950 rounded text-center">
              <span class="text-xs text-slate-400 block font-medium">Live Value</span>
              <span class="text-base font-bold text-white">${reading ? `${value} ${getUnit(sensor.type)}` : 'No readings'}</span>
            </div>
          </div>
        `;

        if (markersRef.current[sensor.id]) {
          const marker = markersRef.current[sensor.id];
          marker.setIcon(customIcon);
          marker.setPopupContent(popupContent);
        } else {
          const marker = L.marker([sensor.lat, sensor.lng], { icon: customIcon })
            .addTo(map)
            .bindPopup(popupContent, { minWidth: 200 });
          markersRef.current[sensor.id] = marker;
        }
      });
    }

    // E. Draw event markers (Always visible or in risk tab)
    events.forEach((event) => {
      const now = new Date().toISOString();
      const isActive = event.start_time <= now && now <= event.end_time;
      const markerColor = isActive ? '#ec4899' : '#94a3b8'; // pink if active, slate if scheduled
      const pulseClass = isActive ? 'animate-ping opacity-75' : '';
      const emoji = event.type === 'festival' ? '🎪' : event.type === 'rally' ? '📢' : event.type === 'concert' ? '🎵' : '🏆';

      const iconHtml = `
        <div class="relative flex items-center justify-center w-8 h-8">
          ${isActive ? `<span class="absolute inline-flex h-full w-full rounded-full bg-[${markerColor}] ${pulseClass}"></span>` : ''}
          <div class="relative w-7 h-7 rounded-full border border-slate-900 shadow-md flex items-center justify-center text-xs" 
               style="background-color: ${markerColor}; box-shadow: 0 0 10px ${markerColor}; color: white; display: flex; align-items: center; justify-content: center;">
            ${emoji}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-event-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const popupContent = `
        <div class="p-3 font-sans w-56 bg-slate-900 rounded-lg text-slate-200 text-left">
          <div class="text-[9px] uppercase font-bold tracking-wider text-pink-400 border-b border-slate-800 pb-1 mb-2">
            ${event.type.toUpperCase()} EVENT ${isActive ? '· ACTIVE NOW' : ''}
          </div>
          <div class="font-semibold text-white leading-tight">${event.name}</div>
          <div class="text-[11px] text-slate-500 mt-1">${event.zone_name}</div>
          <div class="mt-2 p-2 bg-slate-950 rounded text-center">
            <span class="text-xs text-slate-400 block font-medium">Expected Footfall</span>
            <span class="text-base font-bold text-white">${event.expected_footfall.toLocaleString()}</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-2">
            Start: ${new Date(event.start_time).toLocaleString()}<br/>
            End: ${new Date(event.end_time).toLocaleString()}
          </div>
        </div>
      `;

      if (eventMarkersRef.current[event.id]) {
        const marker = eventMarkersRef.current[event.id];
        marker.setIcon(customIcon);
        marker.setPopupContent(popupContent);
      } else {
        const marker = L.marker([event.lat, event.lng], { icon: customIcon })
          .addTo(map)
          .bindPopup(popupContent, { minWidth: 220 });
        eventMarkersRef.current[event.id] = marker;
      }
    });

    // F. Draw risk overlays (Risk Twin view)
    if (activeTab === 'risk' && showRiskOverlay) {
      riskSnapshots.forEach((snapshot) => {
        const center = ZONE_CENTERS[snapshot.zone_name];
        if (!center) return;

        const color = getRiskColor(snapshot.category);
        const circleStyles = {
          radius: 800,
          color: color,
          fillColor: color,
          fillOpacity: selectedZoneName === snapshot.zone_name ? 0.45 : 0.22,
          weight: selectedZoneName === snapshot.zone_name ? 3 : 1.5,
          dashArray: selectedZoneName === snapshot.zone_name ? '4,4' : undefined
        };

        if (circlesRef.current[snapshot.zone_name]) {
          const circle = circlesRef.current[snapshot.zone_name];
          circle.setStyle(circleStyles);
        } else {
          const circle = L.circle(center, circleStyles)
            .addTo(map)
            .on('click', () => {
              setSelectedZoneName(snapshot.zone_name);
              map.flyTo(center, 13, { duration: 1.0 });
            });
          circlesRef.current[snapshot.zone_name] = circle;
        }
      });
    }
  }, [sensors, readings, riskSnapshots, activeTypes, activeTab, showRiskOverlay, selectedZoneName, events]);

  const handleZoneSelect = (zoneName: string) => {
    setSelectedZoneName(zoneName);
    const center = ZONE_CENTERS[zoneName];
    const map = mapRef.current;
    if (map && center) {
      map.flyTo(center, 13, { duration: 1.0 });
    }
  };

  // Helper icons
  const renderTypeIcon = (type: string, className = "w-4 h-4") => {
    switch (type) {
      case 'rainfall': return <CloudRain className={`${className} text-blue-400`} />;
      case 'traffic': return <Car className={`${className} text-orange-400`} />;
      case 'aqi': return <Wind className={`${className} text-teal-400`} />;
      case 'water_level': return <Droplet className={`${className} text-purple-400`} />;
      default: return null;
    }
  };

  // Filtered sensors list
  const filteredSensors = sensors.filter(s => {
    if (!activeTypes[s.type]) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.zone_name.toLowerCase().includes(q);
    }
    return true;
  });

  // Hotspot metrics calculations
  const cityScore = riskSnapshots.length > 0 
    ? Math.round(riskSnapshots.reduce((acc, s) => acc + s.score, 0) / riskSnapshots.length)
    : 0;

  const cityCategory = getRiskCategory(cityScore);
  const sortedHotspots = [...riskSnapshots].sort((a, b) => b.score - a.score).slice(0, 5);
  const selectedSnapshot = riskSnapshots.find(s => s.zone_name === selectedZoneName);

  // Style helper classes based on Theme mode (Dark vs Light)
  const themeBg = isDarkMode ? 'bg-[#0b0f19] text-[#e2e8f0]' : 'bg-slate-50 text-slate-800';
  const themeCard = isDarkMode ? 'bg-[#111827] border-[#1f2937]' : 'bg-white border-slate-200 shadow-sm';
  const themeBorder = isDarkMode ? 'border-[#1f2937]' : 'border-slate-200';
  const themeTextMuted = isDarkMode ? 'text-gray-400' : 'text-slate-500';
  const themeTextBold = isDarkMode ? 'text-white' : 'text-slate-800';
  const themeTabActive = isDarkMode ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-900';
  const themeSidebar = isDarkMode ? 'bg-[#0c1220]/95' : 'bg-white/95 border-r';

  // ── Auth gate: show login page if no user ────────────────────────────────
  if (!user) {
    return (
      <LoginPage
        isDarkMode={isDarkMode}
        onLogin={(u) => setUser(u)}
      />
    );
  }

  return (
    <div className={`h-screen w-screen flex flex-row overflow-hidden ${themeBg} transition-colors duration-300`}>
      
      {/* 1. Left Sidebar */}
      <aside className={`w-96 min-w-[24rem] ${themeBorder} ${themeSidebar} flex flex-col h-full z-10 shadow-2xl`}>
        
        {/* Sidebar Header */}
        <header className={`p-5 ${themeBorder} border-b flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className={`absolute inline-flex h-3 w-3 rounded-full animate-ping opacity-75 ${isDemoMode ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isDemoMode ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            </div>
            <div>
              <h1 className={`text-xl font-bold tracking-tight ${themeTextBold} flex items-center gap-1.5`}>
                UrbanPulse 
                <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded ${isDemoMode ? 'bg-amber-500/10 text-amber-400' : 'bg-teal-500/10 text-teal-400'}`}>
                  {isDemoMode ? 'Demo' : 'Mumbai'}
                </span>
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Digital Twin Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* User pill */}
            <span className={`text-[9px] font-mono px-2 py-1 rounded border ${isDarkMode ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
              {user.role === 'operator' ? '⚡' : '👁'} {user.email.split('@')[0]}
            </span>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              title="Toggle theme"
              className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-slate-800 text-amber-400' : 'hover:bg-slate-100 text-slate-500'} transition-colors`}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => setIsAlertsOpen(!isAlertsOpen)}
              title="Toggle alerts drawer"
              className={`p-1.5 rounded-lg relative ${isDarkMode ? 'hover:bg-slate-800 text-gray-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'} transition-colors`}
            >
              <Bell className="w-4 h-4" />
              {alerts.length > 0 && (
                <span className="absolute top-1 right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </button>
            <button 
              onClick={() => isDemoMode ? triggerLocalDemoUpdates(sensors) : fetchRiskData()}
              title="Refresh statistics"
              className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-slate-800 text-gray-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'} transition-colors`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setUser(null)}
              title="Sign out"
              className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-slate-800 text-gray-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500'} transition-colors`}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* View Toggle Tabs */}
        <div className="px-5 pt-4 flex gap-1.5">
          <button 
            onClick={() => { setActiveTab('risk'); setIsRoutingMode(false); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-all duration-200 ${
              activeTab === 'risk' 
                ? `${themeTabActive} border-transparent` 
                : `bg-transparent border-transparent ${themeTextMuted} hover:text-white`
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Risk Twin View
          </button>
          <button 
            onClick={() => { setActiveTab('sensors'); setIsRoutingMode(false); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-all duration-200 ${
              activeTab === 'sensors' 
                ? `${themeTabActive} border-transparent` 
                : `bg-transparent border-transparent ${themeTextMuted} hover:text-white`
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Sensor Net View
          </button>
          <button 
            onClick={() => { setActiveTab('routing'); setIsRoutingMode(true); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-all duration-200 ${
              activeTab === 'routing' 
                ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/40' 
                : `bg-transparent border-transparent ${themeTextMuted} hover:text-cyan-300`
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Emergency Route
          </button>
          {/* Agent Console — Operator only, with pulsing dot badge */}
          {user.role === 'operator' && (
            <button 
              onClick={() => { setActiveTab('agent'); setIsRoutingMode(false); }}
              className={`flex-1 relative flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                activeTab === 'agent' 
                  ? 'bg-violet-600/30 text-violet-300 border-violet-500/40' 
                  : `bg-transparent border-transparent ${themeTextMuted} hover:text-violet-300`
              }`}
            >
              {/* Pulsing indicator dot */}
              <span className="relative flex h-2 w-2 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                  currentAgentStage !== 'idle' ? 'bg-violet-400' : 'bg-violet-600'
                } opacity-75`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  currentAgentStage !== 'idle' ? 'bg-violet-400' : 'bg-violet-700'
                }`} />
              </span>
              <Bot className="w-3.5 h-3.5" />
              Sentinel
            </button>
          )}
        </div>

        {/* ── TAB A: RISK TWIN VIEW ── */}
        {activeTab === 'risk' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Overall City Score Gauge */}
            <div className="p-5 flex flex-col gap-2 border-b border-slate-800/20">
              <div className={`p-4 rounded-xl border flex items-center justify-between ${themeCard}`}>
                <div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold font-mono">Overall City Risk</span>
                  <h3 className={`text-2xl font-bold mt-1 tracking-tight ${themeTextBold}`}>{cityScore} <span className="text-sm font-normal text-gray-500">/ 100</span></h3>
                  <p className="text-xs text-gray-400 mt-1 capitalize">{cityCategory} severity level</p>
                </div>
                
                {/* Visual score status gauge bar */}
                <div className="w-14 h-14 rounded-full border-4 border-slate-800 flex items-center justify-center relative font-mono text-sm font-bold" 
                     style={{ borderLeftColor: getRiskColor(cityCategory), borderTopColor: getRiskColor(cityCategory) }}>
                  {cityScore}
                </div>
              </div>

              {/* Toggle Risk Circles */}
              <label className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer hover:border-slate-600 transition-colors ${themeCard}`}>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold">Enable Zone Risk Heat Overlay</span>
                </div>
                <input 
                  type="checkbox"
                  checked={showRiskOverlay}
                  onChange={() => setShowRiskOverlay(!showRiskOverlay)}
                  className="rounded border-slate-700 bg-slate-800 text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
              </label>

              {/* Simulation Expansion Toggle */}
              <div className="space-y-2 mt-1">
                <button
                  onClick={() => setIsSimulationOpen(!isSimulationOpen)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold hover:border-slate-500 transition-colors ${themeCard}`}
                >
                  <div className="flex items-center gap-2">
                    <Sliders className={`w-4 h-4 text-pink-400 ${isSimulationPaused ? 'animate-pulse' : ''}`} />
                    <span>What-If Simulator Controller</span>
                  </div>
                  <span className="text-[10px] text-gray-500">{isSimulationOpen ? 'Collapse' : 'Expand'}</span>
                </button>
                {isSimulationOpen && (
                  <div className={`p-4 rounded-xl border border-dashed border-slate-800/60 mt-1`}>
                    <SimulationPanel
                      sensors={sensors}
                      isPaused={isSimulationPaused}
                      onToggleSimulation={handleToggleSimulation}
                      onInjectReadings={handleInjectReadings}
                      isDarkMode={isDarkMode}
                    />
                  </div>
                )}

                {/* Risk Weights Tuning Expansion Toggle */}
                <button
                  onClick={() => setIsWeightsOpen(!isWeightsOpen)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold hover:border-slate-500 transition-colors ${themeCard}`}
                >
                  <div className="flex items-center gap-2">
                    <ListFilter className="w-4 h-4 text-teal-400" />
                    <span>Risk Calculation Weights</span>
                  </div>
                  <span className="text-[10px] text-gray-500">{isWeightsOpen ? 'Collapse' : 'Expand'}</span>
                </button>
                {isWeightsOpen && (
                  <div className={`p-4 rounded-xl border border-dashed border-slate-800/60 mt-1 space-y-3.5`}>
                    <p className="text-[10px] text-gray-500">
                      Adjust how much each factor contributes to the rolling risk score:
                    </p>
                    {[
                      { id: 'rainfall', label: 'Rainfall Weight' },
                      { id: 'traffic', label: 'Traffic Weight' },
                      { id: 'aqi', label: 'Air Quality Weight' },
                      { id: 'water_level', label: 'Water Level Weight' },
                      { id: 'event', label: 'Event Weight' },
                    ].map((w) => (
                      <div key={w.id} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-gray-400 capitalize">{w.label}</span>
                          <span className="font-mono text-white font-bold">{weights[w.id]?.toFixed(2) ?? '0.00'}</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="1.0"
                          step="0.05"
                          value={weights[w.id] ?? 0.25}
                          onChange={(e) => handleWeightChange(w.id, Number(e.target.value))}
                          className="w-full accent-teal-500 h-1 bg-slate-850 rounded-lg cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ranked Hotspots */}
            <div className="flex-1 overflow-y-auto px-5 pb-5 flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-2 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-500" /> Top 5 Risk Hotspots
              </h3>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-teal-400 mb-2" />
                  <p className="text-sm">Calculating Zone Risks...</p>
                </div>
              ) : error ? (
                <div className="bg-red-950/40 border border-red-900/55 rounded-xl p-4.5 text-sm text-red-300 flex flex-col gap-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                    <p>{error}</p>
                  </div>
                  <button 
                    onClick={startDemoMode}
                    className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1"
                  >
                    Start in Demo Mode (Local Mock Data)
                  </button>
                </div>
              ) : riskSnapshots.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[#1f2937] rounded-xl text-gray-500 text-sm">
                  Calculating risk scores...
                </div>
              ) : (
                sortedHotspots.map((snapshot, index) => {
                  const isSelected = selectedZoneName === snapshot.zone_name;
                  const borderClass = isSelected ? 'border-teal-500 bg-teal-950/10' : themeBorder;
                  const scoreColor = getRiskColor(snapshot.category);
                  const historyPoints = riskHistory[snapshot.zone_name] || [];

                  return (
                    <div 
                      key={snapshot.zone_name}
                      onClick={() => handleZoneSelect(snapshot.zone_name)}
                      className={`p-3.5 rounded-xl border cursor-pointer hover:border-slate-500 transition-all flex flex-col gap-3 ${themeCard} ${borderClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono font-bold text-gray-500">#0{index + 1}</span>
                          <div>
                            <h4 className="text-sm font-bold text-white">{snapshot.zone_name}</h4>
                            <span className={`text-[9px] uppercase font-mono px-1 rounded inline-block mt-0.5 ${getRiskBgClass(snapshot.category)}`}>
                              {snapshot.category}
                            </span>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-lg font-bold" style={{ color: scoreColor }}>
                            {snapshot.score}
                          </div>
                          <span className="text-[9px] text-gray-500 block font-mono">index score</span>
                        </div>
                      </div>

                    {/* Sparkline & Details */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/40">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-gray-500 font-mono">Trend · Forecast</span>
                          {riskForecasts[snapshot.zone_name] && (
                            <span className={`text-[9px] font-mono font-bold ${
                              riskForecasts[snapshot.zone_name].trend === 'rising' ? 'text-red-400' :
                              riskForecasts[snapshot.zone_name].trend === 'falling' ? 'text-emerald-400' :
                              'text-gray-400'
                            }`}>
                              {riskForecasts[snapshot.zone_name].trend === 'rising' ? '↑ Rising' :
                               riskForecasts[snapshot.zone_name].trend === 'falling' ? '↓ Falling' : '→ Stable'}
                              {' '}~{riskForecasts[snapshot.zone_name].predicted[1]} in 30 min
                            </span>
                          )}
                        </div>
                        <Sparkline
                          data={historyPoints}
                          forecastData={riskForecasts[snapshot.zone_name]?.sparkline_forecast}
                          color={scoreColor}
                          width={110}
                          height={24}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── TAB B: SENSOR NET VIEW ── */}
        {activeTab === 'sensors' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Filter Layers */}
            <div className="p-5 border-b border-slate-800/40">
              <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-3 flex items-center gap-1.5">
                <ListFilter className="w-3.5 h-3.5" /> Active Sensors Toggles
              </h3>
              <div className="space-y-2">
                {[
                  { id: 'rainfall', label: 'Rainfall Gauges', colorClass: 'border-l-4 border-blue-500' },
                  { id: 'traffic', label: 'Traffic Density Cam', colorClass: 'border-l-4 border-orange-500' },
                  { id: 'aqi', label: 'Air Quality Stn', colorClass: 'border-l-4 border-teal-500' },
                  { id: 'water_level', label: 'Water / Flood Level', colorClass: 'border-l-4 border-purple-500' },
                ].map((layer) => (
                  <label 
                    key={layer.id} 
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer hover:border-slate-700 transition-colors ${themeCard} ${layer.colorClass}`}
                  >
                    <div className="flex items-center gap-2">
                      {renderTypeIcon(layer.id, "w-4 h-4")}
                      <span className="text-xs font-semibold">{layer.label}</span>
                    </div>
                    <input 
                      type="checkbox"
                      checked={activeTypes[layer.id]}
                      onChange={() => setActiveTypes(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                      className="rounded border-slate-700 bg-slate-800 text-teal-600 focus:ring-teal-500 w-4 h-4"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="px-5 pt-4 pb-2">
              <input 
                type="text"
                placeholder="Search sensors or zones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-xs text-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 transition-colors"
              />
            </div>

            {/* Sensors List */}
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-teal-400 mb-2" />
                  <p className="text-sm">Fetching sensors...</p>
                </div>
              ) : (
                filteredSensors.map((sensor) => {
                  const reading = readings[sensor.id];
                  const value = reading ? reading.value : 0;
                  const severity = reading ? getSeverity(sensor.type, value) : 'green';
                  const indicatorDot = 
                    severity === 'red' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 
                    severity === 'yellow' ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : 
                    'bg-emerald-500 shadow-[0_0_8px_#10b981]';

                  return (
                    <div 
                      key={sensor.id}
                      onClick={() => handleZoneSelect(sensor.zone_name)}
                      className={`border rounded-xl p-3 cursor-pointer hover:border-slate-600 transition-all flex items-center justify-between ${themeCard}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-[#1f2937] rounded-lg">
                          {renderTypeIcon(sensor.type, "w-3.5 h-3.5")}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white line-clamp-1">{sensor.name}</h4>
                          <span className="text-[10px] text-gray-500">{sensor.zone_name}</span>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-3">
                        <div>
                          <div className="text-xs font-bold">
                            {reading ? `${value} ` : '—'}
                            <span className="text-[9px] font-normal text-gray-500">{getUnit(sensor.type)}</span>
                          </div>
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${indicatorDot}`} />
                            {reading && (
                              <span className={`text-[8px] font-mono font-bold uppercase tracking-wider scale-90 origin-right ${
                                reading.data_source === 'live' ? 'text-emerald-500' : 'text-amber-500'
                              }`}>
                                {reading.data_source ?? 'mock'}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent map pan/zoom
                            setSelectedSensorHistory(sensor);
                          }}
                          title="View detailed sensor telemetry history"
                          className="p-1 rounded hover:bg-slate-800/60 text-slate-500 hover:text-teal-400 transition-colors"
                        >
                          <Activity className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── TAB C: EMERGENCY ROUTE OPTIMIZER ── */}
        {activeTab === 'routing' && (
          <div className="flex-1 flex flex-col overflow-y-auto">

            {/* Header banner */}
            <div className={`p-5 border-b ${isDarkMode ? 'border-slate-800/40' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Emergency Route Optimizer</h3>
              </div>
              <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Risk-aware routing using live OSM road network. Routes automatically avoid flood-closed zones and penalise high-risk areas.
              </p>

              {/* Graph status badge */}
              <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-mono ${
                graphReady
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${graphReady ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'}`} />
                {isDemoMode
                  ? '✓ Demo graph ready (Greater Mumbai network)'
                  : graphReady
                    ? '✓ OSM road graph loaded — real road network active'
                    : '⏳ Loading road network from OpenStreetMap…'}
              </div>
            </div>
            <div className={`p-5 border-b ${isDarkMode ? 'border-slate-800/40' : 'border-slate-200'}`}>
              <h4 className={`text-[10px] uppercase font-bold tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Emergency Routing Coordinates
              </h4>
              <p className="text-[10px] text-slate-500 mb-3">
                Click two points on the map to route, or type coordinates below. Press Enter to apply.
              </p>
              
              <div className="space-y-3">
                {/* Origin A Panel */}
                <div className={`p-3 rounded-lg space-y-2 border ${
                  isDarkMode 
                    ? 'bg-slate-800/40 border-slate-700/50' 
                    : 'bg-slate-100 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">A</span>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Origin
                      </span>
                    </div>
                    {routeFrom && (
                      <button 
                        onClick={clearOrigin}
                        className="text-[10px] text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                        title="Remove Origin"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Latitude</label>
                      <input 
                        type="number"
                        step="any"
                        placeholder="Click map..."
                        value={tempLatA}
                        onChange={(e) => setTempLatA(e.target.value)}
                        onBlur={handleApplyA}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyA()}
                        className={`w-full text-xs px-2 py-1 rounded border transition-colors ${
                          isDarkMode 
                            ? 'bg-slate-900 border-slate-700 text-white focus:border-cyan-500 focus:outline-none' 
                            : 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500 focus:outline-none'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Longitude</label>
                      <input 
                        type="number"
                        step="any"
                        placeholder="Click map..."
                        value={tempLngA}
                        onChange={(e) => setTempLngA(e.target.value)}
                        onBlur={handleApplyA}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyA()}
                        className={`w-full text-xs px-2 py-1 rounded border transition-colors ${
                          isDarkMode 
                            ? 'bg-slate-900 border-slate-700 text-white focus:border-cyan-500 focus:outline-none' 
                            : 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500 focus:outline-none'
                        }`}
                      />
                    </div>
                  </div>
                  {!routeFrom && (
                    <p className="text-[10px] text-amber-400/90 italic">Click on map or type above to set origin</p>
                  )}
                </div>

                {/* Destination B Panel */}
                <div className={`p-3 rounded-lg space-y-2 border ${
                  isDarkMode 
                    ? 'bg-slate-800/40 border-slate-700/50' 
                    : 'bg-slate-100 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-bold">B</span>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Destination
                      </span>
                    </div>
                    {routeTo && (
                      <button 
                        onClick={clearDestination}
                        className="text-[10px] text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                        title="Remove Destination"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Latitude</label>
                      <input 
                        type="number"
                        step="any"
                        placeholder="Click map..."
                        value={tempLatB}
                        onChange={(e) => setTempLatB(e.target.value)}
                        onBlur={handleApplyB}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyB()}
                        className={`w-full text-xs px-2 py-1 rounded border transition-colors ${
                          isDarkMode 
                            ? 'bg-slate-900 border-slate-700 text-white focus:border-cyan-500 focus:outline-none' 
                            : 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500 focus:outline-none'
                        }`}
                        disabled={!routeFrom}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Longitude</label>
                      <input 
                        type="number"
                        step="any"
                        placeholder="Click map..."
                        value={tempLngB}
                        onChange={(e) => setTempLngB(e.target.value)}
                        onBlur={handleApplyB}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyB()}
                        className={`w-full text-xs px-2 py-1 rounded border transition-colors ${
                          isDarkMode 
                            ? 'bg-slate-900 border-slate-700 text-white focus:border-cyan-500 focus:outline-none' 
                            : 'bg-white border-slate-300 text-slate-800 focus:border-cyan-500 focus:outline-none'
                        }`}
                        disabled={!routeFrom}
                      />
                    </div>
                  </div>
                  {!routeTo && (
                    <p className="text-[10px] text-slate-400 italic">
                      {routeFrom ? 'Click on map or type above to set destination' : 'Set origin first'}
                    </p>
                  )}
                </div>
              </div>

              {/* Controls row */}
              <div className="flex gap-2 mt-4">
                {(routeFrom || routeTo) && (
                  <button
                    onClick={clearRoute}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                      isDarkMode
                        ? 'border-slate-600 text-slate-400 hover:text-white hover:border-slate-400'
                        : 'border-slate-300 text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Clear All
                  </button>
                )}
                {routeFrom && routeTo && (
                  <button
                    onClick={() => fetchRoute(routeFrom!, routeTo!)}
                    disabled={routeLoading}
                    className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50"
                  >
                    Recalculate
                  </button>
                )}
              </div>
            </div>

            {/* Route result card */}
            {routeLoading && (
              <div className="p-5 flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Computing optimal route…</p>
              </div>
            )}

            {routeError && !routeLoading && (
              <div className="p-5">
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <p className="text-xs text-red-400 font-semibold">⚠ Route Error</p>
                  <p className="text-[11px] text-red-300 mt-1">{routeError}</p>
                </div>
              </div>
            )}

            {routeResult && !routeLoading && (
              <div className="p-5 space-y-3">
                {/* ETA / Distance row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-800/60 border-slate-700/40' : 'bg-slate-50 border-slate-200'}`}>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold font-mono">Distance</p>
                    <p className={`text-xl font-bold mt-1 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                      {(routeResult.distanceM / 1000).toFixed(2)}
                      <span className="text-sm font-normal text-slate-500"> km</span>
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-800/60 border-slate-700/40' : 'bg-slate-50 border-slate-200'}`}>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold font-mono">ETA</p>
                    <p className={`text-xl font-bold mt-1 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                      {routeResult.estimatedMinutes}
                      <span className="text-sm font-normal text-slate-500"> min</span>
                    </p>
                  </div>
                </div>

                {/* Route warning */}
                {routeResult.routeWarning && (
                  <div className={`p-3 rounded-lg border ${
                    routeResult.blockedZones.length > 0
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-amber-500/10 border-amber-500/30'
                  }`}>
                    <p className={`text-[11px] font-semibold ${
                      routeResult.blockedZones.length > 0 ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {routeResult.blockedZones.length > 0 ? '🚫 Flood Detour Applied' : '⚠ Risk Zones Detected'}
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">{routeResult.routeWarning}</p>
                  </div>
                )}

                {/* Blocked zones */}
                {routeResult.blockedZones.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Flood-Closed Zones (Blocked)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {routeResult.blockedZones.map(z => (
                        <span key={z} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                          {z}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Penalized zones */}
                {routeResult.penalizedZones.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Elevated-Risk Zones (Slowed)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {routeResult.penalizedZones.map(z => (
                        <span key={z} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {z}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Path waypoints */}
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                    Route waypoints ({routeResult.coordinates.length} nodes)
                  </p>
                  <div className={`max-h-32 overflow-y-auto rounded-lg border px-3 py-2 space-y-1 ${isDarkMode ? 'border-slate-700/40 bg-slate-900/30' : 'border-slate-200 bg-slate-50'}`}>
                    {routeResult.coordinates.slice(0, 8).map(([lat, lng], i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[8px] font-mono">{i+1}</span>
                        <span className="text-[10px] font-mono text-slate-500">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
                      </div>
                    ))}
                    {routeResult.coordinates.length > 8 && (
                      <p className="text-[10px] text-slate-600 text-center">… +{routeResult.coordinates.length - 8} more</p>
                    )}
                  </div>
                </div>

                {/* Auto-reroute note */}
                <p className="text-[10px] text-slate-600 text-center italic">
                  Route auto-updates when zone risk changes via simulator ↺
                </p>
              </div>
            )}

            {/* Empty state */}
            {!routeFrom && !routeLoading && !routeResult && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <ShieldAlert className="w-7 h-7 text-cyan-500/60" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-700'}`}>Ready for Emergency Routing</p>
                  <p className="text-xs text-slate-500 mt-1">Click any two points on the map to compute a risk-aware emergency route</p>
                </div>
                <div className={`text-[10px] px-4 py-2 rounded-lg border ${isDarkMode ? 'border-slate-700 text-slate-500 bg-slate-800/40' : 'border-slate-200 text-slate-400 bg-slate-50'}`}>
                  💡 Try with What-If Simulator: flood a zone, then route through it
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── TAB D: SENTINEL AGENT CONSOLE ── */}
        {activeTab === 'agent' && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className={`p-5 border-b ${isDarkMode ? 'border-slate-800/40' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Bot className="w-4 h-4 text-violet-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-violet-400">Sentinel Agent</h3>
                <span className="relative flex h-2 w-2 ml-1">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                    currentAgentStage !== 'idle' ? 'bg-violet-400' : 'bg-violet-700'
                  } opacity-75`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                    currentAgentStage !== 'idle' ? 'bg-violet-400' : 'bg-violet-800'
                  }`} />
                </span>
              </div>
              <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Autonomous perceive → reason → act → learn loop. The full console is shown in the main panel.
              </p>
              <div className={`mt-3 px-3 py-2 rounded-lg text-[11px] font-mono border ${
                currentAgentStage !== 'idle'
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                  : 'bg-slate-800/40 border-slate-700/50 text-slate-400'
              }`}>
                Stage: <span className="font-bold capitalize">{currentAgentStage}</span>
              </div>
            </div>
          </div>
        )}

      </aside>

      {/* 2. Map Viewport (hidden when Agent Console is active) */}
      <main className="flex-1 h-full w-full relative z-0" style={{ display: activeTab === 'agent' ? 'none' : undefined }}>
        <div ref={mapContainerRef} className="h-full w-full" />

        {/* Floating Side Drawer for Selected Zone details */}
        {selectedZoneName && selectedSnapshot && (
          <div className="absolute right-5 top-5 w-80 bg-slate-950/95 border border-slate-800 rounded-2xl p-5 shadow-2xl z-[1000] backdrop-filter backdrop-blur-md flex flex-col gap-4 animate-in fade-in slide-in-from-right-5 duration-200">
            
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-mono">Zone Inspector</span>
                <h2 className="text-lg font-bold text-white">{selectedZoneName}</h2>
              </div>
              <button 
                onClick={() => setSelectedZoneName(null)}
                className="text-xs font-semibold bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-white text-gray-400 px-2.5 py-1 rounded-lg"
              >
                Close
              </button>
            </div>

            {/* Risk Index Overview */}
            <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
              <div>
                <span className="text-xs text-gray-400 font-medium">Risk Score</span>
                <div className="text-2xl font-black text-white mt-0.5">
                  {selectedSnapshot.score}
                  <span className="text-xs font-normal text-slate-500"> / 100</span>
                </div>
              </div>
              <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded ${getRiskBgClass(selectedSnapshot.category)}`}>
                {selectedSnapshot.category}
              </span>
            </div>

            {/* Human Readable Explanation */}
            <div className="bg-teal-950/10 border border-teal-900/30 rounded-xl p-3.5">
              <div className="flex gap-2">
                <ShieldAlert className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <p className="text-xs text-teal-200 leading-relaxed font-medium">
                  {selectedSnapshot.factors.explanation || "Risk levels normal for this zone."}
                </p>
              </div>
            </div>

            {/* Contributing factors progress bars */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Contributing Factors</h4>
              
              {[
                { id: 'rainfall', label: 'Rainfall', max: 80, unit: 'mm/hr' },
                { id: 'traffic', label: 'Traffic Density', max: 100, unit: '%' },
                { id: 'aqi', label: 'Air Pollution (AQI)', max: 400, unit: 'AQI' },
                { id: 'water_level', label: 'Water Level', max: 100, unit: 'cm' },
                { id: 'event', label: 'Event Footfall', max: 50000, unit: 'people' },
              ].map((factor) => {
                const val = selectedSnapshot.factors[factor.id as keyof typeof selectedSnapshot.factors] as number | undefined;
                if (factor.id === 'event' && !val) return null; // Only show event factor if active/greater than 0
                const percentage = val !== undefined ? Math.min((val / factor.max) * 100, 100) : 0;
                
                return (
                  <div key={factor.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">{factor.label}</span>
                      <span className="font-semibold text-white font-mono">
                        {val !== undefined 
                          ? factor.id === 'event' 
                            ? `${val.toLocaleString()} ${factor.unit}` 
                            : `${val} ${factor.unit}` 
                          : 'no data'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-teal-500 rounded-full transition-all duration-500" 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* AI Recommendations */}
            <div className="space-y-2 border-t border-slate-800/60 pt-3">
              <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">AI Recommendations</h4>
              <div className="space-y-1.5">
                {(selectedSnapshot.factors.recommendations || []).map((rec: any, i: number) => (
                  <div key={i} className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-300 text-left">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded tracking-wider ${
                        rec.priority === 'high' ? 'bg-red-950/40 text-red-400 border border-red-900/40' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {rec.priority} Priority
                      </span>
                      <span className="text-[8px] text-slate-500 font-medium italic">via {rec.trigger}</span>
                    </div>
                    <p className="text-xs text-gray-200 leading-normal">{rec.text}</p>
                  </div>
                ))}
                {(!selectedSnapshot.factors.recommendations || selectedSnapshot.factors.recommendations.length === 0) && (
                  <p className="text-[11px] text-slate-500 italic text-left">No special actions recommended at this time.</p>
                )}
              </div>
            </div>

            {/* Historical Trend + Forecast sparkline */}
            <div className="border-t border-slate-800/60 pt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Trend + Forecast</span>
                {riskForecasts[selectedZoneName] && (
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold font-mono ${
                      riskForecasts[selectedZoneName].trend === 'rising' ? 'text-red-400' :
                      riskForecasts[selectedZoneName].trend === 'falling' ? 'text-emerald-400' :
                      'text-gray-400'
                    }`}>
                      {riskForecasts[selectedZoneName].trend === 'rising' ? '↑ Rising' :
                       riskForecasts[selectedZoneName].trend === 'falling' ? '↓ Falling' : '→ Stable'}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      riskForecasts[selectedZoneName].confidence === 'high' ? 'bg-emerald-900/40 text-emerald-400' :
                      riskForecasts[selectedZoneName].confidence === 'medium' ? 'bg-amber-900/40 text-amber-400' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {riskForecasts[selectedZoneName].confidence} confidence
                    </span>
                  </div>
                )}
              </div>
              <div className="bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex items-center justify-center">
                <Sparkline
                  data={riskHistory[selectedZoneName] || []}
                  forecastData={riskForecasts[selectedZoneName]?.sparkline_forecast}
                  color={getRiskColor(selectedSnapshot.category)}
                  width={240}
                  height={55}
                />
              </div>
              {riskForecasts[selectedZoneName] && (
                <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                  {riskForecasts[selectedZoneName].horizon_minutes.map((min, i) => (
                    <div key={min} className="bg-slate-900/50 border border-slate-800/60 rounded-lg p-2 text-center">
                      <span className="text-[9px] text-slate-500 block font-mono">+{min} min</span>
                      <span className="text-sm font-bold text-white block">{riskForecasts[selectedZoneName].predicted[i]}</span>
                      <span className="text-[8px] text-slate-600 font-mono">
                        {riskForecasts[selectedZoneName].lower[i]}–{riskForecasts[selectedZoneName].upper[i]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </main>

      {/* 3. Agent Console — full viewport panel (shown instead of map when agent tab active) */}
      {activeTab === 'agent' && (
        <div className={`flex-1 h-full overflow-hidden ${isDarkMode ? 'bg-[#0b0f19]' : 'bg-slate-50'}`}>
          <AgentConsolePage isDarkMode={isDarkMode} />
        </div>
      )}

      {/* Real-time Alerts Drawer */}
      <NotificationDrawer
        alerts={alerts}
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        onClear={() => setAlerts([])}
        onSelectZone={handleZoneSelect}
        isDarkMode={isDarkMode}
      />

      {/* Sensor telemetry history modal */}
      <SensorHistoryModal
        sensor={selectedSensorHistory}
        isOpen={selectedSensorHistory !== null}
        onClose={() => setSelectedSensorHistory(null)}
        isDarkMode={isDarkMode}
      />

    </div>
  );
}
