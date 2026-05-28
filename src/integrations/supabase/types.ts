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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_trainings: {
        Row: {
          content: string | null
          created_at: string | null
          equipe_id: string
          gpt_training_id: string
          id: string
          image: string | null
          synced_at: string | null
          type: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          equipe_id: string
          gpt_training_id: string
          id?: string
          image?: string | null
          synced_at?: string | null
          type: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          equipe_id?: string
          gpt_training_id?: string
          id?: string
          image?: string | null
          synced_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_trainings_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_decisions: {
        Row: {
          confidence_score: number | null
          created_at: string
          decision_type: string
          equipe_id: string | null
          error_details: string | null
          id: string
          input_summary: string | null
          lead_id: string | null
          output_action: Json
          rule_id: string | null
          status: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          decision_type: string
          equipe_id?: string | null
          error_details?: string | null
          id?: string
          input_summary?: string | null
          lead_id?: string | null
          output_action: Json
          rule_id?: string | null
          status?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          decision_type?: string
          equipe_id?: string | null
          error_details?: string | null
          id?: string
          input_summary?: string | null
          lead_id?: string | null
          output_action?: Json
          rule_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_decisions_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decisions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string
          custom_data: Json
          deleted_at: string | null
          equipe_id: string
          id: string
          industry: string | null
          legal_name: string | null
          name: string
          size_bracket: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          custom_data?: Json
          deleted_at?: string | null
          equipe_id: string
          id?: string
          industry?: string | null
          legal_name?: string | null
          name: string
          size_bracket?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          custom_data?: Json
          deleted_at?: string | null
          equipe_id?: string
          id?: string
          industry?: string | null
          legal_name?: string | null
          name?: string
          size_bracket?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      consumo_creditos: {
        Row: {
          created_at: string | null
          creditos_utilizados: number
          data_consumo: string | null
          equipe_id: string
          id: string
          metadata: Json | null
          periodo: string
        }
        Insert: {
          created_at?: string | null
          creditos_utilizados: number
          data_consumo?: string | null
          equipe_id: string
          id?: string
          metadata?: Json | null
          periodo: string
        }
        Update: {
          created_at?: string | null
          creditos_utilizados?: number
          data_consumo?: string | null
          equipe_id?: string
          id?: string
          metadata?: Json | null
          periodo?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumo_creditos_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_company_links: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          deleted_at: string | null
          equipe_id: string
          id: string
          is_primary: boolean
          role: string
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          deleted_at?: string | null
          equipe_id: string
          id?: string
          is_primary?: boolean
          role?: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          deleted_at?: string | null
          equipe_id?: string
          id?: string
          is_primary?: boolean
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_company_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_company_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_company_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_name: string | null
          archived_at: string | null
          atendido_por_agente: boolean
          channel: string
          created_at: string
          deleted_at: string | null
          equipe_id: string
          gpt_maker_chat_id: string | null
          id: string
          last_message_at: string | null
          lead_id: string
          responsible_id: string | null
          status: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          agent_name?: string | null
          archived_at?: string | null
          atendido_por_agente?: boolean
          channel?: string
          created_at?: string
          deleted_at?: string | null
          equipe_id: string
          gpt_maker_chat_id?: string | null
          id?: string
          last_message_at?: string | null
          lead_id: string
          responsible_id?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          agent_name?: string | null
          archived_at?: string | null
          atendido_por_agente?: boolean
          channel?: string
          created_at?: string
          deleted_at?: string | null
          equipe_id?: string
          gpt_maker_chat_id?: string | null
          id?: string
          last_message_at?: string | null
          lead_id?: string
          responsible_id?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      epic1_merge_log: {
        Row: {
          canonical_lead_id: string | null
          equipe_id: string | null
          id: string
          merged_at: string
          merged_lead_ids: string[] | null
          phone_normalized: string | null
          reassigned_tables: Json | null
        }
        Insert: {
          canonical_lead_id?: string | null
          equipe_id?: string | null
          id?: string
          merged_at?: string
          merged_lead_ids?: string[] | null
          phone_normalized?: string | null
          reassigned_tables?: Json | null
        }
        Update: {
          canonical_lead_id?: string | null
          equipe_id?: string | null
          id?: string
          merged_at?: string
          merged_lead_ids?: string[] | null
          phone_normalized?: string | null
          reassigned_tables?: Json | null
        }
        Relationships: []
      }
      equipes: {
        Row: {
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          created_at: string
          creditos_avulsos: number
          crm_link: string
          default_pipeline_id: string | null
          gpt_maker_agent_id: string | null
          home_explanation: string | null
          id: string
          is_crm_agent_enabled: boolean
          jestor_api_token: string | null
          limite_creditos: number | null
          niche: string | null
          nome: string
          plano_id: number | null
          subscription_status: string | null
          suporte_link: string
          updated_at: string
          webhook_secret: string | null
          workspace_id: string | null
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          created_at?: string
          creditos_avulsos?: number
          crm_link: string
          default_pipeline_id?: string | null
          gpt_maker_agent_id?: string | null
          home_explanation?: string | null
          id?: string
          is_crm_agent_enabled?: boolean
          jestor_api_token?: string | null
          limite_creditos?: number | null
          niche?: string | null
          nome: string
          plano_id?: number | null
          subscription_status?: string | null
          suporte_link: string
          updated_at?: string
          webhook_secret?: string | null
          workspace_id?: string | null
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          created_at?: string
          creditos_avulsos?: number
          crm_link?: string
          default_pipeline_id?: string | null
          gpt_maker_agent_id?: string | null
          home_explanation?: string | null
          id?: string
          is_crm_agent_enabled?: boolean
          jestor_api_token?: string | null
          limite_creditos?: number | null
          niche?: string | null
          nome?: string
          plano_id?: number | null
          subscription_status?: string | null
          suporte_link?: string
          updated_at?: string
          webhook_secret?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipes_default_pipeline_id_fkey"
            columns: ["default_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_equipes_plano"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      kpis_dashboard: {
        Row: {
          created_at: string | null
          equipe_id: string
          id: string
          leads_atendidos: number | null
          negocios_fechados: number | null
          periodo: string
          reunioes_agendadas: number | null
          updated_at: string | null
          valor_total_negocios: number | null
        }
        Insert: {
          created_at?: string | null
          equipe_id: string
          id?: string
          leads_atendidos?: number | null
          negocios_fechados?: number | null
          periodo: string
          reunioes_agendadas?: number | null
          updated_at?: string | null
          valor_total_negocios?: number | null
        }
        Update: {
          created_at?: string | null
          equipe_id?: string
          id?: string
          leads_atendidos?: number | null
          negocios_fechados?: number | null
          periodo?: string
          reunioes_agendadas?: number | null
          updated_at?: string | null
          valor_total_negocios?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpis_dashboard_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          lead_id: string
          metadata: Json | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          tipo: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agent_name: string | null
          assigned_to: string | null
          atendido_por_agente: boolean | null
          channel: string | null
          contact_type: string
          created_at: string
          created_by_id: string | null
          created_by_type: string | null
          creation_source: string | null
          custom_fields: Json | null
          deleted_at: string | null
          email: string | null
          equipe_id: string
          gpt_maker_chat_id: string | null
          id: string
          interaction_id: string | null
          last_message_at: string | null
          lead_type: string | null
          meeting_date: string | null
          meeting_done: boolean | null
          meeting_notes: string | null
          meeting_scheduled: boolean | null
          name: string
          next_contact: string | null
          no_show: boolean | null
          observations: string | null
          opportunity_value: number | null
          origem: string | null
          origin: string | null
          origin_category: string | null
          origin_detail: string | null
          personal_custom_data: Json
          phone: string | null
          phone_normalized: string | null
          profile_picture: string | null
          responsible_id: string | null
          source: string | null
          stage_entered_at: string | null
          stage_id: string | null
          tags: string[] | null
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          agent_name?: string | null
          assigned_to?: string | null
          atendido_por_agente?: boolean | null
          channel?: string | null
          contact_type?: string
          created_at?: string
          created_by_id?: string | null
          created_by_type?: string | null
          creation_source?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          email?: string | null
          equipe_id: string
          gpt_maker_chat_id?: string | null
          id?: string
          interaction_id?: string | null
          last_message_at?: string | null
          lead_type?: string | null
          meeting_date?: string | null
          meeting_done?: boolean | null
          meeting_notes?: string | null
          meeting_scheduled?: boolean | null
          name: string
          next_contact?: string | null
          no_show?: boolean | null
          observations?: string | null
          opportunity_value?: number | null
          origem?: string | null
          origin?: string | null
          origin_category?: string | null
          origin_detail?: string | null
          personal_custom_data?: Json
          phone?: string | null
          phone_normalized?: string | null
          profile_picture?: string | null
          responsible_id?: string | null
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          agent_name?: string | null
          assigned_to?: string | null
          atendido_por_agente?: boolean | null
          channel?: string | null
          contact_type?: string
          created_at?: string
          created_by_id?: string | null
          created_by_type?: string | null
          creation_source?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          email?: string | null
          equipe_id?: string
          gpt_maker_chat_id?: string | null
          id?: string
          interaction_id?: string | null
          last_message_at?: string | null
          lead_type?: string | null
          meeting_date?: string | null
          meeting_done?: boolean | null
          meeting_notes?: string | null
          meeting_scheduled?: boolean | null
          name?: string
          next_contact?: string | null
          no_show?: boolean | null
          observations?: string | null
          opportunity_value?: number | null
          origem?: string | null
          origin?: string | null
          origin_category?: string | null
          origin_detail?: string | null
          personal_custom_data?: Json
          phone?: string | null
          phone_normalized?: string | null
          profile_picture?: string | null
          responsible_id?: string | null
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_backup_sprint3: {
        Row: {
          agent_name: string | null
          assigned_to: string | null
          atendido_por_agente: boolean | null
          channel: string | null
          created_at: string | null
          creation_source: string | null
          custom_fields: Json | null
          email: string | null
          equipe_id: string | null
          gpt_maker_chat_id: string | null
          id: string | null
          interaction_id: string | null
          last_message_at: string | null
          lead_type: string | null
          meeting_date: string | null
          meeting_done: boolean | null
          meeting_notes: string | null
          meeting_scheduled: boolean | null
          name: string | null
          next_contact: string | null
          no_show: boolean | null
          observations: string | null
          opportunity_value: number | null
          origem: string | null
          phone: string | null
          profile_picture: string | null
          responsible_id: string | null
          source: string | null
          stage_entered_at: string | null
          stage_id: string | null
          tags: string[] | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          assigned_to?: string | null
          atendido_por_agente?: boolean | null
          channel?: string | null
          created_at?: string | null
          creation_source?: string | null
          custom_fields?: Json | null
          email?: string | null
          equipe_id?: string | null
          gpt_maker_chat_id?: string | null
          id?: string | null
          interaction_id?: string | null
          last_message_at?: string | null
          lead_type?: string | null
          meeting_date?: string | null
          meeting_done?: boolean | null
          meeting_notes?: string | null
          meeting_scheduled?: boolean | null
          name?: string | null
          next_contact?: string | null
          no_show?: boolean | null
          observations?: string | null
          opportunity_value?: number | null
          origem?: string | null
          phone?: string | null
          profile_picture?: string | null
          responsible_id?: string | null
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          assigned_to?: string | null
          atendido_por_agente?: boolean | null
          channel?: string | null
          created_at?: string | null
          creation_source?: string | null
          custom_fields?: Json | null
          email?: string | null
          equipe_id?: string | null
          gpt_maker_chat_id?: string | null
          id?: string | null
          interaction_id?: string | null
          last_message_at?: string | null
          lead_type?: string | null
          meeting_date?: string | null
          meeting_done?: boolean | null
          meeting_notes?: string | null
          meeting_scheduled?: boolean | null
          name?: string | null
          next_contact?: string | null
          no_show?: boolean | null
          observations?: string | null
          opportunity_value?: number | null
          origem?: string | null
          phone?: string | null
          profile_picture?: string | null
          responsible_id?: string | null
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      leads_backup_sprint55_pre_merge: {
        Row: {
          agent_name: string | null
          assigned_to: string | null
          atendido_por_agente: boolean | null
          channel: string | null
          contact_type: string | null
          created_at: string | null
          created_by_id: string | null
          created_by_type: string | null
          creation_source: string | null
          custom_fields: Json | null
          deleted_at: string | null
          email: string | null
          equipe_id: string | null
          gpt_maker_chat_id: string | null
          id: string | null
          interaction_id: string | null
          last_message_at: string | null
          lead_type: string | null
          meeting_date: string | null
          meeting_done: boolean | null
          meeting_notes: string | null
          meeting_scheduled: boolean | null
          name: string | null
          next_contact: string | null
          no_show: boolean | null
          observations: string | null
          opportunity_value: number | null
          origem: string | null
          origin: string | null
          origin_category: string | null
          origin_detail: string | null
          personal_custom_data: Json | null
          phone: string | null
          profile_picture: string | null
          responsible_id: string | null
          source: string | null
          stage_entered_at: string | null
          stage_id: string | null
          tags: string[] | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          assigned_to?: string | null
          atendido_por_agente?: boolean | null
          channel?: string | null
          contact_type?: string | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_type?: string | null
          creation_source?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          email?: string | null
          equipe_id?: string | null
          gpt_maker_chat_id?: string | null
          id?: string | null
          interaction_id?: string | null
          last_message_at?: string | null
          lead_type?: string | null
          meeting_date?: string | null
          meeting_done?: boolean | null
          meeting_notes?: string | null
          meeting_scheduled?: boolean | null
          name?: string | null
          next_contact?: string | null
          no_show?: boolean | null
          observations?: string | null
          opportunity_value?: number | null
          origem?: string | null
          origin?: string | null
          origin_category?: string | null
          origin_detail?: string | null
          personal_custom_data?: Json | null
          phone?: string | null
          profile_picture?: string | null
          responsible_id?: string | null
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          assigned_to?: string | null
          atendido_por_agente?: boolean | null
          channel?: string | null
          contact_type?: string | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_type?: string | null
          creation_source?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          email?: string | null
          equipe_id?: string | null
          gpt_maker_chat_id?: string | null
          id?: string | null
          interaction_id?: string | null
          last_message_at?: string | null
          lead_type?: string | null
          meeting_date?: string | null
          meeting_done?: boolean | null
          meeting_notes?: string | null
          meeting_scheduled?: boolean | null
          name?: string | null
          next_contact?: string | null
          no_show?: boolean | null
          observations?: string | null
          opportunity_value?: number | null
          origem?: string | null
          origin?: string | null
          origin_category?: string | null
          origin_detail?: string | null
          personal_custom_data?: Json | null
          phone?: string | null
          profile_picture?: string | null
          responsible_id?: string | null
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string | null
          external_id: string | null
          gpt_message_id: string | null
          id: string
          lead_id: string
          media_type: string | null
          media_url: string | null
          read_at: string | null
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          external_id?: string | null
          gpt_message_id?: string | null
          id?: string
          lead_id: string
          media_type?: string | null
          media_url?: string | null
          read_at?: string | null
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          external_id?: string | null
          gpt_message_id?: string | null
          id?: string
          lead_id?: string
          media_type?: string | null
          media_url?: string | null
          read_at?: string | null
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      niches: {
        Row: {
          active: boolean | null
          created_at: string | null
          custom_fields: Json | null
          description: string | null
          domain: string
          id: string
          nome: string
          primary_color: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          custom_fields?: Json | null
          description?: string | null
          domain: string
          id: string
          nome: string
          primary_color?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          custom_fields?: Json | null
          description?: string | null
          domain?: string
          id?: string
          nome?: string
          primary_color?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          closed_at: string | null
          created_at: string
          currency: string
          custom_data: Json
          deleted_at: string | null
          equipe_id: string
          id: string
          lead_id: string
          pipeline_id: string
          position: number
          stage_entered_at: string
          stage_id: string
          status: string
          updated_at: string
          value: number | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          currency?: string
          custom_data?: Json
          deleted_at?: string | null
          equipe_id: string
          id?: string
          lead_id: string
          pipeline_id: string
          position?: number
          stage_entered_at?: string
          stage_id: string
          status?: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          currency?: string
          custom_data?: Json
          deleted_at?: string | null
          equipe_id?: string
          id?: string
          lead_id?: string
          pipeline_id?: string
          position?: number
          stage_entered_at?: string
          stage_id?: string
          status?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_links: {
        Row: {
          created_at: string
          deleted_at: string | null
          equipe_id: string
          id: string
          linked_id: string
          linked_type: string
          opportunity_id: string
          relation: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          equipe_id: string
          id?: string
          linked_id: string
          linked_type: string
          opportunity_id: string
          relation?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          equipe_id?: string
          id?: string
          linked_id?: string
          linked_type?: string
          opportunity_id?: string
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_links_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          equipe_id: string
          from_stage_id: string | null
          id: number
          opportunity_id: string
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          equipe_id: string
          from_stage_id?: string | null
          id?: number
          opportunity_id: string
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          equipe_id?: string
          from_stage_id?: string | null
          id?: number
          opportunity_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_history_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_agent_rules: {
        Row: {
          auto_advance_stages: boolean
          auto_create_opportunity: boolean
          auto_extract_custom_fields: boolean
          cooldown_minutes: number
          created_at: string
          equipe_id: string
          extraction_hints: string | null
          id: string
          pipeline_id: string
          triggers: Json
          updated_at: string
        }
        Insert: {
          auto_advance_stages?: boolean
          auto_create_opportunity?: boolean
          auto_extract_custom_fields?: boolean
          cooldown_minutes?: number
          created_at?: string
          equipe_id: string
          extraction_hints?: string | null
          id?: string
          pipeline_id: string
          triggers?: Json
          updated_at?: string
        }
        Update: {
          auto_advance_stages?: boolean
          auto_create_opportunity?: boolean
          auto_extract_custom_fields?: boolean
          cooldown_minutes?: number
          created_at?: string
          equipe_id?: string
          extraction_hints?: string | null
          id?: string
          pipeline_id?: string
          triggers?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_agent_rules_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_agent_rules_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: true
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          category: string | null
          color: string
          created_at: string
          equipe_id: string
          id: string
          is_default: boolean
          name: string
          position: number
        }
        Insert: {
          category?: string | null
          color?: string
          created_at?: string
          equipe_id: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
        }
        Update: {
          category?: string | null
          color?: string
          created_at?: string
          equipe_id?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages_v2: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          equipe_id: string
          id: string
          max_idle_hours: number | null
          name: string
          pipeline_id: string
          position: number
          stage_type: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          equipe_id: string
          id?: string
          max_idle_hours?: number | null
          name: string
          pipeline_id: string
          position: number
          stage_type?: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          equipe_id?: string
          id?: string
          max_idle_hours?: number | null
          name?: string
          pipeline_id?: string
          position?: number
          stage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_v2_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_v2_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          card_field_ids: Json
          created_at: string
          custom_fields_schema: Json
          deleted_at: string | null
          description: string | null
          equipe_id: string
          id: string
          is_archived: boolean
          name: string
          updated_at: string
        }
        Insert: {
          card_field_ids?: Json
          created_at?: string
          custom_fields_schema?: Json
          deleted_at?: string | null
          description?: string | null
          equipe_id: string
          id?: string
          is_archived?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          card_field_ids?: Json
          created_at?: string
          custom_fields_schema?: Json
          deleted_at?: string | null
          description?: string | null
          equipe_id?: string
          id?: string
          is_archived?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          created_at: string | null
          funcionalidades: string[] | null
          id: number
          limite_creditos: number
          limite_usuarios: number | null
          nome: string
          preco_mensal: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          funcionalidades?: string[] | null
          id: number
          limite_creditos: number
          limite_usuarios?: number | null
          nome: string
          preco_mensal: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          funcionalidades?: string[] | null
          id?: number
          limite_creditos?: number
          limite_usuarios?: number | null
          nome?: string
          preco_mensal?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cargo: string | null
          chat_link_base: string | null
          cpf: string | null
          created_at: string
          email: string
          equipe_id: string | null
          id: string
          nome_completo: string | null
          role: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cargo?: string | null
          chat_link_base?: string | null
          cpf?: string | null
          created_at?: string
          email: string
          equipe_id?: string | null
          id?: string
          nome_completo?: string | null
          role?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cargo?: string | null
          chat_link_base?: string | null
          cpf?: string | null
          created_at?: string
          email?: string
          equipe_id?: string | null
          id?: string
          nome_completo?: string | null
          role?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: Json | null
          attributes: Json
          created_at: string
          deleted_at: string | null
          equipe_id: string
          id: string
          label: string
          latitude: number | null
          longitude: number | null
          property_type: string
          updated_at: string
        }
        Insert: {
          address?: Json | null
          attributes?: Json
          created_at?: string
          deleted_at?: string | null
          equipe_id: string
          id?: string
          label: string
          latitude?: number | null
          longitude?: number | null
          property_type?: string
          updated_at?: string
        }
        Update: {
          address?: Json | null
          attributes?: Json
          created_at?: string
          deleted_at?: string | null
          equipe_id?: string
          id?: string
          label?: string
          latitude?: number | null
          longitude?: number | null
          property_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      property_owner_links: {
        Row: {
          created_at: string
          deleted_at: string | null
          equipe_id: string
          id: string
          owner_id: string
          owner_type: string
          property_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          equipe_id: string
          id?: string
          owner_id: string
          owner_type: string
          property_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          equipe_id?: string
          id?: string
          owner_id?: string
          owner_type?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_owner_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owner_links_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_automations: {
        Row: {
          created_at: string
          equipe_id: string
          executed: boolean | null
          executed_at: string | null
          id: string
          lead_id: string
          payload: Json | null
          scheduled_for: string
          tipo: string
        }
        Insert: {
          created_at?: string
          equipe_id: string
          executed?: boolean | null
          executed_at?: string | null
          id?: string
          lead_id: string
          payload?: Json | null
          scheduled_for: string
          tipo: string
        }
        Update: {
          created_at?: string
          equipe_id?: string
          executed?: boolean | null
          executed_at?: string | null
          id?: string
          lead_id?: string
          payload?: Json | null
          scheduled_for?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_automations_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_automations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string
          status: string | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id: string
          status?: string | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      touchpoints: {
        Row: {
          contact_date: string
          content: string
          created_at: string | null
          id: string
          lead_id: string
          touchpoint_type: string | null
          user_id: string | null
        }
        Insert: {
          contact_date?: string
          content: string
          created_at?: string | null
          id?: string
          lead_id: string
          touchpoint_type?: string | null
          user_id?: string | null
        }
        Update: {
          contact_date?: string
          content?: string
          created_at?: string | null
          id?: string
          lead_id?: string
          touchpoint_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "touchpoints_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "touchpoints_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_configs: {
        Row: {
          active: boolean | null
          created_at: string | null
          equipe_id: string
          headers: Json | null
          id: string
          name: string
          trigger_event: string
          url: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          equipe_id: string
          headers?: Json | null
          id?: string
          name: string
          trigger_event: string
          url: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          equipe_id?: string
          headers?: Json | null
          id?: string
          name?: string
          trigger_event?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_configs_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          direction: string
          equipe_id: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          webhook_config_id: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          equipe_id: string
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          webhook_config_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          equipe_id?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          webhook_config_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_webhook_config_id_fkey"
            columns: ["webhook_config_id"]
            isOneToOne: false
            referencedRelation: "webhook_configs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_negative_stages: { Args: never; Returns: undefined }
      get_dashboard_kpis: {
        Args: {
          p_end_date?: string
          p_equipe_id: string
          p_start_date?: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_conversation_unread_count: {
        Args: { conv_id: string }
        Returns: undefined
      }
      increment_unread_count: { Args: { row_id: string }; Returns: undefined }
      initialize_team_stages: {
        Args: { target_equipe_id: string }
        Returns: undefined
      }
      normalize_phone_br: { Args: { raw: string }; Returns: string }
      set_default_pipeline: { Args: { p_pipeline_id: string }; Returns: string }
    }
    Enums: {
      app_role: "user" | "admin" | "owner" | "super_admin"
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
      app_role: ["user", "admin", "owner", "super_admin"],
    },
  },
} as const
