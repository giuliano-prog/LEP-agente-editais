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
      edital_documents: {
        Row: {
          created_at: string;
          created_by: string | null;
          edital_id: string;
          file_name: string | null;
          final_url: string | null;
          http_status: number | null;
          id: string;
          kind: string;
          metadata: Json;
          mime_type: string;
          org_id: string;
          sha256: string;
          size_bytes: number | null;
          source: string;
          source_url: string | null;
          storage_path: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          edital_id: string;
          file_name?: string | null;
          final_url?: string | null;
          http_status?: number | null;
          id?: string;
          kind?: string;
          metadata?: Json;
          mime_type: string;
          org_id: string;
          sha256: string;
          size_bytes?: number | null;
          source: string;
          source_url?: string | null;
          storage_path: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          edital_id?: string;
          file_name?: string | null;
          final_url?: string | null;
          http_status?: number | null;
          id?: string;
          kind?: string;
          metadata?: Json;
          mime_type?: string;
          org_id?: string;
          sha256?: string;
          size_bytes?: number | null;
          source?: string;
          source_url?: string | null;
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edital_documents_edital_id_fkey";
            columns: ["edital_id"];
            isOneToOne: false;
            referencedRelation: "editais";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edital_documents_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      edital_sources: {
        Row: {
          active: boolean;
          agency: string | null;
          audiovisual_only: boolean;
          created_at: string;
          id: string;
          last_error: string | null;
          last_imported: number | null;
          last_run_at: string | null;
          last_status: string | null;
          link_contains: string | null;
          list_url: string;
          name: string;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          agency?: string | null;
          audiovisual_only?: boolean;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          last_imported?: number | null;
          last_run_at?: string | null;
          last_status?: string | null;
          link_contains?: string | null;
          list_url: string;
          name: string;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          agency?: string | null;
          audiovisual_only?: boolean;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          last_imported?: number | null;
          last_run_at?: string | null;
          last_status?: string | null;
          link_contains?: string | null;
          list_url?: string;
          name?: string;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edital_sources_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      editais: {
        Row: {
          accepted_formats: string[];
          accepted_genres: string[];
          accepted_stages: string[];
          agency: string | null;
          categories: string[];
          created_at: string;
          deadline: string | null;
          discovered_at: string | null;
          eligibility_criteria: string[];
          id: string;
          max_amount_per_project: number | null;
          max_budget: number | null;
          min_budget: number | null;
          official_links: Json;
          official_url: string | null;
          origin: string;
          org_id: string | null;
          required_documents: string[];
          review_status: string;
          source_id: string | null;
          status: string | null;
          summary: string | null;
          title: string | null;
          total_amount: number | null;
          updated_at: string;
        };
        Insert: {
          accepted_formats?: string[];
          accepted_genres?: string[];
          accepted_stages?: string[];
          agency?: string | null;
          categories?: string[];
          created_at?: string;
          deadline?: string | null;
          discovered_at?: string | null;
          eligibility_criteria?: string[];
          id?: string;
          max_amount_per_project?: number | null;
          max_budget?: number | null;
          min_budget?: number | null;
          official_links?: Json;
          official_url?: string | null;
          origin?: string;
          org_id?: string | null;
          required_documents?: string[];
          review_status?: string;
          source_id?: string | null;
          status?: string | null;
          summary?: string | null;
          title?: string | null;
          total_amount?: number | null;
          updated_at?: string;
        };
        Update: {
          accepted_formats?: string[];
          accepted_genres?: string[];
          accepted_stages?: string[];
          agency?: string | null;
          categories?: string[];
          created_at?: string;
          deadline?: string | null;
          discovered_at?: string | null;
          eligibility_criteria?: string[];
          id?: string;
          max_amount_per_project?: number | null;
          max_budget?: number | null;
          min_budget?: number | null;
          official_links?: Json;
          official_url?: string | null;
          origin?: string;
          org_id?: string | null;
          required_documents?: string[];
          review_status?: string;
          source_id?: string | null;
          status?: string | null;
          summary?: string | null;
          title?: string | null;
          total_amount?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "editais_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
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
      monitor_runs: {
        Row: {
          candidates: number;
          error: string | null;
          finished_at: string | null;
          id: number;
          imported: number;
          links_found: number;
          org_id: string;
          skipped: number;
          source_id: string | null;
          started_at: string;
          status: string;
          trigger: string;
        };
        Insert: {
          candidates?: number;
          error?: string | null;
          finished_at?: string | null;
          id?: number;
          imported?: number;
          links_found?: number;
          org_id: string;
          skipped?: number;
          source_id?: string | null;
          started_at?: string;
          status: string;
          trigger: string;
        };
        Update: {
          candidates?: number;
          error?: string | null;
          finished_at?: string | null;
          id?: number;
          imported?: number;
          links_found?: number;
          org_id?: string;
          skipped?: number;
          source_id?: string | null;
          started_at?: string;
          status?: string;
          trigger?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monitor_runs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monitor_runs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "edital_sources";
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
      projetos: {
        Row: {
          budget: number | null;
          created_at: string;
          format: string;
          genre: string | null;
          id: string;
          org_id: string;
          stage: string;
          synopsis: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          budget?: number | null;
          created_at?: string;
          format: string;
          genre?: string | null;
          id?: string;
          org_id: string;
          stage: string;
          synopsis?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          budget?: number | null;
          created_at?: string;
          format?: string;
          genre?: string | null;
          id?: string;
          org_id?: string;
          stage?: string;
          synopsis?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projetos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_edital_with_document: {
        Args: {
          p_file_name: string | null;
          p_final_url: string | null;
          p_http_status: number | null;
          p_kind: string;
          p_metadata: Json | null;
          p_mime_type: string;
          p_official_url: string | null;
          p_org_id: string;
          p_sha256: string;
          p_size_bytes: number | null;
          p_source: string;
          p_source_url: string | null;
          p_storage_path: string;
          p_title: string;
        };
        Returns: string;
      };
      has_role: {
        Args: { p_min_role: Database["core"]["Enums"]["app_role"]; p_org_id: string };
        Returns: boolean;
      };
      try_uuid: {
        Args: { p_value: string };
        Returns: string | null;
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
