import React, { useState, useEffect } from 'react';
import { X, HelpCircle, ChevronDown, ChevronUp, ShieldCheck, Zap, Tag } from 'lucide-react';
import { faqsApi, FaqItem } from '../services/dealbrizApi';

interface FaqsModalProps {
  onClose: () => void;
  onOpenEmi?: () => void;
  onOpenSell?: () => void;
}

export const FaqsModal: React.FC<FaqsModalProps> = ({ onClose, onOpenEmi, onOpenSell }) => {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [categories, setCategories] = useState<{ code: string; label: string }[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Section 3.12: GET /api/faqs
    faqsApi.getFaqs().then((data) => {
      setFaqs(data.faqs || []);
      setCategories([
        { code: 'all', label: 'All FAQs' },
        ...(data.categories || [
          { code: 'buying', label: 'Buying' },
          { code: 'selling', label: 'Selling' },
          { code: 'emi', label: 'DealBriz EMI' },
          { code: 'safety', label: 'Safety & Trust' },
        ]),
      ]);
      setLoading(false);
      if (data.faqs && data.faqs.length > 0) {
        setExpandedId(data.faqs[0].id);
      }
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  const filtered = activeCategory === 'all'
    ? faqs
    : faqs.filter((f) => f.category?.toLowerCase() === activeCategory.toLowerCase());

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-0 db-sheet-bottom shadow-2xl relative h-[80vh] max-h-[600px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <HelpCircle className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Help & FAQs</h3>
              <p className="text-[10px] text-slate-500">Official DealBriz Knowledge Base</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Pills */}
        <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {categories.map((c) => (
            <button
              key={c.code}
              onClick={() => setActiveCategory(c.code)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                activeCategory === c.code
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* FAQ Accordion List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 no-scrollbar bg-[#F5F7FA]">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading help articles...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">No articles in this topic.</div>
          ) : (
            filtered.map((item) => {
              const isOpen = expandedId === item.id;
              return (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden transition-all shadow-sm"
                >
                  <button
                    onClick={() => setExpandedId(isOpen ? null : item.id)}
                    className="w-full text-left p-3.5 flex items-center justify-between gap-3 text-xs font-bold text-slate-900 hover:bg-slate-50"
                  >
                    <span>{item.question}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-3.5 pb-3.5 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-200 bg-slate-100">
                      <p>{item.answer}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Quick Help CTA */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-500 text-[11px]">Still need help?</span>
          <div className="flex gap-2">
            {onOpenEmi && (
              <button
                onClick={() => {
                  onClose();
                  onOpenEmi();
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 text-blue-700 font-semibold text-[11px] hover:bg-slate-200"
              >
                EMI Calculator
              </button>
            )}
            {onOpenSell && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSell();
                }}
                className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold text-[11px] hover:bg-blue-500"
              >
                Post Ad Free
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
