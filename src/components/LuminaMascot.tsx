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

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        const brightness = (r + g + b) / 3;

        const isBackgroundLike = brightness > 185 && saturation < 0.16;
        if (isBackgroundLike) {
          data[i + 3] = 0;
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
