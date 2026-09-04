import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'documents';
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const supabase = useSupabase
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const uploadsDir = path.join(process.cwd(), 'uploads');

// ponytail: local disk fallback when Supabase creds aren't set, swap to Storage-only once creds land.
export async function saveFile({ buffer, originalName, studentId }) {
  const key = `${studentId}/${randomUUID()}-${originalName}`;

  if (useSupabase) {
    const { error } = await supabase.storage.from(bucket).upload(key, buffer, { upsert: false });
    if (error) throw error;
    return { filePath: key, storage: 'supabase' };
  }

  const destDir = path.join(uploadsDir, studentId);
  await mkdir(destDir, { recursive: true });
  const destPath = path.join(destDir, path.basename(key));
  await writeFile(destPath, buffer);
  return { filePath: `uploads/${studentId}/${path.basename(key)}`, storage: 'local' };
}

export async function getSignedUrl(filePath) {
  if (useSupabase) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60 * 10);
    if (error) throw error;
    return data.signedUrl;
  }
  return `/${filePath}`;
}
