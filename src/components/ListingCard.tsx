import React, { useState } from 'react';
import { Heart, MapPin, Zap, Eye, Sparkles } from 'lucide-react';
import { Listing } from '../types';
import { getCategoryEmoji, initialsAvatar } from '../utils/imageUtils';

interface ListingCardProps {
  listing: Listing;
  isSaved: boolean;
  onToggleSave: (id: string, e: React.MouseEvent) => void;
  onClick: (listing: Listing) => void;
}

export const ListingCard: React.FC<ListingCardProps> = ({
  listing,
  isSaved,
  onToggleSave,
  onClick,
}) => {
  const [imgError, setImgError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Format Indian Rupee currency format (e.g., ₹3,30,000)
  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Approximate monthly EMI calculation for 12 months with 15% down payment
  const estimatedEmi = Math.round(((listing.price * 0.85) * 1.12) / 12);

  const sellerAvatarSrc =
    !avatarError && listing.seller_avatar && listing.seller_avatar.trim()
      ? listing.seller_avatar.trim()
      : initialsAvatar(listing.seller_name, 64);

  const hasImage = Boolean(listing.image_url && listing.image_url.trim() && !imgError);

  return (
    <div
      onClick={() => onClick(listing)}
      className="group relative bg-white hover:bg-white border border-slate-200 hover:border-blue-200 rounded-2xl overflow-hidden shadow-md hover:shadow-xl hover:shadow-blue-950/20 transition-all cursor-pointer flex flex-col active:scale-[0.99]"
    >
      {/* Image Container */}
      <div className="relative w-full aspect-[4/3] bg-white overflow-hidden flex items-center justify-center">
        {hasImage ? (
          <img
            src={listing.image_url.trim()}
            alt={listing.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-white via-white to-white flex flex-col items-center justify-center p-4 text-center">
            <span className="text-4xl mb-1 filter drop-shadow-md select-none">
              {getCategoryEmoji(listing.category)}
            </span>
            <span className="text-[11px] font-bold text-slate-600 capitalize">
              {listing.category}
            </span>
          </div>
        )}

        {/* Badges Overlays */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
          {listing.is_featured && (
            <span className="flex items-center gap-1 bg-amber-500 text-slate-950 text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow">
              <Sparkles className="w-2.5 h-2.5 fill-current" />
              FEATURED
            </span>
          )}
          {listing.emi_eligible && (
            <span className="flex items-center gap-1 bg-blue-600/90 backdrop-blur-xs text-white text-[10px] font-semibold px-2 py-0.5 rounded-md shadow">
              <Zap className="w-2.5 h-2.5 fill-current text-amber-700" />
              EMI Available
            </span>
          )}
        </div>

        {/* Favorite Heart Button */}
        <button
          onClick={(e) => onToggleSave(listing.id, e)}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 z-10 ${
            isSaved
              ? 'bg-rose-500 text-white shadow-md'
              : 'bg-slate-100 text-slate-900 hover:bg-white'
          }`}
          aria-label={isSaved ? 'Remove from saved' : 'Save item'}
        >
          <Heart className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
        </button>

        {/* Condition tag */}
        <div className="absolute bottom-2 left-2 z-10">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white backdrop-blur-md text-slate-700 capitalize">
            {listing.condition.replace('_', ' ')}
          </span>
        </div>

        {/* Views count */}
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 text-[10px] text-slate-600 bg-white backdrop-blur-md px-1.5 py-0.5 rounded-full">
          <Eye className="w-2.5 h-2.5" />
          <span>{listing.views}</span>
        </div>
      </div>

      {/* Content Body */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          {/* Price & Negotiable tag */}
          <div className="flex items-baseline justify-between gap-1 mb-1">
            <span className="text-base font-extrabold text-slate-900 tracking-tight">
              {formatPrice(listing.price)}
            </span>
            {listing.negotiable && (
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                Negotiable
              </span>
            )}
          </div>

          {/* Title */}
          <h4 className="text-xs font-semibold text-slate-700 line-clamp-2 mb-1.5 leading-snug group-hover:text-blue-600 transition-colors">
            {listing.title}
          </h4>

          {/* EMI Estimate note if eligible */}
          {listing.emi_eligible && (
            <div className="mb-2 text-[11px] text-blue-600 font-medium flex items-center gap-1">
              <span>EMI from</span>
              <span className="font-bold text-blue-700">₹{estimatedEmi.toLocaleString('en-IN')}/mo</span>
            </div>
          )}
        </div>

        {/* Footer: Location & Seller */}
        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1 truncate max-w-[55%]">
            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate">{listing.location}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <img
              src={sellerAvatarSrc}
              alt={listing.seller_name}
              onError={() => setAvatarError(true)}
              className="w-4 h-4 rounded-full object-cover ring-1 ring-slate-700"
            />
            <span className="text-[10px] font-medium text-slate-600 truncate max-w-[70px]">
              {listing.seller_name.split(' ')[0]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
