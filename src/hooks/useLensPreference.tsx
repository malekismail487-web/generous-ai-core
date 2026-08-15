import { useCallback, useEffect, useState } from 'react';

/**
 * Whether the draggable liquid lens is shown.
 *
 * Deliberately storage-backed rather than context-backed: the lens is mounted
 * on every actor surface, several of which sit outside the app providers, so a
 * lightweight localStorage + event channel keeps them all in sync.
 */

const STORAGE_KEY = 'lumina.lens.enabled';
const EVENT = 'lumina:lens-preference';

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function useLensPreference() {
  const [enabled, setEnabled] = useState<boolean>(read);

  useEffect(() => {
    const sync = () => setEnabled(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setLensEnabled = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* storage is best-effort */
    }
    window.dispatchEvent(new Event(EVENT));
    setEnabled(next);
  }, []);

  return { lensEnabled: enabled, setLensEnabled };
}

export default useLensPreference;
