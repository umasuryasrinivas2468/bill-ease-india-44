
// Re-export from the new centralized client
// This maintains backwards compatibility with existing imports
export { 
  supabase, 
  getSupabaseClient, 
  refreshSupabaseClient, 
  updateSupabaseToken,
  getClerkToken 
} from './supabaseClient';
