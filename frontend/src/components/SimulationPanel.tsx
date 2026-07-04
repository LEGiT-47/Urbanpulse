import { useState } from 'react';
import { Play, Pause, Thermometer, CloudRain, Car, Wind, Droplet, Send, RefreshCw } from 'lucide-react';
import { getUnit, getSensorLabel } from '../utils/severity';

interface Sensor {
  id: string;
  name: string;
  type: 'rainfall' | 'traffic' | 'aqi' | 'water_level';
  lat: number;
  lng: number;
  zone_name: string;
}

interface SimulationPanelProps {
  sensors: Sensor[];
  isPaused: boolean;
  onToggleSimulation: (pause: boolean) => Promise<void>;
  onInjectReadings: (readings: Array<{ sensor_id: string; value: number }>) => Promise<void>;
  isDarkMode: boolean;
}

export default function SimulationPanel({
  sensors,
  isPaused,
  onToggleSimulation,
  onInjectReadings,
  isDarkMode,
}: SimulationPanelProps) {
  const [selectedSensorId, setSelectedSensorId] = useState<string>('');
  const [injectValue, setInjectValue] = useState<number>(0);
  const [injecting, setInjecting] = useState(false);

  const selectedSensor = sensors.find((s) => s.id === selectedSensorId);

  // Set appropriate ranges for slider based on sensor type
  const getRanges = (type: string) => {
    switch (type) {
      case 'rainfall': return { min: 0, max: 80, step: 1 };
      case 'traffic': return { min: 0, max: 100, step: 1 };
      case 'aqi': return { min: 50, max: 400, step: 5 };
      case 'water_level': return { min: 0, max: 100, step: 1 };
      default: return { min: 0, max: 100, step: 1 };
    }
  };

  const currentRanges = selectedSensor ? getRanges(selectedSensor.type) : { min: 0, max: 100, step: 1 };

  // Preset Scenarios
  const triggerScenario = async (scenario: 'cloudburst' | 'rushhour' | 'smog' | 'clear') => {
    setInjecting(true);
    try {
      // First ensure simulation mode is active (generator paused)
      if (!isPaused && scenario !== 'clear') {
        await onToggleSimulation(true);
      } else if (isPaused && scenario === 'clear') {
        await onToggleSimulation(false);
      }

      const readingsToInject: Array<{ sensor_id: string; value: number }> = [];

      sensors.forEach((s) => {
        if (scenario === 'cloudburst') {
          // Sion, Dadar, Kurla, Mahim receive extreme rainfall + rising water levels
          if (['Sion', 'Dadar', 'Kurla', 'Mahim', 'Borivali'].includes(s.zone_name)) {
            if (s.type === 'rainfall') readingsToInject.push({ sensor_id: s.id, value: 75 + Math.random() * 5 }); // 75-80 mm/hr
            if (s.type === 'water_level') readingsToInject.push({ sensor_id: s.id, value: 85 + Math.random() * 10 }); // 85-95 cm
          } else {
            // Other areas get moderate rain
            if (s.type === 'rainfall') readingsToInject.push({ sensor_id: s.id, value: 20 + Math.random() * 10 });
          }
        } else if (scenario === 'rushhour') {
          // Traffic sensors spike up to gridlock
          if (s.type === 'traffic') {
            const highTrafficZones = ['Andheri', 'Bandra', 'Dadar', 'Kurla', 'Goregaon'];
            const val = highTrafficZones.includes(s.zone_name)
              ? 92 + Math.random() * 8 // 92-100% density
              : 60 + Math.random() * 20; // 60-80%
            readingsToInject.push({ sensor_id: s.id, value: Math.round(val) });
          }
        } else if (scenario === 'smog') {
          // AQI monitors spike to hazardous levels
          if (s.type === 'aqi') {
            const indZones = ['Chembur', 'Vikhroli', 'Kalbadevi', 'Andheri', 'Goregaon'];
            const val = indZones.includes(s.zone_name)
              ? 350 + Math.random() * 50 // 350-400 AQI
              : 200 + Math.random() * 50; // 200-250 AQI
            readingsToInject.push({ sensor_id: s.id, value: Math.round(val) });
          }
        }
      });

      if (readingsToInject.length > 0) {
        await onInjectReadings(readingsToInject);
      }
    } catch (e) {
      console.error('Failed to run scenario:', e);
    } finally {
      setInjecting(false);
    }
  };

  const handleInjectSingle = async () => {
    if (!selectedSensorId) return;
    setInjecting(true);
    try {
      // Pause automatic generator if not already paused
      if (!isPaused) {
        await onToggleSimulation(true);
      }
      await onInjectReadings([{ sensor_id: selectedSensorId, value: injectValue }]);
    } catch (e) {
      console.error(e);
    } finally {
      setInjecting(false);
    }
  };

  const renderTypeIcon = (type: string, className = "w-3 h-3") => {
    switch (type) {
      case 'rainfall': return <CloudRain className={`${className} text-blue-400`} />;
      case 'traffic': return <Car className={`${className} text-orange-400`} />;
      case 'aqi': return <Wind className={`${className} text-teal-400`} />;
      case 'water_level': return <Droplet className={`${className} text-purple-400`} />;
      default: return null;
    }
  };

  const themeText = isDarkMode ? 'text-white' : 'text-slate-800';
  const themeCard = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const themeLabel = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="space-y-4">
      {/* Simulation Master Controller */}
      <div className={`p-4 rounded-xl border flex items-center justify-between ${themeCard}`}>
        <div>
          <h4 className={`text-xs font-bold uppercase tracking-wider ${themeText} flex items-center gap-1.5`}>
            <Thermometer className="w-3.5 h-3.5 text-pink-500 animate-pulse" /> What-If Simulator
          </h4>
          <p className="text-[10px] text-gray-500 mt-1">
            {isPaused 
              ? 'Simulation Active — Automatic drift generation paused.' 
              : 'Live Mode — Sensors generated automatically.'}
          </p>
        </div>

        <button
          onClick={() => onToggleSimulation(!isPaused)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            isPaused
              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_10px_rgba(217,119,6,0.3)]'
              : 'bg-slate-800 hover:bg-slate-700 text-gray-300'
          }`}
        >
          {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          {isPaused ? 'Resume Live' : 'Pause Loop'}
        </button>
      </div>

      {/* Preset Disaster Scenarios */}
      <div className="space-y-2">
        <span className={`text-[10px] uppercase font-bold tracking-wider block ${themeLabel}`}>Pre-Defined Disasters</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => triggerScenario('cloudburst')}
            disabled={injecting}
            className="flex items-center justify-center gap-1.5 bg-blue-950/20 hover:bg-blue-900/30 border border-blue-900/40 text-blue-400 hover:text-blue-300 font-bold py-2 px-2 rounded-lg text-xs transition-all disabled:opacity-50"
          >
            <CloudRain className="w-3.5 h-3.5" />
            Monsoon Cloudburst
          </button>
          <button
            onClick={() => triggerScenario('rushhour')}
            disabled={injecting}
            className="flex items-center justify-center gap-1.5 bg-orange-950/20 hover:bg-orange-900/30 border border-orange-900/40 text-orange-400 hover:text-orange-300 font-bold py-2 px-2 rounded-lg text-xs transition-all disabled:opacity-50"
          >
            <Car className="w-3.5 h-3.5" />
            Evening Rush Hour
          </button>
          <button
            onClick={() => triggerScenario('smog')}
            disabled={injecting}
            className="flex items-center justify-center gap-1.5 bg-teal-950/20 hover:bg-teal-900/30 border border-teal-900/40 text-teal-400 hover:text-teal-300 font-bold py-2 px-2 rounded-lg text-xs transition-all disabled:opacity-50"
          >
            <Wind className="w-3.5 h-3.5" />
            Severe Smog Crisis
          </button>
          <button
            onClick={() => triggerScenario('clear')}
            disabled={injecting}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-gray-300 font-bold py-2 px-2 rounded-lg text-xs transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${injecting ? 'animate-spin' : ''}`} />
            Reset all (Resume)
          </button>
        </div>
      </div>

      {/* Manual Sensor Value Injector */}
      <div className={`p-4 rounded-xl border space-y-3.5 ${themeCard}`}>
        <span className={`text-[10px] uppercase font-bold tracking-wider block ${themeLabel}`}>Inject Custom Sensor Value</span>

        {/* Sensor Selector */}
        <div className="space-y-1">
          <label className={`text-[10px] font-semibold block ${themeLabel}`}>Select Sensor</label>
          <select
            value={selectedSensorId}
            onChange={(e) => {
              setSelectedSensorId(e.target.value);
              const sensor = sensors.find((s) => s.id === e.target.value);
              if (sensor) {
                setInjectValue(getRanges(sensor.type).min);
              }
            }}
            className={`w-full text-xs rounded-lg px-3 py-2 border bg-slate-950 text-white focus:outline-none focus:border-teal-500 transition-colors border-slate-800`}
          >
            <option value="">-- Choose a Sensor --</option>
            {sensors.map((s) => (
              <option key={s.id} value={s.id}>
                [{s.zone_name}] {getSensorLabel(s.type)} - {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Value Slider */}
        {selectedSensor && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className={`flex items-center gap-1.5 ${themeLabel}`}>
                {renderTypeIcon(selectedSensor.type)}
                Value to Inject
              </span>
              <span className={`${themeText} font-mono`}>
                {injectValue} {getUnit(selectedSensor.type)}
              </span>
            </div>
            <input
              type="range"
              min={currentRanges.min}
              max={currentRanges.max}
              step={currentRanges.step}
              value={injectValue}
              onChange={(e) => setInjectValue(Number(e.target.value))}
              className="w-full accent-teal-500 h-1 bg-slate-850 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-gray-500 font-mono">
              <span>{currentRanges.min}</span>
              <span>{currentRanges.max}</span>
            </div>

            <button
              onClick={handleInjectSingle}
              disabled={injecting}
              className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-teal-500/10 disabled:opacity-50"
            >
              {injecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
              Inject Simulated Value
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
