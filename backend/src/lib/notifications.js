import { supabase, unwrap } from '../db/client.js';

export async function notify({ userId, title, body = null, relatedEntityType = null, relatedEntityId = null }) {
  unwrap(
    await supabase.from('notifications').insert({
      user_id: userId,
      title,
      body,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
    })
  );
}
