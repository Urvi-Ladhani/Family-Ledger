import fetch from 'node-fetch';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const envVars = Object.fromEntries(
  env.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('='))
);

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL']?.trim();
const supabaseKey = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY']?.trim();

async function inspectSchema() {
  const res = await fetch(`${supabaseUrl}/rest/v1/?apikey=${supabaseKey}`);
  const schema = await res.json();
  console.log("RESPONSE:", schema);
}

inspectSchema();
