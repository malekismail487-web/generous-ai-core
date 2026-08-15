/**
 * Lumina motion layer.
 *
 * One shared vocabulary for every role surface: orbit, depth, reveal, magnetism.
 * Everything here degrades gracefully — reduced-motion users get the same
 * layout with the movement removed, never a broken screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** True when the OS asks for calmer interfaces. */
export function useCalmMotion(): boolean {
  const [calm, setCalm] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const evaluate = () => setCalm(media.matches);
    evaluate();
    media.addEventListener('change', evaluate);
    return () => media.removeEventListener('change', evaluate);
  }, []);

  return calm;
}


/** Tracks whether the current palette is the Onyx (dark) half. */
export function useIsOnyx(): boolean {
  const [onyx, setOnyx] = useState(
    () => typeof document === 'undefined' || !document.documentElement.classList.contains('light'),
  );

  useEffect(() => {
    const evaluate = () => setOnyx(!document.documentElement.classList.contains('light'));
    evaluate();
    const observer = new MutationObserver(evaluate);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return onyx;
}

/**
 * Reveals an element the first time it enters the viewport.
 * Returns a ref to spread onto any element carrying the `reveal` class.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.12) {
  const ref = useRef<T | null>(null);
  const calm = useCalmMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (calm) {
      node.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [calm, threshold]);

  return ref;
}

interface TiltOptions {
  /** Maximum rotation in degrees. */
  max?: number;
  /** How far the surface lifts toward the viewer, in px. */
  lift?: number;
  /** Adds a moving specular highlight driven by pointer position. */
  sheen?: boolean;
}

/**
 * Pointer-driven 3D tilt with a specular highlight.
 * Attach the returned ref to a `.layer-3d` element inside a `.scene-3d` parent.
 */
export function useTilt<T extends HTMLElement = HTMLDivElement>(options: TiltOptions = {}) {
  const { max = 9, lift = 18, sheen = true } = options;
  const ref = useRef<T | null>(null);
  const calm = useCalmMotion();
  const frame = useRef(0);

  const reset = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.transform = '';
    node.style.removeProperty('--sheen-x');
    node.style.removeProperty('--sheen-y');
    node.style.removeProperty('--sheen-o');
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || calm) return;

    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        const rotateY = (px - 0.5) * max * 2;
        const rotateX = (0.5 - py) * max * 2;
        node.style.transform = `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(
          2,
        )}deg) translateZ(${lift}px)`;
        if (sheen) {
          node.style.setProperty('--sheen-x', `${(px * 100).toFixed(1)}%`);
          node.style.setProperty('--sheen-y', `${(py * 100).toFixed(1)}%`);
          node.style.setProperty('--sheen-o', '1');
        }
      });
    };

    const onLeave = () => {
      cancelAnimationFrame(frame.current);
      reset();
    };

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);
    node.addEventListener('pointercancel', onLeave);

    return () => {
      cancelAnimationFrame(frame.current);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      node.removeEventListener('pointercancel', onLeave);
    };
  }, [calm, lift, max, reset, sheen]);

  return ref;
}

/** Magnetic pull: the element leans toward the pointer as it approaches. */
export function useMagnetic<T extends HTMLElement = HTMLButtonElement>(strength = 0.28) {
  const ref = useRef<T | null>(null);
  const calm = useCalmMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || calm) return;

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      node.style.transform = `translate3d(${dx * strength}px, ${dy * strength}px, 0)`;
    };

    const onLeave = () => {
      node.style.transform = '';
    };

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);
    return () => {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
    };
  }, [calm, strength]);

  return ref;
}

/** Scroll-linked parallax offset in px for depth layers. */
export function useParallax<T extends HTMLElement = HTMLDivElement>(depth = 0.12) {
  const ref = useRef<T | null>(null);
  const calm = useCalmMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || calm) return;

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * -depth;
        node.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [calm, depth]);

  return ref;
}
