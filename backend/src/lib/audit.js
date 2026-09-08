import { supabase, unwrap } from '../db/client.js';

export async function logAudit({ actorId, actorRole, action, entityType, entityId, oldValue = null, newValue = null }) {
  unwrap(
    await supabase.from('audit_log').insert({
      actor_id: actorId,
      actor_role: actorRole,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_value: oldValue,
      new_value: newValue,
    })
  );
}
