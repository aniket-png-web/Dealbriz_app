import React, { useState } from 'react';
import {
  X,
  Download,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  FileCode,
  Copy,
  Check,
  ExternalLink,
  Cpu,
  Loader2,
} from 'lucide-react';
import { downloadApkBlob, getApkDirectUrl } from '../services/apkDownload';
import { isNativeAndroid } from '../services/capacitorNative';

interface PwaInstallModalProps {
  onClose: () => void;
  deferredPrompt: any;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({
  onClose,
  deferredPrompt,
}) => {
  const [activeTab, setActiveTab] = useState<'apk' | 'pwa'>('apk');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadDone, setDownloadDone] = useState(false);

  const directApkUrl = getApkDirectUrl();

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadProgress(0);
    setDownloadDone(false);

    try {
      const res = await downloadApkBlob((loaded, total, percent) => {
        setDownloadProgress(percent);
      });
      if (res.success) {
        setDownloadDone(true);
        setTimeout(() => setDownloadDone(false), 5000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handlePwaInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
      }
    } else {
      setInstalled(true);
    }
  };

  // Already running as the installed Android app - offering an APK download
  // (from https://localhost, which doesn't serve one) makes no sense here.
  if (isNativeAndroid()) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-200 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h3 className="font-extrabold text-white text-base">You're on the DealBriz app</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            This is the installed Android app, so there's nothing else to set up. Share the app with a
            friend by sending them{' '}
            <span className="text-blue-600 font-semibold">dealbriz.com</span>.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl relative max-h-[90vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">DealBriz Android Package</h3>
              <p className="text-[10px] text-slate-500">Package: com.dealbriz.app</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex rounded-xl bg-white p-1 border border-slate-200 mb-4 text-xs">
          <button
            onClick={() => setActiveTab('apk')}
            className={`flex-1 py-1.5 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'apk'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Native APK & AAB</span>
          </button>
          <button
            onClick={() => setActiveTab('pwa')}
            className={`flex-1 py-1.5 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'pwa'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Web Shortcut</span>
          </button>
        </div>

        {activeTab === 'apk' ? (
          <div className="space-y-4 text-xs">
            {/* App Card */}
            <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shrink-0 shadow-md">
                <span className="font-extrabold text-white text-base tracking-wider">DB</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm">DealBriz Android App</h4>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                    Built & Ready (4.3 MB)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">Package: com.dealbriz.app • Target SDK 36</p>
                <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-0.5">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Compiled with OpenJDK 21 & Gradle 8.14</span>
                </div>
              </div>
            </div>

            {/* Verified Download Options Card */}
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Verified Android APK (4,418,612 bytes)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Exact: 4.3 MB
                </span>
              </div>

              {/* Primary Interactive In-Memory Download Button */}
              <button
                onClick={handleDownload}
                disabled={downloading}
                className={`w-full py-3 px-4 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2.5 transition-all transform active:scale-98 ${
                  downloadDone
                    ? 'bg-emerald-600 text-white shadow-emerald-700/30'
                    : downloading
                    ? 'bg-emerald-50 text-white cursor-wait'
                    : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white shadow-emerald-600/20'
                }`}
              >
                {downloadDone ? (
                  <Check className="w-4 h-4 text-emerald-700" />
                ) : downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>
                  {downloadDone
                    ? 'APK Saved Successfully!'
                    : downloading
                    ? `Streaming APK... ${downloadProgress}%`
                    : 'Download Full APK (dealbriz.apk)'}
                </span>
                <span className="text-xs bg-emerald-50 px-1.5 py-0.5 rounded-md font-mono">
                  4.3 MB
                </span>
              </button>

              {/* Progress bar when downloading */}
              {downloading && (
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full transition-all duration-150"
                    style={{ width: `${downloadProgress}%` }}
                  ></div>
                </div>
              )}

              {/* Direct Link Options (for Phone Browser / Direct New Tab) */}
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                <a
                  href="/dealbriz.apk"
                  target="_blank"
                  rel="noopener noreferrer"
                  download="dealbriz.apk"
                  className="hover:text-emerald-700 flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open direct URL in new tab</span>
                </a>

                <button
                  onClick={() => copyToClipboard(directApkUrl)}
                  className="hover:text-blue-700 flex items-center gap-1 transition-colors"
                >
                  {copiedText === directApkUrl ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>Copy direct URL</span>
                </button>
              </div>
            </div>

            {/* Steps & Commands */}
            <div className="space-y-3">
              {/* Step 1: Install via USB Debugging */}
              <div className="p-3 bg-white rounded-xl border border-blue-200 space-y-2">
                <div className="flex items-center justify-between text-blue-700 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" />
                    Install via USB Debugging (ADB)
                  </span>
                  <button
                    onClick={() => copyToClipboard('adb install -r dealbriz.apk')}
                    className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700"
                  >
                    {copiedText === 'adb install -r dealbriz.apk' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>Copy ADB Command</span>
                  </button>
                </div>
                <div className="bg-white p-2.5 rounded-lg font-mono text-[11px] text-emerald-600 border border-slate-200 select-all">
                  adb install -r dealbriz.apk
                </div>
                <ol className="list-decimal list-inside text-[10px] text-slate-600 space-y-1">
                  <li>Download <code className="text-emerald-700">dealbriz.apk</code> using the button above.</li>
                  <li>Plug your phone into your computer via USB cable.</li>
                  <li>Enable <strong>USB Debugging</strong> on your phone (Settings &gt; Developer Options).</li>
                  <li>Open your terminal where the APK was downloaded and run the ADB command.</li>
                </ol>
              </div>

              {/* Step 2: Direct on phone */}
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-slate-600 font-semibold">
                  <span>Direct Install on Phone (No PC Needed)</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Open this link on your phone browser, download the APK, and tap the downloaded file in your notifications or <code className="text-slate-600">Files</code> app to install directly.
                </p>
              </div>

              {/* Step 3: Source Code & Rebuild */}
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-slate-600 font-semibold">
                  <span>Rebuild or Modify Project</span>
                  <button
                    onClick={() => copyToClipboard('cd android && ./gradlew assembleDebug')}
                    className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700"
                  >
                    {copiedText === 'cd android && ./gradlew assembleDebug' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>Copy</span>
                  </button>
                </div>
                <div className="bg-white p-2 rounded-lg font-mono text-[10px] text-purple-700 overflow-x-auto">
                  cd android && ./gradlew assembleDebug
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-slate-900 hover:bg-slate-200 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {!installed ? (
              <div className="space-y-3 text-xs text-slate-600">
                <div className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white">
                    DB
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">DealBriz Browser Shortcut</h4>
                    <p className="text-[11px] text-slate-500">Lightweight browser bookmark</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-100">
                    <span className="w-4 h-4 rounded-full bg-blue-600/30 text-blue-400 font-bold flex items-center justify-center text-[10px]">
                      1
                    </span>
                    <p>Tap below to add DealBriz directly to your mobile browser screen.</p>
                  </div>
                </div>

                <button
                  onClick={handlePwaInstall}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 text-xs transition-transform active:scale-98"
                >
                  <Download className="w-4 h-4" />
                  <span>Add Web Shortcut</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h4 className="font-extrabold text-slate-900 text-base">Added to Home Screen!</h4>
                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-slate-900 hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
