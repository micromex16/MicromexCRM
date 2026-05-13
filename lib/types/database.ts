// Placeholder. Generate the real file with:
//   pnpm supabase gen types typescript --project-id <ref> > lib/types/database.ts
// or, against local: pnpm supabase gen types typescript --local > lib/types/database.ts

export type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>;
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
    CompositeTypes: Record<string, unknown>;
  };
}
