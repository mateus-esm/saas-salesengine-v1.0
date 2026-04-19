# Database Conventions

Sprint 3 / CRM v1 — Foundation rules. Every new table introduced from this
sprint forward MUST follow them. Existing legacy tables stay as-is until they
are explicitly migrated.

---

## 1. Standard columns (every new table)

| Column       | Type          | Required | Notes                                    |
| ------------ | ------------- | -------- | ---------------------------------------- |
| `id`         | `uuid`        | yes      | `default gen_random_uuid()`              |
| `equipe_id`  | `uuid`        | yes      | FK → `equipes(id) on delete cascade`     |
| `created_at` | `timestamptz` | yes      | `default now()`                          |
| `updated_at` | `timestamptz` | yes      | maintained by `update_updated_at_column` |
| `deleted_at` | `timestamptz` | no       | nullable → soft-delete                   |

> The sprint planning document references `tenant_id`. In this codebase the
> equivalent column is `equipe_id` (Portuguese for "team"), already wired into
> auth, RLS and every existing table. We keep `equipe_id` for consistency.

## 2. Trigger — `updated_at`

Reuse the existing helper:

```sql
CREATE TRIGGER set_<table>_updated_at
  BEFORE UPDATE ON public.<table>
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Do not duplicate the trigger function per table.

## 3. Row Level Security

RLS is **mandatory**. The canonical pattern:

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their team <table>"
ON public.<table> FOR SELECT
USING (
  equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE POLICY "Users can manage their team <table>"
ON public.<table> FOR ALL
USING (
  equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid())
);
```

Any deviation (per-role policies, service-role-only writes, etc.) must be
documented inline in the migration.

## 4. Indexes

- One partial index per `equipe_id` lookup pattern,
  scoped `WHERE deleted_at IS NULL`.
- Composite indexes for the dominant query (e.g.
  `(equipe_id, pipeline_id, stage_id, position)` for the kanban query).
- Avoid duplicate indexes — `equipe_id` alone is rarely needed; combine it with
  the next-most-common filter.

## 5. JSONB vs columns

| Use a column when…           | Use JSONB when…                          |
| ---------------------------- | ---------------------------------------- |
| The field is required        | The field is tenant-defined              |
| You query / sort / filter it | You only read it as a blob               |
| Every row needs a value      | Different rows can have different shapes |
| It's part of the contract    | The shape evolves per pipeline / per UI  |

Custom fields live in JSONB and are keyed by **stable `field_id` (uuid)**, not
by user-facing `key` or `label`. Renaming a label must never require a data
migration.

## 6. Custom field schema (sprint 3)

Stored in `pipelines.custom_fields_schema` as a JSONB array:

```json
[
  {
    "field_id": "f8b1c2d4-...",
    "key": "roof_type",
    "label": "Roof Type",
    "type": "select",
    "required": true,
    "options": ["Ceramic", "Metal", "Concrete"],
    "position": 0,
    "is_deleted": false
  }
]
```

V1 supported `type` values: `text`, `number`, `currency`, `date`, `boolean`,
`select`. Deleting a field sets `is_deleted: true` so historical
`opportunities.custom_data` keyed by `field_id` is preserved.

## 7. Migration discipline

- One concern per migration file. Filename: `YYYYMMDDHHMMSS_<topic>.sql`.
- Migrations are **additive**. Destructive changes (drop column, drop table)
  ride a separate migration after a one-sprint dual-read window.
- Keep a snapshot table for any structural change that touches existing rows
  (`<table>_backup_<sprint>`).
- Wrap in `IF NOT EXISTS` / `DO $$ … $$` guards so migrations are idempotent
  when re-applied locally.
