// CRM Types - shared across components

// Sprint 4 EPIC 3 §1.2 — MECE origin taxonomy. 12 categories covering inbound,
// outbound, network, and system sources. Physical column check constraint
// lives on `leads.origin_category` (see migration 20260422000000).
export type OriginCategory =
  | 'organic_search'
  | 'organic_social'
  | 'paid_search'
  | 'paid_social'
  | 'direct_brand'
  | 'outbound_phone'
  | 'outbound_message'
  | 'outbound_email'
  | 'referral'
  | 'partner_channel'
  | 'offline_event'
  | 'api_import';

// Sprint 4 EPIC 1 — identity lifecycle flag. Independent from opportunity status.
export type ContactType = 'lead' | 'opportunity' | 'contact' | 'spam' | 'archived';

export type CreatedByType = 'team' | 'automation' | 'ai' | 'import' | 'webhook';

export interface Lead {
  id: string;
  equipe_id: string;
  stage_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  opportunity_value: number | null;
  meeting_scheduled: boolean | null;
  meeting_done: boolean | null;
  no_show: boolean | null;
  next_contact: string | null;
  observations: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  origem: string | null;
  atendido_por_agente: boolean | null;
  interaction_id: string | null;
  // New fields for PRD v2.2
  responsible_id: string | null;
  meeting_date: string | null;
  meeting_notes: string | null;
  // GPT Maker integration fields
  gpt_maker_chat_id: string | null;
  last_message_at: string | null;
  // v3.0 fields
  lead_type: 'lead' | 'contact' | 'spam' | null;
  stage_entered_at: string | null;
  assigned_to: string | null;
  unread_count: number | null;
  creation_source: 'ai_agent' | 'manual' | null;
  created_at: string;
  updated_at: string;
  // Fase 2: Omnichannel enrichment
  channel: 'whatsapp' | 'instagram' | 'telegram' | 'web' | 'messenger' | string | null;
  profile_picture: string | null;
  agent_name: string | null;
  // Sprint 3 EPIC 1 — Global Lead Database (universal identity)
  origin: 'whatsapp' | 'manual' | 'web' | 'import' | string | null;
  deleted_at: string | null;
  // Sprint 4 EPIC 1 — identity-layer extensions. Physical columns landed in
  // migration 20260422000000_sprint4_epic1_foundations.sql.
  contact_type: ContactType | null;
  personal_custom_data: Record<string, unknown> | null;
  created_by_type: CreatedByType | null;
  created_by_id: string | null;
  origin_category: OriginCategory | null;
  origin_detail: string | null;
}

// Sprint 4 EPIC 3 §3.1 — table stays `leads` physically until Sprint 5; new
// code uses the `Contact` name to signal the enterprise taxonomy. Drop the
// alias once the physical rename lands.
export type Contact = Lead;

export interface PipelineStage {
  id: string;
  equipe_id: string;
  name: string;
  position: number;
  color: string;
  is_default: boolean;
  category: string | null; // 'active' | 'won' | 'lost' | 'disqualified' | 'recycled'
  created_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  user_id: string | null;
  tipo: string;
  descricao: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Touchpoint {
  id: string;
  lead_id: string;
  user_id: string | null;
  touchpoint_type: 'call' | 'email' | 'whatsapp' | 'meeting' | 'note';
  content: string;
  contact_date: string;
  created_at: string;
}

export interface CreateLeadData {
  name: string;
  email?: string;
  phone?: string;
  stage_id?: string;
  tags?: string[];
  observations?: string;
  source?: string;
  origin?: 'whatsapp' | 'manual' | 'web' | 'import' | string;
  opportunity_value?: number;
  responsible_id?: string;
  meeting_date?: string;
  meeting_notes?: string;
  custom_fields?: Record<string, unknown>;
  lead_type?: 'lead' | 'contact' | 'spam';
}

export interface UpdateLeadData {
  id: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  stage_id?: string | null;
  tags?: string[];
  observations?: string | null;
  next_contact?: string | null;
  meeting_scheduled?: boolean;
  meeting_done?: boolean;
  no_show?: boolean;
  opportunity_value?: number | null;
  custom_fields?: Record<string, unknown>;
  // New fields for PRD v2.2
  responsible_id?: string | null;
  meeting_date?: string | null;
  meeting_notes?: string | null;
  lead_type?: 'lead' | 'contact' | 'spam';
  // Sprint 4 EPIC 3 — identity-layer editables
  contact_type?: ContactType;
  channel?: string | null;
  origin_category?: OriginCategory | null;
  origin_detail?: string | null;
  personal_custom_data?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────
// Sprint 4 EPIC 4 — Companies, Properties, Associations
// ─────────────────────────────────────────────────────────────────────

export type CompanySizeBracket =
  | 'solo'
  | '2-10'
  | '11-50'
  | '51-200'
  | '201-1000'
  | '1000+';

export interface Company {
  id: string;
  equipe_id: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  website: string | null;
  industry: string | null;
  size_bracket: CompanySizeBracket | null;
  custom_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateCompanyData {
  name: string;
  legal_name?: string | null;
  cnpj?: string | null;
  website?: string | null;
  industry?: string | null;
  size_bracket?: CompanySizeBracket | null;
  custom_data?: Record<string, unknown>;
}

export interface UpdateCompanyData {
  id: string;
  name?: string;
  legal_name?: string | null;
  cnpj?: string | null;
  website?: string | null;
  industry?: string | null;
  size_bracket?: CompanySizeBracket | null;
  custom_data?: Record<string, unknown>;
}

export type PropertyType = 'address' | 'site' | 'unit' | 'custom';

export interface PropertyAddress {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface Property {
  id: string;
  equipe_id: string;
  label: string;
  property_type: PropertyType;
  address: PropertyAddress | null;
  latitude: number | null;
  longitude: number | null;
  attributes: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreatePropertyData {
  label: string;
  property_type?: PropertyType;
  address?: PropertyAddress | null;
  latitude?: number | null;
  longitude?: number | null;
  attributes?: Record<string, unknown>;
}

export interface UpdatePropertyData {
  id: string;
  label?: string;
  property_type?: PropertyType;
  address?: PropertyAddress | null;
  latitude?: number | null;
  longitude?: number | null;
  attributes?: Record<string, unknown>;
}

export type ContactCompanyRole =
  | 'owner'
  | 'decision_maker'
  | 'employee'
  | 'former'
  | 'advisor'
  | 'other';

export interface ContactCompanyLink {
  id: string;
  equipe_id: string;
  contact_id: string;
  company_id: string;
  role: ContactCompanyRole;
  is_primary: boolean;
  created_at: string;
}

export type PropertyOwnerType = 'contact' | 'company';

export interface PropertyOwnerLink {
  id: string;
  equipe_id: string;
  property_id: string;
  owner_type: PropertyOwnerType;
  owner_id: string;
  created_at: string;
}

export interface WebhookConfig {
  id: string;
  equipe_id: string;
  name: string;
  url: string;
  trigger_event: string;
  active: boolean;
  headers: Record<string, unknown>;
  created_at: string;
}

export interface TeamMember {
  id: string;
  nome_completo: string | null;
  email: string | null;
}
