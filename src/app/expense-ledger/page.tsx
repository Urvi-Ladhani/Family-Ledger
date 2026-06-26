'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient();

function formatMoney(amount: number | string, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(Number(amount) || 0);
}

export default function ExpenseLedger() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPayer, setSelectedPayer] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' });

  // Edit & Preview State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ description: '', amount: '' });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Bulk Actions State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    const { data: profile } = await supabase.from('users').select('family_id').eq('id', user.id).maybeSingle();
    if (!profile || !profile.family_id) return router.push('/join-family');
    
    const { data: familyData } = await supabase.from('families').select('*').eq('id', profile.family_id).maybeSingle();
    setFamily(familyData);

    const { data: expenseData } = await supabase.from('expenses').select('*, categories(id, name), users(id, full_name), bills(file_url)').eq('family_id', profile.family_id);
    setExpenses(expenseData || []); 
    
    const { data: cats } = await supabase.from('categories').select('*').eq('family_id', profile.family_id).order('name');
    setCategories(cats || []);
    
    const { data: mems } = await supabase.from('users').select('id, full_name').eq('family_id', profile.family_id);
    setMembers(mems || []);
    
    setLoading(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Process Data (Search/Filter/Sort)
  const processedExpenses = useMemo(() => {
    let result = [...expenses];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(exp => (exp.description && exp.description.toLowerCase().includes(q)) || (exp.categories?.name && exp.categories.name.toLowerCase().includes(q)));
    }
    if (selectedCategory) result = result.filter(exp => exp.category_id === selectedCategory);
    if (selectedPayer) result = result.filter(exp => exp.user_id === selectedPayer);
    
    if (sortConfig) {
      result.sort((a, b) => {
        if (sortConfig.key === 'amount') return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
        if (sortConfig.key === 'date') return sortConfig.direction === 'asc' ? new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime() : new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime();
        if (sortConfig.key === 'title') return sortConfig.direction === 'asc' ? (a.description || '').localeCompare(b.description || '') : (b.description || '').localeCompare(a.description || '');
        if (sortConfig.key === 'status') return sortConfig.direction === 'asc' ? Number(a.is_settled) - Number(b.is_settled) : Number(b.is_settled) - Number(a.is_settled);
        return 0;
      });
    }
    return result;
  }, [expenses, searchQuery, selectedCategory, selectedPayer, sortConfig]);

  // Handlers
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === processedExpenses.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(processedExpenses.map(e => e.id)));
  };

  const toggleSelectRow = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} expenses?`)) return;
    try {
      await supabase.from('expenses').delete().in('id', Array.from(selectedIds));
      setSelectedIds(new Set());
      await fetchData();
    } catch (e) { alert("Failed to delete."); }
  };

  const handleBulkSettle = async () => {
    try {
      await supabase.from('expenses').update({ is_settled: true }).in('id', Array.from(selectedIds));
      setSelectedIds(new Set());
      await fetchData();
    } catch (e) { alert("Failed to update status."); }
  };

  const toggleSingleSettle = async (id: string, currentStatus: boolean) => {
    try {
      await supabase.from('expenses').update({ is_settled: !currentStatus }).eq('id', id);
      await fetchData();
    } catch (e) { alert("Failed to update status."); }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(26, 77, 46);
    doc.text(`${family?.name || 'Family'} Expense Ledger`, 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

    const tableData = processedExpenses.map(exp => [
      exp.description || 'N/A', exp.categories?.name || 'Other',
      exp.users?.full_name?.split(' ')[0] || 'Unknown',
      new Date(exp.expense_date).toLocaleDateString(),
      exp.is_settled ? 'Settled' : 'Pending',
      `${Number(exp.amount).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 36, head: [['Title', 'Category', 'Paid By', 'Date', 'Status', 'Amount (INR)']],
      body: tableData, theme: 'grid', headStyles: { fillColor: [26, 77, 46] }, styles: { fontSize: 9 }
    });
    doc.save(`${family?.name || 'Family'}_Expenses.pdf`);
  };

  const startEdit = (exp: any) => { setEditingId(exp.id); setEditForm({ description: exp.description, amount: String(exp.amount) }); };
  const saveEdit = async (id: string) => {
    try {
      await supabase.from('expenses').update({ description: editForm.description, amount: parseFloat(editForm.amount) }).eq('id', id);
      setEditingId(null); await fetchData();
    } catch (e) { alert("Failed to update."); }
  };

  if (loading) return <div className="min-h-screen bg-[#F4F6F5] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A4D2E]"></div></div>;

  return (
    <div className="min-h-screen flex bg-[#F4F6F5] font-sans text-gray-900 overflow-hidden relative">
      
      {/* PERFECTED, UNIFIED SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex shrink-0 z-10 shadow-sm">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1A4D2E] rounded-lg flex items-center justify-center text-white font-bold">FL</div>
          <span className="font-bold text-lg tracking-tight">FamilyLedger</span>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <p className="px-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4">Menu</p>
          
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-[#1A4D2E] font-medium transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
            Dashboard
          </Link>
          
          {/* ACTIVE STATE ON EXPENSE LEDGER */}
          <Link href="/expense-ledger" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1A4D2E] text-white font-medium shadow-md shadow-[#1A4D2E]/20 transition-all">
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
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto space-y-6 pb-24">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Expense Ledger</h1>
              <p className="text-gray-500 mt-1">Complete history of all family transactions.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm text-sm font-medium text-gray-600">
                {processedExpenses.length} records
              </div>
              <button onClick={exportToPDF} className="bg-[#1A4D2E] hover:bg-[#11331E] text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md shadow-[#1A4D2E]/20 transition-all flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export PDF
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white rounded-[1.25rem] shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              <input 
                type="text" 
                placeholder="Search descriptions or categories..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-[#1A4D2E] outline-none transition-all"
              />
            </div>
            <div className="flex gap-4 w-full md:w-auto">
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-[#1A4D2E] outline-none cursor-pointer w-full md:w-40">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={selectedPayer} onChange={(e) => setSelectedPayer(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-[#1A4D2E] outline-none cursor-pointer w-full md:w-40">
                <option value="">Paid By Anyone</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-gray-100 text-gray-400 uppercase text-xs font-bold tracking-wider bg-gray-50/50">
                <tr>
                  <th className="py-4 px-6 w-12">
                    <input type="checkbox" checked={processedExpenses.length > 0 && selectedIds.size === processedExpenses.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-[#1A4D2E] focus:ring-[#1A4D2E]" />
                  </th>
                  <th className="py-4 px-6 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('title')}>
                    <div className="flex items-center gap-2">Title & Category {sortConfig?.key === 'title' && <span className="text-[#1A4D2E]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div>
                  </th>
                  <th className="py-4 px-6">Paid By</th>
                  <th className="py-4 px-6 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('date')}>
                    <div className="flex items-center gap-2">Date {sortConfig?.key === 'date' && <span className="text-[#1A4D2E]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div>
                  </th>
                  <th className="py-4 px-6 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('status')}>
                    <div className="flex items-center gap-2">Status {sortConfig?.key === 'status' && <span className="text-[#1A4D2E]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div>
                  </th>
                  <th className="py-4 px-6 text-right cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('amount')}>
                    <div className="flex items-center justify-end gap-2">{sortConfig?.key === 'amount' && <span className="text-[#1A4D2E]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>} Amount</div>
                  </th>
                  <th className="py-4 px-6 w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {processedExpenses.map((exp) => (
                  <tr key={exp.id} className={`transition-colors group ${selectedIds.has(exp.id) ? 'bg-[#E8F0EB]/50' : 'hover:bg-gray-50'}`}>
                    
                    <td className="py-4 px-6">
                      <input type="checkbox" checked={selectedIds.has(exp.id)} onChange={() => toggleSelectRow(exp.id)} className="w-4 h-4 rounded border-gray-300 text-[#1A4D2E] focus:ring-[#1A4D2E]" />
                    </td>

                    {/* EDIT MODE */}
                    {editingId === exp.id ? (
                      <>
                        <td className="py-3 px-6">
                          <input type="text" value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} className="w-full bg-white border border-gray-300 rounded px-3 py-1.5 focus:ring-2 focus:ring-[#1A4D2E] outline-none" autoFocus />
                        </td>
                        <td className="py-3 px-6 text-gray-400 text-xs">Locked</td>
                        <td className="py-3 px-6 text-gray-400 text-xs">Locked</td>
                        <td className="py-3 px-6 text-gray-400 text-xs">Locked</td>
                        <td className="py-3 px-6">
                           <input type="number" value={editForm.amount} onChange={(e) => setEditForm({...editForm, amount: e.target.value})} className="w-full bg-white border border-gray-300 rounded px-3 py-1.5 focus:ring-2 focus:ring-[#1A4D2E] outline-none text-right" />
                        </td>
                        <td className="py-3 px-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => saveEdit(exp.id)} className="text-green-600 hover:text-green-800 font-bold text-xs bg-green-50 px-2 py-1 rounded">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-700 font-bold text-xs bg-gray-200 px-2 py-1 rounded">Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      /* READ MODE */
                      <>
                        <td className="py-4 px-6" onDoubleClick={() => startEdit(exp)}>
                          <p className="font-bold text-gray-900">{exp.description}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{exp.categories?.name || 'Other'}</p>
                        </td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-600 font-bold text-xs">
                            {exp.users?.full_name?.split(' ')[0]}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-gray-500 font-medium">
                          {new Date(exp.expense_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        
                        {/* STATUS BADGE */}
                        <td className="py-4 px-6">
                           <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${exp.is_settled ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                             <span className={`w-1.5 h-1.5 rounded-full ${exp.is_settled ? 'bg-green-500' : 'bg-red-500'}`}></span>
                             {exp.is_settled ? 'Settled' : 'Pending'}
                           </span>
                        </td>

                        <td className="py-4 px-6 text-right font-black text-gray-900 text-base" onDoubleClick={() => startEdit(exp)}>
                          {formatMoney(exp.amount)}
                        </td>
                        <td className="py-4 px-6 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => toggleSingleSettle(exp.id, exp.is_settled)} className="text-gray-400 hover:text-green-600" title="Toggle Settled Status">
                               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </button>
                            {exp.bills?.file_url && (
                              <button onClick={() => setPreviewUrl(exp.bills.file_url)} className="text-gray-400 hover:text-[#1A4D2E]" title="View Receipt">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                              </button>
                            )}
                            <button onClick={() => startEdit(exp)} className="text-gray-400 hover:text-[#1A4D2E]" title="Edit Row">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* FLOATING BULK ACTION BAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-4 rounded-[1.5rem] shadow-2xl flex items-center gap-6 z-40 animate-in slide-in-from-bottom-10 fade-in">
          <span className="font-bold text-sm bg-white/20 px-3 py-1 rounded-lg">{selectedIds.size} Selected</span>
          <div className="flex gap-3 border-l border-white/20 pl-6">
            <button onClick={handleBulkSettle} className="bg-[#1A4D2E] hover:bg-[#11331E] px-4 py-2 rounded-xl text-sm font-bold transition-colors">
              Mark as Settled
            </button>
            <button onClick={handleBulkDelete} className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-xl text-sm font-bold transition-colors">
              Delete
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-white px-2 py-2 text-sm font-bold transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* RECEIPT PREVIEW LIGHTBOX */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/80 backdrop-blur-sm">
          <div className="relative bg-white rounded-[2rem] w-full max-w-4xl h-[85vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Receipt Document</h3>
              <button onClick={() => setPreviewUrl(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">✕</button>
            </div>
            <div className="flex-1 bg-gray-50">
              <iframe src={previewUrl} className="w-full h-full border-0" title="Receipt Preview" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}