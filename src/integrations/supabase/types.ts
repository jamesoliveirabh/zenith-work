export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id: string
          created_at: string
          entity_id: string
          entity_title: string | null
          entity_type: string
          id: string
          metadata: Json | null
          workspace_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id: string
          created_at?: string
          entity_id: string
          entity_title?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          workspace_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["activity_action"]
          actor_id?: string
          created_at?: string
          entity_id?: string
          entity_title?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_actions_log: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
          workspace_id: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json
          workspace_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          workspace_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          workspace_id?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          applied_actions: Json
          automation_id: string
          created_at: string
          error_message: string | null
          id: string
          status: string
          task_id: string | null
          workspace_id: string
        }
        Insert: {
          applied_actions?: Json
          automation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          status: string
          task_id?: string | null
          workspace_id: string
        }
        Update: {
          applied_actions?: Json
          automation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          task_id?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      automations: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          list_id: string | null
          name: string
          run_count: number
          trigger: Database["public"]["Enums"]["automation_trigger"]
          trigger_config: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          list_id?: string | null
          name: string
          run_count?: number
          trigger: Database["public"]["Enums"]["automation_trigger"]
          trigger_config?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          list_id?: string | null
          name?: string
          run_count?: number
          trigger?: Database["public"]["Enums"]["automation_trigger"]
          trigger_config?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      billing_dunning_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string
          created_at: string
          dunning_case_id: string
          id: string
          metadata: Json
          reason: string | null
          result: string
          workspace_id: string
        }
        Insert: {
          attempt_number: number
          attempted_at?: string
          created_at?: string
          dunning_case_id: string
          id?: string
          metadata?: Json
          reason?: string | null
          result: string
          workspace_id: string
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          created_at?: string
          dunning_case_id?: string
          id?: string
          metadata?: Json
          reason?: string | null
          result?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_dunning_attempts_dunning_case_id_fkey"
            columns: ["dunning_case_id"]
            isOneToOne: false
            referencedRelation: "billing_dunning_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_dunning_cases: {
        Row: {
          closed_at: string | null
          created_at: string
          grace_ends_at: string | null
          id: string
          invoice_id: string
          metadata: Json
          next_retry_at: string | null
          reason: string | null
          retry_count: number
          status: string
          subscription_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          grace_ends_at?: string | null
          id?: string
          invoice_id: string
          metadata?: Json
          next_retry_at?: string | null
          reason?: string | null
          retry_count?: number
          status?: string
          subscription_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          grace_ends_at?: string | null
          id?: string
          invoice_id?: string
          metadata?: Json
          next_retry_at?: string | null
          reason?: string | null
          retry_count?: number
          status?: string
          subscription_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      billing_dunning_policies: {
        Row: {
          auto_cancel_after_grace: boolean
          created_at: string
          enforcement_mode_during_past_due: string
          grace_period_days: number
          id: string
          max_retries: number
          pause_features_during_past_due: boolean
          retry_schedule_days: number[]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          auto_cancel_after_grace?: boolean
          created_at?: string
          enforcement_mode_during_past_due?: string
          grace_period_days?: number
          id?: string
          max_retries?: number
          pause_features_during_past_due?: boolean
          retry_schedule_days?: number[]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          auto_cancel_after_grace?: boolean
          created_at?: string
          enforcement_mode_during_past_due?: string
          grace_period_days?: number
          id?: string
          max_retries?: number
          pause_features_during_past_due?: boolean
          retry_schedule_days?: number[]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      billing_email_outbox: {
        Row: {
          created_at: string
          id: string
          payload: Json
          recipient_email: string | null
          recipient_user_id: string | null
          sent_at: string | null
          template: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          recipient_email?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          template: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          recipient_email?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          template?: string
          workspace_id?: string
        }
        Relationships: []
      }
      billing_enforcement_logs: {
        Row: {
          action: string
          context: Json | null
          created_at: string
          current_usage: number | null
          decision: string
          feature_key: string
          id: string
          increment_by: number | null
          limit_value: number | null
          mode: string
          reason_code: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          context?: Json | null
          created_at?: string
          current_usage?: number | null
          decision: string
          feature_key: string
          id?: string
          increment_by?: number | null
          limit_value?: number | null
          mode: string
          reason_code?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          context?: Json | null
          created_at?: string
          current_usage?: number | null
          decision?: string
          feature_key?: string
          id?: string
          increment_by?: number | null
          limit_value?: number | null
          mode?: string
          reason_code?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      billing_enforcement_overrides: {
        Row: {
          allowlisted: boolean
          applied_by: string | null
          created_at: string
          feature_key: string | null
          id: string
          mode: string | null
          override_until: string | null
          reason: string
          workspace_id: string
        }
        Insert: {
          allowlisted?: boolean
          applied_by?: string | null
          created_at?: string
          feature_key?: string | null
          id?: string
          mode?: string | null
          override_until?: string | null
          reason: string
          workspace_id: string
        }
        Update: {
          allowlisted?: boolean
          applied_by?: string | null
          created_at?: string
          feature_key?: string | null
          id?: string
          mode?: string | null
          override_until?: string | null
          reason?: string
          workspace_id?: string
        }
        Relationships: []
      }
      billing_enforcement_settings: {
        Row: {
          default_mode: string
          enabled: boolean
          environment: string
          feature_modes: Json
          id: string
          kill_switch: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_mode?: string
          enabled?: boolean
          environment?: string
          feature_modes?: Json
          id?: string
          kill_switch?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_mode?: string
          enabled?: boolean
          environment?: string
          feature_modes?: Json
          id?: string
          kill_switch?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          provider: string
          provider_event_id: string | null
          subscription_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          provider?: string
          provider_event_id?: string | null
          subscription_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          provider?: string
          provider_event_id?: string | null
          subscription_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workspace_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          list_id: string | null
          name: string
          options: Json
          position: number
          type: Database["public"]["Enums"]["custom_field_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          list_id?: string | null
          name: string
          options?: Json
          position?: number
          type?: Database["public"]["Enums"]["custom_field_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          list_id?: string | null
          name?: string
          options?: Json
          position?: number
          type?: Database["public"]["Enums"]["custom_field_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      dashboard_widget_configs: {
        Row: {
          config: Json
          id: string
          is_visible: boolean
          position: number
          updated_at: string
          user_id: string
          widget_type: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          id?: string
          is_visible?: boolean
          position?: number
          updated_at?: string
          user_id: string
          widget_type: string
          workspace_id: string
        }
        Update: {
          config?: Json
          id?: string
          is_visible?: boolean
          position?: number
          updated_at?: string
          user_id?: string
          widget_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widget_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_members: {
        Row: {
          doc_id: string
          permission: string
          user_id: string
        }
        Insert: {
          doc_id: string
          permission: string
          user_id: string
        }
        Update: {
          doc_id?: string
          permission?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_members_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_task_links: {
        Row: {
          doc_id: string
          task_id: string
          workspace_id: string
        }
        Insert: {
          doc_id: string
          task_id: string
          workspace_id: string
        }
        Update: {
          doc_id?: string
          task_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_task_links_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_task_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_task_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      docs: {
        Row: {
          content: Json | null
          content_text: string | null
          cover_url: string | null
          created_at: string
          created_by: string
          icon: string | null
          id: string
          is_published: boolean
          last_edited_by: string | null
          parent_doc_id: string | null
          position: number
          published_token: string
          space_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: Json | null
          content_text?: string | null
          cover_url?: string | null
          created_at?: string
          created_by: string
          icon?: string | null
          id?: string
          is_published?: boolean
          last_edited_by?: string | null
          parent_doc_id?: string | null
          position?: number
          published_token?: string
          space_id?: string | null
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: Json | null
          content_text?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string
          icon?: string | null
          id?: string
          is_published?: boolean
          last_edited_by?: string | null
          parent_doc_id?: string | null
          position?: number
          published_token?: string
          space_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docs_parent_doc_id_fkey"
            columns: ["parent_doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_members: {
        Row: {
          goal_id: string
          user_id: string
        }
        Insert: {
          goal_id: string
          user_id: string
        }
        Update: {
          goal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_members_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_targets: {
        Row: {
          created_at: string
          current_value: number
          goal_id: string
          id: string
          initial_value: number
          list_id: string | null
          name: string
          position: number
          target_type: Database["public"]["Enums"]["goal_target_type"]
          target_value: number
          task_filter: Json | null
          unit: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          goal_id: string
          id?: string
          initial_value?: number
          list_id?: string | null
          name: string
          position?: number
          target_type: Database["public"]["Enums"]["goal_target_type"]
          target_value?: number
          task_filter?: Json | null
          unit?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_value?: number
          goal_id?: string
          id?: string
          initial_value?: number
          list_id?: string | null
          name?: string
          position?: number
          target_type?: Database["public"]["Enums"]["goal_target_type"]
          target_value?: number
          task_filter?: Json | null
          unit?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_targets_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_targets_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_targets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          color: string
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          is_archived: boolean
          name: string
          owner_id: string
          start_date: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_archived?: boolean
          name: string
          owner_id: string
          start_date?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          owner_id?: string
          start_date?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      list_permissions: {
        Row: {
          access_level: Database["public"]["Enums"]["list_access_level"]
          created_at: string
          created_by: string | null
          id: string
          list_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["list_access_level"]
          created_at?: string
          created_by?: string | null
          id?: string
          list_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["list_access_level"]
          created_at?: string
          created_by?: string | null
          id?: string
          list_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      list_role_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          list_id: string
          permission_key: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          enabled: boolean
          id?: string
          list_id: string
          permission_key: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          list_id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      list_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean
          is_shared: boolean
          list_id: string
          name: string
          owner_id: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          list_id: string
          name: string
          owner_id: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          list_id?: string
          name?: string
          owner_id?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      lists: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          position: number
          space_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          position?: number
          space_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          position?: number
          space_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lists_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          comment_id: string | null
          created_at: string
          id: string
          is_read: boolean
          link_path: string | null
          task_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link_path?: string | null
          task_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link_path?: string | null
          task_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      permission_catalog: {
        Row: {
          category: string
          description: string
          key: string
          label: string
          position: number
        }
        Insert: {
          category: string
          description: string
          key: string
          label: string
          position?: number
        }
        Update: {
          category?: string
          description?: string
          key?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          interval: string
          is_active: boolean
          limits_json: Json
          name: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          interval: string
          is_active?: boolean
          limits_json?: Json
          name: string
          price_cents?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          interval?: string
          is_active?: boolean
          limits_json?: Json
          name?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_admin_actions_log: {
        Row: {
          admin_user_id: string | null
          created_at: string
          email: string | null
          event: string
          id: string
          ip: string | null
          metadata: Json
          route: string | null
          user_agent: string | null
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          email?: string | null
          event: string
          id?: string
          ip?: string | null
          metadata?: Json
          route?: string | null
          user_agent?: string | null
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          email?: string | null
          event?: string
          id?: string
          ip?: string | null
          metadata?: Json
          route?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      platform_admin_roles: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          granted_reason: string | null
          id: string
          is_active: boolean
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          role: Database["public"]["Enums"]["platform_admin_role"]
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          granted_reason?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          role: Database["public"]["Enums"]["platform_admin_role"]
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          granted_reason?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          role?: Database["public"]["Enums"]["platform_admin_role"]
          user_id?: string
        }
        Relationships: []
      }
      platform_admin_sessions: {
        Row: {
          email: string | null
          ended_at: string | null
          ended_reason: string | null
          id: string
          ip: string | null
          last_seen_at: string
          metadata: Json
          started_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          email?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          metadata?: Json
          started_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          email?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          metadata?: Json
          started_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_admin_settings: {
        Row: {
          id: boolean
          mfa_enforcement_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          mfa_enforcement_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          mfa_enforcement_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admin_disabled_at: string | null
          admin_disabled_reason: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_platform_admin: boolean
          mfa_required: boolean
          updated_at: string
        }
        Insert: {
          admin_disabled_at?: string | null
          admin_disabled_reason?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_platform_admin?: boolean
          mfa_required?: boolean
          updated_at?: string
        }
        Update: {
          admin_disabled_at?: string | null
          admin_disabled_reason?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_platform_admin?: boolean
          mfa_required?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          enabled: boolean
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          permission_key: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          enabled?: boolean
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_catalog"
            referencedColumns: ["key"]
          },
        ]
      }
      space_memberships: {
        Row: {
          created_at: string
          id: string
          space_id: string
          team_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          space_id: string
          team_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          space_id?: string
          team_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_memberships_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          name: string
          position: number
          team_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          name: string
          position?: number
          team_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          name?: string
          position?: number
          team_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spaces_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      status_columns: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_done: boolean
          list_id: string
          name: string
          position: number
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_done?: boolean
          list_id: string
          name: string
          position?: number
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_done?: boolean
          list_id?: string
          name?: string
          position?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_columns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_columns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          assigned_at?: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          assigned_at?: string
          task_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_size_bytes: number
          filename: string
          id: string
          mime_type: string
          storage_path: string
          task_id: string
          uploaded_by: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          file_size_bytes: number
          filename: string
          id?: string
          mime_type: string
          storage_path: string
          task_id: string
          uploaded_by: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number
          filename?: string
          id?: string
          mime_type?: string
          storage_path?: string
          task_id?: string
          uploaded_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          task_id: string
          workspace_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
          workspace_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_field_values: {
        Row: {
          field_id: string
          id: string
          task_id: string
          updated_at: string
          value: Json | null
          workspace_id: string
        }
        Insert: {
          field_id: string
          id?: string
          task_id: string
          updated_at?: string
          value?: Json | null
          workspace_id: string
        }
        Update: {
          field_id?: string
          id?: string
          task_id?: string
          updated_at?: string
          value?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      task_relations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          relation_type: Database["public"]["Enums"]["task_relation_type"]
          source_task_id: string
          target_task_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          relation_type?: Database["public"]["Enums"]["task_relation_type"]
          source_task_id: string
          target_task_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          relation_type?: Database["public"]["Enums"]["task_relation_type"]
          source_task_id?: string
          target_task_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_relations_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relations_target_task_id_fkey"
            columns: ["target_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_watchers: {
        Row: {
          task_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          task_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          task_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_watchers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: Json | null
          description_text: string | null
          due_date: string | null
          id: string
          list_id: string
          parent_task_id: string | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          start_date: string | null
          status_id: string | null
          tags: string[] | null
          time_estimate_seconds: number | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: Json | null
          description_text?: string | null
          due_date?: string | null
          id?: string
          list_id: string
          parent_task_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          start_date?: string | null
          status_id?: string | null
          tags?: string[] | null
          time_estimate_seconds?: number | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: Json | null
          description_text?: string | null
          due_date?: string | null
          id?: string
          list_id?: string
          parent_task_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          start_date?: string | null
          status_id?: string | null
          tags?: string[] | null
          time_estimate_seconds?: number | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          note: string | null
          started_at: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          note?: string | null
          started_at: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          note?: string | null
          started_at?: string
          task_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_admin_notes: {
        Row: {
          author_email: string | null
          author_id: string | null
          body: string
          created_at: string
          id: string
          workspace_id: string
        }
        Insert: {
          author_email?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          workspace_id: string
        }
        Update: {
          author_email?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_admin_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_entitlements: {
        Row: {
          created_at: string
          current_usage: number
          enabled: boolean
          feature_key: string
          id: string
          limit_value: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_usage?: number
          enabled?: boolean
          feature_key: string
          id?: string
          limit_value?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_usage?: number
          enabled?: boolean
          feature_key?: string
          id?: string
          limit_value?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_entitlements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          token?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_invoices: {
        Row: {
          amount_due_cents: number
          amount_paid_cents: number
          created_at: string
          currency: string
          due_at: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_pdf_url: string | null
          paid_at: string | null
          provider_invoice_id: string | null
          status: string
          subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_due_cents?: number
          amount_paid_cents?: number
          created_at?: string
          currency?: string
          due_at?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          paid_at?: string | null
          provider_invoice_id?: string | null
          status: string
          subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_due_cents?: number
          amount_paid_cents?: number
          created_at?: string
          currency?: string
          due_at?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          paid_at?: string | null
          provider_invoice_id?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workspace_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          org_role: Database["public"]["Enums"]["org_role"]
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_role?: Database["public"]["Enums"]["org_role"]
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_role?: Database["public"]["Enums"]["org_role"]
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          billing_provider: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          plan_id: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          billing_provider?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan_id?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status: string
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          billing_provider?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan_id?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          is_suspended: boolean
          name: string
          owner_id: string
          slug: string
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          name: string
          owner_id: string
          slug: string
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          name?: string
          owner_id?: string
          slug?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _log_platform_admin_event: {
        Args: { _event: string; _metadata?: Json }
        Returns: undefined
      }
      _log_platform_event: {
        Args: { _event: string; _metadata: Json; _route: string }
        Returns: undefined
      }
      accept_workspace_invitation: { Args: { _token: string }; Returns: string }
      admin_billing_account_detail: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      admin_billing_apply_entitlement_override: {
        Args: {
          _allowlisted: boolean
          _feature_key: string
          _mode: string
          _override_until: string
          _reason: string
          _workspace_id: string
        }
        Returns: string
      }
      admin_billing_extend_trial: {
        Args: {
          _additional_days: number
          _reason: string
          _workspace_id: string
        }
        Returns: Json
      }
      admin_billing_list_accounts: {
        Args: {
          _dunning_status?: string
          _limit?: number
          _offset?: number
          _plan_code?: string
          _search?: string
          _sub_status?: string
        }
        Returns: {
          cancel_at_period_end: boolean
          currency: string
          current_period_end: string
          dunning_status: string
          open_dunning_case_id: string
          owner_email: string
          owner_id: string
          owner_name: string
          plan_code: string
          plan_id: string
          plan_interval: string
          plan_name: string
          price_cents: number
          provider: string
          sub_status: string
          subscription_id: string
          total_count: number
          trial_ends_at: string
          updated_at: string
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      admin_billing_log_action: {
        Args: {
          _action: string
          _metadata?: Json
          _reason?: string
          _target_id: string
          _target_type: string
          _workspace_id: string
        }
        Returns: string
      }
      admin_billing_mark_invoice: {
        Args: { _invoice_id: string; _new_status: string; _reason: string }
        Returns: Json
      }
      admin_billing_metrics: { Args: { _window_days?: number }; Returns: Json }
      admin_billing_remove_entitlement_override: {
        Args: { _override_id: string; _reason: string }
        Returns: undefined
      }
      billing_apply_override: {
        Args: {
          _allowlisted: boolean
          _feature_key: string
          _mode: string
          _override_until: string
          _reason: string
          _workspace_id: string
        }
        Returns: string
      }
      billing_check_entitlement: {
        Args: {
          _action?: string
          _commit_usage?: boolean
          _context?: Json
          _feature_key: string
          _increment_by?: number
          _workspace_id: string
        }
        Returns: Json
      }
      billing_close_expired_cancellations: { Args: never; Returns: number }
      billing_decrement_usage: {
        Args: {
          _decrement_by?: number
          _feature_key: string
          _workspace_id: string
        }
        Returns: undefined
      }
      billing_dunning_cancel_for_nonpayment: {
        Args: { _case_id: string; _reason: string }
        Returns: {
          closed_at: string | null
          created_at: string
          grace_ends_at: string | null
          id: string
          invoice_id: string
          metadata: Json
          next_retry_at: string | null
          reason: string | null
          retry_count: number
          status: string
          subscription_id: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "billing_dunning_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      billing_dunning_compute_next_retry: {
        Args: { _attempt_count: number; _schedule: number[] }
        Returns: string
      }
      billing_dunning_extend_grace: {
        Args: { _additional_days: number; _case_id: string; _reason: string }
        Returns: {
          closed_at: string | null
          created_at: string
          grace_ends_at: string | null
          id: string
          invoice_id: string
          metadata: Json
          next_retry_at: string | null
          reason: string | null
          retry_count: number
          status: string
          subscription_id: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "billing_dunning_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      billing_dunning_get_policy: {
        Args: { _workspace_id: string }
        Returns: {
          auto_cancel_after_grace: boolean
          created_at: string
          enforcement_mode_during_past_due: string
          grace_period_days: number
          id: string
          max_retries: number
          pause_features_during_past_due: boolean
          retry_schedule_days: number[]
          updated_at: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "billing_dunning_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      billing_dunning_list_due: {
        Args: { _limit?: number; _now?: string }
        Returns: {
          closed_at: string | null
          created_at: string
          grace_ends_at: string | null
          id: string
          invoice_id: string
          metadata: Json
          next_retry_at: string | null
          reason: string | null
          retry_count: number
          status: string
          subscription_id: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "billing_dunning_cases"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      billing_dunning_open_case: {
        Args: {
          _invoice_id: string
          _reason?: string
          _subscription_id: string
          _workspace_id: string
        }
        Returns: string
      }
      billing_dunning_process_expired_grace: {
        Args: { _now?: string }
        Returns: number
      }
      billing_dunning_record_attempt: {
        Args: {
          _case_id: string
          _metadata?: Json
          _reason?: string
          _result: string
        }
        Returns: Json
      }
      billing_record_event: {
        Args: {
          _event_type: string
          _payload: Json
          _provider: string
          _provider_event_id?: string
          _subscription_id: string
          _workspace_id: string
        }
        Returns: string
      }
      billing_sync_entitlements: {
        Args: { _plan_id: string; _workspace_id: string }
        Returns: undefined
      }
      calculate_goal_progress: { Args: { _goal_id: string }; Returns: number }
      can_access_space: {
        Args: { _space: string; _user: string }
        Returns: boolean
      }
      can_create_team: {
        Args: { _user: string; _ws: string }
        Returns: boolean
      }
      can_write_workspace: {
        Args: { _user: string; _ws: string }
        Returns: boolean
      }
      global_search: {
        Args: { p_limit?: number; p_query: string; p_workspace_id: string }
        Returns: {
          id: string
          result_type: string
          subtitle: string
          title: string
          updated_at: string
          url_path: string
        }[]
      }
      has_permission: {
        Args: { _key: string; _user: string; _ws: string }
        Returns: boolean
      }
      has_permission_for_list: {
        Args: { _key: string; _list: string; _user: string }
        Returns: boolean
      }
      has_platform_role: {
        Args: {
          _role: Database["public"]["Enums"]["platform_admin_role"]
          _user: string
        }
        Returns: boolean
      }
      is_any_platform_admin: { Args: { _user: string }; Returns: boolean }
      is_gestor_of_space: {
        Args: { _space: string; _user: string }
        Returns: boolean
      }
      is_org_admin: { Args: { _user: string; _ws: string }; Returns: boolean }
      is_platform_admin: { Args: { _user: string }; Returns: boolean }
      is_team_gestor: {
        Args: { _team: string; _user: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team: string; _user: string }
        Returns: boolean
      }
      is_workspace_admin: {
        Args: { _user: string; _ws: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user: string; _ws: string }
        Returns: boolean
      }
      list_is_restricted: { Args: { _list_id: string }; Returns: boolean }
      log_audit: {
        Args: {
          _action: string
          _entity_id: string
          _entity_type: string
          _metadata?: Json
          _ws: string
        }
        Returns: undefined
      }
      log_platform_admin_event: {
        Args: { _event: string; _metadata?: Json; _route?: string }
        Returns: string
      }
      mark_all_notifications_read: {
        Args: { _workspace_id: string }
        Returns: number
      }
      platform_admin_add_note: {
        Args: { _body: string; _workspace_id: string }
        Returns: string
      }
      platform_admin_client_detail: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      platform_admin_grant_role: {
        Args: {
          _reason: string
          _role: Database["public"]["Enums"]["platform_admin_role"]
          _target_user: string
        }
        Returns: string
      }
      platform_admin_list_admins: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          is_disabled: boolean
          last_seen_at: string
          mfa_required: boolean
          roles: string[]
          user_id: string
        }[]
      }
      platform_admin_list_audit: {
        Args: {
          _event?: string
          _limit?: number
          _offset?: number
          _search?: string
        }
        Returns: {
          admin_user_id: string
          created_at: string
          email: string
          event: string
          id: string
          ip: string
          metadata: Json
          route: string
          total_count: number
          user_agent: string
        }[]
      }
      platform_admin_list_clients: {
        Args: {
          _created_after?: string
          _created_before?: string
          _limit?: number
          _offset?: number
          _plan_code?: string
          _search?: string
          _sub_status?: string
          _suspended_only?: boolean
        }
        Returns: {
          current_period_end: string
          is_suspended: boolean
          open_dunning_case_id: string
          owner_email: string
          owner_id: string
          owner_name: string
          plan_code: string
          plan_name: string
          sub_status: string
          suspended_at: string
          total_count: number
          updated_at: string
          workspace_created_at: string
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      platform_admin_list_dunning: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: {
          case_id: string
          created_at: string
          grace_ends_at: string
          invoice_id: string
          next_retry_at: string
          retry_count: number
          status: string
          subscription_id: string
          total_count: number
          updated_at: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      platform_admin_list_invoices: {
        Args: {
          _created_after?: string
          _created_before?: string
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: {
          amount_due_cents: number
          amount_paid_cents: number
          created_at: string
          currency: string
          due_at: string
          invoice_id: string
          paid_at: string
          plan_code: string
          status: string
          total_count: number
          workspace_id: string
          workspace_name: string
        }[]
      }
      platform_admin_list_subscriptions: {
        Args: {
          _limit?: number
          _offset?: number
          _plan_code?: string
          _search?: string
          _status?: string
        }
        Returns: {
          cancel_at_period_end: boolean
          current_period_end: string
          owner_email: string
          plan_code: string
          plan_name: string
          provider: string
          status: string
          subscription_id: string
          total_count: number
          trial_ends_at: string
          updated_at: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      platform_admin_reactivate_workspace: {
        Args: { _reason: string; _workspace_id: string }
        Returns: undefined
      }
      platform_admin_revoke_role: {
        Args: {
          _reason: string
          _role: Database["public"]["Enums"]["platform_admin_role"]
          _target_user: string
        }
        Returns: undefined
      }
      platform_admin_revoke_session: {
        Args: { _reason: string; _session_id: string }
        Returns: undefined
      }
      platform_admin_set_disabled: {
        Args: { _disabled: boolean; _reason: string; _target_user: string }
        Returns: undefined
      }
      platform_admin_set_mfa_enforcement: {
        Args: { _enabled: boolean; _reason: string }
        Returns: undefined
      }
      platform_admin_suspend_workspace: {
        Args: { _reason: string; _workspace_id: string }
        Returns: undefined
      }
      seed_role_permissions: { Args: { _ws: string }; Returns: undefined }
      task_link_path: { Args: { _task_id: string }; Returns: string }
      tiptap_to_text: { Args: { _doc: Json }; Returns: string }
      user_can_access_list: {
        Args: { _list_id: string; _user: string }
        Returns: boolean
      }
      workspace_role_of: {
        Args: { _user: string; _ws: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      activity_action:
        | "task_created"
        | "task_updated"
        | "task_deleted"
        | "task_completed"
        | "task_assigned"
        | "comment_created"
        | "attachment_added"
        | "list_created"
        | "space_created"
        | "member_joined"
        | "goal_created"
        | "goal_target_updated"
      automation_action_type:
        | "set_status"
        | "set_assignee"
        | "set_priority"
        | "add_tag"
        | "set_due_date"
        | "unassign_user"
        | "move_to_list"
        | "create_subtask"
        | "post_comment"
        | "send_notification"
      automation_trigger:
        | "task_created"
        | "status_changed"
        | "task_completed"
        | "assignee_changed"
        | "priority_changed"
        | "due_date_approaching"
        | "comment_added"
      custom_field_type:
        | "text"
        | "number"
        | "select"
        | "checkbox"
        | "date"
        | "url"
      goal_target_type:
        | "number"
        | "percentage"
        | "currency"
        | "true_false"
        | "task_count"
      list_access_level: "view" | "edit" | "admin"
      notification_type:
        | "task_assigned"
        | "task_mentioned"
        | "task_commented"
        | "task_status_changed"
        | "task_completed"
        | "invitation_accepted"
      org_role: "admin" | "gestor" | "member"
      platform_admin_role:
        | "platform_owner"
        | "finance_admin"
        | "support_admin"
        | "security_admin"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_relation_type: "blocks" | "relates_to" | "duplicates"
      team_role: "gestor" | "member"
      workspace_role: "admin" | "gestor" | "member_limited" | "member" | "guest"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_action: [
        "task_created",
        "task_updated",
        "task_deleted",
        "task_completed",
        "task_assigned",
        "comment_created",
        "attachment_added",
        "list_created",
        "space_created",
        "member_joined",
        "goal_created",
        "goal_target_updated",
      ],
      automation_action_type: [
        "set_status",
        "set_assignee",
        "set_priority",
        "add_tag",
        "set_due_date",
        "unassign_user",
        "move_to_list",
        "create_subtask",
        "post_comment",
        "send_notification",
      ],
      automation_trigger: [
        "task_created",
        "status_changed",
        "task_completed",
        "assignee_changed",
        "priority_changed",
        "due_date_approaching",
        "comment_added",
      ],
      custom_field_type: [
        "text",
        "number",
        "select",
        "checkbox",
        "date",
        "url",
      ],
      goal_target_type: [
        "number",
        "percentage",
        "currency",
        "true_false",
        "task_count",
      ],
      list_access_level: ["view", "edit", "admin"],
      notification_type: [
        "task_assigned",
        "task_mentioned",
        "task_commented",
        "task_status_changed",
        "task_completed",
        "invitation_accepted",
      ],
      org_role: ["admin", "gestor", "member"],
      platform_admin_role: [
        "platform_owner",
        "finance_admin",
        "support_admin",
        "security_admin",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_relation_type: ["blocks", "relates_to", "duplicates"],
      team_role: ["gestor", "member"],
      workspace_role: ["admin", "gestor", "member_limited", "member", "guest"],
    },
  },
} as const
