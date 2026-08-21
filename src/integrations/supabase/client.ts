import { createClient } from '@supabase/supabase-js';
import { getPublicRuntimeConfig } from '@/lib/config';
import type { Database } from './types';


const { supabaseUrl, supabasePublishableKey } = getPublicRuntimeConfig();

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey);
