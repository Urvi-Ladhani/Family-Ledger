'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useDropzone } from 'react-dropzone';
import {
  PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { calculateAnalytics, extractExpenseData } from '@/utils/ocr-processor';

const supabase = createClient();

const COLORS = ['#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#06B6D4', '#6B7280'];

type DashboardTab = 'ledger' | 'family';
type DateFilter = 'week' | 'month' | 'year' | 'all' | 'custom';

function toDateInputValue(date: Date) {
  return date.toISOString().split('T')[0];
}

function getDateRange(filter: DateFilter, customStart: string, customEnd: string) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (filter === 'all') return { start: null, end: null };

  if (filter === 'custom') {
    const start = customStart ? new Date(`${customStart}T00:00:00`) : null;
    const customRangeEnd = customEnd ? new Date(`${customEnd}T23:59:59`) : null;
    return { start, end: customRangeEnd };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (filter === 'week') {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
  }

  if (filter === 'month') {
    start.setDate(1);
  }

  if (filter === 'year') {
    start.setMonth(0, 1);
  }

  return { start, end };
}

function isInRange(value: string | null | undefined, start: Date | null, end: Date | null) {
  if (!value) return false;
  const date = new Date(`${value.substring(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function buildTrendData(expenses: any[], filter: DateFilter) {
  const totals: Record<string, number> = {};

  for (const expense of expenses) {
    const date = String(expense.expense_date || '').substring(0, 10);
    if (!date) continue;

    const key = filter === 'year' || filter === 'all' ? date.substring(0, 7) : date;
    totals[key] = (totals[key] || 0) + Number(expense.amount || 0);
  }

  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, total]) => ({ name, total }));
}

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amount || 0);
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('ledger');
  const [bills, setBills] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [userRole, setUserRole] = useState<string>('Member');

  const [familyName, setFamilyName] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const [ocrText, setOcrText] = useState<string>('');
  const [ocrStatus, setOcrStatus] = useState<'IDLE' | 'ANALYZING' | 'DONE' | 'FAILED'>('IDLE');
  const [ocrSummary, setOcrSummary] = useState<any>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('month');
  const [customStart, setCustomStart] = useState(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(toDateInputValue(new Date()));
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    category_id: '',
    description: '',
    expense_date: new Date().toISOString().split('T')[0]
  });

  // Fetch user data and expenses
  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');

      // Fetch user's family info. Add robust error handling and a fallback because
      // REST requests can sometimes return 400 if query parameters are malformed
      // or auth headers are missing in certain environments.
      let profile: any = null;
      try {
        const res = await supabase
          .from('users')
          .select('family_id, role')
          .eq('id', user.id)
          .maybeSingle();

        if ((res as any).error) {
            console.error('Supabase users select error:', JSON.stringify(res, null, 2));
            const err = (res as any).error;
            if (err?.code === 'PGRST205' || (err?.message && err.message.includes("Could not find the table 'public.users'"))) {
              alert("Supabase schema issue: 'users' table not found. Please run the migration script db/migrations/03-setup-existing-db.sql in your Supabase SQL editor.");
            }
            profile = null;
        } else {
          profile = (res as any).data;
        }
      } catch (err: unknown) {
        console.error('Failed to fetch profile for user', user.id, err);
        return;
      }

      if (profile?.family_id) {
        setUserRole(profile.role || 'Member');
        
        // Fetch family
        const { data: familyData } = await supabase
          .from('families')
          .select('*')
          .eq('id', profile.family_id)
          .maybeSingle();
        setFamily(familyData);

        // Fetch categories
        const { data: cats } = await supabase
          .from('categories')
          .select('*')
          .eq('family_id', profile.family_id)
          .order('name');
        setCategories(cats || []);

        // Fetch bills
        const { data: billData } = await supabase
          .from('bills')
          .select('*')
          .eq('family_id', profile.family_id)
          .order('created_at', { ascending: false });
        setBills(billData || []);

        // Fetch expenses with role-based filtering
        let expenseQuery = supabase
          .from('expenses')
          .select('*, categories(name, icon, color)')
          .eq('family_id', profile.family_id);

        if (profile.role?.toLowerCase() !== 'admin') {
          expenseQuery = expenseQuery.eq('user_id', user.id);
        }

        const { data: expenseData } = await expenseQuery.order('expense_date', { ascending: false });
        setExpenses(expenseData || []);

      }
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      await fetchData();
    };

    void loadData();
  }, [fetchData]);

  // Extract text from image using Tesseract
  const extractTextFromImage = async (file: File): Promise<string> => {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', undefined, {
        logger: (m: any) => console.log('OCR Progress:', m)
      });

      await worker.load();
      await worker.reinitialize('eng');

      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      return text;
    } catch (error) {
      console.error('OCR Error:', error);
      throw new Error('Failed to extract text from image');
    }
  };

  // Handle manual expense submission
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !family) return;

    try {
      const { error } = await supabase.from('expenses').insert([{
        family_id: family.id,
        user_id: userId,
        amount: parseFloat(expenseForm.amount),
        category_id: expenseForm.category_id,
        expense_date: expenseForm.expense_date,
        description: expenseForm.description,
        ocr_confidence: 0
      }]);

      if (error) throw error;

      setExpenseForm({ amount: '', category_id: '', description: '', expense_date: new Date().toISOString().split('T')[0] });
      setShowExpenseForm(false);
      await fetchData();
    } catch (error: unknown) {
      alert(`Error adding expense: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle family creation
  const handleCreateFamily = async () => {
    if (!userId || !familyName.trim()) return;

    try {
      const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: fam, error } = await supabase
        .from('families')
        .insert([{ name: familyName, created_by: userId, join_code: joinCode }])
        .select()
        .single();

      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: profileError } = await supabase
        .from('users')
        .upsert({
          id: userId,
          email: user?.email || '',
          full_name: user?.user_metadata?.full_name || '',
          family_id: fam.id,
          role: 'Admin'
        });

      if (profileError) throw profileError;

      setFamilyName('');
      await fetchData();
    } catch (error: unknown) {
      alert(`Error creating family: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle family joining
  const handleJoinFamily = async () => {
    if (!userId || !joinCode.trim()) return;

    try {
      const { data: existingFamily } = await supabase
        .from('families')
        .select('*')
        .eq('join_code', joinCode.toUpperCase())
        .maybeSingle();

      if (!existingFamily) {
        alert('Invalid code. No matching family group found.');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { error: profileError } = await supabase
        .from('users')
        .upsert({
          id: userId,
          email: user?.email || '',
          full_name: user?.user_metadata?.full_name || '',
          family_id: existingFamily.id,
          role: 'Member'
        });

      if (profileError) throw profileError;

      setJoinCode('');
      await fetchData();
    } catch (error: unknown) {
      alert(`Error joining family: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Dropzone for bill uploads
  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file || !userId || !family) return;

      setUploading(true);
      setOcrStatus('ANALYZING');
      setOcrSummary(null);

      try {
        // Extract text from image
        let extractedText = '';
        const today = new Date().toISOString().split('T')[0];
        let extracted = {
          amount: null as number | null,
          currency: 'USD',
          date: today,
          description: file.name,
          category: 'Other',
          confidence: 0,
          rawText: ''
        };

        if (file.type.startsWith('image/')) {
          extractedText = await extractTextFromImage(file);
          const parsedExpense = extractExpenseData(extractedText);
          extracted = {
            ...parsedExpense,
            date: parsedExpense.date || today,
            description: parsedExpense.description || file.name
          };
          setOcrText(extractedText);
          setOcrSummary(extracted);
        } else {
          setOcrSummary(extracted);
        }

        // Ensure the 'bills' storage bucket exists and is accessible
        const { error: listErr } = await supabase.storage.from('bills').list('', { limit: 1 });
        if (listErr) {
          console.error('Storage bucket check failed:', listErr);
          alert(`Cannot access storage bucket 'bills': ${listErr.message || JSON.stringify(listErr)}. Please create the bucket in Supabase Storage and allow authenticated uploads.`);
          setUploading(false);
          return;
        }

        // Upload file to storage
        const fileExt = file.name.split('.').pop();
        const uniquePath = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('bills')
          .upload(uniquePath, file, { cacheControl: '3600', upsert: false });
        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          alert(`Upload failed: ${uploadError.message || JSON.stringify(uploadError)}`);
          throw uploadError;
        }

        const { data: urlData } = supabase.storage
          .from('bills')
          .getPublicUrl(uniquePath);

        const detectedCategory =
          categories.find((category) => category.name?.toLowerCase() === extracted.category.toLowerCase()) ||
          categories.find((category) => category.name?.toLowerCase() === 'other') ||
          null;

        // Create bill record
        const { data: newBill, error: dbError } = await supabase.from('bills').insert([{
          family_id: family.id,
          user_id: userId,
          filename: file.name,
          file_url: urlData.publicUrl,
          ocr_text: extractedText,
          status: extracted.amount !== null ? 'processed' : 'needs_review',
          category_id: detectedCategory?.id || null,
          extracted_amount: extracted.amount,
          extracted_date: extracted.date
        }]).select('id').single();

        if (dbError) throw dbError;

        if (extracted.amount !== null) {
          const expensePayload = {
            family_id: family.id,
            user_id: userId,
            bill_id: newBill?.id,
            category_id: detectedCategory?.id || null,
            amount: extracted.amount,
            currency: extracted.currency,
            description: extracted.description || file.name,
            expense_date: extracted.date,
            ocr_text: extractedText,
            ocr_confidence: extracted.confidence
          };

          const { error: expenseError } = await supabase.from('expenses').insert([expensePayload]);

          if (expenseError) {
            const expenseWithoutBill = { ...expensePayload };
            delete expenseWithoutBill.bill_id;
            const { error: retryExpenseError } = await supabase.from('expenses').insert([expenseWithoutBill]);
            if (retryExpenseError) throw expenseError;
          }
        }

        setOcrStatus('DONE');
        await fetchData();
      } catch (error: unknown) {
        setOcrStatus('FAILED');
        alert(`Error uploading bill: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setUploading(false);
      }
    }
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const avatarInitial = userName.trim().charAt(0).toUpperCase() || 'U';
  const selectedRange = useMemo(
    () => getDateRange(dateFilter, customStart, customEnd),
    [dateFilter, customStart, customEnd]
  );
  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => isInRange(expense.expense_date, selectedRange.start, selectedRange.end)),
    [expenses, selectedRange]
  );
  const filteredBills = useMemo(
    () => bills.filter((bill) => {
      if (!selectedRange.start && !selectedRange.end) return true;
      return isInRange(bill.extracted_date || bill.created_at, selectedRange.start, selectedRange.end);
    }),
    [bills, selectedRange]
  );
  const analytics = useMemo(() => calculateAnalytics(filteredExpenses), [filteredExpenses]);
  const categoryNameById = useMemo(() => {
    return Object.fromEntries(categories.map((category) => [category.id, category.name]));
  }, [categories]);

  // Prepare chart data
  const categoryChartData = Object.entries(analytics.categoryBreakdown || {})
    .map(([category, amount]: any) => ({ name: category, value: amount }))
    .slice(0, 8);

  const trendChartData = useMemo(
    () => buildTrendData(filteredExpenses, dateFilter).slice(-24),
    [filteredExpenses, dateFilter]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              {avatarInitial}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Welcome, {userName}!</h1>
              {family && <p className="text-gray-600 text-sm">{family.name} • {userRole?.toLowerCase() === 'admin' ? 'Admin' : 'Member'}</p>}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 text-white font-medium px-6 py-2 rounded-lg transition-colors shadow-md"
          >
            Logout
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`pb-4 px-6 font-medium transition-colors ${
              activeTab === 'ledger'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📊 Bills & Expenses
          </button>
          <button
            onClick={() => setActiveTab('family')}
            className={`pb-4 px-6 font-medium transition-colors ${
              activeTab === 'family'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            👥 Family Management
          </button>
        </div>

        {/* Content Area */}
        {activeTab === 'ledger' && (
          <div className="space-y-8">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Expense Overview</h2>
                  <p className="text-sm text-gray-500">Totals, charts, bills, and expenses update from the selected period.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['week', 'month', 'year', 'all', 'custom'] as DateFilter[]).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setDateFilter(filter)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        dateFilter === filter
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {filter === 'all' ? 'All time' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {dateFilter === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  <label className="text-sm text-gray-600">
                    From
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    To
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <p className="text-gray-600 text-sm font-medium">Total Spending</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{formatMoney(analytics.totalAmount)}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <p className="text-gray-600 text-sm font-medium">Expense Count</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.expenseCount}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <p className="text-gray-600 text-sm font-medium">Average Expense</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{formatMoney(analytics.averageExpense)}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <p className="text-gray-600 text-sm font-medium">Top Category</p>
                <p className="text-3xl font-bold text-gray-900 mt-2 truncate">{analytics.topCategory}</p>
              </div>
            </div>

            {/* Charts */}
            {categoryChartData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending by Category</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={categoryChartData} cx="50%" cy="50%" labelLine={false} label={(entry: any) => `${entry.name}: ${formatMoney(entry.value)}`} outerRadius={100} fill="#8884d8" dataKey="value">
                        {categoryChartData.map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending Trend</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={trendChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="total" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Upload Section */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📸 Upload New Bill</h3>
              <div {...getRootProps()} className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center cursor-pointer hover:bg-blue-50 transition-colors">
                <input {...getInputProps()} />
                <p className="text-gray-600">
                  {uploading ? 'Reading OCR and saving expense...' : 'Drag and drop a bill image or click to browse'}
                </p>
              </div>
              {ocrSummary && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-green-900 text-xs font-semibold uppercase">Detected Total</p>
                    <p className="text-2xl font-bold text-green-950 mt-1">
                      {ocrSummary.amount !== null ? formatMoney(ocrSummary.amount, ocrSummary.currency) : 'Review'}
                    </p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-900 text-xs font-semibold uppercase">Category</p>
                    <p className="text-lg font-semibold text-blue-950 mt-1">{ocrSummary.category}</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <p className="text-purple-900 text-xs font-semibold uppercase">Expense Date</p>
                    <p className="text-lg font-semibold text-purple-950 mt-1">{ocrSummary.date}</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-gray-600 text-xs font-semibold uppercase">Confidence</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{Math.round((ocrSummary.confidence || 0) * 100)}%</p>
                  </div>
                </div>
              )}
              {ocrStatus === 'DONE' && ocrText && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-900 font-medium text-sm mb-2">✓ Text detected:</p>
                  <pre className="text-xs whitespace-pre-wrap break-words text-gray-700 max-h-40 overflow-y-auto">{ocrText}</pre>
                </div>
              )}
            </div>

            {/* Add Expense Form */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">✏️ Add Manual Expense</h3>
                <button onClick={() => setShowExpenseForm(!showExpenseForm)} className="text-blue-600 text-sm hover:underline">
                  {showExpenseForm ? 'Cancel' : 'Add Expense'}
                </button>
              </div>
              {showExpenseForm && (
                <form onSubmit={handleSubmitExpense} className="space-y-4">
                  <input
                    type="number"
                    placeholder="Amount"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    step="0.01"
                    required
                  />
                  <select
                    value={expenseForm.category_id}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                  <textarea
                    placeholder="Description (optional)"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">
                    Save Expense
                  </button>
                </form>
              )}
            </div>

            {/* Bills List */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Bill History</h3>
              {filteredBills.length === 0 ? (
                <p className="text-gray-500">No bills uploaded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left py-3 px-4 text-gray-600 font-medium">Filename</th>
                        <th className="text-left py-3 px-4 text-gray-600 font-medium">Date</th>
                        <th className="text-left py-3 px-4 text-gray-600 font-medium">Category</th>
                        <th className="text-right py-3 px-4 text-gray-600 font-medium">Total</th>
                        <th className="text-left py-3 px-4 text-gray-600 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBills.map((bill) => (
                        <tr key={bill.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <a href={bill.file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                              {bill.filename}
                            </a>
                          </td>
                          <td className="py-3 px-4">{new Date(bill.extracted_date || bill.created_at).toLocaleDateString()}</td>
                          <td className="py-3 px-4">{categoryNameById[bill.category_id] || 'Uncategorized'}</td>
                          <td className="py-3 px-4 text-right font-medium">
                            {bill.extracted_amount ? formatMoney(Number(bill.extracted_amount)) : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                              bill.status === 'processed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {bill.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Expenses List */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">💰 {userRole?.toLowerCase() === 'admin' ? 'All Family' : 'My'} Expenses</h3>
              {filteredExpenses.length === 0 ? (
                <p className="text-gray-500">No expenses recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left py-3 px-4 text-gray-600 font-medium">Date</th>
                        <th className="text-left py-3 px-4 text-gray-600 font-medium">Category</th>
                        <th className="text-left py-3 px-4 text-gray-600 font-medium">Description</th>
                        <th className="text-right py-3 px-4 text-gray-600 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpenses.map((exp) => (
                        <tr key={exp.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-3 px-4">{new Date(exp.expense_date).toLocaleDateString()}</td>
                          <td className="py-3 px-4">{exp.categories?.name || 'Uncategorized'}</td>
                          <td className="py-3 px-4">{exp.description || '—'}</td>
                          <td className="py-3 px-4 text-right font-medium">{formatMoney(Number(exp.amount), exp.currency || 'USD')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'family' && (
          <div className="space-y-6">
            {!family ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Create Family */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">🆕 Create Family</h3>
                  <input
                    type="text"
                    placeholder="Family name"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4"
                  />
                  <button onClick={handleCreateFamily} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">
                    Create
                  </button>
                </div>

                {/* Join Family */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">🔗 Join Family</h3>
                  <input
                    type="text"
                    placeholder="Family code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4"
                  />
                  <button onClick={handleJoinFamily} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition-colors">
                    Join
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">👥 {family.name}</h3>
                <p className="text-gray-600">Invite code: <span className="font-mono font-bold text-gray-900">{family.join_code || family.code}</span></p>
                <p className="text-sm text-gray-500 mt-2">Share this code with family members to invite them to join your expense tracking group.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
