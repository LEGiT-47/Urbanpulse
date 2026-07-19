/**
 * config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central API configuration helper.
 *
 * In production (Netlify), VITE_API_URL can be set to the Render backend URL
 * (e.g., https://urbanpulse-lqvo.onrender.com). This enables direct cross-origin
 * streaming for Server-Sent Events (SSE), bypassing Netlify proxy limitations.
 *
 * In local development, VITE_API_URL is empty, falling back to relative paths
 * like /api/* which are handled by Vite's local dev server proxy.
 */

export const API_BASE_URL = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}
