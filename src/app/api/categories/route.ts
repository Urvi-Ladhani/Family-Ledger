import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// GET categories for family
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('family_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.family_id) {
      return NextResponse.json({ error: 'User not in a family' }, { status: 400 });
    }

    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .eq('family_id', profile.family_id)
      .order('name');

    return NextResponse.json({ categories });

  } catch (error: unknown) {
    console.error('Fetch categories error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST create category (admin only)
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('family_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.family_id) {
      return NextResponse.json({ error: 'User not in a family' }, { status: 400 });
    }

    if (profile.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create categories' }, { status: 403 });
    }

    const { name, icon, color } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Category name required' }, { status: 400 });
    }

    const { data: category, error: createError } = await supabase
      .from('categories')
      .insert([{
        family_id: profile.family_id,
        name,
        icon: icon || '📁',
        color: color || '#6B7280'
      }])
      .select()
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json({ category });

  } catch (error: unknown) {
    console.error('Create category error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
