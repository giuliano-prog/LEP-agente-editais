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
      edital_changes: {
        Row: {
          changes: Json;
          detected_at: string;
          document_ids: string[];
          edital_id: string;
          id: string;
          kind: "fields_changed" | "rectification";
          org_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: "pending" | "applied" | "dismissed";
          summary: string;
        };
        Insert: {
          changes?: Json;
          detected_at?: string;
          document_ids?: string[];
          edital_id: string;
          id?: string;
          kind: "fields_changed" | "rectification";
          org_id: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: "pending" | "applied" | "dismissed";
          summary: string;
        };
        Update: {
          changes?: Json;
          detected_at?: string;
          document_ids?: string[];
          edital_id?: string;
          id?: string;
          kind?: "fields_changed" | "rectification";
          org_id?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: "pending" | "applied" | "dismissed";
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edital_changes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edital_changes_edital_id_fkey";
            columns: ["edital_id"];
            isOneToOne: false;
            referencedRelation: "editais";
            referencedColumns: ["id"];
          },
        ];
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
      discovery_candidates: {
        Row: {
          audiovisual: string | null;
          audiovisual_evidence: string | null;
          audiovisual_reasons: string[];
          edital_id: string | null;
          first_seen_at: string;
          host: string;
          id: string;
          institution: string | null;
          last_seen_at: string;
          official_host: string | null;
          official_reason: string | null;
          official_url: string | null;
          org_id: string;
          query: string | null;
          site_kind: string;
          snippet: string | null;
          status: string;
          status_reason: string | null;
          times_seen: number;
          title: string | null;
          url: string;
        };
        Insert: {
          audiovisual?: string | null;
          audiovisual_evidence?: string | null;
          audiovisual_reasons?: string[];
          edital_id?: string | null;
          first_seen_at?: string;
          host: string;
          id?: string;
          institution?: string | null;
          last_seen_at?: string;
          official_host?: string | null;
          official_reason?: string | null;
          official_url?: string | null;
          org_id: string;
          query?: string | null;
          site_kind: string;
          snippet?: string | null;
          status: string;
          status_reason?: string | null;
          times_seen?: number;
          title?: string | null;
          url: string;
        };
        Update: {
          audiovisual?: string | null;
          audiovisual_evidence?: string | null;
          audiovisual_reasons?: string[];
          edital_id?: string | null;
          first_seen_at?: string;
          host?: string;
          id?: string;
          institution?: string | null;
          last_seen_at?: string;
          official_host?: string | null;
          official_reason?: string | null;
          official_url?: string | null;
          org_id?: string;
          query?: string | null;
          site_kind?: string;
          snippet?: string | null;
          status?: string;
          status_reason?: string | null;
          times_seen?: number;
          title?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_candidates_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discovery_candidates_edital_id_fkey";
            columns: ["edital_id"];
            isOneToOne: false;
            referencedRelation: "editais";
            referencedColumns: ["id"];
          },
        ];
      };
      discovery_runs: {
        Row: {
          audiovisual_no: number;
          audiovisual_uncertain: number;
          audiovisual_yes: number;
          already_known: number;
          api_requests: number;
          limit_reached: string | null;
          analyzed: number;
          blocked: number;
          duplicates: number;
          error: string | null;
          failed: number;
          finished_at: string | null;
          id: number;
          imported: number;
          new_sources: number;
          official_found: number;
          org_id: string;
          provider: string | null;
          provider_limited: boolean;
          queries: string[];
          queries_planned: number;
          queries_run: number;
          results_received: number;
          started_at: string;
          status: string;
          trigger: string;
          unique_urls: number;
        };
        Insert: {
          audiovisual_no?: number;
          audiovisual_uncertain?: number;
          audiovisual_yes?: number;
          already_known?: number;
          api_requests?: number;
          limit_reached?: string | null;
          analyzed?: number;
          blocked?: number;
          duplicates?: number;
          error?: string | null;
          failed?: number;
          finished_at?: string | null;
          id?: number;
          imported?: number;
          new_sources?: number;
          official_found?: number;
          org_id: string;
          provider?: string | null;
          provider_limited?: boolean;
          queries?: string[];
          queries_planned?: number;
          queries_run?: number;
          results_received?: number;
          started_at?: string;
          status: string;
          trigger: string;
          unique_urls?: number;
        };
        Update: {
          audiovisual_no?: number;
          audiovisual_uncertain?: number;
          audiovisual_yes?: number;
          already_known?: number;
          api_requests?: number;
          limit_reached?: string | null;
          analyzed?: number;
          blocked?: number;
          duplicates?: number;
          error?: string | null;
          failed?: number;
          finished_at?: string | null;
          id?: number;
          imported?: number;
          new_sources?: number;
          official_found?: number;
          org_id?: string;
          provider?: string | null;
          provider_limited?: boolean;
          queries?: string[];
          queries_planned?: number;
          queries_run?: number;
          results_received?: number;
          started_at?: string;
          status?: string;
          trigger?: string;
          unique_urls?: number;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_runs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      search_api_usage: {
        Row: { month: string; org_id: string; requests: number; updated_at: string };
        Insert: { month: string; org_id: string; requests?: number; updated_at?: string };
        Update: { month?: string; org_id?: string; requests?: number; updated_at?: string };
        Relationships: [
          {
            foreignKeyName: "search_api_usage_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      edital_matches: {
        Row: {
          blockers: string[];
          computed_at: string;
          confidence: number;
          edital_id: string;
          factors: Json;
          id: string;
          inputs_hash: string;
          level: "high" | "medium" | "low" | "insufficient";
          org_id: string;
          projeto_id: string;
          score: number | null;
          verdict: "compatible" | "compatible_with_pending" | "incompatible";
          version: string;
        };
        Insert: {
          blockers?: string[];
          computed_at?: string;
          confidence: number;
          edital_id: string;
          factors?: Json;
          id?: string;
          inputs_hash: string;
          level: "high" | "medium" | "low" | "insufficient";
          org_id: string;
          projeto_id: string;
          score?: number | null;
          verdict: "compatible" | "compatible_with_pending" | "incompatible";
          version: string;
        };
        Update: {
          blockers?: string[];
          computed_at?: string;
          confidence?: number;
          edital_id?: string;
          factors?: Json;
          id?: string;
          inputs_hash?: string;
          level?: "high" | "medium" | "low" | "insufficient";
          org_id?: string;
          projeto_id?: string;
          score?: number | null;
          verdict?: "compatible" | "compatible_with_pending" | "incompatible";
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edital_matches_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edital_matches_projeto_id_fkey";
            columns: ["projeto_id"];
            isOneToOne: false;
            referencedRelation: "projetos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edital_matches_edital_id_fkey";
            columns: ["edital_id"];
            isOneToOne: false;
            referencedRelation: "editais";
            referencedColumns: ["id"];
          },
        ];
      };
      edital_sightings: {
        Row: {
          edital_id: string;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          match_reason: string;
          org_id: string;
          source_id: string | null;
          title: string | null;
          url: string;
        };
        Insert: {
          edital_id: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          match_reason: string;
          org_id: string;
          source_id?: string | null;
          title?: string | null;
          url: string;
        };
        Update: {
          edital_id?: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          match_reason?: string;
          org_id?: string;
          source_id?: string | null;
          title?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edital_sightings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edital_sightings_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "edital_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edital_sightings_edital_id_fkey";
            columns: ["edital_id"];
            isOneToOne: false;
            referencedRelation: "editais";
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
          adapter_config: Json;
          is_favorite: boolean;
          origin: string;
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
          adapter_config?: Json;
          is_favorite?: boolean;
          origin?: string;
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
          adapter_config?: Json;
          is_favorite?: boolean;
          origin?: string;
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
          eligible_territories: string[];
          triage_reason: string | null;
          eligibility_status:
            | "eligible"
            | "not_eligible"
            | "not_confirmed"
            | "territorial_restriction"
            | "via_partner"
            | "individual"
            | "needs_review";
          eligibility_reason: string | null;
          eligibility_evidence: string | null;
          eligibility_source: "auto" | "manual";
          eligibility_checked_at: string | null;
          page_type: "opportunity" | "uncertain" | null;
          opportunity_kind: string | null;
          page_type_reasons: string[];
          field_evidence: Json;
          extraction_notes: string[];
          extracted_at: string | null;
          canonical_key: string | null;
          possible_duplicate_of: string | null;
          possible_duplicate_reason: string | null;
          last_checked_at: string | null;
          content_hash: string | null;
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
          eligible_territories?: string[];
          triage_reason?: string | null;
          eligibility_status?:
            | "eligible"
            | "not_eligible"
            | "not_confirmed"
            | "territorial_restriction"
            | "via_partner"
            | "individual"
            | "needs_review";
          eligibility_reason?: string | null;
          eligibility_evidence?: string | null;
          eligibility_source?: "auto" | "manual";
          eligibility_checked_at?: string | null;
          page_type?: "opportunity" | "uncertain" | null;
          opportunity_kind?: string | null;
          page_type_reasons?: string[];
          field_evidence?: Json;
          extraction_notes?: string[];
          extracted_at?: string | null;
          canonical_key?: string | null;
          possible_duplicate_of?: string | null;
          possible_duplicate_reason?: string | null;
          last_checked_at?: string | null;
          content_hash?: string | null;
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
          eligible_territories?: string[];
          triage_reason?: string | null;
          eligibility_status?:
            | "eligible"
            | "not_eligible"
            | "not_confirmed"
            | "territorial_restriction"
            | "via_partner"
            | "individual"
            | "needs_review";
          eligibility_reason?: string | null;
          eligibility_evidence?: string | null;
          eligibility_source?: "auto" | "manual";
          eligibility_checked_at?: string | null;
          page_type?: "opportunity" | "uncertain" | null;
          opportunity_kind?: string | null;
          page_type_reasons?: string[];
          field_evidence?: Json;
          extraction_notes?: string[];
          extracted_at?: string | null;
          canonical_key?: string | null;
          possible_duplicate_of?: string | null;
          possible_duplicate_reason?: string | null;
          last_checked_at?: string | null;
          content_hash?: string | null;
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
          status: "invited" | "active" | "suspended";
          invited_at: string | null;
          invited_by: string | null;
          accepted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          role?: Database["core"]["Enums"]["app_role"];
          status?: "invited" | "active" | "suspended";
          invited_at?: string | null;
          invited_by?: string | null;
          accepted_at?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          role?: Database["core"]["Enums"]["app_role"];
          status?: "invited" | "active" | "suspended";
          invited_at?: string | null;
          invited_by?: string | null;
          accepted_at?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
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
          {
            foreignKeyName: "memberships_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_suspended_by_fkey";
            columns: ["suspended_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      monitor_ignored_urls: {
        Row: {
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          org_id: string;
          page_type: "listing" | "result" | "rectification" | "news" | "institutional";
          reasons: string[];
          source_id: string | null;
          title: string | null;
          url: string;
        };
        Insert: {
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          org_id: string;
          page_type: "listing" | "result" | "rectification" | "news" | "institutional";
          reasons?: string[];
          source_id?: string | null;
          title?: string | null;
          url: string;
        };
        Update: {
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          org_id?: string;
          page_type?: "listing" | "result" | "rectification" | "news" | "institutional";
          reasons?: string[];
          source_id?: string | null;
          title?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monitor_ignored_urls_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monitor_ignored_urls_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "edital_sources";
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
          rejected: number;
          blocked_by_robots: number;
          duplicates: number;
          execution_id: string | null;
          failed: number;
          ignored_pages: number;
          found: number;
          pending_review: number;
          updated: number;
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
          rejected?: number;
          blocked_by_robots?: number;
          duplicates?: number;
          execution_id?: string | null;
          failed?: number;
          ignored_pages?: number;
          found?: number;
          pending_review?: number;
          updated?: number;
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
          rejected?: number;
          blocked_by_robots?: number;
          duplicates?: number;
          execution_id?: string | null;
          failed?: number;
          ignored_pages?: number;
          found?: number;
          pending_review?: number;
          updated?: number;
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
          hq_city: string | null;
          partner_territories: string[];
          hq_state: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string;
          hq_city?: string | null;
          partner_territories?: string[];
          hq_state?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
          hq_city?: string | null;
          partner_territories?: string[];
          hq_state?: string | null;
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
      accept_my_invitations: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
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
      reserve_search_request: {
        Args: { p_limit: number; p_org_id: string };
        Returns: boolean;
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
