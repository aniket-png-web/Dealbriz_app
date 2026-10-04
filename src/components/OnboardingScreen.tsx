import React from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';

interface OnboardingScreenProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

/** First-launch splash. Shown once; App persists a flag afterwards. */
export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  onGetStarted,
  onSignIn,
}) => {
  return (
    <div className="absolute inset-0 z-[200] flex flex-col overflow-y-auto overscroll-contain bg-gradient-to-b from-blue-600 via-blue-700 to-indigo-900">
      <div className="absolute -top-16 -left-16 w-72 h-72 rounded-full bg-sky-300/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-24 -right-20 w-80 h-80 rounded-full bg-indigo-400/25 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex-1 min-h-[45vh] flex flex-col items-center justify-center px-8 py-10 db-safe-top">
        <img
          src="/app-icon.png"
          alt=""
          className="rounded-3xl shadow-2xl shadow-blue-950/40 ring-1 ring-white/20"
          style={{ width: 88, height: 88 }}
        />
        <h1 className="mt-5 text-4xl font-black tracking-tight text-white">DealBriz</h1>
        <p className="mt-1.5 text-sm text-blue-100 font-medium">Buy. Sell. Live Better.</p>
      </div>

      <div className="relative z-10 px-7 pb-8 db-sheet-bottom">
        <h2 className="text-2xl font-black text-white leading-tight tracking-tight">
          Great Deals
          <br />
          Closer to You
        </h2>
        <p className="mt-1.5 text-xs text-blue-100 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          Verified. Local. Trusted.
        </p>

        <button
          onClick={onGetStarted}
          className="mt-6 w-full py-3.5 rounded-2xl bg-white text-blue-700 text-sm font-extrabold shadow-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          Get Started
          <ArrowRight className="w-4 h-4 stroke-[3]" />
        </button>

        <button
          onClick={onSignIn}
          className="mt-3 w-full py-3.5 rounded-2xl bg-white/10 border border-white/25 text-white text-sm font-bold backdrop-blur-xs active:scale-[0.98] transition-transform"
        >
          Sign In
        </button>
      </div>
    </div>
  );
};
