// Database types will be generated from Supabase later
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Add specific types as we build features
