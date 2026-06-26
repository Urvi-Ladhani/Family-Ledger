'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const supabase = createClient();

export default function FamilyMembers() {
  const router = useRouter();
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [userRole, setUserRole] = useState<string>('member');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    setUserId(user.id);
    
    const { data: profile } = await supabase.from('users').select('family_id, role, full_name').eq('id', user.id).maybeSingle();
    if (!profile || !profile.family_id) return router.push('/join-family');
    
    setUserName(profile.full_name || 'User');
    setUserRole(profile.role?.toLowerCase() || 'member');
    
    const { data: familyData } = await supabase.from('families').select('*').eq('id', profile.family_id).maybeSingle();
    setFamily(familyData);

    const { data: memberData } = await supabase.from('users').select('id, full_name, role').eq('family_id', profile.family_id);
    setMembers(memberData || []); setLoading(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const logActivity = async (actionType: string, description: string) => {
    if (!family) return;
    await supabase.from('activity_logs').insert([{ family_id: family.id, user_name: userName, action_type: actionType, description }]);
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName}?`)) return;
    try {
      await supabase.from('users').update({ family_id: null, role: 'member' }).eq('id', memberId);
      await logActivity('removed', `Admin removed ${memberName} from the family.`);
      await fetchData();
    } catch (error) { alert('Failed to remove member.'); }
  };

  const handleToggleRole = async (memberId: string, currentRole: string, memberName: string) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    if (!confirm(`Change ${memberName}'s role to ${newRole}?`)) return;
    try {
      await supabase.from('users').update({ role: newRole }).eq('id', memberId);
      await logActivity('role_change', `Admin changed ${memberName}'s role to ${newRole}.`);
      await fetchData();
    } catch (error) { alert('Failed to change role.'); }
  };

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
          <Link href="/family" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1A4D2E] text-white font-medium shadow-md shadow-[#1A4D2E]/20 transition-all">
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
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Family Members</h1>
              <p className="text-gray-500 mt-1">Manage users in the {family?.name} workspace.</p>
            </div>
            {family?.join_code && (
              <div className="text-right">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Invite Code</p>
                <p className="text-lg font-mono font-bold text-[#1A4D2E] bg-white border border-gray-200 px-4 py-1.5 rounded-lg shadow-sm">{family.join_code}</p>
              </div>
            )}
          </div>

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
                  
                  {userRole === 'admin' && member.id !== userId && (
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleToggleRole(member.id, member.role, member.full_name)} className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        Make {member.role === 'admin' ? 'Member' : 'Admin'}
                      </button>
                      <button onClick={() => handleRemoveMember(member.id, member.full_name)} className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}