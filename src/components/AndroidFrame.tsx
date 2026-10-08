import React, { useState } from 'react';
import { Smartphone, Monitor, Download, ShieldCheck, Loader2, Check, ExternalLink } from 'lucide-react';
import { isNativeAndroid } from '../services/capacitorNative';
import { downloadApkBlob, getApkDirectUrl } from '../services/apkDownload';

interface AndroidFrameProps {
  children: React.ReactNode;
  onInstallPwaClick: () => void;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({ children, onInstallPwaClick }) => {
  const [useFrame, setUseFrame] = useState<boolean>(true);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadDone, setDownloadDone] = useState<boolean>(false);
  const currentTime = '10:42';
  const isNative = isNativeAndroid();

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
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
        setTimeout(() => setDownloadDone(false), 4000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  // If running inside the compiled Android APK on a physical phone, render native edge-to-edge
  if (isNative) {
    return (
      <div className="db-app-shell w-full bg-[#F5F7FA] text-slate-800 flex flex-col overflow-hidden relative">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col items-center justify-start antialiased">
      {/* Top Bar Controls for AI Studio Previewer */}
      <header className="w-full bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between z-50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <span className="font-extrabold text-white text-xs tracking-wider">DB</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">DealBriz Android Client</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                Web Preview
              </span>
            </div>
            <p className="text-[10px] text-slate-500 hidden sm:block">
              Mirroring experience of <span className="text-blue-600">dealbriz.com</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Switch View Mode */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 text-xs">
            <button
              onClick={() => setUseFrame(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                useFrame
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Android Phone Mockup"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Phone Frame</span>
            </button>
            <button
              onClick={() => setUseFrame(false)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                !useFrame
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              title="Full Window Responsive View"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Full Width</span>
            </button>
          </div>

          {/* Verified APK Download Button with Stream/Blob Handling */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-all active:scale-95 ${
              downloadDone
                ? 'bg-emerald-50 text-white'
                : downloading
                ? 'bg-emerald-50 text-white cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/30'
            }`}
            title="Download compiled DealBriz APK file (4.3 MB)"
          >
            {downloadDone ? (
              <Check className="w-3.5 h-3.5 text-emerald-700" />
            ) : downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {downloadDone ? 'Saved APK!' : downloading ? `Downloading ${downloadProgress}%` : 'Download APK'}
            </span>
            <span className="text-[10px] bg-emerald-50 px-1 py-0.5 rounded text-emerald-100 font-mono">
              4.3MB
            </span>
          </button>

          {/* Android PWA / APK Details modal button */}
          <button
            onClick={onInstallPwaClick}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 transition-transform active:scale-95"
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden md:inline">Install Guide & ADB</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full flex-1 flex items-center justify-center p-0 sm:p-4 md:p-6 overflow-x-hidden">
        {useFrame ? (
          /* Realistic Android Flagship Frame */
          <div className="relative w-full max-w-[430px] h-[100dvh] sm:h-[92vh] sm:max-h-[890px] bg-white rounded-none sm:rounded-[44px] shadow-2xl shadow-blue-950/40 border-0 sm:border-[8px] sm:border-slate-200 flex flex-col overflow-hidden ring-1 ring-slate-700/50">
            {/* Android Top Bezel / Status Bar */}
            <div className="w-full bg-white text-slate-900 px-6 pt-2 pb-1.5 flex items-center justify-between text-[11px] font-medium select-none z-40 border-b border-slate-200 shrink-0">
              <span>{currentTime}</span>

              {/* Camera punch-hole cutout */}
              <div className="w-3.5 h-3.5 rounded-full bg-black border border-slate-300 shadow-inner"></div>

              {/* Status Icons: 5G, Wi-Fi, Battery */}
              <div className="flex items-center gap-1.5 text-slate-600">
                <span className="text-[10px] font-bold tracking-tight">5G</span>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98C20.93 5.9 16.69 4 12 4z" />
                </svg>
                {/* Battery Pill */}
                <div className="flex items-center gap-0.5 border border-slate-400 rounded-sm px-0.5 py-0.5">
                  <div className="w-3 h-2 bg-emerald-400 rounded-xs"></div>
                  <div className="w-0.5 h-1 bg-slate-400 rounded-r-xs"></div>
                </div>
              </div>
            </div>

            {/* Android Screen Body */}
            <div className="flex-1 w-full relative flex flex-col bg-[#F5F7FA] overflow-hidden min-h-0">
              {children}
            </div>

            {/* Android Bottom Navigation Pill */}
            <div className="w-full bg-[#F5F7FA] pt-1 pb-2 flex justify-center items-center select-none z-30 shrink-0">
              <div className="w-32 h-1 bg-slate-600/60 rounded-full"></div>
            </div>
          </div>
        ) : (
          /* Full Window Responsive View */
          <div className="w-full max-w-2xl h-[100dvh] sm:h-[92vh] sm:max-h-[890px] bg-[#F5F7FA] sm:rounded-2xl border-0 sm:border border-slate-200 shadow-2xl flex flex-col overflow-hidden relative min-h-0">
            {children}
          </div>
        )}
      </main>
    </div>
  );
};
