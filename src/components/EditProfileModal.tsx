import React, { useState, useEffect } from 'react';
import { PhotoSourcePicker } from './PhotoSourcePicker';
import { initialsAvatar } from '../utils/imageUtils';
import { X, User, Phone, MapPin, Loader2, AlertTriangle } from 'lucide-react';
import { UserProfile } from '../types';
import { profileApi, lookupPincode } from '../services/dealbrizApi';

interface EditProfileModalProps {
  user: UserProfile;
  onClose: () => void;
  onSaved: (updated: Partial<UserProfile>) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ user, onClose, onSaved }) => {
  const [firstName, setFirstName] = useState(() => (user.name || '').split(' ')[0] || '');
  const [lastName, setLastName] = useState(() =>
    (user.name || '').split(' ').slice(1).join(' ')
  );
  const [phone, setPhone] = useState(user.phone || '');
  // The account's city field holds a 6-digit PIN (as the website saves it).
  // It was a dropdown of city names: a PIN didn't match any option, so it
  // showed "Select a city", and picking one replaced the PIN with a name.
  const [city, setCity] = useState(user.city || '');
  const [place, setPlace] = useState('');
  useEffect(() => {
    let cancelled = false;
    setPlace('');
    if (/^\d{6}$/.test(city)) {
      lookupPincode(city).then((r) => {
        if (!cancelled && r) setPlace([r.district, r.state].filter(Boolean).join(', '));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [city]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [avatarBusy, setAvatarBusy] = useState(false);

  const handleAvatar = async (file: File) => {
    setAvatarBusy(true);
    setError(null);
    try {
      const url = await profileApi.uploadAvatar(file);
      setAvatar(url);
    } catch (err: any) {
      setError(
        err?.status === 0
          ? 'Photo not uploaded — no connection to DealBriz.'
          : err?.data?.error || 'Photo upload failed. Please try again.'
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSave = async () => {
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      setError('Please enter your first name.');
      return;
    }

    const digits = phone.replace(/\D/g, '');
    if (phone.trim() && (digits.length < 10 || digits.length > 12)) {
      setError('Enter a valid phone number.');
      return;
    }

    if (!/^\d{6}$/.test(city.trim())) {
      setError('Please enter your 6-digit PIN code.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await profileApi.updateProfile({
        first_name: trimmedFirst,
        last_name: lastName.trim(),
        phone: phone.trim(),
        city: city.trim(),
      });

      onSaved({
        name: `${trimmedFirst} ${lastName.trim()}`.trim(),
        phone: phone.trim(),
        city: city.trim(),
        ...(avatar.trim() ? { avatar: avatar.trim() } : {}),
      });
      onClose();
    } catch (err: any) {
      setError(
        err?.status === 0
          ? "Couldn't reach DealBriz. Check your connection and try again."
          : err?.data?.error || 'Could not save your profile. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] db-sheet-bottom overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Edit profile</h3>
            <p className="text-[11px] text-slate-500">Buyers see your name and city</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          {/* Profile photo */}
          <div className="flex items-center gap-3.5">
            <img
              src={avatar?.trim() || initialsAvatar(user.name, 160)}
              alt=""
              referrerPolicy="no-referrer"
              className="w-16 h-16 shrink-0 rounded-full object-cover border-2 border-white shadow ring-1 ring-slate-200"
            />
            <div className="flex-1 min-w-0">
              <PhotoSourcePicker
                label={avatarBusy ? 'Uploading…' : 'Profile photo'}
                onFile={handleAvatar}
                disabled={avatarBusy}
                compact
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1.5">
                First name <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-500 outline-none"
                  placeholder="First name"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-500 outline-none"
                placeholder="Last name"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Phone</label>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-500 outline-none"
                placeholder="10-digit mobile number"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Shown on your ads only if you choose to display it.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1.5">PIN Code</label>
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 z-10" />
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={city}
                onChange={(e) => setCity(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="e.g. 175001"
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 outline-none font-mono"
              />
            </div>
            {place && <p className="text-[10px] text-slate-500 mt-1">{place}</p>}
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Email</label>
            <input
              value={user.email || ''}
              disabled
              className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-500 outline-none cursor-not-allowed"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Your email is your sign-in ID and can't be changed here.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-200">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
              <span className="text-[11px] text-rose-700">{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
