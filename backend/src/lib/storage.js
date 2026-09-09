import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { supabase } from '../db/client.js';

const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'documents';
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const uploadsDir = path.join(process.cwd(), 'uploads');

const contentTypeByExtension = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function contentTypeFor(originalName) {
  return contentTypeByExtension[path.extname(originalName).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

// ponytail: local disk fallback when Supabase creds aren't set, swap to Storage-only once creds land.
export async function saveFile({ buffer, originalName, studentId, ownerId }) {
  // `studentId` is retained for existing report uploads.  Programme material is
  // owned by the administrator who publishes it instead.
  const owner = studentId ?? ownerId;
  if (!owner) throw new Error('A file owner is required');
  const safeName = path.basename(originalName);
  const key = `${owner}/${randomUUID()}-${safeName}`;

  if (useSupabase) {
    const { error } = await supabase.storage.from(bucket).upload(key, buffer, { upsert: false, contentType: contentTypeFor(safeName) });
    if (error) throw error;
    return { filePath: key, storage: 'supabase' };
  }

  const destDir = path.join(uploadsDir, owner);
  await mkdir(destDir, { recursive: true });
  const destPath = path.join(destDir, path.basename(key));
  await writeFile(destPath, buffer);
  return { filePath: `uploads/${owner}/${path.basename(key)}`, storage: 'local' };
}

export async function getSignedUrl(filePath) {
  if (useSupabase) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60 * 10);
    if (error) throw error;
    return data.signedUrl;
  }
  return `/${filePath}`;
}
