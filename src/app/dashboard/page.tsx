'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { calculateAnalytics, extractExpenseData } from '@/utils/ocr-processor';

const supabase = createClient();
type DateFilter = 'month' | 'year' | 'all';

function formatMoney(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(amount || 0);
}

export default function Dashboard() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [userRole, setUserRole] = useState<string>('member');
  const [loadingCheck, setLoadingCheck] = useState<boolean>(true);

  // OCR & Upload State
  const [uploading, setUploading] = useState<boolean>(false);
  const [ocrStatus, setOcrStatus] = useState<'IDLE' | 'ANALYZING' | 'DONE' | 'FAILED'>('IDLE');
  const [ocrSummary, setOcrSummary] = useState<any>(null);
  
  // Manual Expense State
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ amount: '', category_id: '', description: '', expense_date: new Date().toISOString().split('T')[0] });

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');

    setUserId(user.id);
    
    // Fetch user profile
    const { data: profile } = await supabase.from('users').select('family_id, role, full_name').eq('id', user.id).maybeSingle();
    
    if (!profile || !profile.family_id) return router.push('/join-family');
    
    setUserName(profile.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');
    setUserRole(profile.role?.toLowerCase() || 'member');
    
    // Fetch Family
    const { data: familyData } = await supabase.from('families').select('*').eq('id', profile.family_id).maybeSingle();
    setFamily(familyData);

    // Fetch Members (SAFELY: Removed created_at to prevent silent crashes if column is missing)
    const { data: memberData, error: memberError } = await supabase
      .from('users')
      .select('id, full_name, role')
      .eq('family_id', profile.family_id);
      
    if (memberError) {
      console.error("CRITICAL ERROR FETCHING MEMBERS:", memberError);
    }
    setMembers(memberData || []);

    // Fetch Categories
    const { data: cats } = await supabase.from('categories').select('*').eq('family_id', profile.family_id).order('name');
    setCategories(cats || []);

    // Fetch Expenses with User Info
    const { data: expenseData } = await supabase
      .from('expenses')
      .select('*, categories(name), users(full_name)')
      .eq('family_id', profile.family_id)
      .order('expense_date', { ascending: false });
      
    setExpenses(expenseData || []);
    setLoadingCheck(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // --- Family Management Functions ---
  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from the family?`)) return;
    try {
      const { error } = await supabase.from('users').update({ family_id: null, role: 'member' }).eq('id', memberId);
      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member. Ensure you have the correct permissions.');
    }
  };

  const handleToggleRole = async (memberId: string, currentRole: string, memberName: string) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    if (!confirm(`Are you sure you want to change ${memberName}'s role to ${newRole}?`)) return;
    try {
      const { error } = await supabase.from('users').update({ role: newRole }).eq('id', memberId);
      if (error) throw error;
      await fetchData();
    } catch (error) {
      console.error('Error changing role:', error);
      alert('Failed to change role. Ensure you have the correct permissions.');
    }
  };

  // --- OCR Core Functions ---
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
        const currentY = Math.round((item as any).transform[5] / 5) * 5; 
        
        if (lastY !== -1 && currentY !== lastY) {
          pageText += '\n'; 
        } else if (lastY !== -1 && pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' '; 
        }
        
        pageText += item.str.trim();
        lastY = currentY;
      }
      fullText += pageText + '\n\n';
    }
    return fullText;
  };

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
      canvas: canvas 
    } as any).promise;
    
    return canvas.toDataURL('image/jpeg');
  };

  const extractTextFromImage = async (imageSource: File | string): Promise<string> => {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1);
      const { data: { text } } = await worker.recognize(imageSource);
      await worker.terminate();
      return text;
    } catch (error) {
      console.error('OCR Error:', error);
      throw new Error('Failed to extract text from image');
    }
  };

  // --- Drag and Drop OCR Logic ---
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

        if (file.type === 'application/pdf') {
          extractedText = await extractTextFromPdfNative(file);
          if (extractedText.trim().length < 20) {
             const imageSource = await convertPdfToImage(file);
             extractedText = await extractTextFromImage(imageSource);
          }
        } else if (file.type.startsWith('image/')) {
          extractedText = await extractTextFromImage(file);
        }

        const parsedExpense = extractExpenseData(extractedText);
        extracted = { ...parsedExpense, date: parsedExpense.date || today, description: file.name };
        setOcrSummary(extracted);

        const fileExt = file.name.split('.').pop();
        const uniquePath = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('bills')
          .upload(uniquePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
          
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
            currency: 'INR', 
            description: file.name, 
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

  // --- Manual Expense Logic ---
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !family) return;

    try {
      const selectedCategory = categories.find(c => c.id === expenseForm.category_id);
      await supabase.from('expenses').insert([{
        family_id: family.id,
        user_id: userId,
        amount: parseFloat(expenseForm.amount),
        category_id: expenseForm.category_id || null,
        description: expenseForm.description || `Manual ${selectedCategory?.name || 'Expense'}`,
        expense_date: expenseForm.expense_date,
        currency: 'INR'
      }]);
      setExpenseForm({ amount: '', category_id: '', description: '', expense_date: new Date().toISOString().split('T')[0] });
      setShowExpenseForm(false);
      await fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  // --- Derived Analytics ---
  const analytics = useMemo(() => calculateAnalytics(expenses), [expenses]);
  
  const highestSpender = useMemo(() => {
    const spenderTotals: Record<string, number> = {};
    expenses.forEach(exp => {
      const name = exp.users?.full_name || 'Unknown';
      spenderTotals[name] = (spenderTotals[name] || 0) + Number(exp.amount || 0);
    });
    const sorted = Object.entries(spenderTotals).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? { name: sorted[0][0], total: sorted[0][1] } : { name: 'None', total: 0 };
  }, [expenses]);

  const activityFeed = useMemo(() => {
    const activities: any[] = [];
    expenses.slice(0, 15).forEach(exp => {
      activities.push({
        id: `exp-${exp.id}`,
        type: 'expense',
        text: `${exp.users?.full_name?.split(' ')[0] || 'Someone'} added a ${formatMoney(exp.amount)} ${exp.categories?.name?.toLowerCase() || 'expense'}`,
        date: new Date(exp.created_at || exp.expense_date)
      });
    });
    
    // Safely parse members for the feed without depending on created_at
    members.forEach(member => {
      if (member.created_at) {
        activities.push({
          id: `mem-${member.id}`,
          type: 'join',
          text: `${member.full_name?.split(' ')[0] || 'A user'} joined the family`,
          date: new Date(member.created_at)
        });
      }
    });
    return activities.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8);
  }, [expenses, members]);

  if (loadingCheck) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header (Updated per screenshot) */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hello, {userName}</h1>
            <p className="text-gray-500 text-sm">{family?.name} Family</p>
          </div>
          <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors bg-gray-100 hover:bg-red-50 px-4 py-2 rounded-lg">
            Logout
          </button>
        </div>

        {/* Top Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <p className="text-gray-500 text-sm font-medium mb-1">Total Expenses</p>
            <p className="text-3xl font-bold text-gray-900">{formatMoney(analytics.totalAmount)}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <p className="text-gray-500 text-sm font-medium mb-1">Total Bills</p>
            <p className="text-3xl font-bold text-gray-900">{expenses.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <p className="text-gray-500 text-sm font-medium mb-1">Top Category</p>
            <p className="text-3xl font-bold text-blue-600 capitalize">{analytics.topCategory}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <p className="text-gray-500 text-sm font-medium mb-1">Highest Spender</p>
            <p className="text-3xl font-bold text-gray-900 truncate">{highestSpender.name}</p>
          </div>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Actions & Ledger */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Action Bar: Upload & Add Manual */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col sm:flex-row gap-4">
              <div {...getRootProps()} className={`flex-1 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${uploading ? 'border-gray-300 bg-gray-50' : 'border-blue-200 bg-blue-50/50 hover:bg-blue-50'}`}>
                <input {...getInputProps()} disabled={uploading} />
                <div className="flex justify-center mb-2">
                  <svg className={`w-6 h-6 ${uploading ? 'text-gray-400 animate-spin' : 'text-blue-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                </div>
                <p className="text-sm font-medium text-blue-800">{uploading ? 'Processing OCR...' : 'Upload Receipt (OCR)'}</p>
                <p className="text-xs text-blue-600/70 mt-1">{uploading ? 'Extracting text and amount' : 'PDF, JPG, PNG'}</p>
              </div>
              <div onClick={() => setShowExpenseForm(!showExpenseForm)} className="flex-1 border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 rounded-xl p-6 text-center cursor-pointer transition-colors">
                <div className="flex justify-center mb-2">
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </div>
                <p className="text-sm font-medium text-gray-800">Add Manual Expense</p>
                <p className="text-xs text-gray-500 mt-1">Type it out</p>
              </div>
            </div>

            {/* OCR Success Summary Display */}
            {ocrSummary && ocrStatus === 'DONE' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex justify-between items-center animate-in fade-in">
                <div>
                  <p className="text-green-800 font-medium text-sm">Bill Processed Successfully</p>
                  <p className="text-green-600 text-xs mt-1">Added {formatMoney(ocrSummary.amount)} to {ocrSummary.category}</p>
                </div>
                <button onClick={() => setOcrSummary(null)} className="text-green-600 hover:text-green-800 text-sm">Dismiss</button>
              </div>
            )}

            {/* Hidden Manual Form */}
            {showExpenseForm && (
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-gray-900">New Expense</h3>
                  <button onClick={() => setShowExpenseForm(false)} className="text-xs text-gray-500 hover:text-gray-800">Cancel</button>
                </div>
                <form onSubmit={handleSubmitExpense} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input type="text" placeholder="Title/Description" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="border border-gray-300 rounded-lg px-4 py-2 text-sm" required />
                  <input type="number" placeholder="Amount (₹)" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="border border-gray-300 rounded-lg px-4 py-2 text-sm" step="0.01" required />
                  <select value={expenseForm.category_id} onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })} className="border border-gray-300 rounded-lg px-4 py-2 text-sm" required>
                    <option value="">Select Category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} className="border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  <button type="submit" className="sm:col-span-2 bg-gray-900 hover:bg-gray-800 text-white font-medium py-2 rounded-lg text-sm transition-colors">Save Expense</button>
                </form>
              </div>
            )}

            {/* Shared Expense Ledger */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-semibold text-gray-900">Shared Expense Ledger</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white border-b border-gray-100 text-gray-500 uppercase text-xs font-semibold">
                    <tr>
                      <th className="py-4 px-6">Title</th>
                      <th className="py-4 px-6">Category</th>
                      <th className="py-4 px-6">Paid By</th>
                      <th className="py-4 px-6">Date</th>
                      <th className="py-4 px-6 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenses.slice(0, 10).map((exp) => (
                      <tr key={exp.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-6 font-medium text-gray-900 truncate max-w-[150px]">{exp.description || '—'}</td>
                        <td className="py-4 px-6 text-gray-600">{exp.categories?.name || 'Other'}</td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                            {exp.users?.full_name?.split(' ')[0] || 'Unknown'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-gray-500">{new Date(exp.expense_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                        <td className="py-4 px-6 text-right font-bold text-gray-900">{formatMoney(Number(exp.amount), 'INR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {expenses.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">No expenses yet. Upload a bill to get started!</div>}
              </div>
            </div>
          </div>

          {/* Right Column: Feed & Members */}
          <div className="space-y-6">
            
            {/* Activity Feed */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">Activity Feed</h3>
              <div className="space-y-4">
                {activityFeed.map((activity, i) => (
                  <div key={`${activity.id}-${i}`} className="flex gap-3 text-sm">
                    <div className="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center bg-gray-100 flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    </div>
                    <div>
                      <p className="text-gray-800">{activity.text}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{activity.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
                {activityFeed.length === 0 && <p className="text-sm text-gray-500 text-center py-4">No recent activity.</p>}
              </div>
            </div>

            {/* Family Members (Admin Mgmt) */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-900">Family Members</h3>
                {userRole === 'admin' && <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-1 rounded">Admin</span>}
              </div>
              <div className="space-y-3">
                {members.map(member => (
                  <div key={member.id} className="flex flex-col gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                    <div className="flex items-center justify-between">
                      <div>
                        {/* Safely formatted name and role without dates */}
                        <p className="text-sm font-semibold text-gray-900">{member.full_name || 'Unknown User'}</p>
                        <p className="text-xs text-gray-500 capitalize">{member.role || 'Member'}</p>
                      </div>
                    </div>
                    
                    {/* Admin Controls */}
                    {userRole === 'admin' && member.id !== userId && (
                      <div className="flex gap-3 mt-2 pt-2 border-t border-gray-200">
                        <button 
                          onClick={() => handleToggleRole(member.id, member.role, member.full_name)} 
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium transition-colors"
                        >
                          Make {member.role === 'admin' ? 'Member' : 'Admin'}
                        </button>
                        <button 
                          onClick={() => handleRemoveMember(member.id, member.full_name)} 
                          className="text-red-500 hover:text-red-700 text-xs font-medium transition-colors"
                        >
                          Remove Member
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}