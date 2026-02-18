import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Polyfill for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to parse .env file
function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      env[key] = value;
    }
  });
  return env;
}

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const env = parseEnv(envPath);

const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
// Try to find service role key, fallback to anon (might fail for private bucket upload if policies not set for anon)
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const FILE_PATH = path.join(rootDir, 'CONTRATOS', '260115 CARTA DE CONFIDENCIALIDAD.doc');
const BUCKET = 'contract-templates'; // Must match bucket name in migration
const DEST_PATH = 'nda/260115 CARTA DE CONFIDENCIALIDAD.doc';

async function uploadFile() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`Error: File not found at ${FILE_PATH}`);
    process.exit(1);
  }

  console.log(`Reading file: ${FILE_PATH}`);
  const fileContent = fs.readFileSync(FILE_PATH);

  console.log(`Uploading to bucket '${BUCKET}' at path '${DEST_PATH}'...`);
  
  // Create bucket if not exists (idempotent-ish check)
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find(b => b.name === BUCKET)) {
      console.log(`Bucket ${BUCKET} not found, attempting to create...`);
      const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: false });
      if (createError) console.error('Error creating bucket:', createError.message);
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(DEST_PATH, fileContent, {
      contentType: 'application/msword',
      upsert: true
    });

  if (error) {
    console.error('Upload failed:', error.message);
    process.exit(1);
  }

  console.log('Upload successful!');
  console.log('Path:', data.path);
}

uploadFile();
