import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Building2,
  User,
  ShieldCheck,
  Check,
  Loader2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { EmiApplication, Listing } from '../types';
import { defaultListingImage } from '../utils/imageUtils';
import { locationsApi, emiApi, EmiSubmitPayload } from '../services/dealbrizApi';
import { dealbrizStorage } from '../services/dealbrizStorage';

interface EmiCalculatorModalProps {
  listing: Listing | null;
  onClose: () => void;
  onSubmitApplication: (app: EmiApplication) => void;
}

export const EmiCalculatorModal: React.FC<EmiCalculatorModalProps> = ({
  listing,
  onClose,
  onSubmitApplication,
}) => {
  const defaultPrice = listing ? listing.price : 45000;
  const [price, setPrice] = useState<number>(defaultPrice);
  const [downPaymentPercent, setDownPaymentPercent] = useState<number>(20);
  const [tenureMonths, setTenureMonths] = useState<number>(12);
  const [annualRate] = useState<number>(11.5); // 11.5% APR typical for DealBriz consumer finance

  // Step 1: Calculator, Step 2: Instant Application KYC
  const [step, setStep] = useState<'calc' | 'apply' | 'success'>('calc');

  // Application form fields - prefilled from the signed-in account. These
  // used to be a made-up person ("Aman Verma", +91 98765 43210, 160017).
  const profile = dealbrizStorage.getUserProfile();
  const profilePin = [profile.pincode, profile.city].find((v) => /^\d{6}$/.test((v || '').trim())) || '';
  const [applicantName, setApplicantName] = useState(
    profile.isAuthenticated && profile.name !== 'Guest User' ? profile.name : ''
  );
  const [applicantPhone, setApplicantPhone] = useState(profile.isAuthenticated ? profile.phone || '' : '');
  const [applicantPincode, setApplicantPincode] = useState(profilePin);
  const [monthlyIncome, setMonthlyIncome] = useState('');

  // Coverage as the server reports it. null = not checked / couldn't check.
  const [coverage, setCoverage] = useState<{ available: boolean; message?: string } | null>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const [submittingEmi, setSubmittingEmi] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string>('');

  const checkCoverage = async (pin: string) => {
    if (!/^\d{6}$/.test(pin)) {
      setCoverage(null);
      return;
    }
    setCheckingCoverage(true);
    const res = await locationsApi.checkEmiAvailability(pin);
    setCheckingCoverage(false);
    setCoverage(res);
  };

  useEffect(() => {
    if (applicantPincode) checkCoverage(applicantPincode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePincodeChange = (pin: string) => {
    const clean = pin.replace(/\D/g, '').slice(0, 6);
    setApplicantPincode(clean);
    setSubmitError(null);
    if (clean.length === 6) checkCoverage(clean);
    else setCoverage(null);
  };

  // Math calculations
  const downPaymentAmount = Math.round((price * downPaymentPercent) / 100);
  const principal = price - downPaymentAmount;
  const monthlyRate = annualRate / 12 / 100;
  // Guard the degenerate cases (100% down payment, 0% interest) that would
  // otherwise produce NaN or a division by zero.
  let monthlyEmi = 0;
  if (principal > 0 && tenureMonths > 0) {
    if (monthlyRate === 0) {
      monthlyEmi = Math.round(principal / tenureMonths);
    } else {
      const growth = Math.pow(1 + monthlyRate, tenureMonths);
      monthlyEmi = Math.round((principal * monthlyRate * growth) / (growth - 1));
    }
  }
  const totalPayable = monthlyEmi * tenureMonths + downPaymentAmount;
  const totalInterest = totalPayable - price;

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingEmi) return;
    setSubmitError(null);

    const incomeNum = Number(monthlyIncome.replace(/[^\d.]/g, ''));
    if (!incomeNum || incomeNum <= 0) {
      setSubmitError('Please enter your monthly income.');
      return;
    }
    if (!/^\d{6}$/.test(applicantPincode)) {
      setSubmitError('Please enter a valid 6-digit PIN code.');
      return;
    }

    // Same fields the website sends; the server requires all of them.
    const payload: EmiSubmitPayload = {
      product_id: listing?.id && !listing.id.startsWith('local-') ? listing.id : null,
      product_title_snapshot: listing?.title || 'EMI request (no listing)',
      product_image_snapshot: listing?.image_url?.trim() || null,
      product_price_snapshot: price,
      down_payment: downPaymentAmount,
      tenure_months: tenureMonths,
      interest_rate: annualRate,
      loan_amount: principal,
      monthly_emi: monthlyEmi,
      // Matches the website: total of the monthly instalments.
      total_payable: monthlyEmi * tenureMonths,
      applicant_name: applicantName.trim(),
      applicant_phone: applicantPhone.trim(),
      applicant_income: incomeNum,
      pincode: applicantPincode,
    };

    setSubmittingEmi(true);
    try {
      const saved = await emiApi.submitApplication(payload);
      setSubmittedId(saved.id);
      onSubmitApplication(saved);
      setStep('success');
      try {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      } catch {
        // ignore
      }
    } catch (err: any) {
      setSubmitError(
        err?.status === 0
          ? "Couldn't reach DealBriz. Check your connection and try again."
          : err?.data?.error || err?.message || 'Your application was not submitted. Please try again.'
      );
    } finally {
      setSubmittingEmi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl p-5 db-sheet-bottom-p5 shadow-2xl relative max-h-[92vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/30 border border-blue-200 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-700 fill-current" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                DealBriz EMI Financing
              </h3>
              <p className="text-[10px] text-slate-500 font-medium">Buy Now. Pay Monthly.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: Calculator */}
        {step === 'calc' && (
          <div className="space-y-4">
            {listing && (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-200">
                <img
                  src={listing.image_url?.trim() || defaultListingImage(listing.title, listing.category)}
                  alt={listing.title}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-lg object-cover"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-slate-700 truncate">{listing.title}</h4>
                  <span className="text-xs font-extrabold text-slate-900">{formatPrice(listing.price)}</span>
                </div>
              </div>
            )}

            {/* Custom Price Input if no listing */}
            {!listing && (
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Item Price (₹)
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Math.max(1000, Number(e.target.value)))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold"
                />
              </div>
            )}

            {/* Down Payment Slider */}
            <div className="bg-slate-100 p-3.5 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-600">Down Payment ({downPaymentPercent}%)</span>
                <span className="text-xs font-extrabold text-blue-600">
                  {formatPrice(downPaymentAmount)}
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={50}
                step={5}
                value={downPaymentPercent}
                onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
                className="w-full accent-blue-500 h-2 bg-slate-100 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>10% min</span>
                <span>30% recommended</span>
                <span>50%</span>
              </div>
            </div>

            {/* Tenure Selector */}
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-2">
                Loan Tenure (Months)
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {[3, 6, 9, 12, 18, 24].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTenureMonths(t)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      tenureMonths === t
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {t}m
                  </button>
                ))}
              </div>
            </div>

            {/* Results Box */}
            {/* Light card, not a saturated gradient: these figures are the
                point of the screen and dark text on blue was unreadable. */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Monthly EMI</span>
                <div className="text-right">
                  <span className="text-xl font-black text-blue-700">
                    {formatPrice(monthlyEmi)}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    / month for {tenureMonths} mos
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-blue-200 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">Principal Loan</span>
                  <span className="font-bold text-slate-900">{formatPrice(principal)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Total Interest</span>
                  <span className="font-bold text-slate-900">{formatPrice(totalInterest)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Total Payable</span>
                  <span className="font-bold text-slate-900">{formatPrice(totalPayable)}</span>
                </div>
              </div>
            </div>

            {/* Action */}
            <button
              onClick={() => setStep('apply')}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <span>Apply for EMI</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: Instant Application Form */}
        {step === 'apply' && (
          <form onSubmit={handleApplySubmit} className="space-y-3.5">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
              <div>
                <span className="block font-semibold text-slate-900">
                  Monthly EMI: {formatPrice(monthlyEmi)} / mo
                </span>
                <span className="text-[11px] text-slate-500">Tenure: {tenureMonths} Months</span>
              </div>
              <button
                type="button"
                onClick={() => setStep('calc')}
                className="text-xs text-blue-600 underline font-medium"
              >
                Change
              </button>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Full Name (as per Aadhaar / PAN)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                required
                value={applicantPhone}
                onChange={(e) => setApplicantPhone(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Your PIN Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                value={applicantPincode}
                onChange={(e) => handlePincodeChange(e.target.value)}
                placeholder="6-digit PIN"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {/* Coverage, as the server reports it. Nothing is shown as
                "available" unless the server said so. */}
            {checkingCoverage ? (
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-500 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>Checking EMI availability…</span>
              </div>
            ) : coverage?.available ? (
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-200 text-[10px] text-emerald-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>EMI is available for PIN {applicantPincode}.</span>
              </div>
            ) : coverage && !coverage.available ? (
              <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-800 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{coverage.message || 'EMI is not available in your area yet.'}</span>
              </div>
            ) : null}

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Monthly Income (₹)
              </label>
<input
                type="text"
                inputMode="numeric"
                required
                value={monthlyIncome}
                onChange={(e) => {
                  setMonthlyIncome(e.target.value.replace(/[^\d]/g, ''));
                  setSubmitError(null);
                }}
                placeholder="e.g. 25000"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            {submitError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-px" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep('calc')}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submittingEmi || coverage?.available === false}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg shadow-blue-600/30 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {submittingEmi && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submittingEmi ? 'Submitting…' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Approval Success */}
        {step === 'success' && (
          <div className="text-center py-4 space-y-3">
            <div className="w-14 h-14 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto border border-blue-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-base font-extrabold text-slate-900">
              Application submitted
            </h3>
            <p className="text-xs text-slate-600 px-2 leading-relaxed">
              Thanks <strong className="text-slate-900">{applicantName}</strong> — your request to finance{' '}
              <strong className="text-amber-700">{formatPrice(principal)}</strong> at an estimated{' '}
              <strong className="text-blue-700">{formatPrice(monthlyEmi)}/mo</strong> is with the DealBriz team.
              A lending partner reviews every application, and the final rate and approval are decided by them.
            </p>

            <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-left space-y-1 text-slate-500">
              <div className="flex justify-between">
                <span>Application ID:</span>
                <span className="font-mono text-slate-700">{submittedId.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="text-amber-700 font-semibold">Under review</span>
              </div>
              <div className="flex justify-between">
                <span>Next Step:</span>
                <span className="text-slate-700">We'll contact you once a partner responds</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-3 rounded-xl shadow"
            >
              Done & Return to DealBriz
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
