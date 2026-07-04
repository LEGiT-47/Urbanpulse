import { SensorSeed } from '../types';

/**
 * 15 real Mumbai sensor locations covering a mix of:
 *  - Flood-prone zones: Sion, Hindmata (Dadar), Kurla, Vikhroli
 *  - High-traffic corridors: Western Express Hwy (Andheri), Eastern Express Hwy (Kurla)
 *  - Industrial/AQI hotspots: Kalbadevi, Dharavi
 *  - Coastal / low-lying: Mahim, Worli, Bandra (west)
 *
 * Each sensor carries ONE type so risk computation can aggregate per zone.
 * Coordinates verified against OSM / public datasets for Mumbai.
 */
export const SENSOR_SEEDS: SensorSeed[] = [
  // ── Dadar (flood-prone; Hindmata junction historically floods) ──────────
  {
    name: 'Hindmata Rainfall Gauge',
    type: 'rainfall',
    lat: 19.0176,
    lng: 72.8431,
    zone_name: 'Dadar',
  },
  {
    name: 'Dadar TT Traffic Node',
    type: 'traffic',
    lat: 19.0183,
    lng: 72.8488,
    zone_name: 'Dadar',
  },

  // ── Andheri (high traffic; Western Express Highway) ────────────────────
  {
    name: 'Andheri WEH Traffic Camera',
    type: 'traffic',
    lat: 19.1136,
    lng: 72.8697,
    zone_name: 'Andheri',
  },
  {
    name: 'Andheri Lokhandwala AQI Station',
    type: 'aqi',
    lat: 19.1308,
    lng: 72.8271,
    zone_name: 'Andheri',
  },
  {
    name: 'Andheri Millat Nagar Water Level',
    type: 'water_level',
    lat: 19.1100,
    lng: 72.8426,
    zone_name: 'Andheri',
  },

  // ── Bandra (sea-facing; tidal flooding risk) ───────────────────────────
  {
    name: 'Bandra Waterfront Rainfall',
    type: 'rainfall',
    lat: 19.0596,
    lng: 72.8295,
    zone_name: 'Bandra',
  },
  {
    name: 'Bandra-Kurla Complex Traffic',
    type: 'traffic',
    lat: 19.0683,
    lng: 72.8692,
    zone_name: 'Bandra',
  },

  // ── Kurla (Eastern Express; flood-prone low-lying) ─────────────────────
  {
    name: 'Kurla LBS Road Traffic Cam',
    type: 'traffic',
    lat: 19.0726,
    lng: 72.8796,
    zone_name: 'Kurla',
  },
  {
    name: 'Kurla Mithi River Water Level',
    type: 'water_level',
    lat: 19.0659,
    lng: 72.8823,
    zone_name: 'Kurla',
  },

  // ── Sion (historically worst flood point on 26-Jul-2005) ──────────────
  {
    name: 'Sion Hospital Junction Rainfall',
    type: 'rainfall',
    lat: 19.0396,
    lng: 72.8619,
    zone_name: 'Sion',
  },
  {
    name: 'Sion Circle Water Level',
    type: 'water_level',
    lat: 19.0411,
    lng: 72.8611,
    zone_name: 'Sion',
  },

  // ── Kalbadevi / Girgaon (dense commercial; poor drainage) ─────────────
  {
    name: 'Kalbadevi AQI Monitor',
    type: 'aqi',
    lat: 18.9479,
    lng: 72.8310,
    zone_name: 'Kalbadevi',
  },
  {
    name: 'Kalbadevi Charni Rd Rainfall',
    type: 'rainfall',
    lat: 18.9519,
    lng: 72.8190,
    zone_name: 'Kalbadevi',
  },

  // ── Mahim (tidal creek; flooding during high tide + rain) ─────────────
  {
    name: 'Mahim Creek Water Level',
    type: 'water_level',
    lat: 19.0369,
    lng: 72.8394,
    zone_name: 'Mahim',
  },

  // ── Vikhroli (industrial; Godrej complex; Thane Creek tributary) ───────
  {
    name: 'Vikhroli Industrial AQI',
    type: 'aqi',
    lat: 19.1068,
    lng: 72.9258,
    zone_name: 'Vikhroli',
  },

  // ── Borivali (extreme North Mumbai; National Park & Dahisar River flooding) ─
  {
    name: 'Borivali National Park Rainfall',
    type: 'rainfall',
    lat: 19.2215,
    lng: 72.8631,
    zone_name: 'Borivali',
  },
  {
    name: 'Borivali Station Traffic Camera',
    type: 'traffic',
    lat: 19.2290,
    lng: 72.8480,
    zone_name: 'Borivali',
  },
  {
    name: 'Borivali Link Road AQI Station',
    type: 'aqi',
    lat: 19.2320,
    lng: 72.8360,
    zone_name: 'Borivali',
  },
  {
    name: 'Dahisar River Water Level',
    type: 'water_level',
    lat: 19.2250,
    lng: 72.8590,
    zone_name: 'Borivali',
  },

  // ── Chembur (East-Central; major industrial area) ──────────────────────
  {
    name: 'Chembur Fine Arts Traffic Node',
    type: 'traffic',
    lat: 19.0520,
    lng: 72.9020,
    zone_name: 'Chembur',
  },
  {
    name: 'Chembur Industrial AQI Monitor',
    type: 'aqi',
    lat: 19.0650,
    lng: 72.8910,
    zone_name: 'Chembur',
  },
  {
    name: 'Chembur Rainfall Station',
    type: 'rainfall',
    lat: 19.0580,
    lng: 72.8980,
    zone_name: 'Chembur',
  },

  // ── Colaba (extreme South Mumbai; coastal observatory) ──────────────────
  {
    name: 'Colaba Observatory Rainfall',
    type: 'rainfall',
    lat: 18.9080,
    lng: 72.8120,
    zone_name: 'Colaba',
  },
  {
    name: 'Gateway of India Water Level',
    type: 'water_level',
    lat: 18.9220,
    lng: 72.8340,
    zone_name: 'Colaba',
  },
  {
    name: 'Marine Drive Traffic Camera',
    type: 'traffic',
    lat: 18.9430,
    lng: 72.8230,
    zone_name: 'Colaba',
  },

  // ── Goregaon (Western Suburbs; Aarey forest and WEH highway) ──────────────
  {
    name: 'Goregaon Aarey Colony Rainfall',
    type: 'rainfall',
    lat: 19.1485,
    lng: 72.8715,
    zone_name: 'Goregaon',
  },
  {
    name: 'Goregaon WEH Highway Traffic',
    type: 'traffic',
    lat: 19.1585,
    lng: 72.8566,
    zone_name: 'Goregaon',
  },
  {
    name: 'Goregaon West Link Rd AQI',
    type: 'aqi',
    lat: 19.1620,
    lng: 72.8390,
    zone_name: 'Goregaon',
  },
  {
    name: 'Aarey Lake Water Level Sensor',
    type: 'water_level',
    lat: 19.1520,
    lng: 72.8750,
    zone_name: 'Goregaon',
  },
];
