"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client'; 
import { useDropzone } from 'react-dropzone';

const supabase = createClient();

type DashboardTab = 'ledger' | 'family';
type FamilyAction = 'none' | 'creating' | 'joining';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('ledger');
  const [bills, setBills] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [familyAction, setFamilyAction] = useState<FamilyAction>('none');
  const [familyName, setFamilyName] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const dynamicName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';
      setUserName(dynamicName);
      const { data: profile } = await supabase.from('users').select('family_id').eq('id', user.id).maybeSingle();
      if (profile?.family_id) {
        const { data: familyData } = await supabase.from('families').select('*').eq('id', profile.family_id).maybeSingle();
        setFamily(familyData);
      } else { setFamily(null); }
      const { data: billData } = await supabase.from('bills').select('*').order('created_at', { ascending: false });
      setBills(billData || []);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateFamily = async () => {
    if (!familyName.trim() || !userId) { alert("Please enter a valid family name."); return; }
    try {
      const generatedCode = 'FAM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: newFamily, error: famError } = await supabase.from('families').insert([{ name: familyName.trim(), join_code: generatedCode }]).select().single();
      if (famError) throw famError;
      const { error: userError } = await supabase.from('users').update({ family_id: newFamily.id }).eq('id', userId);
      if (userError) throw userError;
      setFamilyName(''); setFamilyAction('none');
      await fetchData();
      alert(`Family created successfully! Share this code: ${generatedCode}`);
    } catch (error: any) { alert(`Error creating family: ${error.message}`); }
  };

  const handleJoinFamily = async () => {
    if (!joinCode.trim() || !userId) { alert("Please enter a family invitation code."); return; }
    try {
      const { data: existingFamily, error: famError } = await supabase.from('families').eq('join_code', joinCode.trim().toUpperCase()).maybeSingle();
      if (famError) throw famError;
      if (!existingFamily) { alert("Invalid code. No matching family group found."); return; }
      const { error: userError } = await supabase.from('users').update({ family_id: existingFamily.id }).eq('id', userId);
      if (userError) throw userError;
      setJoinCode(''); setFamilyAction('none');
      await fetchData();
      alert(`Successfully joined ${existingFamily.name}!`);
    } catch (error: any) { alert(`Error joining family: ${error.message}`); }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0]; if (!file) return;
      setUploading(true);
      try {
        const fileExt = file.name.split('.').pop();
        const uniquePath = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('bills').upload(uniquePath, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('bills').getPublicUrl(uniquePath);
        const { error: dbError } = await supabase.from('bills').insert([{ filename: file.name, file_url: urlData.publicUrl, parse_status: 'DONE' }]);
        if (dbError) throw dbError;
        await fetchData();
      } catch (err: any) { alert(err.message); } finally { setUploading(false); }
    }
  });

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/login'; };
  const avatarInitial = userName.trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className="relative min-h-screen bg-[#BDDDFC] font-sans text-slate-100 antialiased overflow-x-hidden">
      
      {/* UNIFIED DESIGN BACKGROUND LAYER */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#BDDDFC] via-[#6A89A7]/40 to-[#384959]/30" />
      <div className="pointer-events-none absolute left-1/4 top-0 h-[500px] w-[500px] rounded-full bg-[#88BDF2]/15 blur-3xl" />
      <div className="pointer-events-none absolute right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-[#6A89A7]/10 blur-3xl" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">

        {/* ── HEADER CARD ── */}
        <div className="overflow-hidden rounded-2xl border border-[#6A89A7]/40 bg-[#384959] shadow-2xl shadow-slate-950/20 mb-6">
          <div className="h-1.5 bg-gradient-to-r from-[#88BDF2] via-[#6A89A7] to-[#BDDDFC]" />
          <div className="flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#88BDF2] to-[#6A89A7] flex items-center justify-center text-[#384959] font-black text-lg shadow-md ring-4 ring-[#88BDF2]/20">
                  {avatarInitial}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#88BDF2] ring-2 ring-[#384959]" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white">Welcome, {userName}!</h1>
                <p className="text-xs text-[#BDDDFC]">Here&apos;s your family ledger overview.</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl border border-[#6A89A7]/40 bg-slate-950/20 px-4 py-2 text-sm font-semibold text-[#BDDDFC] shadow-sm transition-all hover:border-[#88BDF2] hover:bg-slate-950/40 hover:text-white active:scale-[0.98]"
            >
              <svg className="h-4 w-4 text-[#88BDF2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Logout
            </button>
          </div>
        </div>

        {/* ── PILL TABS — Dark unified wrapper track ── */}
        <div className="mb-6 inline-flex gap-1 rounded-xl bg-slate-950/30 border border-[#6A89A7]/20 p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all ${
              activeTab === 'ledger'
                ? 'bg-[#88BDF2] text-[#384959] font-bold shadow-md'
                : 'text-[#BDDDFC] hover:bg-slate-950/20 hover:text-white'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Bill Ledger
          </button>
          <button
            onClick={() => setActiveTab('family')}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all ${
              activeTab === 'family'
                ? 'bg-[#88BDF2] text-[#384959] font-bold shadow-md'
                : 'text-[#BDDDFC] hover:bg-slate-950/20 hover:text-white'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Manage Family
          </button>
        </div>

        {/* ── LEDGER TAB ── */}
        {activeTab === 'ledger' && (
          <div className="space-y-6">

            {/* Upload Area Card */}
            <div className="overflow-hidden rounded-2xl border border-[#6A89A7]/40 bg-[#384959] shadow-xl">
              <div className="border-b border-[#6A89A7]/20 px-6 py-4">
                <h2 className="text-sm font-bold text-white">Upload New Bill</h2>
              </div>
              <div className="p-6">
                <div
                  {...getRootProps()}
                  className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-all ${
                    isDragActive
                      ? 'border-[#88BDF2] bg-slate-950/40'
                      : 'border-[#6A89A7]/40 bg-slate-950/20 hover:border-[#88BDF2] hover:bg-slate-950/30'
                  }`}
                >
                  <input {...getInputProps()} />
                  {uploading ? (
                    <>
                      <svg className="h-7 w-7 animate-spin text-[#88BDF2]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      <span className="text-sm text-[#BDDDFC]">Uploading to cloud…</span>
                    </>
                  ) : (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#88BDF2]/20">
                        <svg className="h-6 w-6 text-[#88BDF2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-white">
                          <span className="text-[#88BDF2] hover:underline">Click to upload</span> or drag and drop
                        </p>
                        <p className="mt-1 text-xs text-[#BDDDFC]">PDF, PNG, JPG supported</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* History Ledger Table Card */}
            <div className="overflow-hidden rounded-2xl border border-[#6A89A7]/40 bg-[#384959] shadow-xl">
              <div className="border-b border-[#6A89A7]/20 px-6 py-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Bill Ledger History</h2>
                {bills.length > 0 && (
                  <span className="rounded-full bg-[#88BDF2]/20 border border-[#88BDF2]/30 px-2.5 py-0.5 text-xs font-bold text-[#88BDF2]">
                    {bills.length}
                  </span>
                )}
              </div>
              <div className="p-6">
                {bills.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950/20">
                      <svg className="h-6 w-6 text-[#6A89A7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm text-[#BDDDFC]">No bills uploaded yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="border-b border-[#6A89A7]/20">
                        <tr>
                          <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-[#6A89A7]">ID</th>
                          <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-[#6A89A7]">File Name</th>
                          <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-[#6A89A7] text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bills.map((bill) => (
                          <tr key={bill.id} className="border-b border-[#6A89A7]/10 last:border-0 hover:bg-slate-950/10 transition-colors">
                            <td className="py-3.5 text-xs font-mono text-[#6A89A7] tabular-nums">#{bill.id}</td>
                            <td className="py-3.5">
                              <a href={bill.file_url} target="_blank" rel="noreferrer" className="font-semibold text-[#88BDF2] hover:text-[#88BDF2]/80 hover:underline transition-colors">
                                {bill.filename}
                              </a>
                            </td>
                            <td className="py-3.5 text-right">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-950/40 border border-[#6A89A7]/20 px-2.5 py-0.5 text-xs font-bold text-[#88BDF2]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#88BDF2]" />
                                {bill.parse_status || 'DONE'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── FAMILY TAB ── */}
        {activeTab === 'family' && (
          <div className="overflow-hidden rounded-2xl border border-[#6A89A7]/40 bg-[#384959] shadow-xl">
            {family ? (
              <div>
                <div className="border-b border-[#6A89A7]/20 px-6 py-4">
                  <h2 className="text-sm font-bold text-white">Connected Family Workspace</h2>
                </div>
                <div className="p-6">
                  <div className="rounded-xl bg-slate-950/20 border border-[#6A89A7]/20 p-5 space-y-3">
                    <p className="text-sm text-[#BDDDFC]">
                      Family Name: <span className="font-bold text-white">{family.name}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-[#BDDDFC]">Invitation Join Code:</p>
                      <code className="rounded-lg bg-slate-950/40 border border-[#6A89A7]/30 text-[#88BDF2] font-mono font-bold px-3 py-1 text-sm tracking-widest tabular-nums select-all shadow-sm">
                        {family.join_code}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center">
                {familyAction === 'none' && (
                  <>
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#88BDF2]/20">
                      <svg className="h-7 w-7 text-[#88BDF2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <h2 className="text-base font-bold text-white mb-1">You aren&apos;t part of a family yet.</h2>
                    <p className="text-sm text-[#BDDDFC] mb-6">Create a new family group, or join one with an invite code.</p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => setFamilyAction('creating')}
                        className="flex items-center gap-2 rounded-xl bg-[#88BDF2] px-5 py-2.5 text-sm font-bold text-[#384959] shadow-md transition-all hover:bg-[#88BDF2]/90 active:scale-[0.98]"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Create Family
                      </button>
                      <button
                        onClick={() => setFamilyAction('joining')}
                        className="rounded-xl border border-[#6A89A7]/40 bg-slate-950/20 px-5 py-2.5 text-sm font-semibold text-[#BDDDFC] transition-all hover:border-[#88BDF2] hover:text-white active:scale-[0.98]"
                      >
                        Join Family
                      </button>
                    </div>
                  </>
                )}

                {/* Create Family Option Block */}
                {familyAction === 'creating' && (
                  <div className="max-w-sm mx-auto text-left">
                    <h3 className="text-sm font-bold text-white mb-1">Create a Family Group</h3>
                    <p className="text-xs text-[#BDDDFC] mb-4">This initializes a shared ledger instance workspace.</p>
                    <input
                      type="text"
                      placeholder="Enter unique family name"
                      value={familyName}
                      onChange={(e) => setFamilyName(e.target.value)}
                      className="w-full rounded-xl border border-[#6A89A7]/40 bg-white p-2.5 mb-4 text-sm text-[#384959] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#88BDF2] focus:border-[#88BDF2] transition-all shadow-sm"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleCreateFamily} className="flex-1 rounded-xl bg-[#88BDF2] text-[#384959] py-2 text-sm font-bold transition-all hover:bg-[#88BDF2]/90 active:scale-[0.98]">
                        Confirm Create
                      </button>
                      <button onClick={() => setFamilyAction('none')} className="px-4 rounded-xl border border-[#6A89A7]/40 bg-slate-950/20 text-sm font-semibold text-[#BDDDFC] hover:text-white transition-colors">
                        Back
                      </button>
                    </div>
                  </div>
                )}

                {/* Join Family Option Block */}
                {familyAction === 'joining' && (
                  <div className="max-w-sm mx-auto text-left">
                    <h3 className="text-sm font-bold text-white mb-1">Join with Invite Code</h3>
                    <p className="text-xs text-[#BDDDFC] mb-4">Enter the FAM-XXXXXX code from your family admin.</p>
                    <input
                      type="text"
                      placeholder="e.g. FAM-A7X9Q2"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      className="w-full rounded-xl border border-[#6A89A7]/40 bg-white p-2.5 mb-4 text-sm font-mono uppercase tracking-widest text-[#384959] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#88BDF2] focus:border-[#88BDF2] transition-all shadow-sm"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleJoinFamily} className="flex-1 rounded-xl bg-[#88BDF2] text-[#384959] py-2 text-sm font-bold transition-all hover:bg-[#88BDF2]/90 active:scale-[0.98]">
                        Confirm Join
                      </button>
                      <button onClick={() => setFamilyAction('none')} className="px-4 rounded-xl border border-[#6A89A7]/40 bg-slate-950/20 text-sm font-semibold text-[#BDDDFC] hover:text-white transition-colors">
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}