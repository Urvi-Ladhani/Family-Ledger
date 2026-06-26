'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const supabase = createClient();

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [family, setFamily] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    
    const { data: userData } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
    if (!userData || !userData.family_id) return router.push('/join-family');
    
    setProfile({ ...userData, email: user.email });
    
    const { data: familyData } = await supabase.from('families').select('*').eq('id', userData.family_id).maybeSingle();
    setFamily(familyData);

    const { data: cats } = await supabase.from('categories').select('*').eq('family_id', userData.family_id).order('name');
    setCategories(cats || []); 
    setLoading(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !family) return;
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase.from('categories').insert([{
        family_id: family.id,
        name: newCategoryName.trim(),
        created_by: profile.id
      }]);
      
      if (error) throw error;
      setNewCategoryName('');
      await fetchData(); // Refresh the list
    } catch (error) {
      alert('Error adding category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category? (Existing expenses will keep this category text)')) return;
    
    try {
      const { error } = await supabase.from('categories').delete().eq('id', categoryId);
      if (error) throw error;
      await fetchData();
    } catch (error) {
      alert('Error deleting category');
    }
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
          <Link href="/family" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-[#1A4D2E] font-medium transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            Family
          </Link>
          <p className="px-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-6">General</p>
          <Link href="/analytics" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-[#1A4D2E] font-medium transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            Analytics
          </Link>
          <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1A4D2E] text-white font-medium shadow-md shadow-[#1A4D2E]/20 transition-all">
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
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
              <p className="text-gray-500 mt-1">Manage your profile and family categories.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* PROFILE SECTION */}
            <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 flex flex-col h-full">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Profile Details</h2>
              <div className="space-y-4 flex-1">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Full Name</label>
                  <div className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-medium">
                    {profile?.full_name || 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Email Address</label>
                  <div className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-medium">
                    {profile?.email || 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Family Workspace</label>
                  <div className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-medium flex justify-between items-center">
                    <span>{family?.name}</span>
                    <span className="text-xs font-bold text-[#1A4D2E] bg-[#E8F0EB] px-2 py-1 rounded-md">Role: {profile?.role}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CATEGORIES MANAGEMENT SECTION */}
            <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 flex flex-col h-full">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Custom Categories</h2>
              
              <form onSubmit={handleAddCategory} className="mb-6 flex gap-3">
                <input 
                  type="text" 
                  placeholder="e.g., Vacation, Pets..." 
                  value={newCategoryName} 
                  onChange={e => setNewCategoryName(e.target.value)} 
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 font-medium focus:ring-2 focus:ring-[#1A4D2E] outline-none" 
                  required 
                />
                <button type="submit" disabled={isSubmitting} className="bg-[#1A4D2E] hover:bg-[#11331E] text-white font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50">
                  Add
                </button>
              </form>

              <div className="flex-1 overflow-y-auto pr-2 max-h-[300px]">
                <div className="space-y-2">
                  {categories.map(category => (
                    <div key={category.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors group">
                      <span className="font-bold text-gray-700">{category.name}</span>
                      <button 
                        onClick={() => handleDeleteCategory(category.id)} 
                        className="text-red-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete Category"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </div>
                  ))}
                  {categories.length === 0 && <p className="text-sm text-gray-400 text-center mt-4">No custom categories yet.</p>}
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}