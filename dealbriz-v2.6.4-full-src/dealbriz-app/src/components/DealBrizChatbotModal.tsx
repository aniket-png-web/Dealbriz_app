import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Bot,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  Zap,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { chatbotApi } from '../services/dealbrizApi';

interface ChatbotMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  suggestions?: string[];
  timestamp: string;
}

interface DealBrizChatbotModalProps {
  onClose: () => void;
  onOpenEmi?: () => void;
  onOpenSell?: () => void;
}

export const DealBrizChatbotModal: React.FC<DealBrizChatbotModalProps> = ({
  onClose,
  onOpenEmi,
  onOpenSell,
}) => {
  const [messages, setMessages] = useState<ChatbotMessage[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load greeting from Section 3.17: GET /api/chatbot/greeting
  useEffect(() => {
    chatbotApi.getGreeting().then((data) => {
      setMessages([
        {
          id: 'welcome',
          sender: 'bot',
          text:
            data.opening_message ||
            'Hi! Welcome to DealBriz Support. I can help with buying, selling, safety guidelines, and DealBriz EMI financing.',
          suggestions: data.quick_replies || [],
          timestamp: 'Just now',
        },
      ]);
      setQuickReplies(data.quick_replies || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (messageText?: string) => {
    const text = (messageText || input).trim();
    if (!text || loading) return;

    const userMsg: ChatbotMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Section 3.17: POST /api/chatbot
      const res = await chatbotApi.sendMessage(text);
      const botMsg: ChatbotMessage = {
        id: `b-${Date.now()}`,
        sender: 'bot',
        text: res.reply,
        suggestions: res.suggestions,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          sender: 'bot',
          text: 'DealBriz support is available 24/7. You can browse verified listings or apply for EMI directly.',
          timestamp: 'Just now',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-0 shadow-2xl relative h-[85dvh] max-h-[640px] flex flex-col overflow-hidden db-sheet-bottom">
        {/* App Bar */}
        <div className="p-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Bot className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="font-extrabold text-xs text-slate-900">DealBriz Assistant</h4>
                <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded font-semibold">
                  Rule-Based Engine
                </span>
              </div>
              <p className="text-[10px] text-slate-500">Instant answers for buying, selling & EMI</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F5F7FA] no-scrollbar">
          {messages.map((m) => {
            const isMe = m.sender === 'user';
            return (
              <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-tr-xs'
                      : 'bg-slate-100 text-slate-800 rounded-tl-xs border border-slate-300 leading-relaxed'
                  }`}
                >
                  <p>{m.text}</p>
                </div>
                <span className="text-[9px] text-slate-500 px-1 mt-0.5">{m.timestamp}</span>

                {/* Suggestions pill shortcuts */}
                {m.suggestions && m.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-w-[85%]">
                    {m.suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        // A suggestion is a question for the bot, always.
                        // It used to substring-match: "How does EMI work?"
                        // opened the EMI calculator and "How do I report a
                        // seller?" matched "sell" and opened the post-an-ad
                        // form, so neither question was ever answered.
                        onClick={() => handleSend(s)}
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-white border border-blue-300 hover:bg-blue-50 text-blue-800 shadow-sm active:scale-95 transition-all text-left"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>DealBriz Assistant is typing...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Explicit shortcuts - separate from the FAQ questions above, so
            asking a question never silently navigates somewhere else. */}
        {(onOpenEmi || onOpenSell) && (
          <div className="bg-white border-t border-slate-200 px-3 py-1.5 flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-slate-500 font-medium shrink-0">Shortcuts:</span>
            {onOpenEmi && (
              <button
                onClick={onOpenEmi}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 active:scale-95"
              >
                Open EMI calculator
              </button>
            )}
            {onOpenSell && (
              <button
                onClick={onOpenSell}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 active:scale-95"
              >
                Post an ad
              </button>
            )}
          </div>
        )}

        {/* Quick FAQ Chips */}
        {quickReplies.length > 0 && (
          <div className="bg-white border-t border-slate-200 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {quickReplies.map((qr, i) => (
              <button
                key={i}
                onClick={() => handleSend(qr)}
                className="text-[11px] font-semibold whitespace-nowrap px-3 py-1.5 rounded-full bg-white hover:bg-blue-50 text-slate-800 border border-slate-300 shadow-sm"
              >
                {qr}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about buying, selling, or EMI..."
            className="flex-1 bg-white border border-slate-300 rounded-full px-4 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0 active:scale-95 shadow-md shadow-blue-600/30 transition-transform"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
