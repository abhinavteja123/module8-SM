export async function notify(db, { userId, title, body = null, relatedEntityType = null, relatedEntityId = null }) {
  await db.query(
    `INSERT INTO notifications (user_id, title, body, related_entity_type, related_entity_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, title, body, relatedEntityType, relatedEntityId]
  );
}
