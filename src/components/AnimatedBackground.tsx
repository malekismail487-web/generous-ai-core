import { useEffect, useRef } from 'react';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  rotation: number;
  rotationSpeed: number;
  shape: 'circle' | 'ring' | 'square';
}

export function AnimatedBackground() {
  const { isLiteMode } = useThemeLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const isDarkRef = useRef(true);

  useEffect(() => {
    if (isLiteMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const checkTheme = () => {
      isDarkRef.current = !document.documentElement.classList.contains('light');
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const count = Math.min(35, Math.floor((window.innerWidth * window.innerHeight) / 25000));
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 20 + 8,
      opacity: Math.random() * 0.08 + 0.03,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.008,
      shape: (['circle', 'ring', 'square'] as const)[Math.floor(Math.random() * 3)],
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dark = isDarkRef.current;
      // Monochromatic: use white/grey shades
      const baseL = dark ? 85 : 25;
      const accentL = dark ? 60 : 45;

      particlesRef.current.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        if (p.x < -50) p.x = canvas.width + 50;
        if (p.x > canvas.width + 50) p.x = -50;
        if (p.y < -50) p.y = canvas.height + 50;
        if (p.y > canvas.height + 50) p.y = -50;

        const l = i % 3 === 0 ? accentL : baseL;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `hsl(0 0% ${l}%)`;
          ctx.fill();
        } else if (p.shape === 'ring') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.strokeStyle = `hsl(0 0% ${l}%)`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          const half = p.size * 0.8;
          ctx.strokeStyle = `hsl(0 0% ${l}%)`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-half, -half, half * 2, half * 2);
        }

        ctx.restore();
      });

      for (let i = 0; i < particlesRef.current.length; i++) {
        for (let j = i + 1; j < particlesRef.current.length; j++) {
          const a = particlesRef.current[i];
          const b = particlesRef.current[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            const lineAlpha = (1 - dist / 180) * 0.04;
            const lineL = dark ? 80 : 30;
            ctx.strokeStyle = `hsla(0, 0%, ${lineL}%, ${lineAlpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    };
  }, [isLiteMode]);

  if (isLiteMode) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
}
