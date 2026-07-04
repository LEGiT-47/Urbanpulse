# UrbanPulse 🌆

**Urban Digital Twin for Mumbai** — real-time risk monitoring across traffic,
flood, and air quality sensors with a rolling per-zone risk score.

> **This README covers Step 1: Backend + Schema setup.**
> The React frontend will be added in a future step.

---

## Architecture Overview

```
Supabase (hosted Postgres)
    ↑ insert readings every 5s
    │
Node/Express API  ←── REST clients / future React dashboard
    │
Mock Data Generator (in-process setInterval)
```

### Database Tables (Supabase / Postgres)

| Table | Description |
|---|---|
| `sensors` | 15 Mumbai sensor locations with type & geo-coordinates |
| `readings` | Time-series values from each sensor (inserted every 5 s) |
| `risk_snapshots` | Computed risk scores per zone (written by risk engine — Step 2) |

---

## Quick Start

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| Supabase account | free tier works |

### Step 1 — Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Choose a region close to Mumbai (e.g. **Singapore ap-southeast-1**)
3. Note your **Project URL** and **service-role key** (Settings → API)

### Step 2 — Apply the database migration

In the **Supabase Dashboard → SQL Editor**, open a new query and paste the
contents of [`migrations/001_initial_schema.sql`](./migrations/001_initial_schema.sql),
then click **Run**.

This creates three tables (`sensors`, `readings`, `risk_snapshots`) plus the
required indexes.

### Step 3 — Configure environment variables

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PORT=3001
NODE_ENV=development
```

> ⚠️ **Never commit `.env`** — it contains your service-role key which bypasses
> Row-Level Security.

### Step 4 — Install dependencies

```bash
cd backend
npm install
```

### Step 5 — Seed the database (run once)

```bash
npm run seed
```

You should see 15 Mumbai sensor locations printed with their UUIDs. The script
is **idempotent** — if sensors already exist it exits safely.

### Step 6 — Start the development server

```bash
npm run dev
```

Expected output:

```
╔══════════════════════════════════════════╗
║        UrbanPulse API  v1.0.0           ║
║  Mumbai Urban Digital Twin — Backend    ║
╚══════════════════════════════════════════╝
🚀  Server listening on http://localhost:3001
📡  Endpoints:
     GET /health
     GET /api/sensors
     GET /api/sensors/:id/readings
     GET /api/sensors/:id/readings/latest

[MockGen] Starting — will generate readings for 15 sensors every 5s
[MockGen] ✓ Inserted 15 readings at 2025-08-01T10:00:05.000Z
[MockGen] ✓ Inserted 15 readings at 2025-08-01T10:00:10.000Z
...
```

---

## REST API Reference

### `GET /health`

Health check.

```json
{ "status": "ok", "service": "UrbanPulse API", "timestamp": "..." }
```

---

### `GET /api/sensors`

Returns all 15 Mumbai sensor locations.

```json
{
  "count": 15,
  "sensors": [
    {
      "id": "uuid",
      "name": "Hindmata Rainfall Gauge",
      "type": "rainfall",
      "lat": 19.0176,
      "lng": 72.8431,
      "zone_name": "Dadar",
      "created_at": "..."
    },
    ...
  ]
}
```

---

### `GET /api/sensors/:id/readings`

Returns historical readings for one sensor.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | number | 100 | Max rows returned (capped at 1000) |
| `since` | ISO timestamp | — | Only return readings after this time |

```json
{
  "sensor": { "id": "...", "name": "...", "zone_name": "Dadar", "type": "rainfall" },
  "count": 100,
  "readings": [
    { "id": "uuid", "sensor_id": "...", "value": 12.4, "recorded_at": "..." },
    ...
  ]
}
```

---

### `GET /api/sensors/:id/readings/latest`

Returns the single most-recent reading.

```json
{
  "sensor": { "id": "...", "name": "Sion Circle Water Level", "zone_name": "Sion", "type": "water_level" },
  "reading": { "id": "...", "sensor_id": "...", "value": 47.83, "recorded_at": "..." }
}
```

---

## Sensor Locations (15 Mumbai Zones)

| Zone | Sensor Name | Type | Rationale |
|---|---|---|---|
| Dadar | Hindmata Rainfall Gauge | rainfall | Historically worst flooding junction |
| Dadar | Dadar TT Traffic Node | traffic | Major road junction |
| Andheri | Andheri WEH Traffic Camera | traffic | Western Express Highway |
| Andheri | Lokhandwala AQI Station | aqi | Dense residential area |
| Andheri | Millat Nagar Water Level | water_level | Low-lying suburb |
| Bandra | Bandra Waterfront Rainfall | rainfall | Sea-facing; tidal flooding risk |
| Bandra | BKC Traffic | traffic | Business district |
| Kurla | LBS Road Traffic Cam | traffic | Eastern Express Highway |
| Kurla | Mithi River Water Level | water_level | Flood-prone river basin |
| Sion | Hospital Junction Rainfall | rainfall | 26-Jul-2005 epicentre |
| Sion | Sion Circle Water Level | water_level | Low-lying underpass |
| Kalbadevi | AQI Monitor | aqi | Dense commercial area |
| Kalbadevi | Charni Rd Rainfall | rainfall | Poor drainage network |
| Mahim | Mahim Creek Water Level | water_level | Tidal creek flooding |
| Vikhroli | Industrial AQI | aqi | Industrial corridor |

---

## Mock Data Value Ranges

| Type | Range | Notes |
|---|---|---|
| `rainfall` | 0–80 mm/hr | Gaussian distribution, occasional spikes |
| `traffic` | 0–100 (index) | 0=free flow, 100=gridlock |
| `aqi` | 50–400 (US EPA) | 50=Good, 300+=Hazardous |
| `water_level` | 0–100 cm | 0=normal, 100=flood alert |

Values drift smoothly between readings (±10% of range per tick) with
configurable spike probability to simulate real urban events.

---

## Running with Docker

Ensure your `.env` is populated, then:

```bash
# From the project root
docker compose up --build
```

The API will be available at `http://localhost:3001`.

---

## Project Structure

```
UrbanPulse/
├── migrations/
│   └── 001_initial_schema.sql   # Run in Supabase SQL Editor
├── docker-compose.yml
├── backend/
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # Express app entry point
│       ├── lib/
│       │   └── supabase.ts       # Supabase admin client
│       ├── types/
│       │   └── index.ts          # Shared TypeScript types
│       ├── data/
│       │   └── sensors.ts        # 15 Mumbai sensor seed records
│       ├── services/
│       │   └── mockDataGenerator.ts  # 5s interval data generator
│       ├── routes/
│       │   └── sensors.ts        # REST route handlers
│       └── scripts/
│           └── seed.ts           # One-time seed script
└── README.md
```

---

## Next Steps (Step 2)

- [ ] Risk computation engine: aggregate latest readings per zone → write `risk_snapshots`
- [ ] `GET /api/zones` and `GET /api/zones/:name/risk` endpoints
- [ ] React + TypeScript frontend with Mapbox/Leaflet map dashboard
- [ ] WebSocket push for live score updates
