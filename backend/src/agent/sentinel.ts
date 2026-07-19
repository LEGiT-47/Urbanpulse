/**
 * sentinel.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * UrbanPulse Sentinel Agent — Autonomous perceive → reason → act → learn loop.
 *
 * Runs every 60 seconds via node-cron.
 *   PERCEIVE : reads latest risk_snapshots from Supabase
 *   REASON   : calls Groq LLM (fallback: Gemini) for each High/Critical zone
 *   ACT      : sends Resend email alert and/or triggers reroute
 *   LEARN    : writes decision to agent_log table
 *
 * Any failure is caught and logged — never crashes the server.
 */

import cron from 'node-cron';
import { Resend } from 'resend';
import { supabase } from '../lib/supabase';
import { realtimeBus } from '../services/realtimeService';
import { getRoadGraph } from '../services/roadGraph';
import { computeRoute } from '../services/routeEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LLMDecision {
  action_needed: boolean;
  action_type: 'alert' | 'reroute' | 'alert_and_reroute' | 'none';
  explanation: string;
  confidence: number;
}

export interface AgentLogEntry {
  id: string;
  zone_name: string;
  risk_score: number;
  risk_category: string;
  llm_decision: LLMDecision;
  action_taken: string;
  triggered_by: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory recent log (for instant /api/agent/history response before DB ready)
// ─────────────────────────────────────────────────────────────────────────────

const recentLog: AgentLogEntry[] = [];
const MAX_IN_MEMORY = 100;

export function getRecentAgentLog(): AgentLogEntry[] {
  return [...recentLog];
}

// ─────────────────────────────────────────────────────────────────────────────
// Current cycle stage (for SSE broadcast to Agent Console)
// ─────────────────────────────────────────────────────────────────────────────

export type AgentStage = 'idle' | 'perceive' | 'reason' | 'act' | 'learn';
let _currentStage: AgentStage = 'idle';
let _lastCycleAt: string | null = null;
let _cycleCount = 0;

export function getAgentStatus() {
  return {
    stage: _currentStage,
    lastCycleAt: _lastCycleAt,
    cycleCount: _cycleCount,
    logCount: recentLog.length,
  };
}

function setStage(stage: AgentStage) {
  _currentStage = stage;
  realtimeBus.emit('agent_stage', { stage, timestamp: new Date().toISOString() });
}

// ─────────────────────────────────────────────────────────────────────────────
// REASON: Call Groq with Gemini fallback
// ─────────────────────────────────────────────────────────────────────────────

const REASON_PROMPT = (zone: string, score: number, category: string, factors: Record<string, any>) => `
You are an urban risk analyst AI for Mumbai's UrbanPulse emergency management system.

Zone: ${zone}
Current Risk Score: ${score}/100  (Category: ${category})
Contributing factors:
${JSON.stringify(factors, null, 2)}

Analyze whether emergency action is needed. Consider:
- High traffic ALONE is not urgent unless combined with flooding or a large event.
- Rising water + any rainfall spike = high flooding risk even at moderate scores.
- Score > 75 AND active event = likely crowd safety incident.

Respond ONLY with valid JSON (no markdown, no explanation outside the JSON):
{
  "action_needed": boolean,
  "action_type": "alert" | "reroute" | "alert_and_reroute" | "none",
  "explanation": "one concise sentence explaining your decision",
  "confidence": number between 0.0 and 1.0
}
`.trim();

async function callGroq(prompt: string): Promise<LLMDecision | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      console.warn(`[Sentinel/Groq] HTTP ${resp.status}`);
      return null;
    }

    const data = await resp.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    return JSON.parse(content) as LLMDecision;
  } catch (err: any) {
    console.warn('[Sentinel/Groq] Failed:', err.message);
    return null;
  }
}

async function callGemini(prompt: string): Promise<LLMDecision | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 200, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      console.warn(`[Sentinel/Gemini] HTTP ${resp.status}`);
      return null;
    }

    const data = await resp.json() as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return null;

    return JSON.parse(content) as LLMDecision;
  } catch (err: any) {
    console.warn('[Sentinel/Gemini] Failed:', err.message);
    return null;
  }
}

async function reason(zone: string, score: number, category: string, factors: Record<string, any>): Promise<LLMDecision> {
  const prompt = REASON_PROMPT(zone, score, category, factors);

  const groqResult = await callGroq(prompt);
  if (groqResult) return groqResult;

  const geminiResult = await callGemini(prompt);
  if (geminiResult) return geminiResult;

  // Both failed — return deterministic fallback decision based on score
  console.warn(`[Sentinel/Reason] Both LLMs failed for ${zone} — using rule-based fallback`);
  const action_needed = score >= 75;
  return {
    action_needed,
    action_type: score >= 75 ? 'alert' : 'none',
    explanation: `Rule-based fallback: score ${score} ${score >= 75 ? 'exceeds critical threshold' : 'within acceptable range'} in ${zone}.`,
    confidence: 0.5,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACT: Send alert email via Resend
// ─────────────────────────────────────────────────────────────────────────────

async function sendAlertEmail(zone: string, score: number, decision: LLMDecision): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const to = process.env.ALERT_EMAIL;

  if (!apiKey || !to) {
    console.log(`[Sentinel/Act] Email not configured — alert for ${zone} logged to console only.`);
    console.log(`[SENTINEL ALERT] Zone: ${zone} | Score: ${score} | Action: ${decision.action_type} | ${decision.explanation}`);
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `🚨 UrbanPulse Sentinel Alert — ${zone} Risk ${score}/100`,
      html: `
        <div style="font-family:monospace;background:#0b0f19;color:#e2e8f0;padding:24px;border-radius:8px;">
          <h2 style="color:#f87171;margin:0 0 16px">🤖 Sentinel Agent Alert</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="color:#94a3b8;padding:4px 0">Zone</td><td style="color:#fff;font-weight:bold">${zone}</td></tr>
            <tr><td style="color:#94a3b8;padding:4px 0">Risk Score</td><td style="color:#f87171;font-weight:bold">${score}/100</td></tr>
            <tr><td style="color:#94a3b8;padding:4px 0">Action</td><td style="color:#fbbf24">${decision.action_type}</td></tr>
            <tr><td style="color:#94a3b8;padding:4px 0">Confidence</td><td>${(decision.confidence * 100).toFixed(0)}%</td></tr>
          </table>
          <p style="margin:16px 0 0;color:#cbd5e1;border-top:1px solid #1f2937;padding-top:12px;">${decision.explanation}</p>
          <p style="margin:12px 0 0;color:#475569;font-size:11px;">Generated by UrbanPulse Sentinel Agent at ${new Date().toISOString()}</p>
        </div>
      `,
    });

    if (error) {
      console.error('[Sentinel/Act] Resend error:', error);
      return false;
    }
    console.log(`[Sentinel/Act] Alert email sent for ${zone}`);
    return true;
  } catch (err: any) {
    console.error('[Sentinel/Act] Failed to send email:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACT: Trigger emergency reroute (uses existing routeEngine)
// ─────────────────────────────────────────────────────────────────────────────

const ZONE_CENTERS: Record<string, [number, number]> = {
  Dadar:     [19.0179, 72.8460],
  Sion:      [19.0403, 72.8615],
  Mahim:     [19.0369, 72.8394],
  Kurla:     [19.0692, 72.8810],
  Bandra:    [19.0640, 72.8493],
  Kalbadevi: [18.9499, 72.8250],
  Chembur:   [19.0618, 72.8998],
  Andheri:   [19.1136, 72.8697],
  Vikhroli:  [19.1088, 72.9231],
  Borivali:  [19.2307, 72.8567],
  Colaba:    [18.9067, 72.8147],
  Goregaon:  [19.1663, 72.8526],
};

async function triggerReroute(zone: string): Promise<string> {
  try {
    const graph = getRoadGraph();
    if (!graph) return 'reroute_skipped_no_graph';

    // Get current risk snapshots to pass to the route engine
    const { data: snapshots } = await supabase
      .from('risk_snapshots')
      .select('zone_name, category, factors')
      .order('created_at', { ascending: false })
      .limit(100);

    const riskSummaries = snapshots
      ? snapshots.filter((s: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.zone_name === s.zone_name) === i)
          .map((s: any) => ({ zone_name: s.zone_name, category: s.category, factors: s.factors ?? {} }))
      : [];

    // Route from zone center to nearest non-critical neighbour
    const zoneCoords = ZONE_CENTERS[zone];
    if (!zoneCoords) return 'reroute_skipped_unknown_zone';

    // Simple: route from the zone to Dadar as an evacuation-anchor reference point
    const anchor = zone === 'Dadar' ? ZONE_CENTERS['Sion'] : ZONE_CENTERS['Dadar'];

    const result = computeRoute(
      { from: { lat: zoneCoords[0], lng: zoneCoords[1] }, to: { lat: anchor[0], lng: anchor[1] } },
      riskSummaries
    );

    if ('error' in result) {
      console.warn(`[Sentinel/Act] Reroute failed for ${zone}: ${result.error}`);
      return 'reroute_failed';
    }

    console.log(`[Sentinel/Act] Reroute computed for ${zone}: ${result.distanceM}m, ${result.estimatedMinutes}min`);
    realtimeBus.emit('agent_reroute', { zone, route: result, timestamp: new Date().toISOString() });
    return 'reroute_computed';
  } catch (err: any) {
    console.error('[Sentinel/Act] Reroute error:', err.message);
    return 'reroute_error';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEARN: Write to agent_log in Supabase
// ─────────────────────────────────────────────────────────────────────────────

async function learn(
  zone: string,
  score: number,
  category: string,
  decision: LLMDecision,
  action_taken: string
): Promise<void> {
  try {
    const { error } = await supabase.from('agent_log').insert({
      zone_name: zone,
      risk_score: score,
      risk_category: category,
      llm_decision: decision as any,
      action_taken,
      triggered_by: 'sentinel_agent',
    });

    if (error) {
      console.warn('[Sentinel/Learn] DB insert failed:', error.message);
    }
  } catch (err: any) {
    console.warn('[Sentinel/Learn] Unexpected error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main cycle
// ─────────────────────────────────────────────────────────────────────────────

async function runCycle(): Promise<void> {
  _cycleCount++;
  const cycleId = _cycleCount;
  console.log(`[Sentinel] ── Cycle #${cycleId} starting ──`);

  // ── PERCEIVE ──────────────────────────────────────────────────────────────
  setStage('perceive');
  let snapshots: any[] = [];

  try {
    const { data, error } = await supabase
      .from('risk_snapshots')
      .select('zone_name, score, category, factors')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    // Deduplicate to latest per zone
    const seen = new Set<string>();
    snapshots = (data || []).filter((s: any) => {
      if (seen.has(s.zone_name)) return false;
      seen.add(s.zone_name);
      return true;
    });

    console.log(`[Sentinel] Perceived ${snapshots.length} zones`);
  } catch (err: any) {
    console.error('[Sentinel/Perceive] Failed:', err.message);
    setStage('idle');
    return;
  }

  // Only evaluate zones that are High or Critical to save LLM quota
  const actionableZones = snapshots.filter((s: any) =>
    s.category === 'high' || s.category === 'critical'
  );
  console.log(`[Sentinel] ${actionableZones.length} zones require LLM evaluation`);

  const cycleResults: AgentLogEntry[] = [];

  // ── REASON + ACT + LEARN per zone ────────────────────────────────────────
  for (const snapshot of actionableZones) {
    const { zone_name, score, category, factors } = snapshot;

    // REASON
    setStage('reason');
    let decision: LLMDecision;
    try {
      decision = await reason(zone_name, score, category, factors ?? {});
      console.log(`[Sentinel] ${zone_name} → action_type=${decision.action_type} confidence=${decision.confidence}`);
    } catch (err: any) {
      console.error(`[Sentinel/Reason] Unexpected error for ${zone_name}:`, err.message);
      continue;
    }

    // ACT
    setStage('act');
    let action_taken = 'none';

    if (decision.action_needed) {
      if (decision.action_type === 'alert' || decision.action_type === 'alert_and_reroute') {
        const emailSent = await sendAlertEmail(zone_name, score, decision);
        action_taken = emailSent ? 'alert_sent' : 'alert_logged';
      }

      if (decision.action_type === 'reroute' || decision.action_type === 'alert_and_reroute') {
        const rerouteResult = await triggerReroute(zone_name);
        action_taken = action_taken === 'none' ? rerouteResult : `${action_taken}+${rerouteResult}`;
      }
    }

    // LEARN
    setStage('learn');
    await learn(zone_name, score, category, decision, action_taken);

    const entry: AgentLogEntry = {
      id: `local-${Date.now()}-${zone_name}`,
      zone_name,
      risk_score: score,
      risk_category: category,
      llm_decision: decision,
      action_taken,
      triggered_by: 'sentinel_agent',
      created_at: new Date().toISOString(),
    };

    cycleResults.push(entry);
    recentLog.unshift(entry);
    if (recentLog.length > MAX_IN_MEMORY) recentLog.pop();
  }

  // Broadcast full cycle summary to Agent Console via SSE
  _lastCycleAt = new Date().toISOString();
  realtimeBus.emit('agent_cycle', {
    cycleId,
    timestamp: _lastCycleAt,
    zonesEvaluated: actionableZones.length,
    zonesTotal: snapshots.length,
    results: cycleResults,
  });

  setStage('idle');
  console.log(`[Sentinel] ── Cycle #${cycleId} complete — ${cycleResults.length} zones acted on ──`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

export function startSentinelAgent(): void {
  console.log('[Sentinel] 🤖 Sentinel Agent starting — runs every 10 minutes');

  // Run once immediately after a short delay (let the risk engine populate data first)
  setTimeout(() => {
    runCycle().catch(err => console.error('[Sentinel] Initial cycle error:', err));
  }, 30_000);

  // Then schedule every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    runCycle().catch(err => console.error('[Sentinel] Cron cycle error:', err));
  });
}
