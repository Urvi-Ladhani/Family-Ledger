import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const envVars = Object.fromEntries(
  env.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('='))
);

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL']?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY']?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUsersTable() {
  const testId = '00000000-0000-0000-0000-000000000000';
  
  console.log('Testing insert into users...');
  const { data, error } = await supabase
    .from('users')
    .insert([{ id: testId, email: 'test@example.com', full_name: 'Test', role: 'Member' }]);
    
  if (error) {
    console.log('Insert response:', error.code, error.message);
  } else {
    console.log('Insert success:', data);
    await supabase.from('users').delete().eq('id', testId);
  }

  const { data: cols, error: errCols } = await supabase.from('users').select('*').limit(1);
  if (errCols) {
    console.log('Select response:', errCols.code, errCols.message);
  } else {
    if (cols && cols.length > 0) {
      console.log('Users columns:', Object.keys(cols[0]));
    } else {
      console.log('Users table empty, cannot inspect columns from select');
    }
  }
}

testUsersTable();
