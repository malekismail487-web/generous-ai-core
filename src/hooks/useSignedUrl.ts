import { useState, useEffect } from 'react';
import { getSignedUrl } from '@/lib/storageUtils';

/**
 * Hook that converts a stored Supabase storage URL to a signed URL.
 * Returns the signed URL (or original URL if not a storage URL).
 */
export function useSignedUrl(storedUrl: string | null | undefined) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storedUrl) {
      setSignedUrl(null);
      return;
    }

    // If it's not a supabase storage URL, use as-is
    if (!storedUrl.includes('/storage/v1/object/public/')) {
      setSignedUrl(storedUrl);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getSignedUrl(storedUrl).then((url) => {
      if (!cancelled) {
        setSignedUrl(url);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setSignedUrl(storedUrl); // fallback
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [storedUrl]);

  return { signedUrl, loading };
}
