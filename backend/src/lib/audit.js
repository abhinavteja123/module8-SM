export async function logAudit(db, { actorId, actorRole, action, entityType, entityId, oldValue = null, newValue = null }) {
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actorId, actorRole, action, entityType, entityId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null]
  );
}
