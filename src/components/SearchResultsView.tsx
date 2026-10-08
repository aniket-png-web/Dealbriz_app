import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Search,
  X,
  Heart,
  MapPin,
  SlidersHorizontal,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react';
import { Listing } from '../types';
import { defaultListingImage } from '../utils/imageUtils';

type SortKey = 'relevance' | 'price_low' | 'price_high' | 'newest';

interface SearchResultsViewProps {
  /** Free-text query. Empty when the page was opened from a category tile. */
  query: string;
  onQueryChange: (q: string) => void;
  /** Shown instead of the search field when browsing a category. */
  categoryLabel?: string;
  results: Listing[];
  savedIds: string[];
  onToggleSave: (id: string, e: React.MouseEvent) => void;
  onSelectListing: (l: Listing) => void;
  onBack: () => void;
  onOpenFilters: () => void;
}

/**
 * A results screen of its own rather than a filtered home feed, so backing out
 * returns you where you were instead of leaving the home tab in a filtered
 * state. Used for both search and category browsing.
 */
export const SearchResultsView: React.FC<SearchResultsViewProps> = ({
  query,
  onQueryChange,
  categoryLabel,
  results,
  savedIds,
  onToggleSave,
  onSelectListing,
  onBack,
  onOpenFilters,
}) => {
  const [sort, setSort] = useState<SortKey>('relevance');
  const [quickFilter, setQuickFilter] = useState<'all' | 'nearby' | 'emi'>('all');

  const shown = useMemo(() => {
    let list = [...results];
    if (quickFilter === 'emi') list = list.filter((l) => l.emi_eligible);
    if (quickFilter === 'nearby') {
      list = list.filter((l) => typeof l.distance_km === 'number');
      list.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
    }
    if (sort === 'price_low') list.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sort === 'price_high') list.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sort === 'newest') {
      list.sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
    }
    return list;
  }, [results, sort, quickFilter]);

  const chips: { key: typeof quickFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'nearby', label: 'Nearby' },
    { key: 'emi', label: 'EMI' },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F5F7FA]">
      <div className="shrink-0 px-3.5 pt-3 pb-2 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            aria-label="Back"
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-slate-700 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {categoryLabel ? (
            <h2 className="flex-1 min-w-0 text-base font-black text-slate-900 truncate">
              {categoryLabel}
            </h2>
          ) : (
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search cars, phones, bikes..."
                className="w-full bg-slate-100 border border-slate-200 rounded-full pl-9 pr-8 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:bg-white"
              />
              {query && (
                <button
                  onClick={() => onQueryChange('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 active:scale-90"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
          {chips.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setQuickFilter(key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                quickFilter === key
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-600/25'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={onOpenFilters}
            aria-label="More filters"
            className="shrink-0 w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center justify-center ml-auto"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="shrink-0 px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">
          {shown.length} result{shown.length === 1 ? '' : 's'}
        </span>
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="appearance-none bg-transparent text-xs font-bold text-slate-800 pr-5 outline-none"
          >
            <option value="relevance">Sort</option>
            <option value="price_low">Price: low to high</option>
            <option value="price_high">Price: high to low</option>
            <option value="newest">Newest first</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-600 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-28 space-y-2.5">
        {shown.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <p className="text-sm font-bold text-slate-800">No matches</p>
            <p className="text-xs text-slate-500 mt-1 px-6">
              Try a shorter word, or clear a filter above.
            </p>
          </div>
        ) : (
          shown.map((l) => {
            const isSaved = savedIds.includes(l.id);
            return (
              <button
                key={l.id}
                onClick={() => onSelectListing(l)}
                className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-2.5 flex gap-3 text-left active:scale-[0.99] transition-transform"
              >
                <div className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-slate-100">
                  <img
                    src={l.image_url?.trim() || defaultListingImage(l.title, l.category)}
                    alt={l.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900 leading-tight line-clamp-2">
                      {l.title}
                    </h4>
                    <span
                      onClick={(e) => onToggleSave(l.id, e)}
                      role="button"
                      aria-label={isSaved ? 'Remove from saved' : 'Save listing'}
                      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                        isSaved ? 'text-rose-500' : 'text-slate-400'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                    </span>
                  </div>

                  <p className="text-base font-black text-slate-900 mt-0.5">
                    ₹{Number(l.price || 0).toLocaleString('en-IN')}
                  </p>

                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {l.condition && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 capitalize">
                        {l.condition}
                      </span>
                    )}
                    {l.emi_eligible && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        EMI Available
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-slate-500">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{l.location}</span>
                    {typeof l.distance_km === 'number' && (
                      <span className="shrink-0">· {l.distance_km.toFixed(0)} km</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
