import { createClient, SupabaseClient } from '@supabase/supabase-js';

const buckets = ['img', 'vids'] as const;
const pageSize = 100;
const targetFileSizeLimit = 1024 * 1024 * 1024;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before running the Storage migration.`);
  return value;
}

function client(urlName: string, keyName: string): SupabaseClient {
  return createClient(required(urlName), required(keyName), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensurePublicBucket(target: SupabaseClient, bucket: string) {
  const storage = target.storage;
  const created = await storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: targetFileSizeLimit,
  });

  if (!created.error) return;

  // An already-created bucket is expected when resuming a partially completed transfer.
  const updated = await storage.updateBucket(bucket, {
    public: true,
    fileSizeLimit: targetFileSizeLimit,
  });
  if (updated.error) {
    throw new Error(`Could not prepare target bucket "${bucket}": ${updated.error.message}`);
  }
}

async function transferFolder(
  source: SupabaseClient,
  target: SupabaseClient,
  bucket: string,
  prefix: string,
  counts: { copied: number }
) {
  for (let offset = 0; ; offset += pageSize) {
    const { data: entries, error } = await source.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`Could not list source bucket "${bucket}": ${error.message}`);

    for (const entry of entries ?? []) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!entry.id) {
        await transferFolder(source, target, bucket, objectPath, counts);
        continue;
      }

      const { data: file, error: downloadError } = await source.storage.from(bucket).download(objectPath);
      if (downloadError || !file) {
        throw new Error(`Could not download "${bucket}/${objectPath}": ${downloadError?.message ?? 'empty response'}`);
      }

      const { error: uploadError } = await target.storage.from(bucket).upload(
        objectPath,
        file,
        {
          contentType: entry.metadata?.mimetype ?? 'application/octet-stream',
          cacheControl: '31536000',
          upsert: true,
        }
      );
      if (uploadError) throw new Error(`Could not upload "${bucket}/${objectPath}": ${uploadError.message}`);

      counts.copied += 1;
      if (counts.copied % 25 === 0) console.log(`Copied ${counts.copied} objects so far.`);
    }

    if (!entries || entries.length < pageSize) break;
  }
}

async function main() {
  const target = client('TARGET_SUPABASE_URL', 'TARGET_SUPABASE_SERVICE_ROLE_KEY');
  const counts = { copied: 0 };

  for (const bucket of buckets) {
    await ensurePublicBucket(target, bucket);
  }

  if (process.argv.includes('--init-only')) {
    console.log(`Prepared public buckets: ${buckets.join(', ')}.`);
    return;
  }

  const source = client('SOURCE_SUPABASE_URL', 'SOURCE_SUPABASE_SERVICE_ROLE_KEY');
  for (const bucket of buckets) {
    await transferFolder(source, target, bucket, '', counts);
  }

  console.log(`Storage migration finished: ${counts.copied} objects copied to img and vids.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Storage migration failed.');
  process.exitCode = 1;
});
