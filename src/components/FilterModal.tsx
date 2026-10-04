import React from 'react';
import { X, SlidersHorizontal, RotateCcw, Check } from 'lucide-react';
import { FilterState } from '../types';

interface FilterModalProps {
  filters: FilterState;
  onUpdateFilters: (filters: FilterState) => void;
  onClose: () => void;
  onReset: () => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({
  filters,
  onUpdateFilters,
  onClose,
  onReset,
}) => {
  const sortOptions = [
    { id: 'recommended', label: 'Recommended' },
    { id: 'price_low', label: 'Price: Low to High' },
    { id: 'price_high', label: 'Price: High to Low' },
    { id: 'recent', label: 'Newly Listed' },
    { id: 'distance', label: 'Nearest to Me' },
  ];

  const conditions = [
    { id: 'all', label: 'Any Condition' },
    { id: 'like_new', label: 'Like New / Mint' },
    { id: 'new', label: 'Brand New (Sealed)' },
    { id: 'good', label: 'Good' },
    { id: 'fair', label: 'Fair' },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-5 db-sheet-bottom-p5 shadow-2xl relative max-h-[90vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
            <h3 className="font-extrabold text-slate-900 text-base">Filter & Sort</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Sort By */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-2">Sort By</label>
            <div className="space-y-1">
              {sortOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() =>
                    onUpdateFilters({
                      ...filters,
                      sortBy: opt.id as any,
                    })
                  }
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-medium border transition-colors ${
                    filters.sortBy === opt.id
                      ? 'bg-blue-600/20 border-blue-500 text-blue-700'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{opt.label}</span>
                  {filters.sortBy === opt.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              ))}
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-2">Condition</label>
            <div className="grid grid-cols-2 gap-1.5">
              {conditions.map((c) => {
                const isSelected =
                  (c.id === 'all' && !filters.condition) || filters.condition === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() =>
                      onUpdateFilters({
                        ...filters,
                        condition: c.id === 'all' ? null : c.id,
                      })
                    }
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium border text-left truncate transition-colors ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 text-blue-700'
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price Range */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-2">Price Range (₹)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Min"
                value={filters.minPrice ?? ''}
                onChange={(e) =>
                  onUpdateFilters({
                    ...filters,
                    minPrice: e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                  })
                }
                className="flex-1 min-w-0 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <span className="text-slate-500 text-xs">to</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Max"
                value={filters.maxPrice ?? ''}
                onChange={(e) =>
                  onUpdateFilters({
                    ...filters,
                    maxPrice: e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                  })
                }
                className="flex-1 min-w-0 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[
                { label: 'Under ₹25k', min: null, max: 25000 },
                { label: '₹25k – ₹1L', min: 25000, max: 100000 },
                { label: '₹1L – ₹5L', min: 100000, max: 500000 },
                { label: 'Over ₹5L', min: 500000, max: null },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() =>
                    onUpdateFilters({ ...filters, minPrice: preset.min, maxPrice: preset.max })
                  }
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                    filters.minPrice === preset.min && filters.maxPrice === preset.max
                      ? 'bg-blue-600/20 border-blue-500 text-blue-700'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {filters.minPrice !== null &&
              filters.maxPrice !== null &&
              filters.minPrice > filters.maxPrice && (
                <p className="text-[11px] text-rose-600 mt-1.5">
                  Minimum price is higher than the maximum.
                </p>
              )}
          </div>

          {/* Quick Toggles */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer">
              <span className="text-xs font-medium text-slate-700">DealBriz EMI Eligible Only</span>
              <input
                type="checkbox"
                checked={filters.emiOnly}
                onChange={(e) =>
                  onUpdateFilters({
                    ...filters,
                    emiOnly: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-blue-600 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer">
              <span className="text-xs font-medium text-slate-700">Verified Sellers Only</span>
              <input
                type="checkbox"
                checked={filters.verifiedOnly}
                onChange={(e) =>
                  onUpdateFilters({
                    ...filters,
                    verifiedOnly: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-blue-600 rounded"
              />
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-3 border-t border-slate-200">
            <button
              onClick={onReset}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 hover:bg-slate-200 flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-600/30"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
