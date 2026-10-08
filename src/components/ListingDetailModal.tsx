import React, { useState, useEffect } from 'react';
import {
  X,
  Heart,
  Share2,
  MapPin,
  Zap,
  Phone,
  MessageCircle,
  Tag,
  Info,
  AlertCircle,
  Calendar,
  Fuel,
  Gauge,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  ShieldAlert,
  Edit3,
} from 'lucide-react';
import { Listing } from '../types';
import { publicListingUrl } from '../services/dealbrizApi';
import { CATEGORIES } from '../data/initialListings';
import { buyApi } from '../services/dealbrizApi';
import { defaultListingImage, getCategoryEmoji } from '../utils/imageUtils';
import { ReportModal } from './ReportModal';

interface ListingDetailModalProps {
  listing: Listing | null;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: (id: string, e: React.MouseEvent) => void;
  onOpenChat: (listing: Listing) => void;
  onOpenEmi: (listing: Listing) => void;
  onMakeOffer: (listing: Listing, offerPrice: number) => void;
  onEditListing?: (listing: Listing) => void;
  isOwner?: boolean;
  onToggleStatus?: (id: string) => void;
  /** The signed-in user's own number, used only to catch the case where the
   *  server hands back the viewer's phone as the seller's. */
  viewerPhone?: string;
  /** The viewer's own show-number setting, used on their own listings. */
  viewerShowPhone?: boolean;
  /** Whether the seller's number has been fetched fresh for this page. */
  phoneStatus?: 'loading' | 'ok' | 'failed';
}

export const ListingDetailModal: React.FC<ListingDetailModalProps> = ({
  listing,
  onClose,
  isSaved,
  onToggleSave,
  onOpenChat,
  onOpenEmi,
  onMakeOffer,
  onEditListing,
  isOwner,
  onToggleStatus,
  viewerPhone,
  viewerShowPhone,
  phoneStatus = 'ok',
}) => {
  if (!listing) return null;

  // Compare on digits only - the two values can differ by +91, spaces or dashes
  // and still be the same number.
  const digits = (v?: string) => (v || '').replace(/\D/g, '').slice(-10);
  const rawSellerPhone = (listing.seller_phone || '').trim();
  // If the viewer is looking at someone else's ad and the "seller" number is
  // their own, the data is wrong - dialling it would just call the user. Show
  // that plainly rather than offering a button that does nothing useful.
  const phoneIsViewersOwn =
    !isOwner && Boolean(rawSellerPhone) && digits(rawSellerPhone) === digits(viewerPhone);
  // Hidden by the seller: on your own ad that's your own setting, and for
  // anyone else's ad the server only sends a number when they've opted in, so
  // an absent number already means hidden.
  const sellerHidPhone = isOwner
    ? !viewerShowPhone
    : listing.show_phone === false;
  const callablePhone =
    rawSellerPhone && !phoneIsViewersOwn && !sellerHidPhone ? rawSellerPhone : '';

  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [showOfferDialog, setShowOfferDialog] = useState<boolean>(false);
  const [offerValue, setOfferValue] = useState<string>(
    Math.round(listing.price * 0.9).toString()
  );
  const [showPhone, setShowPhone] = useState<boolean>(false);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  // Section 3.2: POST /api/buy/<pid>/view
  useEffect(() => {
    if (listing?.id) {
      buyApi.trackView(listing.id);
    }
  }, [listing?.id]);

  const allImages = [listing.image_url, ...(listing.extra_images || [])]
    .filter((img): img is string => typeof img === 'string' && img.trim().length > 0);

  const displayImage =
    allImages[activeImageIndex] ||
    (listing.image_url?.trim() ? listing.image_url.trim() : null) ||
    defaultListingImage(listing.title, listing.category);

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const listedAgo = (() => {
    const created = new Date(listing.created_at);
    if (Number.isNaN(created.getTime())) return listing.posted_time || '—';
    const days = Math.floor((Date.now() - created.getTime()) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  })();

  const detailRows: { label: string; value: string; tone?: string }[] = [
    { label: 'Brand', value: listing.attributes?.brand || '—' },
    {
      label: 'Model',
      value: listing.attributes?.model || (listing.attributes?.year ? String(listing.attributes.year) : '—'),
    },
    {
      label: 'Category',
      value: CATEGORIES.find((c) => c.id === listing.category)?.name || listing.category,
    },
    {
      label: 'Condition',
      value: listing.condition ? listing.condition.replace(/_/g, ' ') : '—',
      tone: 'text-slate-700 capitalize',
    },
    {
      label: 'Negotiable',
      value: listing.negotiable ? 'Yes' : 'No',
      tone: listing.negotiable ? 'text-emerald-600' : 'text-slate-600',
    },
    {
      label: 'EMI Eligible',
      value: listing.emi_eligible ? 'Yes' : 'No',
      tone: listing.emi_eligible ? 'text-amber-700' : 'text-slate-600',
    },
    { label: 'Location', value: listing.location || listing.city || '—' },
    { label: 'Pincode', value: listing.pincode || '—' },
    { label: 'Listed', value: listedAgo },
  ];

  const handleShare = async () => {
    // Inside the APK window.location.href is https://localhost/, which is
    // useless to whoever receives it. Always share the public listing URL.
    const shareUrl = publicListingUrl(listing.id);

    if (navigator.share) {
      try {
        await navigator.share({
          title: listing.title,
          text: `Check out ${listing.title} for ${formatPrice(listing.price)} on DealBriz!`,
          url: shareUrl,
        });
        return;
      } catch {
        // fall through to clipboard
      }
    }

    try {
      await navigator.clipboard?.writeText(shareUrl);
    } catch {
      // clipboard unavailable
    }
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2500);
  };

  const handleSendOffer = () => {
    const val = Number(offerValue);
    if (val > 0) {
      onMakeOffer(listing, val);
      setShowOfferDialog(false);
    }
  };

  const estimatedMonthlyEmi = Math.round(((listing.price * 0.85) * 1.12) / 12);

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-3 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] db-sheet-bottom flex flex-col animate-in slide-in-from-bottom-6 duration-200">
        {/* Floating Top Navigation within Modal */}
        <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-white text-slate-900 backdrop-blur-md flex items-center justify-center pointer-events-auto border border-black/5 shadow-lg active:scale-95"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Only the person who posted the ad may edit it. This button used
                to render for everyone who opened any listing. */}
            {isOwner && onEditListing && (
              <button
                onClick={() => onEditListing(listing)}
                className="h-9 px-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white backdrop-blur-md flex items-center gap-1.5 border border-black/5 shadow-lg active:scale-95 text-xs font-bold"
                aria-label="Edit Ad"
                title="Edit this listing"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}

            <button
              onClick={handleShare}
              className="w-9 h-9 rounded-full bg-white hover:bg-white text-slate-900 backdrop-blur-md flex items-center justify-center border border-black/5 shadow-lg active:scale-95 relative"
              aria-label="Share"
            >
              <Share2 className="w-4 h-4" />
              {copiedShare && (
                <span className="absolute -bottom-7 right-0 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded shadow whitespace-nowrap">
                  Link copied!
                </span>
              )}
            </button>

            <button
              onClick={(e) => onToggleSave(listing.id, e)}
              className={`w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center border border-white/10 shadow-lg active:scale-95 ${
                isSaved ? 'bg-rose-500 text-white' : 'bg-white text-slate-900 hover:bg-white'
              }`}
              aria-label="Favorite"
            >
              <Heart className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar db-scroll-clear-actionbar">
          {/* Image Slider / Gallery */}
          <div className="relative w-full aspect-[4/3] bg-black">
            <img
              src={displayImage}
              alt={listing.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover cursor-zoom-in"
              onClick={() => setLightboxOpen(true)}
            />

            {/* Lightbox Zoom Trigger */}
            <button
              onClick={() => setLightboxOpen(true)}
              className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-white text-slate-900 backdrop-blur-xs hover:bg-white border border-black/5"
              title="View full screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Slider Controls if multiple images */}
            {allImages.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1))
                  }
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() =>
                    setActiveImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0))
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {/* Dot indicators */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 bg-black/60 backdrop-blur-xs rounded-full">
                  {allImages.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImageIndex(idx)}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${
                        activeImageIndex === idx ? 'w-4 bg-blue-500' : 'bg-slate-400/60'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Details Body */}
          <div className="p-4 space-y-4">
            {/* Price & Title Heading */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900 tracking-tight">
                    {formatPrice(listing.price)}
                  </span>
                  {listing.original_price && (
                    <span className="text-xs text-slate-500 line-through">
                      {formatPrice(listing.original_price)}
                    </span>
                  )}
                </div>

                {listing.negotiable && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Negotiable Price
                  </span>
                )}
              </div>

              <h1 className="text-base font-bold text-slate-800 leading-snug">{listing.title}</h1>

              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>{listing.location}</span>
                </div>
                <span>•</span>
                <span>{listing.city}</span>
                <span>•</span>
                <span>Condition: <strong className="text-slate-700 capitalize">{listing.condition.replace('_', ' ')}</strong></span>
              </div>
            </div>

            {/* DealBriz EMI Spotlight Banner */}
            {listing.emi_eligible && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-sm">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-amber-600 fill-current" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-900">Buy on DealBriz EMI</span>
                      <span className="text-[9px] bg-white text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-bold">
                        Zero Processing Fee
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700 mt-0.5">
                      Pay just{' '}
                      <span className="font-black text-blue-700">
                        ₹{estimatedMonthlyEmi.toLocaleString('en-IN')}/mo
                      </span>{' '}
                      for 12 months with flexible down payment.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onOpenEmi(listing)}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-xl shrink-0 shadow-md shadow-blue-600/30 active:scale-95 transition-all"
                >
                  Calculate EMI
                </button>
              </div>
            )}

            {/* Attributes / Key Specifications */}
            {listing.attributes && Object.keys(listing.attributes).length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-blue-600" />
                  Key Specifications
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {listing.attributes.brand && (
                    <div className="p-2 rounded-lg bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Brand</span>
                      <span className="font-semibold text-slate-700">{listing.attributes.brand}</span>
                    </div>
                  )}
                  {listing.attributes.model && (
                    <div className="p-2 rounded-lg bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Model</span>
                      <span className="font-semibold text-slate-700">{listing.attributes.model}</span>
                    </div>
                  )}
                  {listing.attributes.year && (
                    <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-500 block">Year</span>
                        <span className="font-semibold text-slate-700">{listing.attributes.year}</span>
                      </div>
                    </div>
                  )}
                  {listing.attributes.fuel && (
                    <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center gap-2">
                      <Fuel className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-500 block">Fuel Type</span>
                        <span className="font-semibold text-slate-700">{listing.attributes.fuel}</span>
                      </div>
                    </div>
                  )}
                  {listing.attributes.km_driven && (
                    <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-500 block">KM Driven</span>
                        <span className="font-semibold text-slate-700">
                          {Number(listing.attributes.km_driven).toLocaleString('en-IN')} km
                        </span>
                      </div>
                    </div>
                  )}
                  {listing.attributes.storage && (
                    <div className="p-2 rounded-lg bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Storage</span>
                      <span className="font-semibold text-slate-700">{listing.attributes.storage}</span>
                    </div>
                  )}
                  {listing.attributes.ram && (
                    <div className="p-2 rounded-lg bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">RAM</span>
                      <span className="font-semibold text-slate-700">{listing.attributes.ram}</span>
                    </div>
                  )}
                  {listing.attributes.battery_health && (
                    <div className="p-2 rounded-lg bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Battery Health</span>
                      <span className="font-semibold text-emerald-600">{listing.attributes.battery_health}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Listing Details - mirrors the detail table on dealbriz.com */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-600" />
                Listing Details
              </h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
                {detailRows.map((row) => (
                  <div key={row.label}>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide block">
                      {row.label}
                    </span>
                    <span className={`font-semibold ${row.tone || 'text-slate-700'}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Description
              </h3>
              {listing.description?.trim() ? (
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {listing.description}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic">The seller hasn't added a description.</p>
              )}
            </div>

            {/* Seller Information */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-base overflow-hidden ring-2 ring-blue-500/30">
                    {listing.seller_avatar?.trim() ? (
                      <img
                        src={listing.seller_avatar.trim()}
                        alt={listing.seller_name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{listing.seller_name ? listing.seller_name.charAt(0) : '?'}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-sm text-slate-900">{listing.seller_name}</h4>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      {listing.seller_rating > 0 ? (
                        <>
                          <span className="text-amber-600 font-semibold">★ {listing.seller_rating}</span>
                          <span>({listing.seller_reviews_count} reviews)</span>
                        </>
                      ) : (
                        <span>No ratings yet</span>
                      )}
                      {listing.seller_joined && <span>• Member since {listing.seller_joined}</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Phone display trigger */}
              <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between gap-2">
                <div className="text-xs text-slate-600 min-w-0">
                  {isOwner && sellerHidPhone ? (
                    <span className="text-slate-500">
                      Hidden — buyers cannot see your number.
                    </span>
                  ) : !isOwner && phoneStatus === 'loading' ? (
                    <span className="text-slate-400">Checking contact details…</span>
                  ) : !isOwner && phoneStatus === 'failed' ? (
                    <span className="text-slate-500">
                      Couldn't load contact details. You can still use chat.
                    </span>
                  ) : !callablePhone && !phoneIsViewersOwn ? (
                    // The server leaves the number out entirely when the
                    // seller hid it, so "no number" and "hidden" are the same.
                    <span className="text-slate-500">
                      This user has chosen not to show their mobile number.
                    </span>
                  ) : phoneIsViewersOwn ? (
                    <span className="text-amber-700/90">
                      Seller's number unavailable — use chat.
                    </span>
                  ) : showPhone ? (
                    <a
                      href={`tel:${callablePhone}`}
                      className="font-bold text-blue-600 flex items-center gap-1 hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {callablePhone}
                    </a>
                  ) : (
                    <span className="text-slate-500">
                      Phone: ••••••••{callablePhone.slice(-3)}
                    </span>
                  )}
                </div>
                {callablePhone && (
                  <button
                    onClick={() => setShowPhone((prev) => !prev)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 shrink-0"
                  >
                    {showPhone ? 'Hide Contact' : 'Show Full Number'}
                  </button>
                )}
              </div>
            </div>

            {/* DealBriz Safety Guarantee Tips */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-500">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-700 block font-semibold mb-0.5">
                  DealBriz Safe Trading Tips
                </strong>
                Always inspect items in person in a safe public spot. Do not make advance payments to unknown accounts before verifying the goods.
              </div>
            </div>

            {/* Report Listing Trigger */}
            <div className="flex justify-center pt-1 pb-2">
              <button
                onClick={() => setShowReportModal(true)}
                className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center gap-1 font-medium transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Report this ad or seller
              </button>
            </div>
          </div>
        </div>

        {/* Report Modal Component */}
        {showReportModal && (
          <ReportModal
            listing={listing}
            onClose={() => setShowReportModal(false)}
          />
        )}

        {/* Sticky Android Bottom Bar inside Modal */}
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 px-4 pt-3 db-sheet-bottom-p3 flex items-center gap-2.5 shadow-2xl">
          {isOwner ? (
            <div className="flex items-center gap-2.5 w-full">
              {onEditListing && (
                <button
                  onClick={() => onEditListing(listing)}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold py-3 px-3 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit This Ad
                </button>
              )}
              {onToggleStatus && (
                <button
                  onClick={() => onToggleStatus(listing.id)}
                  className={`flex-1 text-xs font-bold py-3 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                    listing.status === 'sold'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-600/30'
                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {listing.status === 'sold' ? 'Re-activate Ad' : 'Mark as Sold'}
                </button>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowOfferDialog(true)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-3 px-3 rounded-xl border border-slate-300 flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <Tag className="w-4 h-4 text-amber-600" />
                Make Offer
              </button>

              {callablePhone && (
                <a
                  href={`tel:${callablePhone}`}
                  className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-3 px-3.5 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  aria-label={`Call ${listing.seller_name}`}
                >
                  <Phone className="w-4 h-4" />
                  Call
                </a>
              )}

              <button
                onClick={() => onOpenChat(listing)}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold py-3 px-3 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <MessageCircle className="w-4 h-4" />
                Chat
              </button>
            </>
          )}
        </div>

        {/* Make Offer Dialog */}
        {showOfferDialog && (
          <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-xs bg-white border border-slate-300 rounded-2xl p-4 shadow-2xl">
              <h3 className="font-bold text-slate-900 text-sm mb-1">Make an Offer</h3>
              <p className="text-xs text-slate-500 mb-3">
                Current asking price: <strong className="text-slate-900">{formatPrice(listing.price)}</strong>
              </p>

              <div className="mb-3">
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Your Offer Amount (₹)
                </label>
                <input
                  type="number"
                  value={offerValue}
                  onChange={(e) => setOfferValue(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Quick discount buttons */}
              <div className="flex items-center gap-1.5 mb-4">
                <button
                  type="button"
                  onClick={() => setOfferValue(Math.round(listing.price * 0.95).toString())}
                  className="flex-1 py-1 text-[10px] bg-slate-100 text-slate-600 rounded border border-slate-300 hover:bg-slate-200"
                >
                  -5%
                </button>
                <button
                  type="button"
                  onClick={() => setOfferValue(Math.round(listing.price * 0.9).toString())}
                  className="flex-1 py-1 text-[10px] bg-slate-100 text-slate-600 rounded border border-slate-300 hover:bg-slate-200"
                >
                  -10%
                </button>
                <button
                  type="button"
                  onClick={() => setOfferValue(Math.round(listing.price * 0.85).toString())}
                  className="flex-1 py-1 text-[10px] bg-slate-100 text-slate-600 rounded border border-slate-300 hover:bg-slate-200"
                >
                  -15%
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowOfferDialog(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendOffer}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-500 shadow-md"
                >
                  Submit Offer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lightbox Modal */}
        {lightboxOpen && (
          <div className="fixed inset-0 z-[120] bg-black flex items-center justify-center p-4">
            <button
              onClick={() => setLightboxOpen(false)}
              aria-label="Close"
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/90 text-slate-900 shadow-lg active:scale-95"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Fullscreen had no way to move between photos - the arrows and
                counter existed on the inline carousel only, so opening the
                lightbox stranded you on whichever image you were on. */}
            {allImages.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1))
                  }
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/90 text-slate-900 shadow-lg flex items-center justify-center active:scale-95"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                  onClick={() =>
                    setActiveImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0))
                  }
                  aria-label="Next photo"
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/90 text-slate-900 shadow-lg flex items-center justify-center active:scale-95"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>

                <span className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-black/70 text-white text-xs font-bold">
                  {activeImageIndex + 1} / {allImages.length}
                </span>

                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
                  {allImages.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImageIndex(i)}
                      aria-label={`Photo ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all ${
                        i === activeImageIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}

            <img
              src={displayImage}
              alt={listing.title}
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[85vh] object-contain rounded-lg select-none"
            />
          </div>
        )}
      </div>
    </div>
  );
};
