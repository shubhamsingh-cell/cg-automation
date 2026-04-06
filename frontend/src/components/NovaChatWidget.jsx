import { useState } from 'react';
import { X } from 'lucide-react';

export default function NovaChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Chat Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-5 z-[9999] rounded-2xl overflow-hidden shadow-2xl shadow-[#5A54BD]/20"
          style={{ width: 400, height: 580 }}
        >
          {/* Glass header bar */}
          <div className="h-11 flex items-center justify-between px-4 bg-[#0a0b14]/90 backdrop-blur-xl border-b border-[rgba(90,84,189,0.2)]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #5A54BD, #6BB3CD)' }}>
                <span className="text-white text-[9px] font-bold">N</span>
              </div>
              <span className="text-white text-xs font-semibold tracking-tight">Nova AI</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-[#666] hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close Nova chat"
            >
              <X size={16} />
            </button>
          </div>
          {/* Iframe -- load Nova chatbot */}
          <iframe
            src="https://media-plan-generator.onrender.com/nova"
            title="Nova AI Chat"
            className="w-full border-0 bg-[#0a0a0a]"
            style={{ height: 'calc(100% - 44px)' }}
            allow="clipboard-write"
          />
        </div>
      )}

      {/* Floating Button -- Pulsing glow ring + gradient circle */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-5 right-5 z-[9999] group"
        aria-label={open ? 'Close Nova chat' : 'Open Nova chat'}
      >
        {/* Outer glow ring (animated) */}
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(90,84,189,0.35) 0%, transparent 70%)',
            transform: 'scale(1.6)',
            pointerEvents: 'none',
          }}
        />
        {/* Second glow ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: '0 0 20px 6px rgba(90,84,189,0.25), 0 0 40px 12px rgba(107,179,205,0.15)',
            pointerEvents: 'none',
          }}
        />
        {/* Main circle */}
        <div
          className="relative w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #5A54BD, #6BB3CD)',
            boxShadow: open
              ? '0 4px 24px rgba(90,84,189,0.5), 0 0 0 3px rgba(90,84,189,0.2)'
              : '0 4px 24px rgba(90,84,189,0.4)',
          }}
        >
          {open ? (
            <X size={22} className="text-white" />
          ) : (
            <span className="text-white text-lg font-bold">N</span>
          )}
        </div>
      </button>
    </>
  );
}
