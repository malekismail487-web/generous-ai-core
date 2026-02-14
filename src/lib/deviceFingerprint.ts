// Generate a simple device fingerprint from browser properties
export function getDeviceFingerprint(): string {
  const stored = localStorage.getItem('_device_fp');
  if (stored) return stored;

  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency || 'unknown',
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
  ].join('|');

  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  const fp = 'fp_' + Math.abs(hash).toString(36) + '_' + raw.split('|').pop();
  localStorage.setItem('_device_fp', fp);
  return fp;
}
