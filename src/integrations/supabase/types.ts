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
      equipes: {
        Row: {
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          created_at: string
          creditos_avulsos: number
          crm_link: string
          gpt_maker_agent_id: string | null
          home_explanation: string | null
          id: string
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
          gpt_maker_agent_id?: string | null
          home_explanation?: string | null
          id?: string
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
          gpt_maker_agent_id?: string | null
          home_explanation?: string | null
          id?: string
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
          atendido_por_agente: boolean | null
          created_at: string
          custom_fields: Json | null
          email: string | null
          equipe_id: string
          gpt_maker_chat_id: string | null
          id: string
          interaction_id: string | null
          last_message_at: string | null
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
          phone: string | null
          responsible_id: string | null
          source: string | null
          stage_id: string | null
          tags: string[] | null
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          atendido_por_agente?: boolean | null
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          equipe_id: string
          gpt_maker_chat_id?: string | null
          id?: string
          interaction_id?: string | null
          last_message_at?: string | null
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
          phone?: string | null
          responsible_id?: string | null
          source?: string | null
          stage_id?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          atendido_por_agente?: boolean | null
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          equipe_id?: string
          gpt_maker_chat_id?: string | null
          id?: string
          interaction_id?: string | null
          last_message_at?: string | null
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
          phone?: string | null
          responsible_id?: string | null
          source?: string | null
          stage_id?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: [
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
      messages: {
        Row: {
          content: string | null
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
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          equipe_id: string
          id: string
          is_default: boolean
          name: string
          position: number
        }
        Insert: {
          color?: string
          created_at?: string
          equipe_id: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
        }
        Update: {
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
      increment_unread_count: { Args: { row_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
