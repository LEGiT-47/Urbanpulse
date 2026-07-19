import { useEffect, useState, useRef } from 'react';
import { Bot, Eye, Brain, Zap, BookOpen, RefreshCw, Mail, Navigation, AlertTriangle, CheckCircle2, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { getApiUrl } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LLMDecision {
  action_needed: boolean;
  action_type: 'alert' | 'reroute' | 'alert_and_reroute' | 'none';
  explanation: string;
  confidence: number;
}

interface AgentLogEntry {
  id: string;
  zone_name: string;
  risk_score: number;
  risk_category: string;
  llm_decision: LLMDecision;
  action_taken: string;
  triggered_by: string;
  created_at: string;
}

type AgentStage = 'idle' | 'perceive' | 'reason' | 'act' | 'learn';

interface AgentConsolePanelProps {
  isDarkMode: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage metadata
// ─────────────────────────────────────────────────────────────────────────────

const STAGES: { id: AgentStage; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
  { id: 'perceive', label: 'Perceive', icon: <Eye className="w-4 h-4" />, color: 'cyan', desc: 'Reading live risk snapshots' },
  { id: 'reason',  label: 'Reason',   icon: <Brain className="w-4 h-4" />, color: 'violet', desc: 'LLM evaluating convergence' },
  { id: 'act',     label: 'Act',      icon: <Zap className="w-4 h-4" />, color: 'amber', desc: 'Sending alerts / reroutes' },
  { id: 'learn',   label: 'Learn',    icon: <BookOpen className="w-4 h-4" />, color: 'emerald', desc: 'Writing to agent_log' },
];

const STAGE_COLORS: Record<string, string> = {
  cyan:    'bg-cyan-500/20 border-cyan-500/60 text-cyan-300',
  violet:  'bg-violet-500/20 border-violet-500/60 text-violet-300',
  amber:   'bg-amber-500/20 border-amber-500/60 text-amber-300',
  emerald: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300',
};

const STAGE_INACTIVE = 'bg-slate-800/50 border-slate-700/50 text-slate-500';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: action type pill
// ─────────────────────────────────────────────────────────────────────────────

function ActionPill({ type }: { type: string }) {
  const cfg: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    alert:            { label: 'Alert',          cls: 'bg-red-500/20 text-red-300 border-red-500/40',     icon: <Mail className="w-3 h-3" /> },
    reroute:          { label: 'Reroute',         cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',  icon: <Navigation className="w-3 h-3" /> },
    alert_and_reroute:{ label: 'Alert + Reroute', cls: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: <AlertTriangle className="w-3 h-3" /> },
    none:             { label: 'None',            cls: 'bg-slate-700/50 text-slate-400 border-slate-600/40', icon: <CheckCircle2 className="w-3 h-3" /> },
  };
  const c = cfg[type] ?? cfg['none'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

function RiskBadge({ score, category }: { score: number; category: string }) {
  const cls = category === 'critical' ? 'text-red-400'
    : category === 'high' ? 'text-orange-400'
    : category === 'moderate' ? 'text-yellow-400' : 'text-emerald-400';
  return <span className={`font-mono font-bold text-sm ${cls}`}>{score}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function AgentConsolePage({ isDarkMode }: AgentConsolePanelProps) {
  const [currentStage, setCurrentStage] = useState<AgentStage>('idle');
  const [log, setLog] = useState<AgentLogEntry[]>([]);
  const [cycleInfo, setCycleInfo] = useState<{ cycleId: number; zonesEvaluated: number; zonesTotal: number; timestamp: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [nextCycleIn, setNextCycleIn] = useState(60);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const themeCard   = isDarkMode ? 'bg-[#111827] border-[#1f2937]' : 'bg-white border-slate-200 shadow-sm';
  const themeMuted  = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const themeText   = isDarkMode ? 'text-[#e2e8f0]' : 'text-slate-800';
  const themeBorder = isDarkMode ? 'border-[#1f2937]' : 'border-slate-200';

  // ── Fetch initial log ────────────────────────────────────────────────────
  async function fetchHistory() {
    try {
      const res = await fetch(getApiUrl('/api/agent/history?limit=50'));
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) return;
      const data = await res.json();
      setLog(data.entries || []);
    } catch (err) {
      console.warn('[AgentConsole] History fetch paused while backend connects.');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Countdown ticker ─────────────────────────────────────────────────────
  function resetCountdown() {
    setNextCycleIn(60);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setNextCycleIn(prev => Math.max(0, prev - 1));
    }, 1000);
  }

  useEffect(() => {
    fetchHistory();
    resetCountdown();

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      source = new EventSource(getApiUrl('/api/realtime/stream'));

      source.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'agent_stage') {
            setCurrentStage(msg.data.stage as AgentStage);
          }
          if (msg.type === 'agent_cycle') {
            const { cycleId, zonesEvaluated, zonesTotal, timestamp, results } = msg.data;
            setCycleInfo({ cycleId, zonesEvaluated, zonesTotal, timestamp });
            if (results && results.length > 0) {
              setLog(prev => [...results, ...prev].slice(0, 100));
            }
            resetCountdown();
            setTimeout(() => setCurrentStage('idle'), 500);
          }
        } catch (_) {}
      };

      source.onerror = () => {
        if (source) source.close();
        retryTimer = setTimeout(connect, 10000);
      };
    }

    connect();

    return () => {
      if (source) source.close();
      if (retryTimer) clearTimeout(retryTimer);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  function toggleRow(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30">
              <Bot className="w-5 h-5 text-violet-400" />
              {currentStage !== 'idle' && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500" />
                </span>
              )}
            </div>
            <div>
              <h2 className={`text-xl font-bold tracking-tight ${themeText}`}>
                Sentinel Agent Console
                <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">AUTONOMOUS</span>
              </h2>
              <p className={`text-xs mt-0.5 ${themeMuted}`}>Perceive → Reason → Act → Learn · runs every 60 seconds</p>
            </div>
          </div>
        </div>
        <button
          onClick={fetchHistory}
          className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500'} transition-colors`}
          title="Refresh log"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Loop Stage Indicators ── */}
      <div className={`rounded-2xl border p-5 ${themeCard}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-xs font-bold uppercase tracking-widest ${themeMuted}`}>Agent Loop — Live Stage</h3>
          <div className={`flex items-center gap-1.5 text-[10px] font-mono ${themeMuted}`}>
            <Clock className="w-3 h-3" />
            Next cycle in <span className="text-violet-400 font-bold">{nextCycleIn}s</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {STAGES.map((stage, idx) => {
            const isActive = currentStage === stage.id;
            const isPast = currentStage !== 'idle' &&
              STAGES.findIndex(s => s.id === currentStage) > idx;

            return (
              <div key={stage.id} className="flex flex-col items-center gap-2">
                <div className={`relative w-full rounded-xl border p-3 flex flex-col items-center gap-2 transition-all duration-500 ${
                  isActive ? STAGE_COLORS[stage.color] + ' shadow-lg scale-[1.03]'
                  : isPast ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : STAGE_INACTIVE
                }`}>
                  {isActive && (
                    <div className={`absolute inset-0 rounded-xl opacity-30 animate-pulse bg-${stage.color}-500`} />
                  )}
                  <div className={`relative z-10 ${isActive ? '' : isPast ? 'text-emerald-400' : 'text-slate-600'}`}>
                    {isPast ? <CheckCircle2 className="w-4 h-4" /> : stage.icon}
                  </div>
                  <span className={`relative z-10 text-[10px] font-bold uppercase tracking-wider ${isActive ? '' : isPast ? 'text-emerald-400' : 'text-slate-600'}`}>
                    {stage.label}
                  </span>
                  {isActive && (
                    <span className="relative z-10 text-[9px] text-center leading-tight opacity-80">{stage.desc}</span>
                  )}
                </div>
                {idx < STAGES.length - 1 && (
                  <div className={`w-full h-px mt-[-2px] ${isPast ? 'bg-emerald-500/40' : 'bg-slate-700/50'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Cycle stats */}
        {cycleInfo && (
          <div className={`mt-4 pt-4 border-t ${themeBorder} grid grid-cols-3 gap-4 text-center`}>
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${themeMuted}`}>Cycle #</p>
              <p className="text-lg font-mono font-bold text-violet-400">{cycleInfo.cycleId}</p>
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${themeMuted}`}>Zones Evaluated</p>
              <p className="text-lg font-mono font-bold text-amber-400">{cycleInfo.zonesEvaluated} / {cycleInfo.zonesTotal}</p>
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${themeMuted}`}>Last Run</p>
              <p className="text-xs font-mono text-slate-400">{new Date(cycleInfo.timestamp).toLocaleTimeString()}</p>
            </div>
          </div>
        )}

        {currentStage === 'idle' && !cycleInfo && (
          <p className={`mt-4 text-center text-xs ${themeMuted}`}>
            Waiting for first cycle… Agent starts 30s after server boot.
          </p>
        )}
      </div>

      {/* ── Activity Log ── */}
      <div className={`rounded-2xl border ${themeCard}`}>
        <div className={`px-5 py-4 border-b ${themeBorder} flex items-center justify-between`}>
          <h3 className={`text-xs font-bold uppercase tracking-widest ${themeMuted}`}>
            Activity Log
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
              🤖 Sentinel Agent
            </span>
          </h3>
          <span className={`text-[10px] font-mono ${themeMuted}`}>{log.length} entries</span>
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading agent history…
          </div>
        ) : log.length === 0 ? (
          <div className="p-8 text-center">
            <Bot className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className={`text-sm ${themeMuted}`}>No agent cycles recorded yet.</p>
            <p className={`text-xs mt-1 ${themeMuted}`}>The agent runs every 60s. Make sure the backend is running and <code>agent_log</code> table exists.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {log.map(entry => {
              const expanded = expandedRows.has(entry.id);
              return (
                <div key={entry.id} className="transition-colors hover:bg-slate-800/20">
                  <button
                    onClick={() => toggleRow(entry.id)}
                    className="w-full text-left px-5 py-3.5 flex items-center gap-4"
                  >
                    {/* Timestamp */}
                    <span className={`text-[10px] font-mono shrink-0 w-20 ${themeMuted}`}>
                      {new Date(entry.created_at).toLocaleTimeString()}
                    </span>

                    {/* Zone */}
                    <span className={`text-xs font-semibold w-24 shrink-0 ${themeText}`}>{entry.zone_name}</span>

                    {/* Score */}
                    <div className="w-12 shrink-0">
                      <RiskBadge score={entry.risk_score} category={entry.risk_category} />
                    </div>

                    {/* Action */}
                    <div className="flex-1 min-w-0">
                      <ActionPill type={entry.llm_decision?.action_type ?? 'none'} />
                    </div>

                    {/* Confidence */}
                    <span className={`text-[10px] font-mono w-10 shrink-0 text-right ${themeMuted}`}>
                      {entry.llm_decision?.confidence != null
                        ? `${(entry.llm_decision.confidence * 100).toFixed(0)}%`
                        : '—'}
                    </span>

                    {/* Sentinel badge */}
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 border border-violet-500/20 shrink-0">
                      🤖 Sentinel
                    </span>

                    {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                  </button>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className={`px-5 pb-4 pt-0 ml-24 space-y-2`}>
                      <div className={`rounded-xl px-4 py-3 border ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                        <p className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${themeMuted}`}>LLM Explanation</p>
                        <p className={`text-xs leading-relaxed ${themeText}`}>{entry.llm_decision?.explanation || 'No explanation available.'}</p>
                      </div>
                      <div className="flex gap-3 text-[10px] font-mono">
                        <span className={themeMuted}>Action taken: <span className="text-amber-400">{entry.action_taken}</span></span>
                        <span className={themeMuted}>Triggered by: <span className="text-violet-400">{entry.triggered_by}</span></span>
                        <span className={themeMuted}>Category: <span className={`${entry.risk_category === 'critical' ? 'text-red-400' : entry.risk_category === 'high' ? 'text-orange-400' : 'text-slate-300'}`}>{entry.risk_category}</span></span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Info footer ── */}
      <div className={`rounded-xl border px-4 py-3 ${isDarkMode ? 'bg-violet-500/5 border-violet-500/20' : 'bg-violet-50 border-violet-200'}`}>
        <p className={`text-[10px] leading-relaxed ${isDarkMode ? 'text-violet-300/70' : 'text-violet-600'}`}>
          <strong>How it works:</strong> Every 60 seconds the Sentinel Agent queries live risk snapshots (Perceive), sends High/Critical zones to the Groq LLM for convergence analysis (Reason), dispatches email alerts via Resend and computes emergency routes (Act), then logs every decision to the <code>agent_log</code> Supabase table (Learn). Actions are tagged <strong>🤖 Sentinel Agent</strong> to distinguish them from operator-triggered events.
        </p>
      </div>
    </div>
  );
}
