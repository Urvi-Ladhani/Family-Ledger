'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { calculateAnalytics, extractExpenseData } from '@/utils/ocr-processor';

const supabase = createClient();
type DateFilter = 'month' | 'year' | 'all';

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
  const [userRole, setUserRole] = useState<string>('member');
  const [loadingCheck, setLoadingCheck] = useState<boolean>(true);

  // Review & Split Modal State
  const [uploading, setUploading] = useState<boolean>(false);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [reviewData, setReviewData] = useState({
    isOcr: false,
    file: null as File | null,
    extractedText: '',
    amount: '',
    description: '',
    category_id: '',
    expense_date: new Date().toISOString().split('T')[0],
    paid_by: '',
    split_with: [] as string[]
  });

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');

    setUserId(user.id);
    
    const { data: profile } = await supabase.from('users').select('family_id, role, full_name').eq('id', user.id).maybeSingle();
    if (!profile || !profile.family_id) return router.push('/join-family');
    
    setUserName(profile.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');
    setUserRole(profile.role?.toLowerCase() || 'member');
    
    const { data: familyData } = await supabase.from('families').select('*').eq('id', profile.family_id).maybeSingle();
    setFamily(familyData);

    const { data: memberData } = await supabase.from('users').select('id, full_name, role').eq('family_id', profile.family_id);
    setMembers(memberData || []);

    const { data: cats } = await supabase.from('categories').select('*').eq('family_id', profile.family_id).order('name');
    setCategories(cats || []);

    const { data: expenseData } = await supabase.from('expenses').select('*, categories(name), users(full_name)').eq('family_id', profile.family_id).order('expense_date', { ascending: false });
    setExpenses(expenseData || []);

    // Fetch Activity Logs
    const { data: logData } = await supabase.from('activity_logs').select('*').eq('family_id', profile.family_id).order('created_at', { ascending: false }).limit(15);
    setActivityFeed(logData || []);

    setLoadingCheck(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const logActivity = async (actionType: string, description: string) => {
    if (!family) return;
    await supabase.from('activity_logs').insert([{
      family_id: family.id,
      user_name: userName,
      action_type: actionType,
      description: description
    }]);
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from the family?`)) return;
    try {
      await supabase.from('users').update({ family_id: null, role: 'member' }).eq('id', memberId);
      await logActivity('removed', `Admin removed ${memberName} from the family.`);
      await fetchData();
    } catch (error) {
      alert('Failed to remove member.');
    }
  };

  const handleToggleRole = async (memberId: string, currentRole: string, memberName: string) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    if (!confirm(`Are you sure you want to change ${memberName}'s role to ${newRole}?`)) return;
    try {
      await supabase.from('users').update({ role: newRole }).eq('id', memberId);
      await logActivity('role_change', `Admin changed ${memberName}'s role to ${newRole}.`);
      await fetchData();
    } catch (error) {
      alert('Failed to change role.');
    }
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
      let lastY = -1;
      let pageText = '';
      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        const currentY = Math.round((item as any).transform[5] / 5) * 5; 
        if (lastY !== -1 && currentY !== lastY) pageText += '\n'; 
        else if (lastY !== -1 && pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) pageText += ' '; 
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
    await page.render({ canvasContext: context!, viewport: viewport, canvas: canvas } as any).promise;
    return canvas.toDataURL('image/jpeg');
  };

  const extractTextFromImage = async (imageSource: File | string): Promise<string> => {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1);
    const { data: { text } } = await worker.recognize(imageSource);
    await worker.terminate();
    return text;
  };

  // --- Handlers for Modal ---
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
        } else if (file.type.startsWith('image/')) {
          extractedText = await extractTextFromImage(file);
        }

        const parsedExpense = extractExpenseData(extractedText);
        const detectedCategory = categories.find((c) => c.name?.toLowerCase() === parsedExpense.category.toLowerCase())?.id || '';

        setReviewData({
          isOcr: true,
          file: file,
          extractedText: extractedText,
          amount: parsedExpense.amount ? String(parsedExpense.amount) : '',
          description: file.name,
          category_id: detectedCategory,
          expense_date: parsedExpense.date || new Date().toISOString().split('T')[0],
          paid_by: userId,
          split_with: members.map(m => m.id)
        });
        setShowReviewModal(true);
      } catch (error) {
        alert('Error processing file.');
      } finally {
        setUploading(false);
      }
    }
  });

  const openManualModal = () => {
    if (!userId) return;
    setReviewData({
      isOcr: false,
      file: null,
      extractedText: '',
      amount: '',
      description: '',
      category_id: '',
      expense_date: new Date().toISOString().split('T')[0],
      paid_by: userId,
      split_with: members.map(m => m.id)
    });
    setShowReviewModal(true);
  };

  const toggleSplitMember = (id: string) => {
    setReviewData(prev => ({
      ...prev,
      split_with: prev.split_with.includes(id) ? prev.split_with.filter(m => m !== id) : [...prev.split_with, id]
    }));
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!family) return;

    try {
      let billId = null;

      // 1. Process OCR File Upload if applicable
      if (reviewData.isOcr && reviewData.file) {
        const fileExt = reviewData.file.name.split('.').pop();
        const uniquePath = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('bills').upload(uniquePath, reviewData.file, { contentType: reviewData.file.type });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('bills').getPublicUrl(uniquePath);
        const { data: newBill } = await supabase.from('bills').insert([{
          family_id: family.id,
          user_id: reviewData.paid_by,
          filename: reviewData.file.name,
          file_url: urlData.publicUrl,
          ocr_text: reviewData.extractedText,
          status: 'processed',
          category_id: reviewData.category_id || null,
          extracted_amount: parseFloat(reviewData.amount),
          extracted_date: reviewData.expense_date
        }]).select('id').single();
        
        billId = newBill?.id;
      }

      // 2. Format Splitwise Description
      const payerName = members.find(m => m.id === reviewData.paid_by)?.full_name || 'Someone';
      const splitNames = members.filter(m => reviewData.split_with.includes(m.id) && m.id !== reviewData.paid_by).map(m => m.full_name.split(' ')[0]).join(', ');
      
      let finalDescription = reviewData.description;
      if (splitNames.length > 0) {
        finalDescription = `${reviewData.description} (Split with ${splitNames})`;
      }

      // 3. Insert Expense
      await supabase.from('expenses').insert([{
        family_id: family.id,
        user_id: reviewData.paid_by, // Assigns the expense to whoever was selected in the dropdown
        bill_id: billId,
        category_id: reviewData.category_id || null,
        amount: parseFloat(reviewData.amount),
        currency: 'INR',
        description: finalDescription,
        expense_date: reviewData.expense_date,
      }]);

      await logActivity('expense', `${payerName} added a ${formatMoney(reviewData.amount)} expense: ${reviewData.description}`);

      setShowReviewModal(false);
      await fetchData();
    } catch (error) {
      alert('Failed to save expense.');
    }
  };

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

  if (loadingCheck) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hello, {userName}</h1>
            <p className="text-gray-500 text-sm">{family?.name} Family</p>
          </div>
          <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors bg-gray-100 hover:bg-red-50 px-4 py-2 rounded-lg">Logout</button>
        </div>

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col sm:flex-row gap-4">
              <div {...getRootProps()} className={`flex-1 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${uploading ? 'border-gray-300 bg-gray-50' : 'border-blue-200 bg-blue-50/50 hover:bg-blue-50'}`}>
                <input {...getInputProps()} disabled={uploading} />
                <p className="text-sm font-medium text-blue-800">{uploading ? 'Processing OCR...' : 'Upload Receipt (OCR)'}</p>
                <p className="text-xs text-blue-600/70 mt-1">{uploading ? 'Extracting text and amount' : 'PDF, JPG, PNG'}</p>
              </div>
              <div onClick={openManualModal} className="flex-1 border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 rounded-xl p-6 text-center cursor-pointer transition-colors flex items-center justify-center flex-col">
                <p className="text-sm font-medium text-gray-800">Add Manual Expense</p>
                <p className="text-xs text-gray-500 mt-1">Type it out</p>
              </div>
            </div>

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
                    {expenses.slice(0, 15).map((exp) => (
                      <tr key={exp.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-6 font-medium text-gray-900 max-w-[200px] truncate">{exp.description || '—'}</td>
                        <td className="py-4 px-6 text-gray-600">{exp.categories?.name || 'Other'}</td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                            {exp.users?.full_name?.split(' ')[0] || 'Unknown'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-gray-500">{new Date(exp.expense_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                        <td className="py-4 px-6 text-right font-bold text-gray-900">{formatMoney(exp.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {expenses.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">No expenses yet. Upload a bill to get started!</div>}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Activity Feed</h3>
              <div className="space-y-4">
                {activityFeed.map((log) => (
                  <div key={log.id} className="text-sm border-b border-gray-50 pb-2 last:border-0">
                    <p className="text-gray-800">{log.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(log.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))}
                {activityFeed.length === 0 && <p className="text-sm text-gray-500 text-center py-4">No recent activity.</p>}
              </div>
            </div>

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
                        <p className="text-sm font-semibold text-gray-900">{member.full_name || 'Unknown User'}</p>
                        <p className="text-xs text-gray-500 capitalize">{member.role || 'Member'}</p>
                      </div>
                    </div>
                    {userRole === 'admin' && member.id !== userId && (
                      <div className="flex gap-3 mt-2 pt-2 border-t border-gray-200">
                        <button onClick={() => handleToggleRole(member.id, member.role, member.full_name)} className="text-blue-600 hover:text-blue-800 text-xs font-medium transition-colors">
                          Make {member.role === 'admin' ? 'Member' : 'Admin'}
                        </button>
                        <button onClick={() => handleRemoveMember(member.id, member.full_name)} className="text-red-500 hover:text-red-700 text-xs font-medium transition-colors">
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

      {/* Review & Split Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">{reviewData.isOcr ? 'Review OCR Receipt' : 'Add Manual Expense'}</h2>
              <button onClick={() => setShowReviewModal(false)} className="text-gray-400 hover:text-gray-700">Cancel</button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Description / Title</label>
                <input type="text" value={reviewData.description} onChange={e => setReviewData({...reviewData, description: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Amount (INR)</label>
                  <input type="number" step="0.01" value={reviewData.amount} onChange={e => setReviewData({...reviewData, amount: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2 font-medium" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Date</label>
                  <input type="date" value={reviewData.expense_date} onChange={e => setReviewData({...reviewData, expense_date: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2" required />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Category</label>
                <select value={reviewData.category_id} onChange={e => setReviewData({...reviewData, category_id: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2" required>
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="border-t border-gray-200 pt-4 mt-2">
                <label className="block text-xs font-semibold text-blue-600 uppercase mb-2">Paid By (Who gets paid back?)</label>
                <select value={reviewData.paid_by} onChange={e => setReviewData({...reviewData, paid_by: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-blue-50">
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name} {m.id === userId ? '(You)' : ''}</option>)}
                </select>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-2">
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-3">Split with (Equally)</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {members.map(m => (
                    <label key={m.id} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={reviewData.split_with.includes(m.id)} onChange={() => toggleSplitMember(m.id)} className="w-4 h-4 text-blue-600 rounded" />
                      <span className="text-sm text-gray-700">{m.full_name} {m.id === reviewData.paid_by ? '(Payer)' : ''}</span>
                    </label>
                  ))}
                </div>
                {reviewData.amount && reviewData.split_with.length > 0 && (
                  <div className="mt-3 text-sm font-medium text-blue-800 bg-blue-100 p-2 rounded text-center">
                    Split: {formatMoney(Number(reviewData.amount) / reviewData.split_with.length)} per person
                  </div>
                )}
              </div>

              <button type="submit" className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-3 rounded-xl mt-4 transition-colors">
                Save & Add to Ledger
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}