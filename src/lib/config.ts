/** Browser-safe configuration boundary. Never place service-role or provider secrets here. */

export type PublicRuntimeConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

const readRequired = (name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY') => {
  const value = import.meta.env[name]?.trim();
  if (!value) throw new Error(`Lumina is not configured: missing ${name}.`);
  return value;
};

export const getPublicRuntimeConfig = (): PublicRuntimeConfig => {
  const supabaseUrl = readRequired('VITE_SUPABASE_URL');
  const supabasePublishableKey = readRequired('VITE_SUPABASE_PUBLISHABLE_KEY');
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error('Lumina is not configured: VITE_SUPABASE_URL must be a valid URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error('Lumina is not configured: Supabase must use HTTPS outside local development.');
  }
  if (/service[_-]?role/i.test(supabasePublishableKey)) {
    throw new Error('Unsafe configuration: a service-role credential cannot be used in browser code.');
  }
  return { supabaseUrl: parsed.toString().replace(/\/$/, ''), supabasePublishableKey };
};

// Feature Flags
export const FEATURE_FLAGS = {
  ENABLE_3D_GLB_PIPELINE: false, // Disabled until three.js → .glb path is hardened
  ENABLE_AI_ASSIGNMENT_GENERATOR: false, // Coming soon feature
  ENABLE_CODE_PREVIEW_AI: false, // Requires API key configuration
};

// Environment Validation
export const validateEnvironment = () => {
  try {
    getPublicRuntimeConfig();
    return true;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Lumina configuration is invalid.');
    return false;
  }
};

export default {
  FEATURE_FLAGS,
  getPublicRuntimeConfig,
  validateEnvironment,
};
