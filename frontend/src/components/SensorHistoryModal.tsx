import { useEffect, useState } from 'react';
import { X, RefreshCw, Activity, Calendar } from 'lucide-react';
import { getUnit, getSensorLabel, getSeverity } from '../utils/severity';

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
  value: number;
  recorded_at: string;
  data_source?: 'live' | 'mock';
}

interface SensorHistoryModalProps {
  sensor: Sensor | null;
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

export default function SensorHistoryModal({
  sensor,
  isOpen,
  onClose,
  isDarkMode,
}: SensorHistoryModalProps) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !sensor) return;
    const currentSensor = sensor;

    async function fetchSensorHistory() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sensors/${currentSensor.id}/readings?limit=30`);
        if (!res.ok) throw new Error('Failed to load sensor history');
        const data = await res.json();
        // Backend returns in desc order (newest first). Let's reverse for chronological plotting
        setReadings((data.readings || []).reverse());
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchSensorHistory();
  }, [sensor, isOpen]);

  if (!isOpen || !sensor) return null;

  const width = 450;
  const height = 180;
  const padding = 35;

  const values = readings.map((r) => r.value);
  const maxVal = values.length > 0 ? Math.max(...values) : 100;
  const minVal = 0;
  const range = maxVal - minVal || 1;

  // Generate SVG path points
  const points = readings
    .map((r, idx) => {
      const x = padding + (idx / (readings.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - ((r.value - minVal) / range) * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const areaPoints = readings.length > 0
    ? `${points} ${width - padding},${height - padding} ${padding},${height - padding}`
    : '';

  const themeBg = isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200 shadow-2xl';
  const themeText = isDarkMode ? 'text-white' : 'text-slate-800';
  const themeCard = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const themeLabel = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[2000] p-4">
      <div className={`w-full max-w-lg rounded-2xl border p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-150 ${themeBg}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/40 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-900 rounded-lg text-teal-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-mono">
                {getSensorLabel(sensor.type)} Sensor telemetry
              </span>
              <h2 className={`text-base font-bold leading-tight ${themeText}`}>{sensor.name}</h2>
              <span className="text-[10px] text-gray-500">{sensor.zone_name} Zone</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800/40 text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chart Content */}
        <div className={`p-4 rounded-xl border flex flex-col justify-center items-center ${themeCard}`}>
          {loading ? (
            <div className="py-16 text-gray-500 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-teal-500" />
              Loading history points...
            </div>
          ) : error ? (
            <div className="py-16 text-red-400 text-xs text-center">{error}</div>
          ) : readings.length < 2 ? (
            <div className="py-16 text-gray-500 text-xs text-center">
              Insufficient historical points. Waiting for readings to register...
            </div>
          ) : (
            <div className="w-full space-y-3">
              <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  Telemetry (Last 30 cycles)
                </span>
                <span>Peak: {maxVal.toFixed(1)} {getUnit(sensor.type)}</span>
              </div>

              {/* SVG Area Chart */}
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible select-none">
                <defs>
                  <linearGradient id="sensorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Gridlines */}
                {[0, 0.5, 1].map((ratio) => {
                  const y = padding + ratio * (height - 2 * padding);
                  const val = maxVal - ratio * range;
                  return (
                    <g key={ratio} className="opacity-15">
                      <line
                        x1={padding}
                        y1={y}
                        x2={width - padding}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeWidth="0.8"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padding - 8}
                        y={y + 3}
                        fill="#e2e8f0"
                        fontSize="9"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {val.toFixed(0)}
                      </text>
                    </g>
                  );
                })}

                {/* Bottom X-axis line */}
                <line
                  x1={padding}
                  y1={height - padding}
                  x2={width - padding}
                  y2={height - padding}
                  stroke="#475569"
                  strokeWidth="0.8"
                  className="opacity-40"
                />

                {/* Chart Area Fill */}
                <polygon points={areaPoints} fill="url(#sensorGrad)" />

                {/* Chart Stroke Line */}
                <polyline
                  fill="none"
                  stroke="#14b8a6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />

                {/* Latest value dot */}
                {readings.length > 0 && (
                  <circle
                    cx={padding + (width - 2 * padding)}
                    cy={height - padding - ((values[values.length - 1] - minVal) / range) * (height - 2 * padding)}
                    r="3.5"
                    fill="#14b8a6"
                    className="animate-pulse"
                  />
                )}
              </svg>

              {/* Telemetry Footer */}
              <div className="flex items-center justify-between pt-1 text-[10px] text-gray-500 font-mono">
                <span>{new Date(readings[0].recorded_at).toLocaleTimeString()}</span>
                <span>{new Date(readings[readings.length - 1].recorded_at).toLocaleTimeString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Sensor details cards */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className={`p-3 rounded-xl border flex flex-col justify-between ${themeCard}`}>
            <div>
              <span className={`text-[10px] font-bold block ${themeLabel}`}>Current Value</span>
              <div className="text-base font-extrabold mt-1">
                {latestReading 
                  ? `${latestReading.value.toFixed(1)} ${getUnit(sensor.type)}`
                  : 'No reading'}
              </div>
            </div>
            {latestReading && (
              <span className={`self-start mt-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase ${
                latestReading.data_source === 'live'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {latestReading.data_source ?? 'mock'} data
              </span>
            )}
          </div>
          <div className={`p-3 rounded-xl border ${themeCard}`}>
            <span className={`text-[10px] font-bold block ${themeLabel}`}>Current Severity</span>
            <div className="mt-1">
              {latestReading ? (
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold ${
                  getSeverity(sensor.type, latestReading.value) === 'red'
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : getSeverity(sensor.type, latestReading.value) === 'yellow'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {getSeverity(sensor.type, latestReading.value)}
                </span>
              ) : '—'}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
