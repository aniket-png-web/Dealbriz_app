import React, { useState } from 'react';
import { PullToRefresh } from './PullToRefresh';
import {
  ArrowLeft,
  ShieldCheck,
  MapPin,
  Phone,
  Mail,
  Heart,
  Tag,
  Zap,
  Globe,
  ExternalLink,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Trash2,
  Edit3,
  Bot,
  ShieldAlert,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { EmiApplication, Listing, UserProfile } from '../types';
import { EMI_STATUS_LABELS } from '../services/dealbrizApi';
import { initialsAvatar, defaultListingImage } from '../utils/imageUtils';

interface ProfileViewProps {
  user: UserProfile;
  myListings: Listing[];
  savedListings: Listing[];
  emiApplications: EmiApplication[];
  onSelectListing: (listing: Listing) => void;
  onRemoveSaved: (id: string, e: React.MouseEvent) => void;
  onMarkAsSold: (id: string) => void;
  onEditListing?: (listing: Listing) => void;
  onDeleteListing?: (id: string) => void;
  onToggleStatus?: (id: string) => void;
  onOpenWebsite: () => void;
  onOpenSellModal: () => void;
  onOpenFaqs?: () => void;
  onOpenChatbot?: () => void;
  onOpenReportProblem?: () => void;
  onOpenAuth?: (mode?: 'login' | 'signup') => void;
  onOpenEmi?: () => void;
  showPhone?: boolean;
  onToggleShowPhone?: (on: boolean) => void;
  onRefresh?: () => Promise<unknown>;
  onLogout?: () => void;
  onEditProfile?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  myListings,
  savedListings,
  emiApplications,
  onSelectListing,
  onRemoveSaved,
  onMarkAsSold,
  onEditListing,
  onDeleteListing,
  onToggleStatus,
  onOpenWebsite,
  onOpenEmi,
  showPhone,
  onToggleShowPhone,
  onRefresh,
  onOpenSellModal,
  onOpenFaqs,
  onOpenChatbot,
  onOpenReportProblem,
  onOpenAuth,
  onLogout,
  onEditProfile,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'listings' | 'saved' | 'emi' | null>(null);

  const isLoggedIn = Boolean(user.isAuthenticated);

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <PullToRefresh
      className="p-4 space-y-4 pb-28"
      onRefresh={onRefresh ?? (async () => {})}
      disabled={!onRefresh}
    >
      {/* Profile Card / Guest Welcome Banner */}
      {activeSubTab ? null : !isLoggedIn ? (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-xl relative overflow-hidden">
          <div className="flex items-start gap-3.5 mb-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-600/30 shrink-0">
              <LogIn className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Welcome to DealBriz</h3>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Sign in to post items, chat with local sellers in {user.city}, and apply for instant EMI financing.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
            <button
              onClick={() => onOpenAuth?.('login')}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              onClick={() => onOpenAuth?.('signup')}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-blue-700 border border-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create Account</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Identity */}
          <div className="flex items-center gap-3.5 px-1 pt-1">
            <img
              src={user.avatar?.trim() || initialsAvatar(user.name, 160)}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-16 h-16 shrink-0 rounded-full object-cover border-2 border-white shadow-md ring-1 ring-slate-200"
            />

            <div className="flex-1 min-w-0">
              <h3 className="font-black text-slate-900 text-lg truncate leading-tight">{user.name}</h3>
              <div className="flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-xs font-bold text-blue-700">
                  DealBriz Member
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">{user.email}</p>
            </div>

            {onEditProfile && (
              <button
                onClick={onEditProfile}
                aria-label="Edit profile"
                className="shrink-0 w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 active:scale-95"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Stats - every number counted from real data */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex items-stretch divide-x divide-slate-200">
            <div className="flex-1 py-3 text-center">
              <p className="text-xl font-black text-slate-900 leading-none">
                {myListings.filter((l) => l.status !== 'sold').length}
              </p>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">Active Listings</p>
            </div>
            <div className="flex-1 py-3 text-center">
              <p className="text-xl font-black text-slate-900 leading-none">
                {myListings.filter((l) => l.status === 'sold').length}
              </p>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">Sold Items</p>
            </div>
            <div className="flex-1 py-3 text-center">
              <p className="text-xl font-black text-slate-900 leading-none">{savedListings.length}</p>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">Saved</p>
            </div>
          </div>

          <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
            <span>{user.memberSince ? `Member since ${user.memberSince}` : 'DealBriz member'}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAuth?.('login')}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                Switch Account
              </button>
              {onLogout && (
                <>
                  <span className="text-slate-400">•</span>
                  <button onClick={onLogout} className="text-rose-600 font-semibold">
                    Log Out
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {!activeSubTab && (
        <>
      {/* Website card - you're already in the app, so offering an APK here
          made no sense. */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-4 text-white shadow-xl shadow-blue-600/20 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-black tracking-wider uppercase bg-white/20 px-1.5 py-0.5 rounded">
              dealbriz.com
            </span>
          </div>
          <h4 className="font-extrabold text-sm">The full marketplace, on the big screen</h4>
          <p className="text-[11px] text-blue-100 mt-0.5">
            Same account, same ads — browse and manage your listings from any browser.
          </p>
        </div>

        <button
          onClick={onOpenWebsite}
          className="bg-white text-blue-900 hover:bg-slate-100 text-xs font-black px-3.5 py-2.5 rounded-xl shrink-0 shadow active:scale-95 transition-all flex items-center gap-1.5"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Visit</span>
        </button>
      </div>

      {/* Menu rows - each opens its own page */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100 overflow-hidden">
        {[
          { key: 'listings' as const, icon: Tag, label: 'My Listings', count: myListings.length },
          { key: 'saved' as const, icon: Heart, label: 'Saved Items', count: savedListings.length },
          { key: 'emi' as const, icon: Zap, label: 'EMI Loans', count: emiApplications.length },
        ].map(({ key, icon: Icon, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveSubTab(key)}
            className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-slate-50 transition-colors"
          >
            <Icon className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="flex-1 text-sm font-semibold text-slate-800">{label}</span>
            {count > 0 && (
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {count}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        ))}

        {onToggleShowPhone && (
          <div className="w-full px-4 py-3.5 flex items-center gap-3">
            <Phone className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-slate-800">
                Show my mobile number
              </span>
              <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">
                {showPhone
                  ? 'Buyers can see your number on your ads and in chat.'
                  : 'Your number stays hidden. Buyers can still reach you in chat.'}
              </span>
            </span>
            <button
              role="switch"
              aria-checked={Boolean(showPhone)}
              aria-label="Show my mobile number"
              onClick={() => onToggleShowPhone(!showPhone)}
              className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
                showPhone ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  showPhone ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        )}

        <button
          onClick={onOpenChatbot}
          className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-slate-50 transition-colors"
        >
          <HelpCircle className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="flex-1 text-sm font-semibold text-slate-800">Help &amp; Support</span>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          onClick={onOpenFaqs}
          className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-slate-50 transition-colors"
        >
          <Settings className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="flex-1 text-sm font-semibold text-slate-800">FAQs &amp; Settings</span>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </div>

        </>
      )}

      {activeSubTab && (
        <div className="flex items-center gap-2 -mx-1 pb-1">
          <button
            onClick={() => setActiveSubTab(null)}
            aria-label="Back to profile"
            className="w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-700 active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">
            {activeSubTab === 'listings'
              ? 'My Listings'
              : activeSubTab === 'saved'
                ? 'Saved Items'
                : 'EMI Loans'}
          </h3>
        </div>
      )}

      {activeSubTab === 'listings' && (
        <div className="space-y-3">
          {myListings.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500">
                <Tag className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">You haven't posted any ads yet</h4>
              <p className="text-xs text-slate-500">
                Got a car, smartphone, laptop or bike to sell? Post your ad in 60 seconds!
              </p>
              <button
                onClick={onOpenSellModal}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow active:scale-95"
              >
                Post an Ad Now
              </button>
            </div>
          ) : (
            myListings.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-white border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 shadow-md transition-all hover:border-slate-300"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <img
                    src={item.image_url?.trim() || defaultListingImage(item.title, item.category)}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover shrink-0 cursor-pointer"
                    onClick={() => onSelectListing(item)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase text-blue-600 truncate">
                        {item.category}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          item.status === 'sold'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {item.status === 'sold' ? 'Sold Out' : 'Active'}
                      </span>
                    </div>
                    <h4
                      onClick={() => onSelectListing(item)}
                      className="text-xs font-bold text-slate-900 truncate cursor-pointer hover:text-blue-600"
                    >
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-700">
                        {formatPrice(item.price)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {item.views} views • {item.location}
                    </div>
                  </div>
                </div>

                {/* Actions: Edit, Status, Delete */}
                <div className="flex items-center gap-1.5 justify-end pt-2 sm:pt-0 border-t border-slate-200 sm:border-t-0 shrink-0">
                  {onEditListing && (
                    <button
                      onClick={() => onEditListing(item)}
                      className="text-[11px] font-bold text-blue-700 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-200 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 shadow-sm shadow-blue-500/10"
                      title="Edit this Ad"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Edit Ad</span>
                    </button>
                  )}

                  <button
                    onClick={() => (onToggleStatus ? onToggleStatus(item.id) : onMarkAsSold(item.id))}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-xl border transition-all ${
                      item.status === 'sold'
                        ? 'bg-emerald-500/15 hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                    }`}
                  >
                    {item.status === 'sold' ? 'Re-activate' : 'Mark Sold'}
                  </button>

                  {onDeleteListing && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete ad "${item.title}"? This cannot be undone.`)) {
                          onDeleteListing(item.id);
                        }
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1.5 rounded-xl hover:bg-rose-500/10 transition-colors"
                      title="Delete Ad"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* SUBTAB 2: Saved Items */}
      {activeSubTab === 'saved' && (
        <div className="space-y-3">
          {savedListings.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl border border-slate-200 p-6 space-y-2">
              <Heart className="w-10 h-10 text-slate-500 mx-auto" />
              <h4 className="font-bold text-slate-900 text-sm">No saved items yet</h4>
              <p className="text-xs text-slate-500">
                Tap the heart icon on any listing to bookmark your favorite deals.
              </p>
            </div>
          ) : (
            savedListings.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3 shadow-md"
              >
                <div
                  className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                  onClick={() => onSelectListing(item)}
                >
                  <img
                    src={item.image_url?.trim() || defaultListingImage(item.title, item.category)}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-blue-600 capitalize">
                      {item.category}
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 truncate">{item.title}</h4>
                    <span className="text-xs font-extrabold text-slate-700">
                      {formatPrice(item.price)}
                    </span>
                    <p className="text-[10px] text-slate-500 truncate">{item.location}</p>
                  </div>
                </div>

                <button
                  onClick={(e) => onRemoveSaved(item.id, e)}
                  className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl"
                  title="Remove from saved"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* SUBTAB 3: EMI Applications */}
      {activeSubTab === 'emi' && (
        <div className="space-y-3">
          {emiApplications.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <p className="text-sm font-bold text-slate-800 mt-3">No EMI applications yet</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed px-4">
                When you apply for financing on a listing, it'll show up here with its status.
              </p>
              {onOpenEmi && (
                <button
                  onClick={onOpenEmi}
                  className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold active:scale-95"
                >
                  Open EMI Calculator
                </button>
              )}
            </div>
          )}
          {emiApplications.map((app) => (
            <div
              key={app.id}
              className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 truncate max-w-[70%]">
                  {app.listingTitle}
                </span>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    ['approved', 'disbursed', 'completed'].includes(app.status)
                      ? 'bg-emerald-50 text-emerald-700'
                      : ['rejected', 'cancelled'].includes(app.status)
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {EMI_STATUS_LABELS[app.status] || 'Under review'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-xl text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">Monthly EMI</span>
                  <span className="font-extrabold text-amber-700">
                    {formatPrice(app.monthlyEmi)}/mo
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Tenure</span>
                  <span className="font-bold text-slate-700">{app.tenureMonths} Months</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Loan Amount</span>
                  <span className="font-bold text-slate-700">{formatPrice(app.loanAmount)}</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 flex justify-between items-center pt-1 border-t border-slate-200">
                <span>Application: {app.id}</span>
                <span className="text-blue-600 font-semibold">Instant Digital Disbursal</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Account Settings Menu List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-200/80 text-xs">
        {onOpenChatbot && (
          <button
            onClick={onOpenChatbot}
            className="w-full p-3.5 flex items-center justify-between hover:bg-slate-100 text-slate-700"
          >
            <div className="flex items-center gap-2.5">
              <Bot className="w-4 h-4 text-blue-600" />
              <span className="font-semibold">DealBriz Assistant (Support Bot)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded">24/7</span>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>
          </button>
        )}

        {onOpenFaqs && (
          <button
            onClick={onOpenFaqs}
            className="w-full p-3.5 flex items-center justify-between hover:bg-slate-100 text-slate-700"
          >
            <div className="flex items-center gap-2.5">
              <HelpCircle className="w-4 h-4 text-amber-600" />
              <span className="font-medium">DealBriz Help & FAQs</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        )}

        {onOpenReportProblem && (
          <button
            onClick={onOpenReportProblem}
            className="w-full p-3.5 flex items-center justify-between hover:bg-slate-100 text-slate-700"
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span className="font-medium">Report a Problem / Feedback</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        )}

        <button
          onClick={onOpenWebsite}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-100 text-slate-700"
        >
          <div className="flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">Visit dealbriz.com</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>

        {onOpenAuth && (
          <>
            <button
              onClick={() => onOpenAuth('login')}
              className="w-full p-3.5 flex items-center justify-between hover:bg-slate-100 text-slate-700"
            >
              <div className="flex items-center gap-2.5">
                <LogIn className="w-4 h-4 text-blue-600" />
                <span className="font-medium">
                  {isLoggedIn ? 'Switch Account / Sign In' : 'Sign In to Account'}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            <button
              onClick={() => onOpenAuth('signup')}
              className="w-full p-3.5 flex items-center justify-between hover:bg-slate-100 text-slate-700"
            >
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <span className="font-medium">Create New DealBriz Account</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </>
        )}

        {isLoggedIn && onLogout && (
          <button
            onClick={onLogout}
            className="w-full p-3.5 flex items-center justify-between hover:bg-slate-100 text-rose-600"
          >
            <div className="flex items-center gap-2.5">
              <LogOut className="w-4 h-4 text-rose-600" />
              <span className="font-medium">Sign Out</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        )}
      </div>
    </PullToRefresh>
  );
};
