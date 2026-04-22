import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface DuplicateCheckParams {
  phone?: string;
  email?: string;
  excludeLeadId?: string;
}

interface DuplicateMatch {
  id: string;
  name: string;
  matchedField: "phone" | "email";
  matchedValue: string;
}

/**
 * Non-blocking duplicate detection — fires a debounced lookup against the
 * tenant's live leads (deleted_at IS NULL) for exact phone or email matches.
 * Used by AddContactModal to surface a warning, never to block submission.
 */
export const useLeadDuplicateCheck = ({
  phone,
  email,
  excludeLeadId,
}: DuplicateCheckParams) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!equipeId) return;

    const trimmedPhone = phone?.trim();
    const trimmedEmail = email?.trim().toLowerCase();

    if (!trimmedPhone && !trimmedEmail) {
      setMatches([]);
      return;
    }

    let cancelled = false;
    setIsChecking(true);

    const handle = window.setTimeout(async () => {
      const found: DuplicateMatch[] = [];

      if (trimmedPhone && trimmedPhone.length >= 8) {
        const { data } = await supabase
          .from("leads")
          .select("id, name, phone")
          .eq("equipe_id", equipeId)
          .eq("phone", trimmedPhone)
          .is("deleted_at", null)
          .limit(5);

        (data || []).forEach((row) => {
          if (excludeLeadId && row.id === excludeLeadId) return;
          found.push({
            id: row.id,
            name: row.name,
            matchedField: "phone",
            matchedValue: row.phone || trimmedPhone,
          });
        });
      }

      if (trimmedEmail && trimmedEmail.includes("@")) {
        const { data } = await supabase
          .from("leads")
          .select("id, name, email")
          .eq("equipe_id", equipeId)
          .ilike("email", trimmedEmail)
          .is("deleted_at", null)
          .limit(5);

        (data || []).forEach((row) => {
          if (excludeLeadId && row.id === excludeLeadId) return;
          if (found.some((m) => m.id === row.id)) return;
          found.push({
            id: row.id,
            name: row.name,
            matchedField: "email",
            matchedValue: row.email || trimmedEmail,
          });
        });
      }

      if (!cancelled) {
        setMatches(found);
        setIsChecking(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      setIsChecking(false);
    };
  }, [equipeId, phone, email, excludeLeadId]);

  return { matches, isChecking };
};
