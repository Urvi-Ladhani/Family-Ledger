import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractExpenseData } from '@/utils/ocr-processor';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

    // Get user's family and role
    const { data: profile } = await supabase
      .from('users')
      .select('family_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.family_id) {
      return NextResponse.json({ error: 'User not in a family' }, { status: 400 });
    }

    const { billId, ocrText } = await request.json();

    if (!billId || !ocrText) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Extract expense data from OCR
    const extractedData = extractExpenseData(ocrText);

    // Get family's default category if auto-categorization failed
    let categoryId = null;
    if (extractedData.category !== 'Other') {
      const { data: category } = await supabase
        .from('categories')
        .select('id')
        .eq('family_id', profile.family_id)
        .eq('name', extractedData.category)
        .maybeSingle();
      
      categoryId = category?.id;
    }

    // If category not found, get 'Other' category
    if (!categoryId) {
      const { data: otherCategory } = await supabase
        .from('categories')
        .select('id')
        .eq('family_id', profile.family_id)
        .eq('name', 'Other')
        .maybeSingle();
      
      categoryId = otherCategory?.id;
    }

    // Create expense entry
    const expenseData = {
      family_id: profile.family_id,
      user_id: user.id,
      bill_id: billId,
      category_id: categoryId,
      amount: extractedData.amount,
      currency: extractedData.currency,
      description: extractedData.description,
      expense_date: extractedData.date || new Date().toISOString().split('T')[0],
      ocr_text: extractedData.rawText,
      ocr_confidence: extractedData.confidence
    };

    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert([expenseData])
      .select()
      .single();

    if (expenseError) {
      console.error('Expense creation error:', expenseError);
      return NextResponse.json({ error: expenseError.message }, { status: 500 });
    }

    // Update bill with extracted data
    await supabase
      .from('bills')
      .update({
        category_id: categoryId,
        extracted_amount: extractedData.amount,
        extracted_date: extractedData.date,
        parse_status: 'CATEGORIZED'
      })
      .eq('id', billId);

    return NextResponse.json({
      success: true,
      expense: expense,
      extracted: extractedData
    });

  } catch (error: unknown) {
    console.error('Process expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET endpoint to fetch analytics
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
      .select('family_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.family_id) {
      return NextResponse.json({ error: 'User not in a family' }, { status: 400 });
    }

    // Fetch expenses based on role
    let query = supabase
      .from('expenses')
      .select('*, categories(name, icon, color)')
      .eq('family_id', profile.family_id);

    // Non-admins can only see their own expenses
    if (profile.role?.toLowerCase() !== 'admin') {
      query = query.eq('user_id', user.id);
    }

    const { data: expenses } = await query.order('expense_date', { ascending: false });

    // Calculate analytics
    const categoryBreakdown: Record<string, number> = {};
    const monthlyTrend: Record<string, number> = {};
    let totalAmount = 0;

    for (const expense of expenses || []) {
      totalAmount += expense.amount || 0;
      const category = expense.categories?.name || 'Other';
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + (expense.amount || 0);
      
      const month = expense.expense_date?.substring(0, 7) || '';
      if (month) monthlyTrend[month] = (monthlyTrend[month] || 0) + (expense.amount || 0);
    }

    return NextResponse.json({
      expenses,
      analytics: {
        totalAmount,
        categoryBreakdown,
        monthlyTrend,
        expenseCount: expenses?.length || 0
      }
    });

  } catch (error: unknown) {
    console.error('Fetch analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
