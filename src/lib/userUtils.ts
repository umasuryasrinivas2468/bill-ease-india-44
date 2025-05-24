
// Utility to ensure user ID compatibility with Supabase
export const normalizeUserId = (userId: string): string => {
  // Clerk user IDs are already strings, just return as-is
  // This function can be extended if needed for other auth providers
  return userId;
};

// Helper to validate if we have a valid user ID
export const isValidUserId = (userId: string | null | undefined): userId is string => {
  return typeof userId === 'string' && userId.length > 0;
};
