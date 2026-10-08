import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  ChevronLeft,
  ShieldCheck,
  Tag,
  Phone,
  Paperclip,
  ExternalLink,
  Info,
  MapPin,
  Calendar,
  Package,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { ChatConversation, ChatMessage, Listing } from '../types';
import { defaultListingImage, initialsAvatar } from '../utils/imageUtils';
import { chatApi, lookupPincode } from '../services/dealbrizApi';
import { parseServerDate, parseThreadId } from '../services/chatBridge';

interface ChatModalProps {
  conversation: ChatConversation | null;
  listing?: Listing | null;
  onClose: () => void;
  onSendMessage: (conversationId: string, text: string, offerAmount?: number) => void;
  onViewListing: (listingId: string) => void;
  sendError?: string | null;
  onDismissSendError?: () => void;
  /** Which side of the thread the signed-in user is on. Defaults to buyer. */
  role?: 'buyer' | 'seller';
  /** The viewer's own show-number setting. */
  viewerShowPhone?: boolean;
}

// Openers a buyer would actually send to a seller. "DealBriz EMI?" used to be
// here too, but EMI is a DealBriz process, not something the seller decides -
// that question belongs in the support chatbot.
const SELLER_QUICK_MSGS: { label: string; text: string }[] = [
  { label: 'Yes, available', text: 'Yes, it is still available.' },
  { label: 'Price is firm', text: 'The price is firm at the listed amount.' },
  { label: 'Open to offers', text: 'I am open to a reasonable offer - what did you have in mind?' },
  { label: 'When to meet?', text: 'When would you like to come and see it?' },
];

const BUYER_QUICK_MSGS: { label: string; text: string }[] = [
  { label: 'Still available?', text: 'Is this still available?' },
  { label: 'Best price?', text: 'What is your best price?' },
  { label: 'See today?', text: 'Can I see it today in person?' },
  { label: 'Where to meet?', text: 'Where would be convenient to meet?' },
];

export const ChatModal: React.FC<ChatModalProps> = ({
  conversation,
  listing,
  onClose,
  onSendMessage,
  onViewListing,
  sendError,
  onDismissSendError,
  role = 'buyer',
  viewerShowPhone,
}) => {
  const [inputText, setInputText] = useState('');
  const [showPartyInfo, setShowPartyInfo] = useState(false);
  const [showOfferInput, setShowOfferInput] = useState(false);
  const [offerValue, setOfferValue] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ChatConversation calls the other party "seller" whoever it is, because the
  // shape was written buyer-first. On the seller's side that field holds the
  // buyer, so labels come from role, not the name.
  const isSeller = role === 'seller';
  const quickMsgs = isSeller ? SELLER_QUICK_MSGS : BUYER_QUICK_MSGS;
  const partyNoun = isSeller ? 'Buyer' : 'Seller';

  const title = conversation?.listingTitle || listing?.title || 'Listing Chat';
  const price = conversation?.listingPrice || listing?.price || 0;
  const image = conversation?.listingImage || listing?.image_url;
  const sellerName =
    conversation?.sellerName ||
    (isSeller ? 'DealBriz Buyer' : listing?.seller_name || 'Seller');
  const sellerAvatar = conversation?.sellerAvatar || listing?.seller_avatar;
  // A number only shows when its owner has opted in. On the seller side that
  // field holds the signed-in user's own number, so it follows their setting;
  // on the buyer side the listing carries the seller's choice.
  const rawOtherPhone = isSeller
    ? conversation?.otherUserPhone
    : // The account's current setting (inbox, refreshed often), or the number
      // from a listing page that was just fetched fresh. Not conversation
      // .sellerPhone, which was copied from a listing when the chat started.
      conversation?.otherUserPhone || listing?.seller_phone;
  const otherHidPhone = !isSeller && listing?.show_phone === false;
  const sellerPhone = otherHidPhone ? undefined : rawOtherPhone;
  // Same value drives the info panel row.
  const partyPhone = sellerPhone;

  // "About this person" describes the OTHER person, from their own public
  // profile (GET /api/users/<id>). Location used to be the listing's PIN, so
  // a seller looking at a buyer saw the ad's location, not the buyer's.
  const otherUserId =
    conversation?.otherUserId || (conversation ? parseThreadId(conversation.id)?.otherUserId : '') || '';
  const [partyLocation, setPartyLocation] = useState('');
  const [partyJoined, setPartyJoined] = useState('');
  useEffect(() => {
    let cancelled = false;
    setPartyLocation('');
    setPartyJoined('');
    if (!otherUserId) return;
    (async () => {
      const prof = await chatApi.getUserProfileById(otherUserId);
      if (cancelled || !prof) return;
      if (prof.created_at) {
        const d = parseServerDate(prof.created_at);
        if (!Number.isNaN(d.getTime())) {
          setPartyJoined(d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
        }
      }
      const city = (prof.city || '').trim();
      if (/^\d{6}$/.test(city)) {
        // Accounts store a PIN code here; show the place, not the number.
        const place = await lookupPincode(city);
        if (cancelled) return;
        setPartyLocation(place ? [place.district, place.state].filter(Boolean).join(', ') : city);
      } else {
        setPartyLocation(city);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [otherUserId]);
  const sellerLocation = partyLocation;
  const sellerJoined = partyJoined;

  // Only real messages. This used to fall back to a fabricated greeting that
  // looked like the seller had written it.
  const messages: ChatMessage[] = conversation?.messages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (textToSend?: string, offerAmt?: number) => {
    const text = textToSend || inputText;
    if (!text.trim() || !conversation) return;

    onSendMessage(conversation.id, text.trim(), offerAmt);
    setInputText('');
    setShowOfferInput(false);
    setOfferValue('');
  };

  const handleQuickChip = (text: string) => {
    handleSend(text);
  };

  const handleMakeOffer = () => {
    const num = parseFloat(offerValue.replace(/[^0-9]/g, ''));
    if (isNaN(num) || num <= 0) return;
    const msg = isSeller
      ? `I can do ₹${num.toLocaleString('en-IN')} for ${title}.`
      : `I would like to make an offer of ₹${num.toLocaleString('en-IN')} for ${title}.`;
    handleSend(msg, num);
  };

  const handleReportUser = () => {
    setReportSubmitted(true);
    setTimeout(() => {
      setShowReportConfirm(false);
      setShowPartyInfo(false);
      setReportSubmitted(false);
    }, 2000);
  };

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-3">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl shadow-2xl h-[92vh] db-sheet-bottom max-h-[850px] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 duration-200 relative">
        {/* DealBriz Android Chat App Bar */}
        <div className="bg-white border-b border-slate-200 px-3.5 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 active:scale-95 shrink-0"
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Seller Avatar */}
            <div
              onClick={() => setShowPartyInfo(true)}
              className="relative cursor-pointer shrink-0"
              title="View profile info"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs overflow-hidden border border-slate-300">
                {sellerAvatar?.trim() ? (
                  <img
                    src={sellerAvatar.trim()}
                    alt={sellerName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span>{sellerName ? sellerName.charAt(0).toUpperCase() : 'U'}</span>
                )}
              </div>
            </div>

            {/* Seller Details */}
            <div
              onClick={() => setShowPartyInfo(true)}
              className="min-w-0 cursor-pointer"
              title={`Click to see ${partyNoun.toLowerCase()} details`}
            >
              <div className="flex items-center gap-1">
                <span className="font-bold text-xs text-slate-900 truncate">{sellerName}</span>
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              </div>
              <p className="text-[11px] text-blue-600 font-medium truncate max-w-[170px] sm:max-w-[220px]">
                {title}
              </p>
            </div>
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Info button */}
            <button
              onClick={() => setShowPartyInfo(true)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
              title="About this person"
            >
              <Info className="w-4 h-4" />
            </button>

            {/* Direct Phone Call */}
            {sellerPhone && (
              <a
                href={`tel:${sellerPhone}`}
                className="p-1.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-200"
                title={`Call ${sellerName}`}
              >
                <Phone className="w-4 h-4" />
              </a>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pinned Listing Summary Bar with View Listing button */}
        {conversation?.listingId && (
          <div className="bg-white border-b border-slate-200 px-3.5 py-2 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={image?.trim() || defaultListingImage(title)}
                alt={title}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-lg object-cover border border-slate-300 shrink-0"
              />
              <div className="min-w-0">
                <h5 className="text-xs font-bold text-slate-700 truncate">{title}</h5>
                <span className="text-xs font-extrabold text-blue-600">{formatPrice(price)}</span>
              </div>
            </div>

            <button
              onClick={() => onViewListing(conversation.listingId)}
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-700 px-3 py-1.5 rounded-full bg-blue-600/15 border border-blue-200 shrink-0 active:scale-95 transition-all"
            >
              <span>View Ad</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Chat Messages Log */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F5F7FA]">
          {/* DealBriz Official Safety Notice Banner */}
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-200 text-amber-700 text-xs flex items-start gap-2.5 leading-relaxed shadow-sm">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-amber-700 text-[11px] font-bold">DealBriz Safe Chat</strong>
              <span>Never share OTPs or bank details, and pay only after you have seen the item in person. DealBriz never asks for payment in chat.</span>
            </div>
          </div>

          {messages.length === 0 && (
            <div className="py-6 text-center space-y-1">
              <p className="text-xs font-semibold text-slate-600">No messages yet</p>
              <p className="text-[11px] text-slate-500 px-6 leading-relaxed">
                Say hello — your message goes straight to {sellerName}, who will see it on their
                DealBriz account.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isMe = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-tr-xs'
                      : 'bg-slate-100 text-slate-800 rounded-tl-xs border border-slate-300'
                  }`}
                >
                  {/* Official Offer Proposal Badge */}
                  {msg.isOffer && (
                    <div className="mb-1.5 pb-1.5 border-b border-black/5 flex items-center gap-1.5 text-[11px] font-bold text-amber-700">
                      <Tag className="w-3.5 h-3.5" />
                      <span>Deal Offer: {formatPrice(msg.offerAmount || 0)}</span>
                    </div>
                  )}

                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
                <span className="text-[9px] text-slate-500 px-1 mt-0.5">{msg.timestamp}</span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {sendError && (
          <div className="bg-rose-500/15 border-t border-rose-200 px-3 py-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span className="text-[11px] text-rose-700 flex-1">{sendError}</span>
            <button
              onClick={onDismissSendError}
              className="text-[11px] font-bold text-rose-700 px-2 py-0.5 rounded-md bg-rose-500/20"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Inline Offer Creator Popup */}
        {showOfferInput && (
          <div className="bg-white border-t border-slate-300 p-3 flex items-center gap-2 animate-in slide-in-from-bottom-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">₹</span>
              <input
                type="number"
                value={offerValue}
                onChange={(e) => setOfferValue(e.target.value)}
                placeholder={`Offer amount (listed: ₹${price.toLocaleString('en-IN')})`}
                className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-xl pl-7 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 outline-none"
              />
            </div>
            <button
              onClick={handleMakeOffer}
              disabled={!offerValue.trim()}
              className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs active:scale-95 transition-all"
            >
              Send Offer
            </button>
            <button
              onClick={() => setShowOfferInput(false)}
              className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Suggestion Chips (Buyer & Seller openers as on website) */}
        <div className="bg-white border-t border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setShowOfferInput(true)}
            className="text-[11px] font-semibold whitespace-nowrap px-3 py-1 rounded-full bg-amber-500/15 hover:bg-amber-50 text-amber-700 border border-amber-200 active:scale-95 transition-all flex items-center gap-1 shrink-0"
          >
            <Tag className="w-3 h-3" />
            <span>{isSeller ? 'Counter Offer' : 'Make Offer'}</span>
          </button>

          {quickMsgs.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleQuickChip(item.text)}
              className="text-[11px] whitespace-nowrap px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 active:scale-95 transition-all shrink-0"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Chat Input Bar */}
        <div className="bg-white border-t border-slate-200 p-2.5 px-3 flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="p-2 rounded-full text-slate-500 hover:text-slate-700"
            title="Attach photo"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 bg-white border border-slate-300 focus:border-blue-500 rounded-full px-4 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none"
          />

          <button
            onClick={() => handleSend()}
            disabled={!inputText.trim()}
            className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30 transition-transform active:scale-95"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Person Info Modal ("About this person" - Exactly like DealBriz website) */}
        {showPartyInfo && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  About This {partyNoun}
                </h4>
                <button
                  onClick={() => setShowPartyInfo(false)}
                  className="p-1 rounded-full text-slate-500 hover:text-slate-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Head profile */}
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg overflow-hidden border-2 border-blue-500">
                  {sellerAvatar?.trim() ? (
                    <img
                      src={sellerAvatar.trim()}
                      alt={sellerName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{sellerName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <strong className="block text-sm text-slate-900">{sellerName}</strong>
                  <span className="text-xs text-slate-500 font-medium mt-0.5 block">DealBriz member</span>
                </div>
              </div>

              {/* Rows */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-100 border border-slate-200">
                  <span className="text-slate-500 flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    Location
                  </span>
                  <span className="font-semibold text-slate-900">{sellerLocation || '—'}</span>
                </div>

                {/* Mobile number.
                    Shown only when the other party has chosen to share it. The
                    number itself has to come from the server - nothing in the
                    current API returns another user's phone - so an absent
                    value is treated as "not shared" rather than guessed at. */}
                <div className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-slate-100 border border-slate-200">
                  <span className="text-slate-500 flex items-center gap-2 shrink-0">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    Mobile
                  </span>
                  {partyPhone ? (
                    <a
                      href={`tel:${partyPhone}`}
                      className="font-semibold text-blue-700 hover:underline text-right"
                    >
                      {partyPhone}
                    </a>
                  ) : (
                    <span className="text-slate-500 text-right text-[11px] leading-snug max-w-[190px]">
                      This user has chosen not to show their mobile number.
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-100 border border-slate-200">
                  <span className="text-slate-500 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    Member Since
                  </span>
                  <span className="font-semibold text-slate-900">{sellerJoined || '—'}</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-100 border border-slate-200">
                  <span className="text-slate-500 flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-slate-500" />
                    Inquiring About
                  </span>
                  <span className="font-semibold text-blue-600 truncate max-w-[140px] text-right">
                    {title}
                  </span>
                </div>
              </div>

              {/* Safety banner */}
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-200 text-[11px] text-amber-700">
                Never share OTPs or wire money in advance. If something feels wrong, report this user.
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setShowReportConfirm(true)}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-200 text-rose-400 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Report User
                </button>
                <button
                  onClick={() => setShowPartyInfo(false)}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all"
                >
                  Close
                </button>
              </div>

              {/* Report Confirmation Modal */}
              {showReportConfirm && (
                <div className="p-3 rounded-xl bg-white border border-rose-200 text-center space-y-2 mt-2">
                  {reportSubmitted ? (
                    <div className="text-emerald-600 text-xs font-bold py-2">
                      Report submitted. Our trust & safety team has received the alert.
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-600">
                        Submit a safety report regarding {sellerName}?
                      </p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={handleReportUser}
                          className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold text-xs"
                        >
                          Confirm Report
                        </button>
                        <button
                          onClick={() => setShowReportConfirm(false)}
                          className="px-3 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
