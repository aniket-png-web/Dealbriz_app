import React, { useState, useEffect } from 'react';
import {
  X,
  Bell,
  Zap,
  Tag,
  ShieldCheck,
  CheckCheck,
  Radio,
  Settings2,
  Send,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  LogIn,
  LogOut,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  oneSignalService,
  OneSignalStatus,
  getStoredOneSignalAppId,
  saveStoredOneSignalAppId,
} from '../services/oneSignalService';
import { auth, signInWithGoogle, logOutFirebase } from '../services/firebase';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';

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
  onNewNotification?: (item: NotificationItem) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  onClose,
  notifications,
  onMarkAllRead,
  onNewNotification,
}) => {
  const [activeTab, setActiveTab] = useState<'notifications' | 'onesignal'>('notifications');
  const [oneSignalStatus, setOneSignalStatus] = useState<OneSignalStatus>(() =>
    oneSignalService.getStatus()
  );
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [appIdInput, setAppIdInput] = useState<string>(() => getStoredOneSignalAppId());
  const [isSavingAppId, setIsSavingAppId] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    const unsubOneSignal = oneSignalService.subscribe((status) => {
      setOneSignalStatus(status);
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        oneSignalService.linkUser(user.uid, user.email || undefined).catch(() => {});
      }
    });

    return () => {
      unsubOneSignal();
      unsubAuth();
    };
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSaveAppId = async () => {
    if (!appIdInput.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid OneSignal App ID' });
      return;
    }
    setIsSavingAppId(true);
    setStatusMessage(null);
    try {
      saveStoredOneSignalAppId(appIdInput.trim());
      await oneSignalService.initOneSignal(appIdInput.trim());
      setStatusMessage({ type: 'success', text: 'OneSignal App ID saved and re-initialized!' });
    } catch {
      setStatusMessage({ type: 'error', text: 'Could not initialize OneSignal with this App ID.' });
    } finally {
      setIsSavingAppId(false);
    }
  };

  const handleEnablePush = async () => {
    setStatusMessage(null);
    const granted = await oneSignalService.requestNotificationPermission();
    if (granted) {
      setStatusMessage({ type: 'success', text: 'Push notifications enabled successfully!' });
    } else {
      setStatusMessage({
        type: 'error',
        text: 'Notification permission was denied or blocked in browser settings.',
      });
    }
  };

  const handleSendTestPush = async () => {
    setTestSending(true);
    setStatusMessage(null);
    try {
      const title = 'DealBriz Push Alert 🔥';
      const body = 'Instant price drop alert! New verified listings available in your area.';
      const res = await oneSignalService.triggerTestNotification(title, body);

      if (res.success) {
        setStatusMessage({ type: 'success', text: 'Test push notification dispatched!' });
        onNewNotification?.({
          id: `test-${Date.now()}`,
          title,
          message: body,
          time: 'Just now',
          type: 'deal',
          read: false,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: res.message || 'Could not show notification. Enable push permissions first.',
        });
      }
    } finally {
      setTestSending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setStatusMessage(null);
    try {
      const user = await signInWithGoogle();
      setStatusMessage({
        type: 'success',
        text: `Connected with Google (${user.email || 'account'})!`,
      });
      await oneSignalService.linkUser(user.uid, user.email || undefined);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Google sign-in cancelled or failed.',
      });
    }
  };

  const handleSignOut = async () => {
    await logOutFirebase();
    await oneSignalService.unlinkUser();
    setStatusMessage({ type: 'success', text: 'Signed out of Firebase.' });
  };

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
              <p className="text-[11px] text-slate-500">Alerts & OneSignal Web Push</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl mb-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'notifications'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Feed ({notifications.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('onesignal')}
            className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'onesignal'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>OneSignal & Firebase</span>
            {oneSignalStatus.hasPermission && (
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            )}
          </button>
        </div>

        {statusMessage && (
          <div
            className={`mb-3 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span className="flex-1">{statusMessage.text}</span>
          </div>
        )}

        {/* TAB 1: Notifications Feed */}
        {activeTab === 'notifications' && (
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
                <button
                  onClick={handleSendTestPush}
                  className="mt-3 text-xs text-blue-600 font-semibold underline underline-offset-2"
                >
                  Send a test push notification
                </button>
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

        {/* TAB 2: OneSignal & Firebase Configuration */}
        {activeTab === 'onesignal' && (
          <div className="space-y-4">
            {/* Firebase Account Card */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-900">Firebase Authentication</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                  Connected
                </span>
              </div>

              {firebaseUser ? (
                <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 min-w-0">
                    {firebaseUser.photoURL ? (
                      <img
                        src={firebaseUser.photoURL}
                        alt="Avatar"
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {firebaseUser.email?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {firebaseUser.displayName || 'Google Account'}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">{firebaseUser.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-[11px] text-slate-600 mb-2.5">
                    Sign in with your Google account (e.g.{' '}
                    <span className="font-semibold text-slate-800">redevilaed@gmail.com</span>) to link
                    your account to Firebase & OneSignal notifications.
                  </p>
                  <button
                    onClick={handleGoogleSignIn}
                    className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Connect Google Account</span>
                  </button>
                </div>
              )}
            </div>

            {/* OneSignal Web Push Status */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
                    <Radio className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    OneSignal Push Service
                    {oneSignalStatus.isNative && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-sm bg-blue-100 text-blue-700">
                        Android Native
                      </span>
                    )}
                  </span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    oneSignalStatus.hasPermission
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {oneSignalStatus.hasPermission ? 'Push Active' : 'Permission Needed'}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleEnablePush}
                  className="py-2 px-3 rounded-xl bg-white border border-slate-200 hover:border-blue-400 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Bell className="w-3.5 h-3.5 text-blue-600" />
                  <span>Enable Push</span>
                </button>
                <button
                  onClick={handleSendTestPush}
                  disabled={testSending}
                  className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Test Push</span>
                </button>
              </div>

              {/* OneSignal App ID Configuration */}
              <div className="pt-2 border-t border-slate-200">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  OneSignal App ID
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    placeholder="e.g. 12345678-abcd-1234-abcd-1234567890ab"
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSaveAppId}
                    disabled={isSavingAppId}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Connected to OneSignal account for <span className="font-semibold text-slate-700">redevilaed@gmail.com</span>
                </p>
              </div>
            </div>

            {/* Firebase Cloud Messaging Link details for OneSignal Dashboard */}
            <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100">
              <h4 className="text-xs font-bold text-blue-900 mb-1">
                Link OneSignal to Firebase Cloud Messaging (FCM)
              </h4>
              <p className="text-[11px] text-blue-700 leading-snug mb-3">
                In your OneSignal Dashboard (under <strong>Settings → Platforms → Google Android / Web Push</strong>), enter your Firebase details below:
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-blue-200/60 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">FCM Sender ID</span>
                    <span className="font-mono font-bold text-slate-800">{oneSignalStatus.fcmSenderId}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(oneSignalStatus.fcmSenderId, 'senderId')}
                    className="p-1 rounded-lg text-blue-600 hover:bg-blue-50"
                  >
                    {copiedKey === 'senderId' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-blue-200/60 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Firebase Project ID</span>
                    <span className="font-mono font-bold text-slate-800">{oneSignalStatus.firebaseProjectId}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(oneSignalStatus.firebaseProjectId, 'projectId')}
                    className="p-1 rounded-lg text-blue-600 hover:bg-blue-50"
                  >
                    {copiedKey === 'projectId' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
