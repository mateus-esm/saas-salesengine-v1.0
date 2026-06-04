export type TaxonomyKind = "origem" | "canal";

export interface OriginTag {
  id: string;
  equipe_id: string;
  kind: TaxonomyKind;
  label: string;
  color: string;
  created_at: string;
  deleted_at: string | null;
}
