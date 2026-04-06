import { useRef, useEffect } from 'react';

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
    const r = size * 0.32;
    const particles = [];

    for (let i = 0; i < 120; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      particles.push({
        theta, phi,
        speed: 0.001 + Math.random() * 0.003,
        size: 0.4 + Math.random() * 0.8,
        hue: 210 + Math.random() * 50,
        sat: 60 + Math.random() * 30,
        brightness: 0.4 + Math.random() * 0.6,
      });
    }

    let animId;
    function draw() {
      ctx.clearRect(0, 0, size, size);

      // Outer ring (subtle)
      ctx.beginPath();
      ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90, 84, 189, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Second ring
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90, 84, 189, 0.12)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Sort by z for depth ordering
      const sorted = particles.map((p) => {
        const x3d = r * Math.sin(p.phi) * Math.cos(p.theta);
        const y3d = r * Math.sin(p.phi) * Math.sin(p.theta);
        const z3d = r * Math.cos(p.phi);
        return { ...p, x3d, y3d, z3d };
      }).sort((a, b) => a.z3d - b.z3d);

      sorted.forEach((p) => {
        p.theta += p.speed;
        const px = cx + p.x3d * 0.85;
        const py = cy + p.y3d * 0.85;
        const depth = (p.z3d / r + 1) / 2; // 0 (back) to 1 (front)

        const dotSize = p.size * (0.6 + depth * 0.5);
        const alpha = 0.15 + depth * 0.65;

        ctx.beginPath();
        ctx.arc(px, py, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${45 + depth * 25}%, ${alpha})`;
        ctx.fill();

        // Small glow on front particles only
        if (depth > 0.7 && p.size > 0.6) {
          ctx.beginPath();
          ctx.arc(px, py, dotSize * 2, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(px, py, 0, px, py, dotSize * 2);
          grad.addColorStop(0, `hsla(${p.hue}, 80%, 65%, ${depth * 0.08})`);
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

  return <canvas ref={canvasRef} style={{ width: size, height: size, borderRadius: '50%' }} />;
}

export default function NovaChatWidget() {
  // Nova chatbot opens in a new window (iframe blocked by cross-origin headers)
  function openNovaChat() {
    window.open(
      'https://media-plan-generator.onrender.com/nova',
      'nova-chat',
      'width=420,height=620,resizable=yes,scrollbars=yes',
    );
  }

  return (
    <button
      onClick={openNovaChat}
      className="fixed bottom-5 right-5 z-[9999] group"
      aria-label="Open Nova AI chat"
      style={{ width: 64, height: 64, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      {/* Background glow */}
      <div style={{
        position: 'absolute', inset: '-10px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(90,84,189,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      {/* Main circle */}
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 35%, #1a1a3a, #0a0a18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(90,84,189,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'transform 0.3s',
        overflow: 'hidden',
      }} className="group-hover:scale-110 group-active:scale-95">
        <ParticleGlobe size={56} />
      </div>
      {/* Outer ring */}
      <div style={{
        position: 'absolute', inset: '-4px', borderRadius: '50%',
        border: '1px solid rgba(90,84,189,0.25)',
        pointerEvents: 'none',
      }} />
    </button>
  );
}
