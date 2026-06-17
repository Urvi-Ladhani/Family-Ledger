import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user from the token header
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    // 2. Fetch user's profile to see if they belong to a family workspace
    const { data: profile } = await supabase
      .from('users')
      .select('family_id')
      .eq('id', user.id)
      .maybeSingle();

    // 3. Join with users table via user_id foreign key mapping
    let dbQuery = supabase
      .from('bills')
      .select('*, uploader:users(full_name, display_name, email)');
    
    if (profile?.family_id) {
      dbQuery = dbQuery.eq('family_id', profile.family_id);
    } else {
      dbQuery = dbQuery.eq('user_id', user.id);
    }

    const { data: bills, error: dbError } = await dbQuery.order('created_at', { ascending: false });

    if (dbError) {
      console.error('Database Fetch Error:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ bills });

  } catch (error: any) {
    console.error('Server Fetch Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}