import { PhotoSourcePicker } from './PhotoSourcePicker';
import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  AlertTriangle,
  Upload,
  Sparkles,
  MapPin,
  Tag,
  CheckCircle2,
  Trash2,
  Zap,
  Loader2,
  Edit3,
  Check,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CATEGORIES } from '../data/initialListings';
import { CategoryId, Listing, ListingAttributes } from '../types';
import { lookupPincode, PincodeLookupResult, sellApi } from '../services/dealbrizApi';
import { dealbrizStorage } from '../services/dealbrizStorage';
import { initialsAvatar, defaultListingImage } from '../utils/imageUtils';

interface SellListingModalProps {
  onClose: () => void;
  /** Resolve when the server has the ad; reject with a message to show. */
  onPostListing: (listing: Listing) => Promise<void>;
  onUpdateListing?: (listing: Listing) => Promise<void>;
  editingListing?: Listing | null;
  userCity: string;
}

export const SellListingModal: React.FC<SellListingModalProps> = ({
  onClose,
  onPostListing,
  onUpdateListing,
  editingListing,
  userCity,
}) => {
  const isEditing = Boolean(editingListing);

  const [title, setTitle] = useState(editingListing?.title || '');
  const [category, setCategory] = useState<Exclude<CategoryId, 'all'>>(
    (editingListing?.category as Exclude<CategoryId, 'all'>) || 'phones'
  );
  const [price, setPrice] = useState(editingListing ? String(editingListing.price) : '');
  const [originalPrice, setOriginalPrice] = useState(
    editingListing?.original_price ? String(editingListing.original_price) : ''
  );
  const [condition, setCondition] = useState<'new' | 'like_new' | 'good' | 'fair'>(
    editingListing?.condition || 'like_new'
  );
  const [description, setDescription] = useState(editingListing?.description || '');
  // A new ad starts at the seller's own PIN code. It used to start at
  // 160017 / "Sector 17, Chandigarh", and that address was posted whenever
  // the PIN lookup didn't overwrite it.
  const ownPin = (() => {
    const prof = dealbrizStorage.getUserProfile();
    return [prof.pincode, prof.city].find((v) => /^\d{6}$/.test((v || '').trim()))?.trim() || '';
  })();
  const [location, setLocation] = useState(editingListing?.location || '');
  // True once the seller types in the Location box. Until then the location
  // follows the PIN code, so changing the PIN can't leave an old address.
  const [locationTouched, setLocationTouched] = useState(false);
  const [city, setCity] = useState(editingListing?.city || '');
  const [pincode, setPincode] = useState(editingListing?.pincode || ownPin);
  const [negotiable, setNegotiable] = useState(editingListing ? (editingListing.negotiable ?? true) : true);
  const [emiEligible, setEmiEligible] = useState(editingListing ? (editingListing.emi_eligible ?? true) : true);
  const [status, setStatus] = useState<'active' | 'sold'>(editingListing?.status || 'active');

  // Category specific attributes
  const [brand, setBrand] = useState(editingListing?.attributes?.brand || '');
  const [model, setModel] = useState(editingListing?.attributes?.model || '');
  const [year, setYear] = useState(editingListing?.attributes?.year || '');
  const [fuel, setFuel] = useState<'' | 'Petrol' | 'Diesel' | 'Electric' | 'CNG' | 'Hybrid'>(
    (editingListing?.attributes?.fuel as any) || ''
  );
  const [kmDriven, setKmDriven] = useState(editingListing?.attributes?.km_driven || '');
  const [storage, setStorage] = useState(editingListing?.attributes?.storage || '');
  const [transmission, setTransmission] = useState<'' | 'Manual' | 'Automatic'>(
    (editingListing?.attributes?.transmission as any) || ''
  );
  const [owners, setOwners] = useState(String(editingListing?.attributes?.owners || ''));
  const [color, setColor] = useState(editingListing?.attributes?.color || '');
  const [ram, setRam] = useState(editingListing?.attributes?.ram || '');

  // Images state
  const [images, setImages] = useState<string[]>(() => {
    if (editingListing) {
      const allImgs = [editingListing.image_url, ...(editingListing.extra_images || [])].filter(Boolean);
      if (allImgs.length > 0) return allImgs;
    }
    // A new ad starts with no photos - it used to be seeded with another
    // seller's uploaded image from S3.
    return [];
  });
  const [isUploading, setIsUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showDescPrompt, setShowDescPrompt] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Sync if editingListing prop updates
  useEffect(() => {
    if (editingListing) {
      setTitle(editingListing.title || '');
      setCategory((editingListing.category as Exclude<CategoryId, 'all'>) || 'phones');
      setPrice(editingListing.price ? String(editingListing.price) : '');
      setOriginalPrice(editingListing.original_price ? String(editingListing.original_price) : '');
      setCondition(editingListing.condition || 'like_new');
      setDescription(editingListing.description || '');
      setLocation(editingListing.location || '');
      setLocationTouched(false);
      setCity(editingListing.city || '');
      setPincode(editingListing.pincode || '');
      setNegotiable(editingListing.negotiable ?? true);
      setEmiEligible(editingListing.emi_eligible ?? true);
      setStatus(editingListing.status || 'active');
      setBrand(editingListing.attributes?.brand || '');
      setModel(editingListing.attributes?.model || '');
      setYear(editingListing.attributes?.year || '');
      setFuel((editingListing.attributes?.fuel as any) || '');
      setKmDriven(editingListing.attributes?.km_driven || '');
      setStorage(editingListing.attributes?.storage || '');
      setTransmission((editingListing.attributes?.transmission as any) || '');
      setOwners(String(editingListing.attributes?.owners || ''));
      setColor(editingListing.attributes?.color || '');
      setRam(editingListing.attributes?.ram || '');
      const allImgs = [editingListing.image_url, ...(editingListing.extra_images || [])].filter(Boolean);
      if (allImgs.length > 0) {
        setImages(allImgs);
      }
    }
  }, [editingListing, userCity]);

  // Section 2.1: India Post Pincode Lookup state
  const [pincodeResult, setPincodeResult] = useState<PincodeLookupResult | null>(null);
  const [pincodeLoading, setPincodeLoading] = useState(false);

  const [pincodeChecked, setPincodeChecked] = useState(false);

  const resolvePincode = async (clean: string) => {
    setPincodeLoading(true);
    const res = await lookupPincode(clean);
    setPincodeLoading(false);
    setPincodeChecked(true);
    setPincodeResult(res);
    if (res?.district) setCity(res.district);
    return res;
  };

  // Look up the PIN the form opens with, so the seller sees where the ad
  // will be shown before posting.
  useEffect(() => {
    const clean = pincode.replace(/\D/g, '');
    if (clean.length === 6) resolvePincode(clean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePincodeChange = async (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    setPincode(clean);
    setPincodeResult(null);
    setPincodeChecked(false);
    // A new PIN makes an address that came with the old one wrong. Unless the
    // seller typed their own, clear it; the server then names the location
    // from the PIN code (district, state).
    if (!locationTouched) setLocation('');
    if (clean.length === 6) await resolvePincode(clean);
  };

  /** What the ad will show as its location if the seller leaves the box empty. */
  const derivedLocation = pincodeResult
    ? [pincodeResult.district, pincodeResult.state].filter(Boolean).join(', ')
    : '';

  // Section 3.3: POST /api/sell/upload-image
  const isVehicle = category === 'cars' || category === 'bikes';
  const isDevice = category === 'phones' || category === 'electronics';

  /** Only sends the attributes the chosen category actually uses. */
  const buildAttributes = (): ListingAttributes => {
    const attrs: ListingAttributes = {};
    if (brand.trim()) attrs.brand = brand.trim();
    if (model.trim()) attrs.model = model.trim();

    if (isVehicle) {
      if (String(year).trim()) attrs.year = String(year).trim();
      if (fuel) attrs.fuel = fuel;
      if (transmission) attrs.transmission = transmission;
      if (String(kmDriven).trim()) attrs.km_driven = String(kmDriven).trim();
      if (owners.trim()) attrs.owners = owners.trim();
    }

    if (isDevice) {
      if (color.trim()) attrs.color = color.trim();
      if (storage) attrs.storage = storage;
      if (ram) attrs.ram = ram;
      if (String(year).trim()) attrs.year = String(year).trim();
    }

    return attrs;
  };

  const handleFileUpload = async (file: File) => {
    if (file && images.length < 5) {
      setIsUploading(true);
      setUploadError(null);
      try {
        const uploadedUrl = await sellApi.uploadImage(file);
        if (uploadedUrl) {
          setImages([...images, uploadedUrl]);
        }
      } catch (err: any) {
        // No silent base64 fallback: an image that only exists on this phone
        // would be posted as the ad's photo and show up broken everywhere else.
        setUploadError(
          err?.status === 0
            ? "Photo not uploaded — no connection to DealBriz."
            : err?.data?.error || 'Photo upload failed. Please try again.'
        );
      } finally {
        setIsUploading(false);
        // PhotoSourcePicker resets its own inputs, so the same file can be
        // picked again after a failure.
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // A second tap before the modal closes would fire a second request.
    if (submitting) return;

    // The API requires all of these, and rejects the post without them.
    if (!title.trim()) {
      setFormError('Please enter a title for your ad.');
      return;
    }
    const numPrice = Number(price);
    if (!price || !Number.isFinite(numPrice) || numPrice <= 0) {
      setFormError('Please enter a valid price.');
      return;
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      setFormError('Please enter a valid 6-digit PIN code.');
      return;
    }
    // Ads without a photo get almost no interest, and the placeholder art the
    // form used to fall back to reads as a broken listing to buyers. On an edit
    // the existing photo counts, so a listing that already has one isn't
    // blocked by this.
    const usableImages = images.filter((img) => Boolean(img && img.trim()));
    if (usableImages.length === 0 && !(isEditing && editingListing?.image_url?.trim())) {
      setFormError('Please add at least one photo — ads with photos get far more responses.');
      return;
    }
    // Required, as on the website. A blank one used to be replaced with
    // "Well maintained item available for quick local pickup." and shown as
    // if the seller had written it.
    if (!description.trim()) {
      setFormError(null);
      setShowDescPrompt(true);
      return;
    }
    setFormError(null);

    if (isEditing && editingListing) {
      const updatedListing: Listing = {
        ...editingListing,
        title: title.trim(),
        price: numPrice,
        original_price: originalPrice ? Number(originalPrice) : null,
        category,
        condition,
        description: description.trim(),
        // Empty means "work it out from the PIN code" - the server does that
        // with the same data the lookup above uses.
        location: location.trim() || derivedLocation,
        city,
        pincode: pincode.trim(),
        image_url:
          images[0] ||
          editingListing.image_url ||
          defaultListingImage(title.trim() || 'Listing', category),
        extra_images: images.slice(1),
        emi_eligible: emiEligible && numPrice >= 10000,
        negotiable,
        status,
        attributes: {
          ...editingListing.attributes,
          ...buildAttributes(),
        },
      };

      setSubmitting(true);
      try {
        await (onUpdateListing ? onUpdateListing(updatedListing) : onPostListing(updatedListing));
        try {
          confetti({ particleCount: 50, spread: 60, origin: { y: 0.5 } });
        } catch {
          // ignore
        }
      } catch (err: any) {
        // Everything typed is still in the form.
        setFormError(err?.message || 'Your changes were not saved. Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const profile = dealbrizStorage.getUserProfile();

    const newListing: Listing = {
      // An edit keeps the listing's own id so it updates in place. Minting a
      // fresh 'local-' id here is what made every save post a duplicate ad.
      // 'local-' otherwise marks a draft the server hasn't confirmed yet, so a
      // refresh of the live catalogue doesn't wipe it.
      id: editingListing?.id || `local-${Date.now()}`,
      seller_id: profile.id,
      title: title.trim(),
      price: numPrice,
      original_price: originalPrice ? Number(originalPrice) : null,
      category,
      condition,
      description: description.trim(),
      location: location.trim() || derivedLocation,
      city,
      pincode: pincode.trim(),
      distance_km: undefined,
      image_url: images[0] || defaultListingImage(title.trim() || 'Listing', category),
      extra_images: images.slice(1),
      is_featured: false,
      emi_eligible: emiEligible && numPrice >= 10000,
      negotiable,
      seller_name: profile.name || 'DealBriz Seller',
      // Don't attach your number to an ad you've chosen to keep private.
      seller_phone: profile.showPhone ? profile.phone || '' : '',
      show_phone: Boolean(profile.showPhone),
      seller_avatar: profile.avatar || initialsAvatar(profile.name || 'Seller'),
      seller_rating: 0,
      seller_reviews_count: 0,
      // DealBriz doesn't verify sellers; this only becomes true if the API says so.
      seller_verified: false,
      seller_joined: profile.memberSince || '',
      views: 0,
      created_at: editingListing?.created_at || new Date().toISOString(),
      // Editing a sold ad must not quietly relist it.
      status,
      attributes: buildAttributes(),
    };

    setSubmitting(true);
    try {
      await onPostListing(newListing);
      try {
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.5 } });
      } catch {
        // ignore
      }
    } catch (err: any) {
      // The form stays open with everything the seller entered.
      setFormError(err?.message || "Your ad wasn't posted. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl p-5 db-sheet-bottom-p5 shadow-2xl relative max-h-[92vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-6 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow ${
              isEditing ? 'bg-gradient-to-tr from-amber-500 to-indigo-600' : 'bg-gradient-to-tr from-blue-600 to-indigo-600'
            }`}>
              {isEditing ? <Edit3 className="w-4 h-4 text-white" /> : <Upload className="w-4 h-4 text-white" />}
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                {isEditing ? 'Edit Ad Details' : 'Post an Ad on DealBriz'}
              </h3>
              <p className="text-[10px] text-slate-500 font-medium">
                {isEditing ? 'Update price, photos, specs or status' : 'Turn your unused items into instant cash'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Photo Uploader */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">
              Upload Photos ({images.length}/5) <span className="text-rose-600">*</span>
            </label>
            {images.length < 5 && (
              <div className="mb-2">
                <PhotoSourcePicker onFile={handleFileUpload} disabled={isUploading} compact />
              </div>
            )}

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {/* Uploaded Thumbnails */}
              {images.filter((img) => Boolean(img && img.trim())).map((img, idx) => (
                <div
                  key={idx}
                  className="relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-300 shrink-0 bg-black group"
                >
                  <img
                    src={img}
                    alt={`Upload ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {idx === 0 && (
                    <span className="absolute bottom-1 left-1 right-1 text-[8px] bg-blue-600/90 text-white font-bold px-1 py-0.5 rounded text-center">
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-rose-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {uploadError ? (
              <p className="mt-2 text-[10px] text-rose-700 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                {uploadError}
              </p>
            ) : (
              <p className="mt-2 text-[10px] text-slate-500">
                Add up to 5 photos of your own item. The first one becomes the cover.
              </p>
            )}
          </div>

          {/* Listing Status (Only shown in Edit mode) */}
          {isEditing && (
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <label className="text-xs font-bold text-slate-600 block mb-1.5">
                Ad Availability Status
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('active')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    status === 'active'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-700'
                      : 'bg-white border-slate-300 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Active (Accepting Calls)
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('sold')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    status === 'sold'
                      ? 'bg-rose-600/20 border-rose-500 text-rose-700'
                      : 'bg-white border-slate-300 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  Mark as Sold Out
                </button>
              </div>
            </div>
          )}

          {/* Ad Title */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">
              Ad Title <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. iPhone 13 Pro 128GB Mint Condition with Box"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Category Selector */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">
              Category <span className="text-rose-600">*</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id as any)}
                  className={`py-2 px-1 rounded-xl text-xs font-medium border flex flex-col items-center gap-0.5 transition-all ${
                    category === cat.id
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-sm">{cat.emoji}</span>
                  <span className="text-[10px] truncate max-w-full">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Price & Negotiable */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                Selling Price (₹) <span className="text-rose-600">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 25000"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                Original Price (₹) <span className="text-[10px] text-slate-500">(optional)</span>
              </label>
              <input
                type="number"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="e.g. 35000"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Negotiable & EMI eligibility toggles */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={negotiable}
                onChange={(e) => setNegotiable(e.target.checked)}
                className="accent-blue-600 w-4 h-4 rounded"
              />
              <span>Allow Price Negotiations</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-blue-700">
              <input
                type="checkbox"
                checked={emiEligible}
                onChange={(e) => setEmiEligible(e.target.checked)}
                className="accent-blue-600 w-4 h-4 rounded"
              />
              <Zap className="w-3.5 h-3.5 text-amber-700" />
              <span>Enable DealBriz EMI</span>
            </label>
          </div>

          {/* Condition */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">Condition</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['like_new', 'new', 'good', 'fair'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCondition(c)}
                  className={`py-1.5 rounded-xl text-[11px] font-semibold border capitalize transition-all ${
                    condition === c
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {c.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Brand / Model - shown for every category, as on the website */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Brand / Make</label>
              <input
                type="text"
                placeholder="e.g. Samsung, Honda"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Model</label>
              <input
                type="text"
                placeholder="e.g. Galaxy S21, Figo Aspire"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 outline-none"
              />
            </div>
          </div>

          {/* Category specific fields */}
          {isVehicle && (
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2.5">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  {category === 'cars' ? 'Car' : 'Bike'} details
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Optional, but buyers filter on these — listings with them get found more often.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Year</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 2021"
                    value={String(year)}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    KM driven
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 45000"
                    value={String(kmDriven)}
                    onChange={(e) => setKmDriven(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Fuel</label>
                  <select
                    value={fuel}
                    onChange={(e) => setFuel(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-2 text-xs text-slate-900 outline-none"
                  >
                    <option value="">Not specified</option>
                    {['Petrol', 'Diesel', 'Electric', 'CNG', 'Hybrid'].map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Transmission
                  </label>
                  <select
                    value={transmission}
                    onChange={(e) => setTransmission(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-2 text-xs text-slate-900 outline-none"
                  >
                    <option value="">Not specified</option>
                    <option value="Manual">Manual</option>
                    <option value="Automatic">Automatic</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Previous owners
                  </label>
                  <select
                    value={owners}
                    onChange={(e) => setOwners(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-2 text-xs text-slate-900 outline-none"
                  >
                    <option value="">Not specified</option>
                    <option value="1">1st owner</option>
                    <option value="2">2nd owner</option>
                    <option value="3">3rd owner</option>
                    <option value="4+">4th or more</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {isDevice && (
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2.5">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  {category === 'phones' ? 'Phone' : 'Device'} details
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Optional, but buyers filter on these — listings with them get found more often.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Colour</label>
                  <input
                    type="text"
                    placeholder="e.g. Midnight Black"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Storage</label>
                  <select
                    value={storage}
                    onChange={(e) => setStorage(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-2 text-xs text-slate-900 outline-none"
                  >
                    <option value="">Not specified</option>
                    {['2 GB', '4 GB', '8 GB', '16 GB', '32 GB', '64 GB', '128 GB',
                      '256 GB', '512 GB', '1 TB', '2 TB'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">RAM</label>
                  <select
                    value={ram}
                    onChange={(e) => setRam(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-2 text-xs text-slate-900 outline-none"
                  >
                    <option value="">Not specified</option>
                    {['2 GB', '3 GB', '4 GB', '6 GB', '8 GB', '12 GB', '16 GB'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Year of purchase
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 2022"
                    value={String(year)}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Location, Pincode & City */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600">
                    PIN Code <span className="text-rose-600">*</span>
                  </label>
                  {pincodeLoading && (
                    <span className="text-[10px] text-blue-600 flex items-center gap-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      Lookup...
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="e.g. 160055"
                  value={pincode}
                  onChange={(e) => handlePincodeChange(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono tracking-wider"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">District</label>
                {/* Comes from the PIN code. It was a free-text box that was
                    never saved, and a typo in it could become the ad's location. */}
                <input
                  type="text"
                  readOnly
                  value={pincodeResult?.district || ''}
                  placeholder="From PIN code"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700"
                />
              </div>
            </div>

            {pincodeChecked && !pincodeResult && !pincodeLoading && (
              <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>We couldn't find this PIN code. Please check it.</span>
              </div>
            )}

            {pincodeResult && (
              <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-200 text-[11px] text-emerald-700 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                <span className="truncate">
                  PIN {pincodeResult.pincode}: <strong>{pincodeResult.district}</strong>, {pincodeResult.state}
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Location / Sector / Landmark</label>
              <input
                type="text"
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setLocationTouched(true);
                }}
                placeholder={
                  derivedLocation
                    ? `Leave blank to show "${derivedLocation}"`
                    : 'e.g. Sector 55, Near Phase 5 Market'
                }
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">
              Description <span className="text-rose-600">*</span>
            </label>
            <textarea
              ref={descriptionRef}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mention key details like warranty, reason for selling, accessories included..."
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          {formError && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-200">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
              <span className="text-[11px] text-rose-700">{formError}</span>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2 flex items-center gap-2">
            {isEditing && (
              <button
                type="button"
                onClick={onClose}
                className="py-3.5 px-4 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all active:scale-98"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || isUploading}
              className="flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-extrabold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isEditing ? 'Saving…' : 'Publishing…'}</span>
                </>
              ) : isEditing ? (
                <>
                  <Check className="w-4 h-4 text-emerald-700" />
                  <span>Save Changes</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-700" />
                  <span>Publish Ad on DealBriz</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>

        {showDescPrompt && (
          <div
            className="absolute inset-0 z-[120] bg-black/40 flex items-center justify-center p-6"
            onClick={() => setShowDescPrompt(false)}
          >
            <div
              role="alertdialog"
              aria-labelledby="desc-prompt-title"
              className="w-full max-w-xs bg-white rounded-2xl p-4 shadow-2xl text-center space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-10 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h4 id="desc-prompt-title" className="text-sm font-extrabold text-slate-900">
                Add a description
              </h4>
              <p className="text-[11px] text-slate-600 leading-snug">
                Tell buyers about the item's condition, age and why you're selling. An ad can't be
                posted without one.
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowDescPrompt(false);
                  setTimeout(() => {
                    descriptionRef.current?.scrollIntoView({ block: 'center' });
                    descriptionRef.current?.focus();
                  }, 50);
                }}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"
              >
                Add description
              </button>
            </div>
          </div>
        )}
    </div>
  );
};
