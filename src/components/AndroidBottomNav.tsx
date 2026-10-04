import React from 'react';
import { Home, Grid, Plus, MessageSquare, User } from 'lucide-react';
import { ActiveTab } from '../types';

interface AndroidBottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  unreadChatsCount: number;
}

export const AndroidBottomNav: React.FC<AndroidBottomNavProps> = ({
  activeTab,
  onTabChange,
  unreadChatsCount,
}) => {
  return (
    <nav
      id="android-bottom-bar"
      className="db-safe-bottom shrink-0 z-40 bg-white/98 backdrop-blur-lg border-t border-slate-200 px-2 pt-1 pb-1 flex items-center justify-around shadow-2xl select-none"
    >
      {/* 1. Home */}
      <button
        onClick={() => onTabChange('home')}
        className={`flex-1 flex flex-col items-center py-1 transition-colors relative ${
          activeTab === 'home' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <div
          className={`p-1 rounded-xl transition-all ${
            activeTab === 'home' ? 'bg-blue-600/15' : ''
          }`}
        >
          <Home className="w-5 h-5" />
        </div>
        <span className="text-[10px] font-medium tracking-tight mt-0.5">Home</span>
      </button>

      {/* 2. Categories */}
      <button
        onClick={() => onTabChange('categories')}
        className={`flex-1 flex flex-col items-center py-1 transition-colors relative ${
          activeTab === 'categories' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <div
          className={`p-1 rounded-xl transition-all ${
            activeTab === 'categories' ? 'bg-blue-600/15' : ''
          }`}
        >
          <Grid className="w-5 h-5" />
        </div>
        <span className="text-[10px] font-medium tracking-tight mt-0.5">Explore</span>
      </button>

      {/* 3. SELL - Elevated Centered Android FAB */}
      <div className="flex-1 flex justify-center -mt-4">
        <button
          onClick={() => onTabChange('sell')}
          className="w-13 h-13 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white flex flex-col items-center justify-center shadow-lg shadow-blue-600/40 border-4 border-[#070F1E] active:scale-95 transition-transform"
          aria-label="Sell on DealBriz"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
          <span className="text-[8px] font-black tracking-wider uppercase -mt-0.5">Sell</span>
        </button>
      </div>

      {/* 4. Chats */}
      <button
        onClick={() => onTabChange('chats')}
        className={`flex-1 flex flex-col items-center py-1 transition-colors relative ${
          activeTab === 'chats' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <div
          className={`p-1 rounded-xl transition-all relative ${
            activeTab === 'chats' ? 'bg-blue-600/15' : ''
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          {unreadChatsCount > 0 && (
            <span className="absolute -top-0.5 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center shadow">
              {unreadChatsCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium tracking-tight mt-0.5">Chats</span>
      </button>

      {/* 5. Profile */}
      <button
        onClick={() => onTabChange('profile')}
        className={`flex-1 flex flex-col items-center py-1 transition-colors relative ${
          activeTab === 'profile' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <div
          className={`p-1 rounded-xl transition-all ${
            activeTab === 'profile' ? 'bg-blue-600/15' : ''
          }`}
        >
          <User className="w-5 h-5" />
        </div>
        <span className="text-[10px] font-medium tracking-tight mt-0.5">Profile</span>
      </button>
    </nav>
  );
};
