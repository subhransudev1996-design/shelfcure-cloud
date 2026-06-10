import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

/**
 * Uploads a prescription image to the `prescriptions` bucket.
 * Path shape: `{org_id}/{yyyy}/{mm}/{uuid}.{ext}` — RLS checks the leading
 * segment matches the caller's org_id (per migration 0024).
 */
export async function uploadPrescription(
  client: Client,
  orgId: string,
  file: File,
): Promise<{ path: string }> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'jpg';
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const path = `${orgId}/${yyyy}/${mm}/${id}.${ext}`;

  const { error } = await client.storage
    .from('prescriptions')
    .upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
  if (error) throw mapSupabaseError(error);
  return { path };
}

/** Returns a short-lived signed URL for a prescription image (bucket is private). */
export async function signedPrescriptionUrl(
  client: Client,
  path: string,
  expiresInSeconds = 600,
): Promise<string> {
  const { data, error } = await client.storage
    .from('prescriptions')
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw mapSupabaseError(error);
  if (!data?.signedUrl) throw mapSupabaseError(new Error('No signed URL returned'));
  return data.signedUrl;
}
