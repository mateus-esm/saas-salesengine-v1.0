class GuardError(Exception):
    """Exception raised when database access guard checks fail."""
    pass


ALLOWED_TABLES = {
    "opportunities",
    "pipeline_stages_v2",
    "custom_table_records",
    "leads",
    "tasks",
    "lead_activities",
    "touchpoints",
    "opportunity_stage_history",
}


def assert_table(table_name: str) -> None:
    """
    Ensure the table is in the allowed whitelist of tables that the agent can interact with.
    Raises GuardError if the table is not allowed.
    """
    if table_name not in ALLOWED_TABLES:
        raise GuardError(f"Access denied: table '{table_name}' is not in the whitelist.")


def assert_equipe(row: dict | None, equipe_id: str) -> None:
    """
    Ensure the database row belongs to the context's equipe_id (tenant check).
    Raises GuardError if there is a mismatch or row is empty/invalid.
    """
    if row is None:
        raise GuardError("Access denied: row is empty or None.")

    row_equipe_id = row.get("equipe_id")
    if row_equipe_id is None:
        raise GuardError("Access denied: row does not contain an 'equipe_id'.")

    # Compare as strings to prevent UUID mismatch issues
    if str(row_equipe_id) != str(equipe_id):
        raise GuardError(
            f"Tenant violation: row belongs to equipe '{row_equipe_id}', "
            f"but current tenant context is '{equipe_id}'."
        )
