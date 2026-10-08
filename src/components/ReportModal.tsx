import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, CheckCircle2, AlertTriangle, Send } from 'lucide-react';
import { reportsApi, ReportReason } from '../services/dealbrizApi';
import { Listing } from '../types';
import { dealbrizStorage } from '../services/dealbrizStorage';

interface ReportModalProps {
  listing?: Listing | null;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ listing, onClose }) => {
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [selectedReason, setSelectedReason] = useState('');
  const [notes, setNotes] = useState('');
  // Was hardcoded to 'user@dealbriz.com' and sent as the reporter's email.
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = Boolean(dealbrizStorage.getUserProfile().isAuthenticated);
  // Reports point at the seller's account; the listing must carry it.
  const sellerId = listing?.seller_id ? String(listing.seller_id) : '';

  useEffect(() => {
    if (listing) {
      reportsApi.getReasons().then((r) => {
        setReasons(r);
        if (r.length > 0) setSelectedReason(r[0].value);
      }).catch(() => {});
    } else {
      reportsApi.getProblemReasons().then((r) => {
        setReasons(r);
        if (r.length > 0) setSelectedReason(r[0].value);
      }).catch(() => {});
    }
  }, [listing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (listing && !signedIn) {
      setError('Please sign in to report a seller.');
      return;
    }
    if (listing && !sellerId) {
      setError("This ad can't be reported right now. Please refresh and try again.");
      return;
    }
    if (!listing && !signedIn && !email.includes('@')) {
      setError('Please enter your email so we can reply.');
      return;
    }

    setLoading(true);
    try {
      if (listing) {
        await reportsApi.submitReport({
          reported_user_id: sellerId,
          product_id: listing.id,
          reason: selectedReason,
          details: notes.trim(),
        });
      } else {
        await reportsApi.submitProblem({
          reason: selectedReason,
          details: notes.trim(),
          ...(signedIn ? {} : { contact_email: email.trim() }),
        });
      }
      // Only after the server accepted it.
      setSubmitted(true);
    } catch (err: any) {
      setError(
        err?.status === 0
          ? "Couldn't reach DealBriz. Check your connection and try again."
          : err?.status === 401
            ? 'Please sign in again to send this report.'
            : err?.data?.error || err?.message || 'Your report was not sent. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-5 db-sheet-bottom-p5 shadow-2xl relative">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <h3 className="font-extrabold text-slate-900 text-base">
              {listing ? 'Report Listing' : 'Report a Problem'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {listing && (
              <div className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Reporting Item</span>
                <span className="font-semibold text-slate-900 truncate block">{listing.title}</span>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Select Reason</label>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              >
                {reasons.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                Additional Details
              </label>
              <textarea
                rows={3}
                required
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Explain the issue or describe the safety concern..."
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {!listing && !signedIn && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Your Email (so we can reply)
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-600/30 disabled:opacity-60"
              >
                {loading ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h4 className="font-extrabold text-slate-900 text-base">Report Submitted</h4>
            <p className="text-xs text-slate-600">
              Thank you for keeping DealBriz safe. Our trust & safety team will review this report immediately.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-slate-900 hover:bg-slate-200"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
