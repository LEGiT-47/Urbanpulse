import { EventSeed } from '../types';

/**
 * Generates 8 realistic Mumbai events with start and end times relative to baseDate.
 * This ensures that when the project is run or verified, we always have testable
 * active (current), future, and past events.
 * 
 * Coordinates are set around corresponding pilot zone centers.
 */
export function getEventSeeds(baseDate: Date = new Date()): EventSeed[] {
  const now = baseDate.getTime();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  return [
    // 1. Dadar — Lalbaugcha Raja Ganeshotsav (Active Now)
    {
      name: 'Lalbaugcha Raja Ganeshotsav',
      type: 'festival',
      zone_name: 'Dadar',
      lat: 19.0125,
      lng: 72.8410,
      start_time: new Date(now - 3 * hour).toISOString(), // Started 3 hours ago
      end_time: new Date(now + 6 * hour).toISOString(),    // Ends in 6 hours
      expected_footfall: 80000
    },
    // 2. Bandra — Live Concert at BKC (Active Now)
    {
      name: 'BKC Ground Music Concert',
      type: 'concert',
      zone_name: 'Bandra',
      lat: 19.0655,
      lng: 72.8632,
      start_time: new Date(now - 1 * hour).toISOString(), // Started 1 hour ago
      end_time: new Date(now + 4 * hour).toISOString(),    // Ends in 4 hours
      expected_footfall: 35000
    },
    // 3. Kurla — Mithi River Clean-up Rally (Active Now)
    {
      name: 'Mithi River Clean-up Rally',
      type: 'rally',
      zone_name: 'Kurla',
      lat: 19.0665,
      lng: 72.8850,
      start_time: new Date(now - 2 * hour).toISOString(), // Started 2 hours ago
      end_time: new Date(now + 1 * hour).toISOString(),    // Ends in 1 hour
      expected_footfall: 5000
    },
    // 4. Colaba — IPL Cricket Match at Wankhede (Future)
    {
      name: 'Wankhede IPL T20 Match',
      type: 'sports',
      zone_name: 'Colaba',
      lat: 18.9389,
      lng: 72.8258,
      start_time: new Date(now + 1 * day + 2 * hour).toISOString(), // Tomorrow
      end_time: new Date(now + 1 * day + 6 * hour).toISOString(),
      expected_footfall: 40000
    },
    // 5. Sion — Sion Fort Cultural Festival (Future)
    {
      name: 'Sion Fort Heritage Festival',
      type: 'festival',
      zone_name: 'Sion',
      lat: 19.0465,
      lng: 72.8655,
      start_time: new Date(now + 2 * day).toISOString(), // In 2 days
      end_time: new Date(now + 2 * day + 8 * hour).toISOString(),
      expected_footfall: 12000
    },
    // 6. Andheri — Suburban Tech Exhibition (Future)
    {
      name: 'Nesco Andheri Tech Expo',
      type: 'festival',
      zone_name: 'Andheri',
      lat: 19.1550,
      lng: 72.8550,
      start_time: new Date(now + 5 * day).toISOString(), // In 5 days
      end_time: new Date(now + 6 * day).toISOString(),
      expected_footfall: 25000
    },
    // 7. Dadar — Shivaji Park Political Rally (Past)
    {
      name: 'Shivaji Park Political Assembly',
      type: 'rally',
      zone_name: 'Dadar',
      lat: 19.0268,
      lng: 72.8375,
      start_time: new Date(now - 2 * day).toISOString(), // 2 days ago
      end_time: new Date(now - 2 * day + 4 * hour).toISOString(),
      expected_footfall: 50000
    },
    // 8. Kalbadevi — Market Protest March (Past)
    {
      name: 'Kalbadevi Merchants Protest',
      type: 'rally',
      zone_name: 'Kalbadevi',
      lat: 18.9510,
      lng: 72.8300,
      start_time: new Date(now - 4 * day).toISOString(), // 4 days ago
      end_time: new Date(now - 4 * day + 5 * hour).toISOString(),
      expected_footfall: 15000
    }
  ];
}
