// Tipos do banco no formato de `supabase gen types`.
// Após alterar migrações, regenere com `pnpm db:types` (requer `pnpm db:start`).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  core: {
    Tables: {
      ai_usage: {
        Row: {
          cached_input_tokens: number;
          cost_usd: number;
          created_at: string;
          duration_ms: number | null;
          error_message: string | null;
          id: number;
          input_tokens: number;
          metadata: Json;
          model: string;
          org_id: string;
          output_tokens: number;
          provider: string;
          purpose: string;
          status: string;
        };
        Insert: {
          cached_input_tokens?: number;
          cost_usd?: number;
          created_at?: string;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: never;
          input_tokens?: number;
          metadata?: Json;
          model: string;
          org_id: string;
          output_tokens?: number;
          provider: string;
          purpose: string;
          status: string;
        };
        Update: {
          cached_input_tokens?: number;
          cost_usd?: number;
          created_at?: string;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: never;
          input_tokens?: number;
          metadata?: Json;
          model?: string;
          org_id?: string;
          output_tokens?: number;
          provider?: string;
          purpose?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: number;
          new_data: Json | null;
          old_data: Json | null;
          org_id: string | null;
          record_id: string | null;
          table_name: string;
          table_schema: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          new_data?: Json | null;
          old_data?: Json | null;
          org_id?: string | null;
          record_id?: string | null;
          table_name: string;
          table_schema: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          new_data?: Json | null;
          old_data?: Json | null;
          org_id?: string | null;
          record_id?: string | null;
          table_name?: string;
          table_schema?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          role: Database["core"]["Enums"]["app_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          role?: Database["core"]["Enums"]["app_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          role?: Database["core"]["Enums"]["app_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: { p_min_role: Database["core"]["Enums"]["app_role"]; p_org_id: string };
        Returns: boolean;
      };
      role_in_org: {
        Args: { p_org_id: string };
        Returns: Database["core"]["Enums"]["app_role"];
      };
    };
    Enums: {
      app_role: "viewer" | "editor" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
