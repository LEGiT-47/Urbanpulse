export interface ForecastPoint {
  predicted: number;
  lower: number;
  upper: number;
}

interface SparklineProps {
  data: number[];
  forecastData?: ForecastPoint[];
  color?: string;
  width?: number;
  height?: number;
}

export default function Sparkline({ 
  data, 
  forecastData,
  color = '#14b8a6',
  width = 120, 
  height = 36 
}: SparklineProps) {
  const hasForecast = forecastData && forecastData.length > 0;
  const allValues = [
    ...data,
    ...(hasForecast ? forecastData.map(f => f.upper) : [])
  ];

  if (!data || data.length < 2) {
    return <div className="text-gray-500 text-xs font-mono">no history</div>;
  }

  const max = Math.max(...allValues, 100);
  const min = 0;
  const range = max - min || 1;

  // ── Historical segment ───────────────────────────────────────────────────
  // Historical points occupy the left portion of the chart.
  // If we have forecast data, history takes ~65% of the width; otherwise 100%.
  const histWidth = hasForecast ? width * 0.65 : width;

  const histPoints = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * histWidth;
    const y = height - ((val - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  const areaPoints = `${histPoints} ${histWidth.toFixed(2)},${height} 0,${height}`;

  // Last historical point coords (anchor for the forecast segment)
  const lastHistX = histWidth;
  const lastHistY = height - ((data[data.length - 1] - min) / range) * height;

  // ── Forecast segment ─────────────────────────────────────────────────────
  // Forecast points fill the remaining right portion of the chart.
  const forecastWidth = width - histWidth;

  const fxCoords = hasForecast ? forecastData.map((_, idx) => {
    // idx 0 == t+15, 1 == t+30 … evenly spaced
    return lastHistX + ((idx + 1) / forecastData.length) * forecastWidth;
  }) : [];

  const fyPredicted = hasForecast ? forecastData.map(f =>
    height - ((f.predicted - min) / range) * height
  ) : [];

  const fyLower = hasForecast ? forecastData.map(f =>
    height - ((f.lower - min) / range) * height
  ) : [];

  const fyUpper = hasForecast ? forecastData.map(f =>
    height - ((f.upper - min) / range) * height
  ) : [];

  // SVG polyline for dashed forecast line (including anchor from last hist point)
  const forecastLinePoints = hasForecast
    ? [`${lastHistX.toFixed(2)},${lastHistY.toFixed(2)}`,
       ...fxCoords.map((x, i) => `${x.toFixed(2)},${fyPredicted[i].toFixed(2)}`)
      ].join(' ')
    : '';

  // Confidence band polygon: upper-left→upper-right→lower-right→lower-left
  const confidencePolygon = hasForecast
    ? [
        `${lastHistX.toFixed(2)},${lastHistY.toFixed(2)}`, // anchor (predicted == hist last)
        ...fxCoords.map((x, i) => `${x.toFixed(2)},${fyUpper[i].toFixed(2)}`),
        ...fxCoords.slice().reverse().map((x, i) => {
          const ri = fxCoords.length - 1 - i;
          return `${x.toFixed(2)},${fyLower[ri].toFixed(2)}`;
        }),
        `${lastHistX.toFixed(2)},${lastHistY.toFixed(2)}`, // close
      ].join(' ')
    : '';

  const gradId = `grad-${color.replace('#', '')}`;
  const forecastGradId = `fcast-${color.replace('#', '')}`;

  return (
    <svg width={width} height={height} className="overflow-visible select-none">
      <defs>
        {/* Historical fill gradient */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
        {/* Forecast confidence band gradient */}
        <linearGradient id={forecastGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.06" />
        </linearGradient>
      </defs>

      {/* Historical filled area */}
      <polygon points={areaPoints} fill={`url(#${gradId})`} />

      {/* Historical solid line */}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={histPoints}
      />

      {/* ── Forecast elements ── */}
      {hasForecast && (
        <>
          {/* Confidence band shading */}
          <polygon
            points={confidencePolygon}
            fill={`url(#${forecastGradId})`}
          />

          {/* Upper bound dashed outline */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="0.8"
            strokeOpacity="0.3"
            strokeDasharray="2 2"
            strokeLinecap="round"
            points={[
              `${lastHistX.toFixed(2)},${lastHistY.toFixed(2)}`,
              ...fxCoords.map((x, i) => `${x.toFixed(2)},${fyUpper[i].toFixed(2)}`)
            ].join(' ')}
          />

          {/* Lower bound dashed outline */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="0.8"
            strokeOpacity="0.3"
            strokeDasharray="2 2"
            strokeLinecap="round"
            points={[
              `${lastHistX.toFixed(2)},${lastHistY.toFixed(2)}`,
              ...fxCoords.map((x, i) => `${x.toFixed(2)},${fyLower[i].toFixed(2)}`)
            ].join(' ')}
          />

          {/* Forecast centre dashed line */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeOpacity="0.65"
            strokeDasharray="4 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={forecastLinePoints}
          />

          {/* Forecast endpoint marker */}
          <circle
            cx={fxCoords[fxCoords.length - 1]}
            cy={fyPredicted[fyPredicted.length - 1]}
            r="2"
            fill={color}
            fillOpacity="0.55"
          />

          {/* Vertical separator between history and forecast */}
          <line
            x1={lastHistX}
            y1={0}
            x2={lastHistX}
            y2={height}
            stroke={color}
            strokeWidth="0.8"
            strokeOpacity="0.2"
            strokeDasharray="2 2"
          />
        </>
      )}

      {/* Pulsing endpoint dot on the latest real reading */}
      <circle
        cx={lastHistX}
        cy={lastHistY}
        r="2.5"
        fill={color}
        className="animate-pulse"
      />
    </svg>
  );
}
