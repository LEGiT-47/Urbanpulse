import { AlertTriangle, Clock, Flame, X } from 'lucide-react';

export interface AlertNotification {
  id: string;
  timestamp: string;
  type: 'critical' | 'predicted';
  message: string;
  zoneName: string;
  score: number;
}

interface NotificationDrawerProps {
  alerts: AlertNotification[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
  onSelectZone: (zoneName: string) => void;
  isDarkMode: boolean;
}

export default function NotificationDrawer({
  alerts,
  isOpen,
  onClose,
  onClear,
  onSelectZone,
  isDarkMode,
}: NotificationDrawerProps) {
  if (!isOpen) return null;

  const themeBg = isDarkMode ? 'bg-[#0f172a]/95 border-slate-800' : 'bg-white/95 border-slate-200';
  const themeCard = isDarkMode ? 'bg-slate-900 border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-slate-200 hover:border-slate-300';
  const themeText = isDarkMode ? 'text-white' : 'text-slate-800';

  return (
    <div className={`absolute right-5 top-5 w-85 max-w-[22rem] h-[85vh] ${themeBg} border rounded-2xl p-5 shadow-2xl z-[1000] backdrop-filter backdrop-blur-md flex flex-col gap-4 animate-in fade-in slide-in-from-right-5 duration-200`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/40 pb-3">
        <div>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-mono">Real-Time Alerts</span>
          <h2 className={`text-base font-bold ${themeText} flex items-center gap-1.5`}>
            Predictive Warnings ({alerts.length})
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {alerts.length > 0 && (
            <button
              onClick={onClear}
              className="text-[10px] text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
            >
              Clear All
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800/40 text-gray-400 hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 p-5">
            <Clock className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
            <p className="text-xs">No active risk alerts.</p>
            <p className="text-[10px] text-gray-600 mt-1">
              Warnings will appear here if any zone risk exceeds 75 or is forecasted to cross 75.
            </p>
          </div>
        ) : (
          alerts.map((alert) => {
            const isCritical = alert.type === 'critical';
            return (
              <div
                key={alert.id}
                onClick={() => onSelectZone(alert.zoneName)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex gap-3 ${themeCard}`}
              >
                {/* Icon */}
                <div className={`p-2 rounded-lg shrink-0 h-fit ${
                  isCritical ? 'bg-red-500/10 text-red-500' : 'bg-orange-500/10 text-orange-500'
                }`}>
                  {isCritical ? <Flame className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                </div>

                {/* Content */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${
                      isCritical ? 'text-red-400' : 'text-orange-400'
                    }`}>
                      {isCritical ? 'Critical Risk' : 'Risk Projection'}
                    </span>
                    <span className="text-[9px] text-gray-500 font-mono">
                      {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <p className={`text-xs font-semibold ${themeText}`}>{alert.message}</p>
                  <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-1">
                    <span>Zone: <strong className="text-slate-400">{alert.zoneName}</strong></span>
                    <span>•</span>
                    <span>Score: <strong className="text-slate-400">{alert.score}</strong></span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
