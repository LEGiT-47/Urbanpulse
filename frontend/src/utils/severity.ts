export type Severity = 'green' | 'yellow' | 'red';

export function getSeverity(type: 'rainfall' | 'traffic' | 'aqi' | 'water_level', value: number): Severity {
  switch (type) {
    case 'rainfall':
      if (value < 10) return 'green';
      if (value < 35) return 'yellow';
      return 'red';
    case 'traffic':
      if (value < 40) return 'green';
      if (value < 75) return 'yellow';
      return 'red';
    case 'aqi':
      if (value < 100) return 'green';
      if (value < 200) return 'yellow';
      return 'red';
    case 'water_level':
      if (value < 20) return 'green';
      if (value < 50) return 'yellow';
      return 'red';
    default:
      return 'green';
  }
}

export function getUnit(type: string): string {
  switch (type) {
    case 'rainfall':
      return 'mm/hr';
    case 'traffic':
      return '%';
    case 'aqi':
      return 'AQI';
    case 'water_level':
      return 'cm';
    default:
      return '';
  }
}

export function getSensorLabel(type: string): string {
  switch (type) {
    case 'rainfall':
      return 'Rainfall';
    case 'traffic':
      return 'Traffic Density';
    case 'aqi':
      return 'Air Quality';
    case 'water_level':
      return 'Flood/Water Level';
    default:
      return type;
  }
}

export type RiskCategory = 'low' | 'moderate' | 'high' | 'critical';

export function getRiskCategory(score: number): RiskCategory {
  if (score > 75) return 'critical';
  if (score > 50) return 'high';
  if (score > 25) return 'moderate';
  return 'low';
}

export function getRiskColor(category: RiskCategory): string {
  switch (category) {
    case 'low': return '#10b981';       // emerald-500
    case 'moderate': return '#f59e0b';  // amber-500
    case 'high': return '#f97316';      // orange-500
    case 'critical': return '#ef4444';  // red-500
  }
}

export function getRiskBgClass(category: RiskCategory): string {
  switch (category) {
    case 'low': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'moderate': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'high': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
  }
}
