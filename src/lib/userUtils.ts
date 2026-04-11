
// Utility to ensure user ID compatibility with Supabase
export const normalizeUserId = (userId: string): string => {
  // Clerk user IDs are strings, return as-is for text columns
  return userId;
};

// Helper to validate if we have a valid user ID
export const isValidUserId = (userId: string | null | undefined): userId is string => {
  return typeof userId === 'string' && userId.length > 0;
};
