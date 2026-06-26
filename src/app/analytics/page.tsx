'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';

const supabase = createClient();

function formatMoney(amount: number | string, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency, maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

const COLORS = ['#1A4D2E', '#3bceb5', '#86efac', '#bbf7d0', '#dcfce7'];

export default function AnalyticsPage() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    const { data: profile } = await supabase.from('users').select('family_id').eq('id', user.id).maybeSingle();
    if (!profile || !profile.family_id) return router.push('/join-family');
    
    const { data: familyData } = await supabase.from('families').select('*').eq('id', profile.family_id).maybeSingle();
    setFamily(familyData);

    const { data: expenseData } = await supabase.from('expenses').select('*, categories(name), users(full_name)').eq('family_id', profile.family_id);
    setExpenses(expenseData || []); 
    setLoading(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // --- Data Processing for Charts ---
  
  // 1. Category Breakdown (Pie Chart)
  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};
    expenses.forEach(exp => {
      const cat = exp.categories?.name || 'Other';
      totals[cat] = (totals[cat] || 0) + Number(exp.amount);
    });
    return Object.keys(totals)
      .map(key => ({ name: key, value: totals[key] }))
      .sort((a, b) => b.value - a.value); // Sort highest to lowest
  }, [expenses]);

  // 2. Spending by Member (Bar Chart)
  const memberData = useMemo(() => {
    const totals: Record<string, number> = {};
    expenses.forEach(exp => {
      const user = exp.users?.full_name?.split(' ')[0] || 'Unknown';
      totals[user] = (totals[user] || 0) + Number(exp.amount);
    });
    return Object.keys(totals).map(key => ({ name: key, total: totals[key] }));
  }, [expenses]);

  // 3. Quick Stats
  const totalSpent = useMemo(() => expenses.reduce((sum, exp) => sum + Number(exp.amount), 0), [expenses]);
  const topCategory = categoryData.length > 0 ? categoryData[0].name : 'N/A';

  if (loading) return <div className="min-h-screen bg-[#F4F6F5] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A4D2E]"></div></div>;

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
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-[#1A4D2E] font-medium transition-all">
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
          <Link href="/analytics" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1A4D2E] text-white font-medium shadow-md shadow-[#1A4D2E]/20 transition-all">
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
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Analytics</h1>
              <p className="text-gray-500 mt-1">Insights into {family?.name}'s spending habits.</p>
            </div>
          </div>

          {/* Quick Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#1A4D2E] rounded-[1.5rem] p-6 shadow-sm text-white flex flex-col justify-between">
              <p className="text-white/80 text-sm font-medium">Total Tracked Expenses</p>
              <p className="text-4xl font-bold mt-2">{formatMoney(totalSpent)}</p>
            </div>
            <div className="bg-white rounded-[1.5rem] p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
              <p className="text-gray-500 text-sm font-medium">Most Expensive Category</p>
              <p className="text-4xl font-bold text-gray-900 mt-2 capitalize">{topCategory}</p>
            </div>
            <div className="bg-white rounded-[1.5rem] p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
              <p className="text-gray-500 text-sm font-medium">Total Transactions</p>
              <p className="text-4xl font-bold text-gray-900 mt-2">{expenses.length}</p>
            </div>
          </div>

          {/* Charts Area */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
            
            {/* Category Donut Chart */}
            <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 flex flex-col">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Spending by Category</h2>
              <div className="h-72 w-full">
                {categoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={110}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value) => formatMoney(value as number)} 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">Not enough data to display.</div>
                )}
              </div>
            </div>

            {/* Member Bar Chart */}
            <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 flex flex-col">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Contributions by Member</h2>
              <div className="h-72 w-full">
                {memberData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={memberData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} dy={10} />
                      <YAxis hide />
                      <Tooltip 
                        cursor={{fill: '#f3f4f6'}}
                        formatter={(value) => [formatMoney(value as number), 'Spent']}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="total" fill="#1A4D2E" radius={[8, 8, 8, 8]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">Not enough data to display.</div>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </main>
    </div>
  );
}