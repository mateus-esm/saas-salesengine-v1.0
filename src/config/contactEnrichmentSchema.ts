import type { CustomFieldSchema } from "@/types/pipelines";

// Sprint 4 EPIC 3 §3.4 — fixed schema for `leads.personal_custom_data`.
// Feeds the existing `DynamicFieldRenderer` so we don't ship a second form
// engine (§6 guiding principle). Sprint 5 turns this into a per-tenant admin-
// configurable schema; for V1 the list is hard-coded.
//
// `field_id` values are stable UUIDs — never change. If a field is retired,
// flip `is_deleted` to true and keep the id so stored values don't orphan.
export const CONTACT_ENRICHMENT_SCHEMA: CustomFieldSchema[] = [
  {
    field_id: "c8a1b2e4-1111-4a00-8000-000000000001",
    key: "birthday",
    label: "Aniversário",
    type: "date",
    required: false,
    position: 1,
  },
  {
    field_id: "c8a1b2e4-1111-4a00-8000-000000000002",
    key: "job_title",
    label: "Cargo",
    type: "text",
    required: false,
    position: 2,
  },
  {
    field_id: "c8a1b2e4-1111-4a00-8000-000000000003",
    key: "linkedin_url",
    label: "LinkedIn",
    type: "url",
    required: false,
    position: 3,
  },
  {
    field_id: "c8a1b2e4-1111-4a00-8000-000000000004",
    key: "instagram_url",
    label: "Instagram",
    type: "url",
    required: false,
    position: 4,
  },
  {
    field_id: "c8a1b2e4-1111-4a00-8000-000000000005",
    key: "profile_picture_url",
    label: "Foto de Perfil (URL)",
    type: "url",
    required: false,
    position: 5,
  },
];
