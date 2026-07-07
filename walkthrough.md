# UrbanPulse — Digital Twin Walkthrough

UrbanPulse is an urban digital twin for Mumbai that tracks live environmental and infrastructure conditions (traffic, rainfall, air quality, flood risk) in real-time, displaying them on an interactive map dashboard.

---

## 🏗️ Architectural Overview

```
Supabase (Hosted Postgres)
      ↑
      │ reads/writes
      ↓
Node/Express API (TypeScript)  ←── Proxy ──  React + Vite Frontend (TypeScript)
      ├─ Mock Data Generator                      │ (Map: Leaflet + OSM Tiles)
      └─ Convergence Risk Engine                  │ (Styling: Tailwind CSS)
                                                  ↓
                                            Interactive UI controls & sidebar
```

---

## 📁 Project Structure

```
UrbanPulse/
├── migrations/
│   └── 001_initial_schema.sql       ← Supabase PostgreSQL schema setup
├── docker-compose.yml               ← Docker setup (API container only)
├── README.md                        ← Main setup documentation
├── backend/                         ← Node.js / Express API Service
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                 ← Server bootstrap + mock generator trigger
│       ├── lib/supabase.ts          ← Supabase service client
│       ├── config/
│       │   └── riskWeights.json     ← Easy-to-tune risk engine weights
│       ├── data/sensors.ts          ← 25 Mumbai sensor seed records
│       ├── services/
│       │   ├── mockDataGenerator.ts ← Gaussian drift mock generator (5s loop)
│       │   └── riskEngine.ts        ← Convergence Risk Engine (10s loop)
│       ├── routes/
│       │   ├── sensors.ts           ← REST endpoints for sensors & readings
│       │   └── risk.ts              ← REST endpoints for risk snapshots
│       └── scripts/
│           └── seed.ts              ← One-time idempotent seed script
└── frontend/                        ← React + TypeScript + Vite Dashboard
    ├── package.json
    ├── tailwind.config.js           ← Tailwind CSS styling tokens
    ├── postcss.config.js
    ├── index.html                   ← Page template & Leaflet assets
    └── src/
        ├── main.tsx
        ├── index.css                ← Tailwind imports + Leaflet dark-tiles filter
        ├── App.tsx                  ← Dashboard map & sidebar app [MODIFIED]
        ├── components/
        │   └── Sparkline.tsx        ← Custom SVG sparkline chart component [NEW]
        └── utils/
            └── severity.ts          ← Severity thresholds & colors [MODIFIED]
```

---

## 🧠 Convergence Risk Engine (Step 3)

The Convergence Risk Engine runs as a background service on the API layer every 10 seconds. It evaluates a rolling composite risk index per Mumbai zone.

### 1. Dynamic Weight Normalization
Since not all zones have all 4 types of sensors (e.g. Dadar only has rainfall and traffic), the engine uses a dynamic normalizer to compute the score (0-100):

$$\text{Score} = \frac{\sum_{t \in \text{Available}} w_t \cdot \text{ValNorm}_t}{\sum_{t \in \text{Available}} w_t}$$

Where values are normalized as follows:
- **Rainfall**: `(value / 80) * 100` (Max 80mm/hr)
- **Traffic**: `value` (already 0-100 density index)
- **AQI**: `((value - 50) / 350) * 100` (US EPA Scale 50-400)
- **Water Level**: `value` (Max 100cm flood height)

### 2. Tuning Weights ([riskWeights.json](file:///d:/projects/UrbanPulse/backend/src/config/riskWeights.json))
Weights can be tuned dynamically without altering code:
- `rainfall`: 0.30
- `traffic`: 0.20
- `aqi`: 0.15
- `water_level`: 0.35

### 3. Natural Language Explanation Builder
The engine evaluates contributing factors and automatically outputs a readable status string:
*   *Zero elevated factors*: `"Normal conditions monitored in Kurla."`
*   *One elevated factor*: `"Heavy rainfall detected in Dadar."`
*   *Two elevated factors*: `"Rising water levels combined with elevated traffic congestion in Kurla."`
*   *Three or more factors*: `"Heavy rainfall, severe traffic gridlock, and rising water levels impacting Sion concurrently."`

This explanation string is stored inside the `factors` JSONB column as the `explanation` key.

---

## 📊 Extended Risk Dashboard Frontend (Step 4)

We have extended the React client with a fully functional Risk Twin Dashboard panel, interactive map overlays, and detailed analytics drawers.

### 1. Zone Risk Heat Overlays
Leaflet maps display color-coded semi-transparent circular overlays showing zone risk levels:
- **Green (Low)**: Score `0 - 25`
- **Yellow (Moderate)**: Score `26 - 50`
- **Orange (High)**: Score `51 - 75`
- **Red (Critical)**: Score `76 - 100`

Clicking a circle on the map auto-pans and focuses on that zone in the sidebar inspector.

### 2. Hotspots Panel & SVG Sparklines
The **Risk Twin View** displays the overall city risk score (average across zones), followed by a ranked list of the top 5 highest-risk zones.
*   **Performance-Optimized Sparklines**: Rather than installing third-party charting libraries which can introduce bundle bloat and React 19 version locks, we built a custom SVG polyline sparkline component with filled background gradients.

### 3. Detailed Zone Drawer
Selecting any zone opens a detailed Side Inspector showcasing:
*   Progress bars for each of the 4 contributing factors (Rainfall, Traffic, AQI, Water Level) scaled to their specific max ranges.
*   The human-readable explanation generated by the backend API explaining the cause.
*   An expanded 1-hour trend sparkline.

### 4. Live Dark/Light Mode Theme Toggle
A toggle button in the header transitions the entire app style from the futuristic dark grid to a clean light dashboard interface. This also toggles the CSS invert filter on the Leaflet tile layer, switching from dark map tiles to standard OpenStreetMap light tiles dynamically.

---

## 🎨 Dashboard Visual Verification

Here is the visual validation of the frontend dashboard running in **Demo Mode (Local Mock Data)**.

````carousel
### 1. Risk Dashboard Overview (Dark Mode)
The default view highlights the Overall City Risk (average index), the ranked Top 5 Risk Hotspots with their live sparklines, and glowing map overlays.

![Risk Dashboard Overview](C:/Users/Viraj Prabhu/.gemini/antigravity-ide/brain/5619fe9e-5801-4be7-8c62-cb0f01b98c10/demo_mode_started_1783154584423.png)
<!-- slide -->
### 2. Zone Inspector Detail (Mahim)
Clicking on a zone displays contributing factors with progress bars, historical 1-hour sparklines, and the API-generated natural-language explanation.

![Zone Inspector Detail](C:/Users/Viraj Prabhu/.gemini/antigravity-ide/brain/5619fe9e-5801-4be7-8c62-cb0f01b98c10/zone_inspector_open_1783154596176.png)
<!-- slide -->
### 3. Light Mode Theme Swap
A single click transitions the digital twin to light mode, swapping backgrounds, cards, shadows, and the Leaflet OSM tile layers.

![Light Mode Theme Swap](C:/Users/Viraj Prabhu/.gemini/antigravity-ide/brain/5619fe9e-5801-4be7-8c62-cb0f01b98c10/light_mode_1783154608709.png)
````

### 📹 Full Interactive Session Recording
Below is the full recording of the browser subagent verifying zone selections, inspecting factors, toggling light mode, and observing live updates.

![UrbanPulse Risk Twin Demo Session](C:/Users/Viraj Prabhu/.gemini/antigravity-ide/brain/5619fe9e-5801-4be7-8c62-cb0f01b98c10/urbanpulse_risk_demo_1783154561732.webp)

---

## ⚡ Real-Time Push Stream, Alerts, & Weight Tuning (Step 5)

We have added dynamic controls, telemetry charts, alerts, and push updates:

### 1. Server-Sent Events (SSE) Real-Time Stream
*   Instead of polling the REST API, the client now maintains a persistent connection to the backend via `/api/realtime/stream`.
*   Whenever a sensor reading or risk snapshot registers on the backend, it is pushed instantly to the client, removing polling latency.

### 2. Predictive Warnings Alerts Drawer
*   A new Bell icon indicator in the header opens a side alerts drawer.
*   Whenever a zone score crosses 75 (Critical) or when the short-horizon forecast projects a score crossing 75 in the next 15-30 minutes, an alert card is generated dynamically in the drawer.

### 3. Interactive Weight Tuning Sliders
*   Planners can adjust risk engine weights (Rainfall, Traffic, AQI, Water Level) using range sliders in the sidebar, instantly updating the scores.

### 4. Detailed Sensor Telemetry Modals
*   Clicking the **Activity** icon on any sensor card in the Sensor Net View opens a modal displaying a 30-cycle SVG area line chart showing historical values and severity.

### 5. What-If Simulation Engine
*   Planners can pause the automatic drift loops and inject custom values or trigger predefined disaster scenarios (*Monsoon Cloudburst, Evening Office Rush Hour, Winter Smog*) to see risk scores propagate.

---

## 🎨 Simulation & Modal Visual Verification

Here is the visual validation of the simulation features and telemetries.

```carousel
### 1. Cloudburst Simulation & Warnings Drawer
Running the Monsoon Cloudburst scenario immediately recalculates Sion's risk to 93 (Critical), generating warnings in the Real-Time Alerts drawer.

![Cloudburst Simulation & Alerts Drawer](C:/Users/Viraj Prabhu/.gemini/antigravity-ide/brain/5619fe9e-5801-4be7-8c62-cb0f01b98c10/cloudburst_simulation_alerts_1783158556642.png)
<!-- slide -->
### 2. Sensor Telemetry Modal (Hindmata Gauge)
Clicking 'Activity' on Hindmata Rainfall Gauge opens a modal displaying the historical area line chart.

![Sensor Telemetry Modal](C:/Users/Viraj Prabhu/.gemini/antigravity-ide/brain/5619fe9e-5801-4be7-8c62-cb0f01b98c10/sensor_history_modal_1783158583652.png)
```

### 📹 Full Simulation Recording
Below is the full recording of the subagent triggering simulations, opening alerts, inspecting telemetry charts, and adjusting weights.

![UrbanPulse Expansion Telemetry Demo](C:/Users/Viraj Prabhu/.gemini/antigravity-ide/brain/5619fe9e-5801-4be7-8c62-cb0f01b98c10/expansion_features_demo_1783158461632.webp)

---

## ⚡ Quick Start Running the Stack

### 1. Supabase Setup
1. Create a project at [supabase.com](https://supabase.com).
2. Execute the migrations in [`001_initial_schema.sql`](file:///d:/projects/UrbanPulse/migrations/001_initial_schema.sql) in your Supabase SQL editor.

### 2. Start the Backend API
```bash
cd d:\projects\UrbanPulse\backend
copy .env.example .env        # Add your SUPABASE_URL & SUPABASE_SERVICE_KEY
npm install
npm run seed -- --force       # Seeds 29 sensors (clears old entries)
npm run dev                   # Starts Express server on http://localhost:3001
```

### 3. Start the Frontend Dashboard
```bash
cd d:\projects\UrbanPulse\frontend
npm install
npm run dev                   # Starts Vite dashboard on http://localhost:5173
```
Now navigate to `http://localhost:5173` to view the live dashboard.
