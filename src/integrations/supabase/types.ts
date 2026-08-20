export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agenda_events: {
        Row: {
          created_at: string
          deleted_at: string | null
          ends_at: string
          equipe_id: string
          id: string
          lead_id: string | null
          notes: string | null
          starts_at: string
          task_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          ends_at: string
          equipe_id: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          starts_at: string
          task_id?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          ends_at?: string
          equipe_id?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          starts_at?: string
          task_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_events_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_events_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "agenda_events_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "agenda_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_action_ledger: {
        Row: {
          created_at: string
          credits_charged: number
          decision_id: string | null
          equipe_id: string
          id: string
          idempotency_key: string
          lead_id: string | null
          mode: string
          model: string | null
          opportunity_id: string | null
          real_cost_usd: number | null
          real_input_tokens: number | null
          real_output_tokens: number | null
          verb: string
        }
        Insert: {
          created_at?: string
          credits_charged?: number
          decision_id?: string | null
          equipe_id: string
          id?: string
          idempotency_key: string
          lead_id?: string | null
          mode: string
          model?: string | null
          opportunity_id?: string | null
          real_cost_usd?: number | null
          real_input_tokens?: number | null
          real_output_tokens?: number | null
          verb: string
        }
        Update: {
          created_at?: string
          credits_charged?: number
          decision_id?: string | null
          equipe_id?: string
          id?: string
          idempotency_key?: string
          lead_id?: string | null
          mode?: string
          model?: string | null
          opportunity_id?: string | null
          real_cost_usd?: number | null
          real_input_tokens?: number | null
          real_output_tokens?: number | null
          verb?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_action_ledger_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_ledger_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "agent_action_ledger_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "agent_action_ledger_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_credits_balance: {
        Row: {
          balance: number
          equipe_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          equipe_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          equipe_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_credits_balance_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: true
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_credits_balance_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: true
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "agent_credits_balance_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
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
          {
            foreignKeyName: "agent_trainings_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "agent_trainings_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
      ai_decisions: {
        Row: {
          actor: string | null
          agent_role: string | null
          confidence_score: number | null
          created_at: string
          decision_type: string
          equipe_id: string | null
          error_details: string | null
          id: string
          input_summary: string | null
          lead_id: string | null
          opportunity_id: string | null
          output_action: Json
          pipeline_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          status: string | null
        }
        Insert: {
          actor?: string | null
          agent_role?: string | null
          confidence_score?: number | null
          created_at?: string
          decision_type: string
          equipe_id?: string | null
          error_details?: string | null
          id?: string
          input_summary?: string | null
          lead_id?: string | null
          opportunity_id?: string | null
          output_action: Json
          pipeline_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          status?: string | null
        }
        Update: {
          actor?: string | null
          agent_role?: string | null
          confidence_score?: number | null
          created_at?: string
          decision_type?: string
          equipe_id?: string | null
          error_details?: string | null
          id?: string
          input_summary?: string | null
          lead_id?: string | null
          opportunity_id?: string | null
          output_action?: Json
          pipeline_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
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
            foreignKeyName: "ai_decisions_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "ai_decisions_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "ai_decisions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decisions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decisions_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_accounts: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_district: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          asaas_customer_id: string | null
          auto_recharge_enabled: boolean
          auto_recharge_product_id: string | null
          auto_recharge_threshold: number | null
          billing_email: string | null
          created_at: string
          doc_number: string | null
          doc_type: string | null
          equipe_id: string
          legal_name: string | null
          phone: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          asaas_customer_id?: string | null
          auto_recharge_enabled?: boolean
          auto_recharge_product_id?: string | null
          auto_recharge_threshold?: number | null
          billing_email?: string | null
          created_at?: string
          doc_number?: string | null
          doc_type?: string | null
          equipe_id: string
          legal_name?: string | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          asaas_customer_id?: string | null
          auto_recharge_enabled?: boolean
          auto_recharge_product_id?: string | null
          auto_recharge_threshold?: number | null
          billing_email?: string | null
          created_at?: string
          doc_number?: string | null
          doc_type?: string | null
          equipe_id?: string
          legal_name?: string | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_auto_recharge_product_id_fkey"
            columns: ["auto_recharge_product_id"]
            isOneToOne: false
            referencedRelation: "billing_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_accounts_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: true
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_accounts_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: true
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "billing_accounts_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
      billing_products: {
        Row: {
          active: boolean
          code: string
          created_at: string
          credits_included: number
          id: string
          kind: string
          list_price: number
          metadata: Json
          name: string
          period: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          credits_included?: number
          id?: string
          kind: string
          list_price: number
          metadata?: Json
          name: string
          period: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          credits_included?: number
          id?: string
          kind?: string
          list_price?: number
          metadata?: Json
          name?: string
          period?: string
          updated_at?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "companies_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "companies_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          {
            foreignKeyName: "consumo_creditos_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "consumo_creditos_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          {
            foreignKeyName: "contact_company_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "contact_company_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
      contract_items: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          period: string
          product_id: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          period: string
          product_id?: string | null
          quantity?: number
          unit_price: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          period?: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "billing_products"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          cancel_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          equipe_id: string
          id: string
          notes: string | null
          past_due_since: string | null
          proposal_id: string | null
          started_at: string | null
          status: string
          term_months: number | null
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          equipe_id: string
          id?: string
          notes?: string | null
          past_due_since?: string | null
          proposal_id?: string | null
          started_at?: string | null
          status?: string
          term_months?: number | null
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          equipe_id?: string
          id?: string
          notes?: string | null
          past_due_since?: string | null
          proposal_id?: string | null
          started_at?: string | null
          status?: string
          term_months?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "contracts_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "contracts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
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
          solo_instance_id: string | null
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
          solo_instance_id?: string | null
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
          solo_instance_id?: string | null
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
            foreignKeyName: "conversations_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "conversations_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          {
            foreignKeyName: "conversations_solo_instance_id_fkey"
            columns: ["solo_instance_id"]
            isOneToOne: false
            referencedRelation: "wpp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_agents: {
        Row: {
          autonomy_mode: string
          created_at: string
          equipe_id: string
          id: string
          name: string
          pipeline_id: string | null
          scope: string
          system_prompt: string | null
          updated_at: string
        }
        Insert: {
          autonomy_mode?: string
          created_at?: string
          equipe_id: string
          id?: string
          name?: string
          pipeline_id?: string | null
          scope: string
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          autonomy_mode?: string
          created_at?: string
          equipe_id?: string
          id?: string
          name?: string
          pipeline_id?: string | null
          scope?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_agents_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_agents_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "copilot_agents_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "copilot_agents_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_ingest_queue: {
        Row: {
          conversation_ref: string | null
          created_at: string
          due_at: string
          equipe_id: string
          id: string
          lead_id: string
          pipeline_id: string | null
          processed_at: string | null
          updated_at: string
        }
        Insert: {
          conversation_ref?: string | null
          created_at?: string
          due_at: string
          equipe_id: string
          id?: string
          lead_id: string
          pipeline_id?: string | null
          processed_at?: string | null
          updated_at?: string
        }
        Update: {
          conversation_ref?: string | null
          created_at?: string
          due_at?: string
          equipe_id?: string
          id?: string
          lead_id?: string
          pipeline_id?: string | null
          processed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_ingest_queue_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_ingest_queue_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "copilot_ingest_queue_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "copilot_ingest_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_ingest_queue_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_knowledge: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          equipe_id: string
          id: string
          metadata: Json
          source: string | null
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          equipe_id: string
          id?: string
          metadata?: Json
          source?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          equipe_id?: string
          id?: string
          metadata?: Json
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copilot_knowledge_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_knowledge_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "copilot_knowledge_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
      copilot_run_events: {
        Row: {
          created_at: string
          equipe_id: string
          id: string
          kind: string
          opportunity_id: string | null
          payload: Json
          run_id: string
          seq: number
        }
        Insert: {
          created_at?: string
          equipe_id: string
          id?: string
          kind: string
          opportunity_id?: string | null
          payload?: Json
          run_id: string
          seq: number
        }
        Update: {
          created_at?: string
          equipe_id?: string
          id?: string
          kind?: string
          opportunity_id?: string | null
          payload?: Json
          run_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "copilot_run_events_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_run_events_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "copilot_run_events_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          created_at: string
          credits: number
          entry_type: string
          equipe_id: string
          expires_at: string | null
          id: string
          idempotency_key: string
          metadata: Json
          ref_id: string | null
          source: string
        }
        Insert: {
          created_at?: string
          credits: number
          entry_type: string
          equipe_id: string
          expires_at?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          ref_id?: string | null
          source: string
        }
        Update: {
          created_at?: string
          credits?: number
          entry_type?: string
          equipe_id?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          ref_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "credit_ledger_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
      custom_table_links: {
        Row: {
          created_at: string
          deleted_at: string | null
          equipe_id: string
          from_id: string
          from_table: string
          id: string
          relation_key: string
          to_id: string
          to_table: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          equipe_id: string
          from_id: string
          from_table: string
          id?: string
          relation_key: string
          to_id: string
          to_table: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          equipe_id?: string
          from_id?: string
          from_table?: string
          id?: string
          relation_key?: string
          to_id?: string
          to_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_table_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_table_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "custom_table_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
      custom_table_records: {
        Row: {
          created_at: string
          data: Json
          deleted_at: string | null
          equipe_id: string
          id: string
          table_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          deleted_at?: string | null
          equipe_id: string
          id?: string
          table_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          deleted_at?: string | null
          equipe_id?: string
          id?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_table_records_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_table_records_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "custom_table_records_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "custom_table_records_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "custom_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_tables: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          equipe_id: string
          icon: string | null
          id: string
          name: string
          slug: string
          table_schema: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          equipe_id: string
          icon?: string | null
          id?: string
          name: string
          slug: string
          table_schema?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          equipe_id?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          table_schema?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_tables_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_tables_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "custom_tables_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          contact_fields_schema: Json
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
          page_permissions: Json
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
          contact_fields_schema?: Json
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
          page_permissions?: Json
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
          contact_fields_schema?: Json
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
          page_permissions?: Json
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
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          product_id: string | null
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          product_id?: string | null
          quantity?: number
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          product_id?: string | null
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "billing_products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          asaas_invoice_url: string | null
          asaas_payment_id: string | null
          contract_id: string | null
          created_at: string
          currency: string
          discount: number
          due_date: string | null
          equipe_id: string
          id: string
          issued_at: string | null
          kind: string
          metadata: Json
          number: string
          paid_at: string | null
          pix_payload: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          contract_id?: string | null
          created_at?: string
          currency?: string
          discount?: number
          due_date?: string | null
          equipe_id: string
          id?: string
          issued_at?: string | null
          kind: string
          metadata?: Json
          number?: string
          paid_at?: string | null
          pix_payload?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          contract_id?: string | null
          created_at?: string
          currency?: string
          discount?: number
          due_date?: string | null
          equipe_id?: string
          id?: string
          issued_at?: string | null
          kind?: string
          metadata?: Json
          number?: string
          paid_at?: string | null
          pix_payload?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "invoices_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "invoices_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          {
            foreignKeyName: "kpis_dashboard_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "kpis_dashboard_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          opportunity_id: string | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          opportunity_id?: string | null
          tipo: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          opportunity_id?: string | null
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
          {
            foreignKeyName: "lead_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
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
          lifecycle_stage: string
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
          lifecycle_stage?: string
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
          lifecycle_stage?: string
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
            foreignKeyName: "leads_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "leads_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          provider: string | null
          provider_message_id: string | null
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
          provider?: string | null
          provider_message_id?: string | null
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
          provider?: string | null
          provider_message_id?: string | null
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
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          id: string
          last_error: string | null
          notification_id: string
          provider_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id: string
          provider_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id?: string
          provider_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channels: string[]
          created_at: string
          equipe_id: string
          id: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channels?: string[]
          created_at?: string
          equipe_id: string
          id?: string
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channels?: string[]
          created_at?: string
          equipe_id?: string
          id?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "notification_preferences_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
      notification_types: {
        Row: {
          audience: string
          default_channels: string[]
          default_severity: string
          description: string | null
          type: string
        }
        Insert: {
          audience: string
          default_channels: string[]
          default_severity: string
          description?: string | null
          type: string
        }
        Update: {
          audience?: string
          default_channels?: string[]
          default_severity?: string
          description?: string | null
          type?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          data: Json
          dedup_key: string | null
          equipe_id: string
          id: string
          read_at: string | null
          severity: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          data?: Json
          dedup_key?: string | null
          equipe_id: string
          id?: string
          read_at?: string | null
          severity?: string
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          data?: Json
          dedup_key?: string | null
          equipe_id?: string
          id?: string
          read_at?: string | null
          severity?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "notifications_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
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
            foreignKeyName: "opportunities_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "opportunities_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
            foreignKeyName: "opportunity_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "opportunity_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          actor: string | null
          changed_at: string
          changed_by: string | null
          changed_by_type: string
          equipe_id: string
          from_stage_id: string | null
          id: number
          opportunity_id: string
          to_stage_id: string
        }
        Insert: {
          actor?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_by_type?: string
          equipe_id: string
          from_stage_id?: string | null
          id?: number
          opportunity_id: string
          to_stage_id: string
        }
        Update: {
          actor?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_by_type?: string
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
      origin_taxonomy: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          equipe_id: string
          id: string
          kind: string
          label: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          equipe_id: string
          id?: string
          kind: string
          label: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          equipe_id?: string
          id?: string
          kind?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "origin_taxonomy_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "origin_taxonomy_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "origin_taxonomy_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
      payment_events: {
        Row: {
          attempts: number
          event_type: string
          id: string
          invoice_id: string | null
          last_error: string | null
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
          received_at: string
          status: string
        }
        Insert: {
          attempts?: number
          event_type: string
          id?: string
          invoice_id?: string | null
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          provider?: string
          provider_event_id: string
          received_at?: string
          status?: string
        }
        Update: {
          attempts?: number
          event_type?: string
          id?: string
          invoice_id?: string | null
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_agent_rules: {
        Row: {
          auto_advance_stages: boolean
          auto_create_opportunity: boolean
          auto_extract_custom_fields: boolean
          autonomy_cost_ceiling: number | null
          confidence_threshold: number
          cooldown_minutes: number
          created_at: string
          deal_value_strategic_threshold: number | null
          doorman_model: string | null
          enabled_skills: Json
          equipe_id: string
          escalate_threshold: number | null
          extraction_hints: string | null
          id: string
          pipeline_id: string
          reasoning_enabled: boolean
          strategic_model: string | null
          tools_enabled: boolean
          triggers: Json
          updated_at: string
          worker_model: string | null
        }
        Insert: {
          auto_advance_stages?: boolean
          auto_create_opportunity?: boolean
          auto_extract_custom_fields?: boolean
          autonomy_cost_ceiling?: number | null
          confidence_threshold?: number
          cooldown_minutes?: number
          created_at?: string
          deal_value_strategic_threshold?: number | null
          doorman_model?: string | null
          enabled_skills?: Json
          equipe_id: string
          escalate_threshold?: number | null
          extraction_hints?: string | null
          id?: string
          pipeline_id: string
          reasoning_enabled?: boolean
          strategic_model?: string | null
          tools_enabled?: boolean
          triggers?: Json
          updated_at?: string
          worker_model?: string | null
        }
        Update: {
          auto_advance_stages?: boolean
          auto_create_opportunity?: boolean
          auto_extract_custom_fields?: boolean
          autonomy_cost_ceiling?: number | null
          confidence_threshold?: number
          cooldown_minutes?: number
          created_at?: string
          deal_value_strategic_threshold?: number | null
          doorman_model?: string | null
          enabled_skills?: Json
          equipe_id?: string
          escalate_threshold?: number | null
          extraction_hints?: string | null
          id?: string
          pipeline_id?: string
          reasoning_enabled?: boolean
          strategic_model?: string | null
          tools_enabled?: boolean
          triggers?: Json
          updated_at?: string
          worker_model?: string | null
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
            foreignKeyName: "pipeline_agent_rules_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "pipeline_agent_rules_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          {
            foreignKeyName: "pipeline_stages_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "pipeline_stages_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
      pipeline_stages_v2: {
        Row: {
          cadence_unit: string | null
          cadence_value: number | null
          color: string
          created_at: string
          cycle_days: number | null
          cycle_target_stage_id: string | null
          cycle_webhook_url: string | null
          deleted_at: string | null
          description: string | null
          equipe_id: string
          id: string
          max_idle_hours: number | null
          max_interactions: number | null
          name: string
          pipeline_id: string
          position: number
          stage_type: string
          webhook_triggers: Json
        }
        Insert: {
          cadence_unit?: string | null
          cadence_value?: number | null
          color?: string
          created_at?: string
          cycle_days?: number | null
          cycle_target_stage_id?: string | null
          cycle_webhook_url?: string | null
          deleted_at?: string | null
          description?: string | null
          equipe_id: string
          id?: string
          max_idle_hours?: number | null
          max_interactions?: number | null
          name: string
          pipeline_id: string
          position: number
          stage_type?: string
          webhook_triggers?: Json
        }
        Update: {
          cadence_unit?: string | null
          cadence_value?: number | null
          color?: string
          created_at?: string
          cycle_days?: number | null
          cycle_target_stage_id?: string | null
          cycle_webhook_url?: string | null
          deleted_at?: string | null
          description?: string | null
          equipe_id?: string
          id?: string
          max_idle_hours?: number | null
          max_interactions?: number | null
          name?: string
          pipeline_id?: string
          position?: number
          stage_type?: string
          webhook_triggers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_v2_cycle_target_stage_id_fkey"
            columns: ["cycle_target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_v2_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_v2_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "pipeline_stages_v2_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          cadence_days: number | null
          card_field_ids: Json
          created_at: string
          custom_fields_schema: Json
          deleted_at: string | null
          description: string | null
          equipe_id: string
          icp_weights: Json
          id: string
          is_archived: boolean
          name: string
          revenue_config: Json
          updated_at: string
        }
        Insert: {
          cadence_days?: number | null
          card_field_ids?: Json
          created_at?: string
          custom_fields_schema?: Json
          deleted_at?: string | null
          description?: string | null
          equipe_id: string
          icp_weights?: Json
          id?: string
          is_archived?: boolean
          name: string
          revenue_config?: Json
          updated_at?: string
        }
        Update: {
          cadence_days?: number | null
          card_field_ids?: Json
          created_at?: string
          custom_fields_schema?: Json
          deleted_at?: string | null
          description?: string | null
          equipe_id?: string
          icp_weights?: Json
          id?: string
          is_archived?: boolean
          name?: string
          revenue_config?: Json
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
          {
            foreignKeyName: "pipelines_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "pipelines_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          {
            foreignKeyName: "profiles_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "profiles_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          {
            foreignKeyName: "properties_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "properties_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
            foreignKeyName: "property_owner_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "property_owner_links_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
      proposal_acceptances: {
        Row: {
          accepted_at: string
          accepted_doc: string | null
          accepted_name: string | null
          created_at: string
          id: string
          ip: unknown
          proposal_id: string
          terms_snapshot: Json
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          accepted_doc?: string | null
          accepted_name?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          proposal_id: string
          terms_snapshot: Json
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          accepted_doc?: string | null
          accepted_name?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          proposal_id?: string
          terms_snapshot?: Json
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_acceptances_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          label: string
          period: string
          product_id: string | null
          proposal_id: string
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          label: string
          period?: string
          product_id?: string | null
          proposal_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          period?: string
          product_id?: string | null
          proposal_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "billing_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          cliente_doc: string | null
          cliente_email: string | null
          cliente_nome: string
          cliente_whatsapp: string | null
          codigo: string
          created_at: string
          created_by: string | null
          equipe_id: string | null
          first_viewed_at: string | null
          id: string
          list_monthly_price: number | null
          monthly_price: number
          notes: string | null
          sent_at: string | null
          setup_price: number
          status: string
          term_months: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          cliente_doc?: string | null
          cliente_email?: string | null
          cliente_nome: string
          cliente_whatsapp?: string | null
          codigo?: string
          created_at?: string
          created_by?: string | null
          equipe_id?: string | null
          first_viewed_at?: string | null
          id?: string
          list_monthly_price?: number | null
          monthly_price?: number
          notes?: string | null
          sent_at?: string | null
          setup_price?: number
          status?: string
          term_months?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          cliente_doc?: string | null
          cliente_email?: string | null
          cliente_nome?: string
          cliente_whatsapp?: string | null
          codigo?: string
          created_at?: string
          created_by?: string | null
          equipe_id?: string | null
          first_viewed_at?: string | null
          id?: string
          list_monthly_price?: number | null
          monthly_price?: number
          notes?: string | null
          sent_at?: string | null
          setup_price?: number
          status?: string
          term_months?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "proposals_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
            foreignKeyName: "scheduled_automations_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "scheduled_automations_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
          observations: string | null
          parent_task_id: string | null
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
          observations?: string | null
          parent_task_id?: string | null
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
          observations?: string | null
          parent_task_id?: string | null
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
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
          field_mappings: Json
          headers: Json | null
          id: string
          inbound_function: string | null
          name: string
          payload_template: Json
          pipeline_id: string | null
          trigger_event: string
          url: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          equipe_id: string
          field_mappings?: Json
          headers?: Json | null
          id?: string
          inbound_function?: string | null
          name: string
          payload_template?: Json
          pipeline_id?: string | null
          trigger_event: string
          url: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          equipe_id?: string
          field_mappings?: Json
          headers?: Json | null
          id?: string
          inbound_function?: string | null
          name?: string
          payload_template?: Json
          pipeline_id?: string | null
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
          {
            foreignKeyName: "webhook_configs_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "webhook_configs_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "webhook_configs_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          direction: string
          dispatch_token: string | null
          equipe_id: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          request_id: number | null
          response_body: string | null
          response_status: number | null
          webhook_config_id: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          dispatch_token?: string | null
          equipe_id: string
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json
          request_id?: number | null
          response_body?: string | null
          response_status?: number | null
          webhook_config_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          dispatch_token?: string | null
          equipe_id?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          request_id?: number | null
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
            foreignKeyName: "webhook_logs_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "webhook_logs_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
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
      wpp_instances: {
        Row: {
          billing_active: boolean
          connected_at: string | null
          created_at: string
          display_name: string
          equipe_id: string
          id: string
          ingest_inbound: boolean
          instance_name: string
          last_health_at: string | null
          phone: string | null
          status: string
        }
        Insert: {
          billing_active?: boolean
          connected_at?: string | null
          created_at?: string
          display_name: string
          equipe_id: string
          id?: string
          ingest_inbound?: boolean
          instance_name: string
          last_health_at?: string | null
          phone?: string | null
          status?: string
        }
        Update: {
          billing_active?: boolean
          connected_at?: string | null
          created_at?: string
          display_name?: string
          equipe_id?: string
          id?: string
          ingest_inbound?: boolean
          instance_name?: string
          last_health_at?: string | null
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wpp_instances_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpp_instances_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_credit_balance"
            referencedColumns: ["equipe_id"]
          },
          {
            foreignKeyName: "wpp_instances_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_entitlements"
            referencedColumns: ["equipe_id"]
          },
        ]
      }
    }
    Views: {
      v_credit_balance: {
        Row: {
          equipe_id: string | null
          expiring_balance: number | null
          grant_expires_at: string | null
          total: number | null
        }
        Insert: {
          equipe_id?: string | null
          expiring_balance?: never
          grant_expires_at?: never
          total?: never
        }
        Update: {
          equipe_id?: string | null
          expiring_balance?: never
          grant_expires_at?: never
          total?: never
        }
        Relationships: []
      }
      v_tenant_entitlements: {
        Row: {
          contract_id: string | null
          contract_status: string | null
          current_period_end: string | null
          equipe_id: string | null
          included_credits: number | null
          instance_limit: number | null
          is_live: boolean | null
          is_read_only: boolean | null
          modules: string[] | null
          page_permissions: Json | null
          seat_limit: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      charge_credits: {
        Args: {
          p_credits: number
          p_equipe_id: string
          p_idempotency_key: string
          p_ledger: Json
        }
        Returns: string
      }
      check_credits: {
        Args: { p_equipe_id: string; p_estimated?: number }
        Returns: Json
      }
      credit_balance: { Args: { p_equipe_id: string }; Returns: number }
      credits_consumed_in_window: {
        Args: { p_equipe_id: string; p_from: string; p_to: string }
        Returns: number
      }
      enqueue_crm_webhooks: {
        Args: { p_context: Json; p_equipe_id: string; p_event: string }
        Returns: undefined
      }
      ensure_negative_stages: { Args: never; Returns: undefined }
      expire_credits: { Args: never; Returns: number }
      fn_calculate_icp_score: {
        Args: { p_lead_id: string }
        Returns: {
          breakdown: Json
          score: number
        }[]
      }
      fn_calculate_lead_velocity: {
        Args: { p_lead_id: string }
        Returns: number
      }
      fn_stage_conversion_rates: {
        Args: { p_pipeline_id: string }
        Returns: {
          conversion_rate: number
          stage_id: string
          stage_name: string
          stage_position: number
        }[]
      }
      gen_proposal_code: { Args: never; Returns: string }
      get_dashboard_kpis: {
        Args: {
          p_end_date?: string
          p_equipe_id: string
          p_start_date?: string
        }
        Returns: Json
      }
      grant_credits: {
        Args: {
          p_credits: number
          p_entry_type?: string
          p_equipe_id: string
          p_expires_at: string
          p_idempotency_key: string
          p_ref_id: string
          p_source: string
        }
        Returns: string
      }
      has_module_access: {
        Args: { p_equipe_id: string; p_module: string }
        Returns: boolean
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
      is_super_admin: { Args: never; Returns: boolean }
      next_invoice_number: { Args: never; Returns: string }
      normalize_phone_br: { Args: { raw: string }; Returns: string }
      notify: {
        Args: {
          p_action_url?: string
          p_body?: string
          p_data?: Json
          p_dedup_key?: string
          p_equipe_id: string
          p_severity?: string
          p_title: string
          p_type: string
          p_user_id?: string
        }
        Returns: string
      }
      pending_expiry: { Args: { p_equipe_id: string }; Returns: number }
      provision_tenant_from_proposal: {
        Args: { p_proposal_id: string }
        Returns: Json
      }
      recompute_credit_balance: {
        Args: { p_equipe_id: string }
        Returns: number
      }
      refresh_webhook_delivery_logs: {
        Args: { p_equipe_id: string }
        Returns: number
      }
      render_webhook_payload: {
        Args: { p_context: Json; p_template: Json }
        Returns: Json
      }
      set_default_pipeline: { Args: { p_pipeline_id: string }; Returns: string }
      shape_pipeline: {
        Args: { p_equipe_id: string; p_payload: Json }
        Returns: string
      }
    }
    Enums: {
      app_role: "user" | "admin" | "owner" | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["user", "admin", "owner", "super_admin"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

