import React from 'react';
import { CATEGORIES } from '../data/initialListings';
import { CategoryId } from '../types';

interface CategoryBarProps {
  selectedCategory: CategoryId;
  onSelectCategory: (cat: CategoryId) => void;
  categoryCounts?: Record<string, number>;
}

/** Per-category tile tint. */
const TILE_TINT: Record<string, string> = {
  all: 'bg-orange-50 border-orange-100',
  cars: 'bg-blue-50 border-blue-100',
  bikes: 'bg-rose-50 border-rose-100',
  phones: 'bg-indigo-50 border-indigo-100',
  property: 'bg-emerald-50 border-emerald-100',
  electronics: 'bg-violet-50 border-violet-100',
  furniture: 'bg-amber-50 border-amber-100',
  fashion: 'bg-pink-50 border-pink-100',
  appliances: 'bg-cyan-50 border-cyan-100',
};

/** Four labelled icon tiles across, replacing the old scrolling chip rail. */
export const CategoryBar: React.FC<CategoryBarProps> = ({
  selectedCategory,
  onSelectCategory,
  categoryCounts = {},
}) => {
  return (
    <div className="w-full px-3.5 pt-1 pb-2">
      <div className="grid grid-cols-4 gap-2.5">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const count = cat.id === 'all' ? undefined : categoryCounts[cat.id];
          const tint = TILE_TINT[cat.id] || 'bg-slate-50 border-slate-100';

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className="flex flex-col items-center gap-1 group"
            >
              <span
                className={`relative w-full aspect-square max-h-14 rounded-2xl border flex items-center justify-center text-xl transition-all active:scale-95 ${
                  isSelected
                    ? 'bg-blue-600 border-blue-600 shadow-md shadow-blue-600/25'
                    : `${tint} group-hover:brightness-95`
                }`}
              >
                <span>{cat.emoji}</span>
                {typeof count === 'number' && count > 0 && (
                  <span
                    className={`absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ring-2 ring-[#F5F7FA] ${
                      isSelected ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] font-semibold tracking-tight text-center leading-tight truncate w-full ${
                  isSelected ? 'text-blue-700' : 'text-slate-600'
                }`}
              >
                {cat.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
