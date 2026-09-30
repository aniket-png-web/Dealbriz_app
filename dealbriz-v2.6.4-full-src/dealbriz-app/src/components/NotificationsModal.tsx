import React from 'react';
import { X, Bell, Zap, Tag, ShieldCheck, CheckCheck } from 'lucide-react';

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
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  onClose,
  notifications,
  onMarkAllRead,
}) => {
  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-5 db-sheet-bottom-p5 shadow-2xl relative max-h-[85vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-6 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600" />
            <h3 className="font-extrabold text-slate-900 text-base">Notifications</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAllRead}
              className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark Read</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-3 rounded-2xl border transition-all flex items-start gap-3 ${
                n.read
                  ? 'bg-slate-100 border-slate-200 opacity-80'
                  : 'bg-slate-100 border-blue-200 shadow-sm'
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
      </div>
    </div>
  );
};
