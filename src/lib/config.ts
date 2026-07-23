/**
 * Centralized Application Configuration
 * 
 * This module provides a single source of truth for application-wide constants
 * and configuration values, including super admin email and other critical settings.
 */

// Super Admin Configuration
// This email grants super admin privileges when matched during authentication
export const SUPER_ADMIN_EMAIL = 'malekismail487@gmail.com';

// Feature Flags
export const FEATURE_FLAGS = {
  ENABLE_3D_GLB_PIPELINE: false, // Disabled until three.js → .glb path is hardened
  ENABLE_AI_ASSIGNMENT_GENERATOR: false, // Coming soon feature
  ENABLE_CODE_PREVIEW_AI: false, // Requires API key configuration
};

// Environment Validation
export const validateEnvironment = () => {
  const requiredVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ];
  
  const missing = requiredVars.filter(varName => !import.meta.env[varName]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing);
    return false;
  }
  
  return true;
};

export default {
  SUPER_ADMIN_EMAIL,
  FEATURE_FLAGS,
  validateEnvironment,
};
