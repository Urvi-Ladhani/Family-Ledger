'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import {
  PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { calculateAnalytics, extractExpenseData } from '@/utils/ocr-processor';

const supabase = createClient();
const COLORS = ['#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#06B6D4', '#6B7280'];
type DateFilter = 'week' | 'month' | 'year' | 'all' | 'custom';

function toDateInputValue(date: Date) { return date.toISOString().split('T')[0]; }

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
  if (filter === 'month') start.setDate(1);
  if (filter === 'year') start.setMonth(0, 1);
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
  return Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)).map(([name, total]) => ({ name, total }));
}

function formatMoney(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(amount || 0);
}

export default function Dashboard() {
  const router = useRouter();
  const [bills, setBills] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [userRole, setUserRole] = useState<string>('Member');
  const [loadingCheck, setLoadingCheck] = useState<boolean>(true);

  const [uploading, setUploading] = useState<boolean>(false);
  const [ocrText, setOcrText] = useState<string>('');
  const [ocrStatus, setOcrStatus] = useState<'IDLE' | 'ANALYZING' | 'DONE' | 'FAILED'>('IDLE');
  const [ocrSummary, setOcrSummary] = useState<any>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('month');
  const [customStart, setCustomStart] = useState(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(toDateInputValue(new Date()));
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ amount: '', category_id: '', description: '', expense_date: new Date().toISOString().split('T')[0] });

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');

    setUserId(user.id);
    setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');

    let profile: any = null;
    try {
      const { data, error } = await supabase.from('users').select('family_id, role').eq('id', user.id).maybeSingle();
      if (!error && data) profile = data;
    } catch (err) {
      console.error('Profile fetch failed', err);
    }

    if (!profile || !profile.family_id) {
      return router.push('/join-family');
    }

    setUserRole(profile.role || 'Member');
    
    const { data: familyData } = await supabase.from('families').select('*').eq('id', profile.family_id).maybeSingle();
    setFamily(familyData);

    const { data: cats } = await supabase.from('categories').select('*').eq('family_id', profile.family_id).order('name');
    setCategories(cats || []);

    const { data: billData } = await supabase.from('bills').select('*').eq('family_id', profile.family_id).order('created_at', { ascending: false });
    setBills(billData || []);

    let expenseQuery = supabase.from('expenses').select('*, categories(name, icon, color)').eq('family_id', profile.family_id);
    if (profile.role?.toLowerCase() !== 'admin') {
      expenseQuery = expenseQuery.eq('user_id', user.id);
    }
    const { data: expenseData } = await expenseQuery.order('expense_date', { ascending: false });
    setExpenses(expenseData || []);
    
    setLoadingCheck(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const convertPdfToImage = async (file: File): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 }); 

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ 
  canvasContext: context!, 
  viewport: viewport,
  canvas: canvas // <-- Satisfies the updated TS interface
} as any).promise;
    return canvas.toDataURL('image/jpeg');
  };

  const extractTextFromPdfNative = async (file: File): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      let lastY = -1;
      let pageText = '';
      
      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        
        // Group items on the same line using their vertical Y-coordinate
        // Rounding helps group text that is slightly misaligned
        const currentY = Math.round(item.transform[5] / 5) * 5; 
        
        if (lastY !== -1 && currentY !== lastY) {
          pageText += '\n'; // Different Y coordinate = create a new line
        } else if (lastY !== -1 && pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' '; // Same line = just add a space between words
        }
        
        pageText += item.str.trim();
        lastY = currentY;
      }
      fullText += pageText + '\n\n';
    }
    return fullText;
  };

  const extractTextFromImage = async (imageSource: File | string): Promise<string> => {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        logger: (m: any) => console.log('OCR Progress:', m)
      });

      const { data: { text } } = await worker.recognize(imageSource);
      
      await worker.terminate();
      return text;
    } catch (error) {
      console.error('OCR Error:', error);
      throw new Error('Failed to extract text from image');
    }
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !family) return;

    try {
      const selectedCategory = categories.find(c => c.id === expenseForm.category_id);
      
      const { error } = await supabase.from('expenses').insert([
        {
          family_id: family.id,
          user_id: userId,
          amount: parseFloat(expenseForm.amount),
          category_id: expenseForm.category_id || null,
          description: expenseForm.description || `Manual ${selectedCategory?.name || 'Expense'}`,
          expense_date: expenseForm.expense_date,
        }
      ]);

      if (error) throw error;

      setExpenseForm({ amount: '', category_id: '', description: '', expense_date: new Date().toISOString().split('T')[0] });
      setShowExpenseForm(false);
      await fetchData();
    } catch (error) {
      console.error('Error adding expense manually:', error);
      alert('Failed to save manual expense entry.');
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file || !userId || !family) return;

      setUploading(true);
      setOcrStatus('ANALYZING');
      setOcrSummary(null);

      try {
        let extractedText = '';
        const today = new Date().toISOString().split('T')[0];
        let extracted = { amount: null as number | null, currency: 'INR', date: today, description: file.name, category: 'Other', confidence: 0, rawText: '' };

        // Replace the old file.type check with this:
        if (file.type === 'application/pdf') {
          // 1. Try native text extraction first (perfect for digital bills, reads all pages)
          extractedText = await extractTextFromPdfNative(file);
          
          // 2. If it's a scanned photo saved as a PDF (no native text), fallback to OCR
          if (extractedText.trim().length < 20) {
             const imageSource = await convertPdfToImage(file);
             extractedText = await extractTextFromImage(imageSource);
          }
        } else if (file.type.startsWith('image/')) {
          // It's a standard image, use OCR
          extractedText = await extractTextFromImage(file);
        }

        const parsedExpense = extractExpenseData(extractedText);
        extracted = { ...parsedExpense, date: parsedExpense.date || today, description: file.name };
        setOcrText(extractedText);
        setOcrSummary(extracted);

        const fileExt = file.name.split('.').pop();
        const uniquePath = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('bills')
          .upload(uniquePath, file, { 
            cacheControl: '3600', 
            upsert: false,
            contentType: file.type 
          });
          
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('bills').getPublicUrl(uniquePath);
        const detectedCategory = categories.find((c) => c.name?.toLowerCase() === extracted.category.toLowerCase()) || categories.find((c) => c.name?.toLowerCase() === 'other') || null;

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
            currency: extracted.currency || 'INR',
            description: extracted.description || file.name,
            expense_date: extracted.date,
            ocr_text: extractedText,
            ocr_confidence: extracted.confidence
          };
          const { error: expenseError } = await supabase.from('expenses').insert([expensePayload]);
          if (expenseError) throw expenseError;
        }

        setOcrStatus('DONE');
        await fetchData();
      } catch (error: unknown) {
        setOcrStatus('FAILED');
        console.error('Upload Process Failed:', error);
        alert(`Error uploading bill: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setUploading(false);
      }
    }
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const avatarInitial = userName.trim().charAt(0).toUpperCase() || 'U';
  const selectedRange = useMemo(() => getDateRange(dateFilter, customStart, customEnd), [dateFilter, customStart, customEnd]);
  const filteredExpenses = useMemo(() => expenses.filter((e) => isInRange(e.expense_date, selectedRange.start, selectedRange.end)), [expenses, selectedRange]);
  
  const analytics = useMemo(() => calculateAnalytics(filteredExpenses), [filteredExpenses]);
  const categoryChartData = Object.entries(analytics.categoryBreakdown || {}).map(([name, value]: any) => ({ name, value })).slice(0, 8);
  const trendChartData = useMemo(() => buildTrendData(filteredExpenses, dateFilter).slice(-24), [filteredExpenses, dateFilter]);

  if (loadingCheck) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-sans">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              {avatarInitial}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Welcome, {userName}!</h1>
              {family && <p className="text-gray-600 text-sm">{family.name} • <span className="capitalize">{userRole.toLowerCase()}</span></p>}
            </div>
          </div>
          <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white font-medium px-6 py-2 rounded-lg transition-colors shadow-md">
            Logout
          </button>
        </div>

        <div className="space-y-8">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Ledger Overview</h2>
              <p className="text-sm text-gray-500">Totals update based on the selected period.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['week', 'month', 'year', 'all', 'custom'] as DateFilter[]).map((filter) => (
                <button key={filter} onClick={() => setDateFilter(filter)} className={`px-4 py-2 rounded-lg text-sm font-medium border ${dateFilter === filter ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  {filter === 'all' ? 'All time' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"><p className="text-gray-600 text-sm font-medium">Total Spending</p><p className="text-3xl font-bold text-gray-900 mt-2">{formatMoney(analytics.totalAmount)}</p></div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"><p className="text-gray-600 text-sm font-medium">Expense Count</p><p className="text-3xl font-bold text-gray-900 mt-2">{analytics.expenseCount}</p></div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"><p className="text-gray-600 text-sm font-medium">Avg Expense</p><p className="text-3xl font-bold text-gray-900 mt-2">{formatMoney(analytics.averageExpense)}</p></div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"><p className="text-gray-600 text-sm font-medium">Top Category</p><p className="text-3xl font-bold text-gray-900 mt-2 truncate">{analytics.topCategory}</p></div>
          </div>

          {categoryChartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending by Category</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart><Pie data={categoryChartData} cx="50%" cy="50%" labelLine={false} label={(e: any) => `${e.name}: ${formatMoney(e.value)}`} outerRadius={100} dataKey="value">{categoryChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trendChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="total" fill="#3B82F6" /></BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📸 Upload New Bill</h3>
            <div {...getRootProps()} className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center cursor-pointer hover:bg-blue-50 transition-colors">
              <input {...getInputProps()} />
              <p className="text-gray-600">{uploading ? 'Processing OCR and saving...' : 'Drag and drop a bill image/PDF or click to browse'}</p>
            </div>
            {ocrSummary && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4"><p className="text-green-900 text-xs font-semibold uppercase">Total</p><p className="text-xl font-bold mt-1">{ocrSummary.amount !== null ? formatMoney(ocrSummary.amount) : 'Review'}</p></div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4"><p className="text-blue-900 text-xs font-semibold uppercase">Category</p><p className="text-lg font-semibold mt-1">{ocrSummary.category}</p></div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4"><p className="text-purple-900 text-xs font-semibold uppercase">Date</p><p className="text-lg font-semibold mt-1">{ocrSummary.date}</p></div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4"><p className="text-gray-600 text-xs font-semibold uppercase">Confidence</p><p className="text-lg font-semibold mt-1">{Math.round((ocrSummary.confidence || 0) * 100)}%</p></div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">✏️ Add Manual Expense</h3>
              <button onClick={() => setShowExpenseForm(!showExpenseForm)} className="text-blue-600 text-sm hover:underline">{showExpenseForm ? 'Cancel' : 'Add Expense'}</button>
            </div>
            {showExpenseForm && (
              <form onSubmit={handleSubmitExpense} className="space-y-4">
                <input type="number" placeholder="Amount" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2" step="0.01" required />
                <select value={expenseForm.category_id} onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2" required>
                  <option value="">Select Category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2" />
                <textarea placeholder="Description" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2" />
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg">Save Expense</button>
              </form>
            )}
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
             <h3 className="text-lg font-semibold text-gray-900 mb-4">💰 Expense Ledger</h3>
             {filteredExpenses.length === 0 ? <p className="text-gray-500">No expenses recorded yet.</p> : (
               <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                   <thead className="border-b"><tr className="text-gray-600"><th className="py-3 px-4">Date</th><th className="py-3 px-4">Category</th><th className="py-3 px-4">Description</th><th className="py-3 px-4 text-right">Amount</th></tr></thead>
                   <tbody>
                     {filteredExpenses.map((exp) => (
                       <tr key={exp.id} className="border-b last:border-0 hover:bg-gray-50">
                         <td className="py-3 px-4">{new Date(exp.expense_date).toLocaleDateString()}</td>
                         <td className="py-3 px-4">{exp.categories?.name || 'Uncategorized'}</td>
                         <td className="py-3 px-4">{exp.description || '—'}</td>
                         <td className="py-3 px-4 text-right font-medium">{formatMoney(Number(exp.amount), 'INR')}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}