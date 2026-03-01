import { useEffect, useState } from 'react';
import luminaMascot from '@/assets/lumina-mascot.png';

interface LuminaMascotProps {
  size?: number;
  className?: string;
}

export function LuminaMascot({ size = 48, className = '' }: LuminaMascotProps) {
  const [processedSrc, setProcessedSrc] = useState<string>(luminaMascot);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = luminaMascot;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const w = canvas.width;
      const h = canvas.height;

      // Flood-fill from all edges to find the background region
      // This preserves interior white pixels (like the eyes)
      const visited = new Uint8Array(w * h);
      const backgroundMask = new Uint8Array(w * h);
      const queue: number[] = [];

      const isBackgroundColor = (idx: number): boolean => {
        const r = data[idx * 4];
        const g = data[idx * 4 + 1];
        const b = data[idx * 4 + 2];
        const a = data[idx * 4 + 3];
        if (a < 10) return true; // already transparent
        const brightness = (r + g + b) / 3;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        // Background: bright + low saturation (white/light grey)
        return brightness > 200 && saturation < 0.12;
      };

      // Seed from all edge pixels
      for (let x = 0; x < w; x++) {
        queue.push(x); // top row
        queue.push((h - 1) * w + x); // bottom row
      }
      for (let y = 0; y < h; y++) {
        queue.push(y * w); // left column
        queue.push(y * w + (w - 1)); // right column
      }

      // BFS flood fill
      while (queue.length > 0) {
        const idx = queue.pop()!;
        if (idx < 0 || idx >= w * h) continue;
        if (visited[idx]) continue;
        visited[idx] = 1;

        if (!isBackgroundColor(idx)) continue;

        backgroundMask[idx] = 1;

        const x = idx % w;
        const y = Math.floor(idx / w);
        if (x > 0) queue.push(idx - 1);
        if (x < w - 1) queue.push(idx + 1);
        if (y > 0) queue.push(idx - w);
        if (y < h - 1) queue.push(idx + w);
      }

      // Apply mask: only remove pixels identified as connected-to-edge background
      for (let i = 0; i < w * h; i++) {
        if (backgroundMask[i]) {
          data[i * 4 + 3] = 0; // set alpha to 0
        }
      }

      // Soften edges of the mascot (anti-alias the boundary)
      for (let i = 0; i < w * h; i++) {
        if (backgroundMask[i]) continue;
        const x = i % w;
        const y = Math.floor(i / w);
        let bgNeighbors = 0;
        let totalNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              totalNeighbors++;
              if (backgroundMask[ny * w + nx]) bgNeighbors++;
            }
          }
        }
        if (bgNeighbors > 0 && totalNeighbors > 0) {
          const factor = 1 - (bgNeighbors / totalNeighbors) * 0.5;
          data[i * 4 + 3] = Math.round(data[i * 4 + 3] * factor);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      setProcessedSrc(canvas.toDataURL('image/png'));
    };
  }, []);

  return (
    <img
      src={processedSrc}
      alt="Lumina"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}
