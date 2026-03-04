import { supabase } from '@/integrations/supabase/client';

/**
 * Scans content for malicious/inappropriate material using the scan-content edge function.
 * This is fire-and-forget - it won't block the main operation.
 */
export async function scanContent({
  content,
  contentType,
  contentId,
  userId,
  schoolId,
}: {
  content: string;
  contentType: 'chat_message' | 'course_material' | 'assignment' | 'comment';
  contentId?: string;
  userId: string;
  schoolId?: string | null;
}): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        content,
        content_type: contentType,
        content_id: contentId || null,
        user_id: userId,
        school_id: schoolId || null,
      }),
    }).catch(() => {
      // Silently fail - scanning is non-blocking
    });
  } catch {
    // Non-blocking
  }
}
