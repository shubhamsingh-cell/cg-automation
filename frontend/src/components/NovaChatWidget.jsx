import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

function ParticleGlobe({ size = 56 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.35;
    const particles = [];

    // Create particles on a sphere surface
    for (let i = 0; i < 80; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      particles.push({
        theta, phi,
        speed: 0.002 + Math.random() * 0.004,
        size: 0.8 + Math.random() * 1.5,
        hue: 220 + Math.random() * 40,
        brightness: 0.4 + Math.random() * 0.6,
      });
    }

    let animId;
    function draw() {
      ctx.clearRect(0, 0, size, size);

      // Outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90, 84, 189, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw particles
      particles.forEach((p) => {
        p.theta += p.speed;
        const x3d = r * Math.sin(p.phi) * Math.cos(p.theta);
        const y3d = r * Math.sin(p.phi) * Math.sin(p.theta);
        const z3d = r * Math.cos(p.phi);

        // Simple 3D -> 2D projection
        const scale = 1 + z3d / (r * 3);
        const px = cx + x3d * 0.9;
        const py = cy + y3d * 0.9;
        const alpha = (z3d / r + 1) / 2; // 0-1 based on depth

        ctx.beginPath();
        ctx.arc(px, py, p.size * scale, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 70%, ${50 + p.brightness * 20}%, ${0.2 + alpha * 0.7})`;
        ctx.fill();

        // Glow for front particles
        if (alpha > 0.5) {
          ctx.beginPath();
          ctx.arc(px, py, p.size * scale * 2.5, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(px, py, 0, px, py, p.size * scale * 2.5);
          grad.addColorStop(0, `hsla(${p.hue}, 80%, 60%, ${alpha * 0.15})`);
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.fill();
        }
      });

      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animId);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, borderRadius: '50%' }}
    />
  );
}

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
          <iframe
            src="https://media-plan-generator.onrender.com/nova"
            title="Nova AI Chat"
            className="w-full border-0 bg-[#0a0a0a]"
            style={{ height: 'calc(100% - 44px)' }}
            allow="clipboard-write"
          />
        </div>
      )}

      {/* Floating Button -- Animated particle globe with ring */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-5 right-5 z-[9999] group"
        aria-label={open ? 'Close Nova chat' : 'Open Nova chat'}
        style={{ width: 64, height: 64, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute', inset: '-8px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(90,84,189,0.2) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        {/* Main circle with dark bg */}
        <div
          style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, #1a1a3a, #0a0a1a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 24px rgba(90,84,189,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
            transition: 'transform 0.3s, box-shadow 0.3s',
            overflow: 'hidden',
          }}
          className="group-hover:scale-110 group-active:scale-95"
        >
          {open ? (
            <X size={24} style={{ color: 'white' }} />
          ) : (
            <ParticleGlobe size={56} />
          )}
        </div>
        {/* Outer ring */}
        <div
          style={{
            position: 'absolute', inset: '-4px', borderRadius: '50%',
            border: '1px solid rgba(90,84,189,0.3)',
            pointerEvents: 'none',
          }}
        />
      </button>
    </>
  );
}
