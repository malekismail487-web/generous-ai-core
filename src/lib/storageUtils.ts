import { supabase } from '@/integrations/supabase/client';

/**
 * Extracts the bucket name and file path from a Supabase storage public URL.
 * Returns null if the URL is not a Supabase storage URL.
 */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (match) {
      return { bucket: match[1], path: decodeURIComponent(match[2]) };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Converts a stored file URL to a signed URL for private bucket access.
 * If the URL is not a Supabase storage URL, returns the original URL.
 * Signed URLs are valid for 1 hour (3600 seconds).
 */
export async function getSignedUrl(storedUrl: string, expiresIn = 3600): Promise<string> {
  const parsed = parseStorageUrl(storedUrl);
  if (!parsed) return storedUrl;

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, expiresIn);

  if (error || !data?.signedUrl) {
    console.warn('Failed to create signed URL, falling back to original:', error?.message);
    return storedUrl;
  }

  return data.signedUrl;
}

/**
 * Upload a file and return the storage path (not the public URL).
 * The path can later be converted to a signed URL using getSignedUrl().
 */
export async function uploadAndGetSignedUrl(
  bucket: string,
  filePath: string,
  file: File,
  options?: { cacheControl?: string; upsert?: boolean }
): Promise<{ path: string; signedUrl: string } | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, options);

  if (error || !data?.path) return null;

  // Generate a "public-style" URL for storage in DB (backwards compatible)
  // This URL format can be parsed by getSignedUrl() later
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publicStyleUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${data.path}`;

  return { path: publicStyleUrl, signedUrl: publicStyleUrl };
}
