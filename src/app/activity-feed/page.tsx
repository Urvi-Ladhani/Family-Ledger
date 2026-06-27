'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const supabase = createClient();

export default function ActivityFeed() {
  const router = useRouter();
  const [dbLogs, setDbLogs] = useState<any[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>(''); 
  
  // Quick-View Modal & Audio State
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    setUserId(user.id);
    
    const { data: profile } = await supabase.from('users').select('family_id, full_name').eq('id', user.id).maybeSingle();
    if (!profile || !profile.family_id) return router.push('/join-family');
    
    // Grab the user's first name for comparisons
    setUserName(profile.full_name?.split(' ')[0] || profile.full_name || '');
    
    // Fetch normal history
    const { data: logData } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('family_id', profile.family_id)
      .order('created_at', { ascending: false });
      
    // Fetch recurring expenses for "Future Casting"
    const { data: recurringData } = await supabase
      .from('expenses')
      .select('*, users(full_name)')
      .eq('family_id', profile.family_id)
      .eq('is_recurring', true);

    setDbLogs(logData || []);
    setRecurringExpenses(recurringData || []);
    setLoading(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const unifiedFeed = useMemo(() => {
    const allItems: any[] = [...dbLogs];
    const today = new Date();

    // 1. FUTURE PREDICTIONS
    recurringExpenses.forEach(exp => {
      const origDate = new Date(exp.expense_date);
      let nextDate = new Date(today.getFullYear(), today.getMonth(), origDate.getDate());
      if (nextDate <= today) nextDate = new Date(today.getFullYear(), today.getMonth() + 1, origDate.getDate());
      const diffDays = Math.ceil(Math.abs(nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 31) {
        allItems.push({
          id: `future-${exp.id}`, action_type: 'future', user_name: 'AI Prediction',
          description: `Upcoming: ${exp.users?.full_name?.split(' ')[0] || 'Someone'} will be charged ₹${exp.amount} for "${exp.description}".`,
          days_away: diffDays, created_at: nextDate.toISOString()
        });
      }
    });

    // 2. SHOWCASE LOGS
    if (allItems.length > 0) {
      allItems.push({
        id: 'dummy-milestone', action_type: 'milestone', user_name: 'System Assistant',
        title: 'Weekly Wrap-Up 🎉', description: `Your family logged ${dbLogs.length} events this week. Transparency leads to better savings!`,
        created_at: new Date(today.getTime() - 1000 * 60 * 60 * 12).toISOString()
      });
      allItems.push({
        id: 'dummy-admin', action_type: 'admin', user_name: 'Workspace Admin',
        description: 'Updated the family workspace settings and invited a new member.',
        created_at: new Date(today.getTime() - 1000 * 60 * 60 * 24).toISOString()
      });
      allItems.push({
        id: 'dummy-system', action_type: 'system', user_name: 'System Log',
        description: 'New device login detected from Chrome on Windows.',
        created_at: new Date(today.getTime() - 1000 * 60 * 60 * 48).toISOString()
      });
    }

    return allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [dbLogs, recurringExpenses]);

  // VOICE NOTE LOGIC
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudioNote(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start(); setIsRecording(true);
    } catch (err) { alert("Microphone access denied."); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); }
  };

  const uploadAudioNote = async (blob: Blob) => {
    if (!selectedLog) return;
    setIsUploadingAudio(true);
    try {
      const fileName = `${Date.now()}_voice.webm`;
      const { error: uploadError } = await supabase.storage.from('voice_notes').upload(fileName, blob);
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from('voice_notes').getPublicUrl(fileName);
      
      await supabase.from('activity_logs').update({ audio_url: publicUrlData.publicUrl }).eq('id', selectedLog.id);
      setSelectedLog({ ...selectedLog, audio_url: publicUrlData.publicUrl });
      setDbLogs(prev => prev.map(l => l.id === selectedLog.id ? { ...l, audio_url: publicUrlData.publicUrl } : l));
    } catch (e) { alert("Failed to upload voice note."); } finally { setIsUploadingAudio(false); }
  };

  const toggleReaction = async (e: React.MouseEvent, logId: string, type: 'like' | 'acknowledge') => {
    e.stopPropagation();
    if (!userId) return;
    const log = dbLogs.find(l => l.id === logId);
    if (!log) return;
    const currentList = log.reactions?.[type] || [];
    const hasReacted = currentList.includes(userId);
    const newList = hasReacted ? currentList.filter((id: string) => id !== userId) : [...currentList, userId];
    const newReactions = { ...log.reactions, [type]: newList };
    
    setDbLogs(prev => prev.map(l => l.id === logId ? { ...l, reactions: newReactions } : l));
    await supabase.from('activity_logs').update({ reactions: newReactions }).eq('id', logId);
  };

  if (loading) return <div className="min-h-screen bg-[#F4F6F5] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A4D2E]"></div></div>;

  return (
    <div className="min-h-screen flex bg-[#F4F6F5] font-sans text-gray-900 overflow-hidden relative">
      
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
          <Link href="/activity-feed" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1A4D2E] text-white font-medium shadow-md shadow-[#1A4D2E]/20 transition-all">
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
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
          
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Master Feed</h1>
              <p className="text-gray-500 mt-1">Every transaction, prediction, and system update in one place.</p>
            </div>
          </div>

          <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-8">
            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-gray-200 before:via-gray-100 before:to-transparent">
              
              {unifiedFeed.map((log: any) => {
                const type = (log.action_type || '').toLowerCase();
                const isExpense = type.includes('expense');
                
                // FUTURE PREDICTION BLOCK
                if (type === 'future') {
                  return (
                    <div key={log.id} className="relative flex items-start group">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 border-4 border-white shadow-sm shrink-0 z-10 text-white">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      </div>
                      <div className="ml-6 w-full pt-1">
                        <div className="bg-gradient-to-r from-purple-50 to-indigo-50/50 border border-purple-100/50 rounded-2xl p-5 shadow-sm transform hover:scale-[1.01] transition-transform cursor-default">
                          <div className="flex justify-between items-center mb-1">
                            <h3 className="font-bold text-purple-900 flex items-center gap-2">🔮 Predictive Alert</h3>
                            <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">In {log.days_away} days</span>
                          </div>
                          <p className="text-purple-800 text-sm leading-relaxed">{log.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                // MILESTONE BLOCK
                if (type === 'milestone') {
                  return (
                    <div key={log.id} className="relative flex items-start group">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 to-orange-400 border-4 border-white shadow-sm shrink-0 z-10 text-white">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>
                      </div>
                      <div className="ml-6 w-full pt-1">
                        <div className="bg-gradient-to-r from-[#1A4D2E] to-[#2a7a4a] rounded-2xl p-6 text-white shadow-lg transform hover:scale-[1.01] transition-transform cursor-default">
                          <h3 className="font-bold text-lg mb-1 text-yellow-300">{log.title}</h3>
                          <p className="text-white/90 text-sm leading-relaxed">{log.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                // ADMIN & SYSTEM LOGS...
                if (type === 'admin') {
                  return (
                    <div key={log.id} className="relative flex items-start group">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 border-4 border-white shadow-sm shrink-0 z-10 text-white">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z"></path></svg>
                      </div>
                      <div className="ml-6 w-full pt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-700">{log.user_name}</span>
                          <time className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                        </div>
                        <p className="text-slate-600 text-sm font-medium leading-relaxed">{log.description}</p>
                      </div>
                    </div>
                  );
                }

                if (type === 'system') {
                  return (
                    <div key={log.id} className="relative flex items-start group opacity-70 hover:opacity-100 transition-opacity">
                      <div className="flex items-center justify-center w-8 h-8 ml-1 rounded-full bg-gray-200 border-4 border-white shadow-sm shrink-0 z-10 text-gray-500">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
                      </div>
                      <div className="ml-7 w-full pt-1.5">
                        <p className="text-gray-500 text-xs font-mono">{log.description} • {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  );
                }

                // STANDARD EXPENSE & UPI LOGIC
                let extractedAmount = '0';
                if (isExpense) {
                  const amountMatch = log.description?.match(/₹\s?([\d,.]+)/);
                  if (amountMatch) extractedAmount = amountMatch[1].replace(/,/g, '');
                }
                
                // If it's my expense, I can't pay myself.
                const isMine = log.user_name === userName;
                const canPay = !isMine && Number(extractedAmount) > 0;

                return (
                  <div key={log.id} onClick={() => setSelectedLog(log)} className="relative flex items-start group cursor-pointer hover:bg-gray-50/50 p-2 -ml-2 rounded-2xl transition-colors">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-50 border-4 border-white shadow-sm shrink-0 z-10 text-[#1A4D2E] mt-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    </div>
                    
                    <div className="ml-6 w-full pt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-gray-900">{log.user_name}</span>
                        <time className="text-xs font-bold text-[#1A4D2E] bg-[#E8F0EB] px-2.5 py-1 rounded-lg border border-[#1A4D2E]/10">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </time>
                      </div>
                      
                      <p className="text-gray-600 text-sm leading-relaxed mb-4">{log.description}</p>

                      {/* ATTACHMENT BOX & UPI BUTTON */}
                      <div className="flex flex-wrap items-center gap-4 mb-4">
                        
                        {/* Voice Note Trigger Box */}
                        <div className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl p-3 shadow-sm group-hover:border-[#1A4D2E]/30 transition-colors">
                           <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-[#1A4D2E]">
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                           </div>
                           <div>
                             <p className="text-sm font-bold text-gray-900">Expense Recorded</p>
                             <p className="text-xs text-gray-500">Tap to add voice note</p>
                           </div>
                        </div>

                        {/* UPI PAYMENT BUTTON */}
                        {isExpense && (
                          <a 
                            href={canPay ? `upi://pay?pa=demo@upi&pn=${encodeURIComponent(log.user_name)}&am=${extractedAmount}&cu=INR` : '#'}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canPay) {
                                e.preventDefault(); // Stop unclickable button from doing anything
                              } else if (typeof window !== 'undefined' && !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                                alert("UPI links usually only open on mobile devices with UPI apps installed!");
                              }
                            }}
                            className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all font-bold text-sm ${
                              canPay 
                                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-600/20 hover:shadow-lg cursor-pointer' 
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                            {canPay ? `Pay ₹${extractedAmount} via UPI` : `Paid by you (₹${extractedAmount})`}
                          </a>
                        )}
                      </div>

                      {/* MICRO VOICE NOTE PLAYER */}
                      {log.audio_url && (
                        <div className="mb-4 bg-gray-50 rounded-full p-1 border border-gray-100 w-fit" onClick={(e) => e.stopPropagation()}>
                           <audio controls src={log.audio_url} className="h-8 outline-none rounded-full"></audio>
                        </div>
                      )}
                      
                      {/* REACTIONS */}
                      <div className="flex gap-3" onClick={e => e.stopPropagation()}>
                        <button onClick={(e) => toggleReaction(e, log.id, 'like')} className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all border ${log.reactions?.['like']?.includes(userId) ? 'bg-[#E8F0EB] text-[#1A4D2E] border-[#1A4D2E]/20' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                          <svg className="w-4 h-4" fill={log.reactions?.['like']?.includes(userId) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                          {log.reactions?.['like']?.length || 0}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {unifiedFeed.length === 0 && (
                <div className="text-center py-10"><p className="text-gray-500 font-medium">No activity yet.</p></div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* QUICK VIEW & VOICE RECORDER MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm" onClick={() => !isRecording && setSelectedLog(null)}>
          <div className="relative bg-white rounded-[2rem] w-full max-w-md shadow-2xl p-8" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-bold text-gray-900 text-xl">Log Details</h3>
                <p className="text-sm text-gray-500">{new Date(selectedLog.created_at).toLocaleString()}</p>
              </div>
              {!isRecording && (
                <button onClick={() => setSelectedLog(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">✕</button>
              )}
            </div>
            
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 mb-6">
              <p className="text-sm text-[#1A4D2E] font-bold uppercase tracking-wider mb-2">Action by {selectedLog.user_name}</p>
              <p className="text-gray-800 leading-relaxed font-medium">{selectedLog.description}</p>
            </div>

            {/* VOICE RECORDER UI */}
            <div className="mb-6 p-5 rounded-[1.5rem] border border-gray-200 bg-white shadow-sm flex flex-col items-center">
              <p className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">Context Note (Voice)</p>
              
              {selectedLog.audio_url ? (
                <audio controls src={selectedLog.audio_url} className="w-full outline-none"></audio>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  {!isRecording ? (
                    <button 
                      onClick={startRecording} 
                      disabled={isUploadingAudio}
                      className="flex items-center justify-center w-16 h-16 bg-red-50 hover:bg-red-100 text-red-500 rounded-full transition-all disabled:opacity-50 border border-red-100"
                    >
                      {isUploadingAudio ? (
                        <svg className="w-6 h-6 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                      ) : (
                        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                      )}
                    </button>
                  ) : (
                    <button 
                      onClick={stopRecording} 
                      className="flex items-center justify-center w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full animate-pulse transition-all shadow-lg shadow-red-500/40"
                    >
                      <div className="w-4 h-4 bg-white rounded-sm"></div>
                    </button>
                  )}
                  <div className="text-sm font-medium text-gray-500">
                    {isUploadingAudio ? "Saving Note..." : isRecording ? "Recording... (Tap to stop)" : "Hold to add voice note"}
                  </div>
                </div>
              )}
            </div>

            {!isRecording && (
              <button onClick={() => setSelectedLog(null)} className="w-full bg-[#1A4D2E] text-white font-bold py-3.5 rounded-xl hover:bg-[#11331E] transition-colors">
                Close
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}