import luminaMascot from '@/assets/lumina-mascot.png';

interface LuminaMascotProps {
  size?: number;
  className?: string;
}

export function LuminaMascot({ size = 48, className = '' }: LuminaMascotProps) {
  return (
    <img
      src={luminaMascot}
      alt="Lumina"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}
