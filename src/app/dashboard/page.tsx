'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { calculateAnalytics, extractExpenseData } from '@/utils/ocr-processor';
import Link from 'next/link';

const supabase = createClient();

function formatMoney(amount: number | string, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(Number(amount) || 0);
}

export default function Dashboard() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [loadingCheck, setLoadingCheck] = useState<boolean>(true);

  // Review Modal State
  const [uploading, setUploading] = useState<boolean>(false);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [reviewData, setReviewData] = useState({
    isOcr: false, file: null as File | null, extractedText: '', amount: '', description: '',
    category_id: '', expense_date: new Date().toISOString().split('T')[0], paid_by: '', split_with: [] as string[]
  });

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    setUserId(user.id);
    
    const { data: profile } = await supabase.from('users').select('family_id, role, full_name').eq('id', user.id).maybeSingle();
    if (!profile || !profile.family_id) return router.push('/join-family');
    setUserName(profile.full_name?.split(' ')[0] || 'User');
    
    const { data: familyData } = await supabase.from('families').select('*').eq('id', profile.family_id).maybeSingle();
    setFamily(familyData);

    const { data: memberData } = await supabase.from('users').select('id, full_name, role').eq('family_id', profile.family_id);
    setMembers(memberData || []);

    const { data: cats } = await supabase.from('categories').select('*').eq('family_id', profile.family_id).order('name');
    setCategories(cats || []);

    const { data: expenseData } = await supabase.from('expenses').select('*, categories(name), users(full_name)').eq('family_id', profile.family_id).order('expense_date', { ascending: false });
    setExpenses(expenseData || []);

    const { data: logData } = await supabase.from('activity_logs').select('*').eq('family_id', profile.family_id).order('created_at', { ascending: false }).limit(15);
    setActivityFeed(logData || []);

    setLoadingCheck(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const logActivity = async (actionType: string, description: string) => {
    if (!family) return;
    await supabase.from('activity_logs').insert([{ family_id: family.id, user_name: userName, action_type: actionType, description }]);
  };

  // --- OCR Functions ---
  const extractTextFromPdfNative = async (file: File): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      let lastY = -1; let pageText = '';
      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        const currentY = Math.round((item as any).transform[5] / 5) * 5; 
        if (lastY !== -1 && currentY !== lastY) pageText += '\n'; 
        else if (lastY !== -1 && pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) pageText += ' '; 
        pageText += item.str.trim(); lastY = currentY;
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
    canvas.height = viewport.height; canvas.width = viewport.width;
    await page.render({ canvasContext: context!, viewport: viewport, canvas: canvas } as any).promise;
    return canvas.toDataURL('image/jpeg');
  };

  const extractTextFromImage = async (imageSource: File | string): Promise<string> => {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1);
    const { data: { text } } = await worker.recognize(imageSource);
    await worker.terminate(); return text;
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file || !userId || !family) return;
      setUploading(true);
      try {
        let extractedText = '';
        if (file.type === 'application/pdf') {
          extractedText = await extractTextFromPdfNative(file);
          if (extractedText.trim().length < 20) {
             const imageSource = await convertPdfToImage(file);
             extractedText = await extractTextFromImage(imageSource);
          }
        } else if (file.type.startsWith('image/')) { extractedText = await extractTextFromImage(file); }
        const parsedExpense = extractExpenseData(extractedText);
        const detectedCategory = categories.find((c) => c.name?.toLowerCase() === parsedExpense.category.toLowerCase())?.id || '';
        setReviewData({
          isOcr: true, file, extractedText, amount: parsedExpense.amount ? String(parsedExpense.amount) : '',
          description: file.name, category_id: detectedCategory, expense_date: parsedExpense.date || new Date().toISOString().split('T')[0],
          paid_by: userId, split_with: members.map(m => m.id)
        });
        setShowReviewModal(true);
      } catch (error) { alert('Error processing file.'); } finally { setUploading(false); }
    }
  });

  const openManualModal = () => {
    if (!userId) return;
    setReviewData({ isOcr: false, file: null, extractedText: '', amount: '', description: '', category_id: '', expense_date: new Date().toISOString().split('T')[0], paid_by: userId, split_with: members.map(m => m.id) });
    setShowReviewModal(true);
  };

  const toggleSplitMember = (id: string) => {
    setReviewData(prev => ({ ...prev, split_with: prev.split_with.includes(id) ? prev.split_with.filter(m => m !== id) : [...prev.split_with, id] }));
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!family) return;
    try {
      let billId = null;
      if (reviewData.isOcr && reviewData.file) {
        const fileExt = reviewData.file.name.split('.').pop();
        const uniquePath = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        await supabase.storage.from('bills').upload(uniquePath, reviewData.file, { contentType: reviewData.file.type });
        const { data: urlData } = supabase.storage.from('bills').getPublicUrl(uniquePath);
        const { data: newBill } = await supabase.from('bills').insert([{
          family_id: family.id, user_id: reviewData.paid_by, filename: reviewData.file.name, file_url: urlData.publicUrl,
          ocr_text: reviewData.extractedText, status: 'processed', category_id: reviewData.category_id || null,
          extracted_amount: parseFloat(reviewData.amount), extracted_date: reviewData.expense_date
        }]).select('id').single();
        billId = newBill?.id;
      }
      const payerName = members.find(m => m.id === reviewData.paid_by)?.full_name || 'Someone';
      const splitNames = members.filter(m => reviewData.split_with.includes(m.id) && m.id !== reviewData.paid_by).map(m => m.full_name.split(' ')[0]).join(', ');
      let finalDescription = reviewData.description;
      if (splitNames.length > 0) finalDescription = `${reviewData.description} (Split with ${splitNames})`;

      await supabase.from('expenses').insert([{
        family_id: family.id, user_id: reviewData.paid_by, bill_id: billId, category_id: reviewData.category_id || null,
        amount: parseFloat(reviewData.amount), currency: 'INR', description: finalDescription, expense_date: reviewData.expense_date,
      }]);
      await logActivity('expense', `${payerName} added a ${formatMoney(reviewData.amount)} expense: ${reviewData.description}`);
      setShowReviewModal(false); await fetchData();
    } catch (error) { alert('Failed to save expense.'); }
  };

  const analytics = useMemo(() => calculateAnalytics(expenses), [expenses]);
  
  if (loadingCheck) return <div className="min-h-screen bg-[#F4F6F5] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A4D2E]"></div></div>;

  return (
    <div className="min-h-screen flex bg-[#F4F6F5] font-sans text-gray-900 overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex shrink-0 z-10 shadow-sm">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1A4D2E] rounded-lg flex items-center justify-center text-white font-bold">FL</div>
          <span className="font-bold text-lg tracking-tight">FamilyLedger</span>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <p className="px-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4">Menu</p>
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1A4D2E] text-white font-medium shadow-md shadow-[#1A4D2E]/20 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
            Dashboard
          </Link>
          <Link href="/expense-ledger" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-[#1A4D2E] font-medium transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Expense Ledger
          </Link>
          <Link href="/activity-feed" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-[#1A4D2E] font-medium transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Activity Feed
          </Link>
          <Link href="/family" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-[#1A4D2E] font-medium transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            Family
          </Link>
          <p className="px-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-6">General</p>
          <Link href="/analytics" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-[#1A4D2E] font-medium transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            Analytics
          </Link>
          <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-[#1A4D2E] font-medium transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            Settings
          </Link>
        </nav>
        <div className="p-4">
          <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-600 hover:bg-red-50 font-medium transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
              <p className="text-gray-500 mt-1">Plan, track, and accomplish your expenses with ease.</p>
            </div>
          </div>

          {/* Quick Analytics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#1A4D2E] rounded-[1.25rem] p-5 shadow-sm text-white flex flex-col justify-between">
              <p className="text-white/80 text-sm font-medium">Total Expenses</p>
              <p className="text-3xl font-bold mt-2">{formatMoney(analytics.totalAmount)}</p>
            </div>
            <div className="bg-white rounded-[1.25rem] p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <p className="text-gray-500 text-sm font-medium">Total Bills</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{expenses.length}</p>
            </div>
            <div className="bg-white rounded-[1.25rem] p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <p className="text-gray-500 text-sm font-medium">Top Category</p>
              <p className="text-3xl font-bold text-gray-900 mt-2 capitalize">{analytics.topCategory || 'N/A'}</p>
            </div>
            <div className="bg-white rounded-[1.25rem] p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <p className="text-gray-500 text-sm font-medium">Highest Spender</p>
              <p className="text-3xl font-bold text-gray-900 mt-2 truncate">You</p>
            </div>
          </div>

          {/* Actions Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div {...getRootProps()} className={`rounded-[1.25rem] p-5 flex items-center justify-between cursor-pointer transition-all border ${uploading ? 'bg-gray-100 border-gray-200' : 'bg-white border-[#1A4D2E] shadow-[0_4px_14px_rgba(26,77,46,0.08)] hover:shadow-md'}`}>
              <input {...getInputProps()} disabled={uploading} />
              <div>
                <h3 className="font-bold text-[#1A4D2E] text-lg">{uploading ? 'Processing AI OCR...' : 'Upload Receipt (OCR)'}</h3>
                <p className="text-sm text-gray-500">PDF, JPG, PNG</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#1A4D2E]/10 text-[#1A4D2E] flex items-center justify-center">
                <svg className={`w-5 h-5 ${uploading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={uploading ? "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" : "M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"}></path></svg>
              </div>
            </div>
            <div onClick={openManualModal} className="rounded-[1.25rem] bg-white p-5 flex items-center justify-between cursor-pointer transition-all border border-gray-100 shadow-sm hover:shadow-md hover:border-[#1A4D2E]/30">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Add Manual Expense</h3>
                <p className="text-sm text-gray-500">Type it out manually</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              </div>
            </div>
          </div>

          {/* 60/40 Split Area */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* LEFT: Shared Expense Ledger (60%) */}
            <div className="lg:w-[60%] flex flex-col bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-gray-900">Shared Expense Ledger</h2>
                <Link href="/expense-ledger" className="text-sm font-semibold text-[#1A4D2E] hover:underline">Show More</Link>
              </div>
              <div className="flex-1 space-y-4">
                {expenses.slice(0, 3).map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{exp.description || 'Expense'}</p>
                        <p className="text-xs text-gray-500">{exp.categories?.name || 'Other'} • Paid by {exp.users?.full_name?.split(' ')[0]}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#1A4D2E]">{formatMoney(Number(exp.amount), 'INR')}</p>
                    </div>
                  </div>
                ))}
                {expenses.length === 0 && <div className="text-center text-gray-400 text-sm py-4">No expenses yet.</div>}
              </div>
            </div>

            {/* RIGHT: Activity Feed (40%) */}
            <div className="lg:w-[40%] flex flex-col bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-gray-900">Activity Feed</h2>
                <Link href="/activity-feed" className="text-sm font-semibold text-[#1A4D2E] hover:underline">Show More</Link>
              </div>
              <div className="flex-1 space-y-5">
                {activityFeed.slice(0, 3).map((log) => (
                  <div key={log.id} className="flex gap-3">
                    <div className="mt-1 w-2 h-2 rounded-full bg-[#1A4D2E] shrink-0"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 leading-snug">{log.description}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(log.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                    </div>
                  </div>
                ))}
                {activityFeed.length === 0 && <div className="text-center text-gray-400 text-sm py-4">No recent activity.</div>}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* REVIEW & SPLIT MODAL */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">{reviewData.isOcr ? 'Review AI Extraction' : 'Add Expense'}</h2>
              <button onClick={() => setShowReviewModal(false)} className="text-gray-400 hover:text-gray-900">✕</button>
            </div>
            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Title</label>
                <input type="text" value={reviewData.description} onChange={e => setReviewData({...reviewData, description: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:ring-2 focus:ring-[#1A4D2E] outline-none" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Amount (₹)</label>
                  <input type="number" step="0.01" value={reviewData.amount} onChange={e => setReviewData({...reviewData, amount: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-bold focus:ring-2 focus:ring-[#1A4D2E] outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Date</label>
                  <input type="date" value={reviewData.expense_date} onChange={e => setReviewData({...reviewData, expense_date: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:ring-2 focus:ring-[#1A4D2E] outline-none" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Category</label>
                <select value={reviewData.category_id} onChange={e => setReviewData({...reviewData, category_id: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:ring-2 focus:ring-[#1A4D2E] outline-none" required>
                  <option value="">Select</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="border-t border-gray-100 pt-4 mt-2">
                <label className="block text-xs font-bold text-[#1A4D2E] uppercase tracking-wider mb-2">Paid By (Who gets reimbursed?)</label>
                <select value={reviewData.paid_by} onChange={e => setReviewData({...reviewData, paid_by: e.target.value})} className="w-full bg-[#E8F0EB] text-[#1A4D2E] border-0 rounded-xl px-4 py-3 font-bold focus:ring-2 focus:ring-[#1A4D2E] outline-none">
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
              <div className="bg-gray-50 p-4 rounded-[1rem] border border-gray-200 mt-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Split Equally With</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {members.map(m => (
                    <label key={m.id} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={reviewData.split_with.includes(m.id)} onChange={() => toggleSplitMember(m.id)} className="w-4 h-4 text-[#1A4D2E] rounded border-gray-300 focus:ring-[#1A4D2E]" />
                      <span className="text-sm font-medium text-gray-700">{m.full_name}</span>
                    </label>
                  ))}
                </div>
                {reviewData.amount && reviewData.split_with.length > 0 && (
                  <div className="mt-4 text-sm font-bold text-[#1A4D2E] bg-[#E8F0EB] p-2 rounded-lg text-center">
                    Split: {formatMoney(Number(reviewData.amount) / reviewData.split_with.length)} per person
                  </div>
                )}
              </div>
              <button type="submit" className="w-full bg-[#1A4D2E] hover:bg-[#11331E] text-white font-bold py-3.5 rounded-[1rem] mt-4 transition-colors">
                Save Expense
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}