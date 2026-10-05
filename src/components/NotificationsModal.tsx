import React, { useState, useEffect } from 'react';
import { X, Bell, BellOff, Zap, Tag, ShieldCheck, CheckCheck } from 'lucide-react';
import { oneSignalService, OneSignalStatus } from '../services/oneSignalService';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'emi' | 'offer' | 'deal' | 'system';
  read: boolean;
}

interface NotificationsModalProps {
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  /** Kept for App.tsx compatibility; nothing here invents notifications any more. */
  onNewNotification?: (item: NotificationItem) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  onClose,
  notifications,
  onMarkAllRead,
}) => {
  const [pushStatus, setPushStatus] = useState<OneSignalStatus>(() => oneSignalService.getStatus());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = oneSignalService.subscribe(setPushStatus);
    // Opening notifications is the "someone wants notifications" moment: if
    // they're off and Android can still show its dialog, ask right away.
    (async () => {
      await oneSignalService.refresh();
      const s = oneSignalService.getStatus();
      if (s.isNative && !s.hasPermission && (await oneSignalService.canShowSystemPrompt())) {
        await oneSignalService.requestNotificationPermission(false);
      }
    })().catch(() => {});
    return unsub;
  }, []);

  // Explicit tap: shows the dialog, or opens Android Settings if the user refused before.
  const handleTurnOn = async () => {
    setBusy(true);
    try {
      await oneSignalService.requestNotificationPermission(true);
    } finally {
      setBusy(false);
    }
  };

  const showOffBanner = pushStatus.isNative && pushStatus.pluginAvailable && !pushStatus.hasPermission;

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-5 db-sheet-bottom-p5 shadow-2xl relative max-h-[88vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base leading-tight">Notifications</h3>
              <p className="text-[11px] text-slate-500">Your DealBriz alerts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>


        {showOffBanner && (
          <div className="mb-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <BellOff className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-900">Notifications are off</p>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                Turn them on to know when a buyer or seller messages you.
              </p>
              <button
                onClick={handleTurnOn}
                disabled={busy}
                className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-bold active:scale-95 transition-transform disabled:opacity-60"
              >
                {busy ? 'Opening…' : 'Turn on'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: Notifications Feed */}
        {(
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-slate-500">Recent Alerts</span>
              <button
                onClick={onMarkAllRead}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            </div>

            {notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No notifications yet</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-2xl border transition-all flex items-start gap-3 ${
                      n.read
                        ? 'bg-slate-50 border-slate-200 opacity-80'
                        : 'bg-white border-blue-200 shadow-xs'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        n.type === 'emi'
                          ? 'bg-amber-50 text-amber-700'
                          : n.type === 'offer'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {n.type === 'emi' && <Zap className="w-4 h-4 fill-current" />}
                      {n.type === 'offer' && <Tag className="w-4 h-4" />}
                      {n.type === 'deal' && <ShieldCheck className="w-4 h-4" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-slate-900 truncate">{n.title}</h5>
                        <span className="text-[9px] text-slate-500">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{n.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
