'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const supabase = createClient();

function formatMoney(amount: number | string, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency, maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

export default function FamilyMembers() {
  const router = useRouter();
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('member');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    setUserId(user.id);
    
    const { data: profile } = await supabase.from('users').select('family_id, role, full_name').eq('id', user.id).maybeSingle();
    if (!profile || !profile.family_id) return router.push('/join-family');
    setUserRole(profile.role?.toLowerCase() || 'member');
    
    const { data: familyData } = await supabase.from('families').select('*').eq('id', profile.family_id).maybeSingle();
    setFamily(familyData);

    const { data: memberData } = await supabase.from('users').select('id, full_name, role').eq('family_id', profile.family_id);
    setMembers(memberData || []); 

    // Fetch unsettled expenses for the "Who Owes Whom" calculation
    const { data: unsettledExpenses } = await supabase.from('expenses').select('*').eq('family_id', profile.family_id).eq('is_settled', false);
    setExpenses(unsettledExpenses || []);

    setLoading(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // --- NEW: Dynamic "Who Owes Whom" Math Engine ---
  const balances = useMemo(() => {
    const owes: Record<string, Record<string, number>> = {};
    // Initialize matrix
    members.forEach(m1 => { owes[m1.id] = {}; members.forEach(m2 => { owes[m1.id][m2.id] = 0; }); });

    expenses.forEach(exp => {
      const payerId = exp.user_id;
      const splitArray = exp.split_with || [];
      if (!payerId || splitArray.length === 0) return;

      const splitAmount = Number(exp.amount) / splitArray.length;
      
      splitArray.forEach((borrowerId: string) => {
        if (borrowerId !== payerId && owes[borrowerId] && owes[borrowerId][payerId] !== undefined) {
          owes[borrowerId][payerId] += splitAmount;
        }
      });
    });

    // Simplify balances (If A owes B 100, and B owes A 40 -> A owes B 60)
    const finalBalances: { debtor: any, creditor: any, amount: number }[] = [];
    members.forEach(m1 => {
      members.forEach(m2 => {
        if (m1.id < m2.id) { // Prevent calculating twice
          const m1OwesM2 = owes[m1.id][m2.id];
          const m2OwesM1 = owes[m2.id][m1.id];
          const net = m1OwesM2 - m2OwesM1;
          
          if (net > 0) finalBalances.push({ debtor: m1, creditor: m2, amount: net });
          else if (net < 0) finalBalances.push({ debtor: m2, creditor: m1, amount: Math.abs(net) });
        }
      });
    });

    return finalBalances;
  }, [expenses, members]);


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
          <Link href="/family" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1A4D2E] text-white font-medium shadow-md shadow-[#1A4D2E]/20 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            Family
          </Link>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Family Members</h1>
              <p className="text-gray-500 mt-1">Manage users and view outstanding settlements.</p>
            </div>
            {family?.join_code && (
              <div className="text-right">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Invite Code</p>
                <p className="text-lg font-mono font-bold text-[#1A4D2E] bg-white border border-gray-200 px-4 py-1.5 rounded-lg shadow-sm">{family.join_code}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* LEFT: SETTLEMENTS ENGINE */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">Pending Settlements</h2>
              <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 flex flex-col min-h-[300px]">
                {balances.length > 0 ? (
                  <div className="space-y-4">
                    {balances.map((b, i) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-3">
                            <div className="w-10 h-10 rounded-full border-2 border-white bg-red-100 text-red-600 flex items-center justify-center font-bold text-sm shadow-sm z-10">{b.debtor.full_name.charAt(0)}</div>
                            <div className="w-10 h-10 rounded-full border-2 border-white bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm shadow-sm">{b.creditor.full_name.charAt(0)}</div>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500"><span className="font-bold text-gray-900">{b.debtor.full_name.split(' ')[0]}</span> owes <span className="font-bold text-gray-900">{b.creditor.full_name.split(' ')[0]}</span></p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-[#1A4D2E] text-lg">{formatMoney(b.amount)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="m-auto text-center">
                    <div className="w-16 h-16 bg-[#E8F0EB] text-[#1A4D2E] rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <p className="font-bold text-gray-900">All Settled Up!</p>
                    <p className="text-sm text-gray-500">No one owes anyone money.</p>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: MEMBERS LIST */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">Workspace Members</h2>
              <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-2">
                <div className="space-y-2 p-2">
                  {members.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100 group">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#1A4D2E] to-[#2c7a4b] text-white flex items-center justify-center font-bold text-lg shadow-sm">
                          {member.full_name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{member.full_name} {member.id === userId && <span className="text-xs font-medium text-gray-400 font-normal ml-1">(You)</span>}</p>
                          <p className="text-xs text-gray-500 capitalize">{member.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}