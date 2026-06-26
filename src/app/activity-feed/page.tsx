'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const supabase = createClient();

export default function ActivityFeed() {
  const router = useRouter();
  const [feed, setFeed] = useState<any[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  
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
    
    const { data: profile } = await supabase.from('users').select('family_id').eq('id', user.id).maybeSingle();
    if (!profile || !profile.family_id) return router.push('/join-family');
    
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

    setFeed(logData || []);
    setRecurringExpenses(recurringData || []);
    setLoading(false);
  }, [router]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // --- SMART FILTERS ---
  const filteredFeed = useMemo(() => {
    if (filter === 'all') return feed;
    return feed.filter((log: any) => {
      const type = (log.action_type || '').toLowerCase();
      if (filter === 'expense') return type.includes('expense');
      if (filter === 'admin') return type.includes('role') || type.includes('admin');
      if (filter === 'system') return !type.includes('expense') && !type.includes('role') && !type.includes('admin');
      return true;
    });
  }, [feed, filter]);

  // --- FEATURE: FUTURE-CASTING (PREDICTIVE LOGS) ---
  const futureLogs = useMemo(() => {
    if (filter !== 'all') return []; // Only show future cast on the main tab
    
    const upcoming: any[] = [];
    const today = new Date();
    
    recurringExpenses.forEach(exp => {
      // Calculate the next month's due date based on the original expense date
      const origDate = new Date(exp.expense_date);
      let nextDate = new Date(today.getFullYear(), today.getMonth(), origDate.getDate());
      if (nextDate < today) {
        nextDate = new Date(today.getFullYear(), today.getMonth() + 1, origDate.getDate());
      }
      
      // Only show if it's coming up in the next 14 days
      const diffTime = Math.abs(nextDate.getTime() - today.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 14) {
        upcoming.push({
          id: `future-${exp.id}`,
          is_future: true,
          user_name: 'AI Prediction',
          description: `Upcoming Subscription: ${exp.users?.full_name?.split(' ')[0] || 'Someone'} will be charged ₹${exp.amount} for "${exp.description}".`,
          days_away: diffDays,
          created_at: nextDate.toISOString()
        });
      }
    });
    
    // Sort by soonest
    return upcoming.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [recurringExpenses, filter]);


  // --- FEATURE: MICRO VOICE-NOTES (RECORD & UPLOAD) ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudioNote(audioBlob);
        stream.getTracks().forEach(track => track.stop()); // Turn off mic
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAudioNote = async (blob: Blob) => {
    if (!selectedLog) return;
    setIsUploadingAudio(true);
    try {
      const fileName = `${Date.now()}_voice.webm`;
      const { error: uploadError } = await supabase.storage.from('voice_notes').upload(fileName, blob);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('voice_notes').getPublicUrl(fileName);
      
      // Update Database
      await supabase.from('activity_logs').update({ audio_url: publicUrlData.publicUrl }).eq('id', selectedLog.id);
      
      // Update UI State instantly
      setSelectedLog({ ...selectedLog, audio_url: publicUrlData.publicUrl });
      setFeed(prev => prev.map(l => l.id === selectedLog.id ? { ...l, audio_url: publicUrlData.publicUrl } : l));
      
    } catch (e) {
      alert("Failed to upload voice note.");
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const toggleReaction = async (e: React.MouseEvent, logId: string, type: 'like' | 'acknowledge') => {
    e.stopPropagation();
    if (!userId) return;
    const log = feed.find(l => l.id === logId);
    if (!log) return;
    
    const currentList = log.reactions?.[type] || [];
    const hasReacted = currentList.includes(userId);
    const newList = hasReacted ? currentList.filter((id: string) => id !== userId) : [...currentList, userId];
    const newReactions = { ...log.reactions, [type]: newList };
    
    setFeed(prev => prev.map(l => l.id === logId ? { ...l, reactions: newReactions } : l));
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
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
          
          <div className="flex justify-between items-end mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Activity Feed</h1>
              <p className="text-gray-500 mt-1">Updates and history from the family workspace.</p>
            </div>
          </div>

          {/* FILTER TABS */}
          <div className="inline-flex items-center p-1.5 mb-8 bg-white rounded-full shadow-sm border border-gray-100">
            {[
              { id: 'all', label: 'All Activity' },
              { id: 'expense', label: 'Expenses Added' },
              { id: 'admin', label: 'Admin Changes' },
              { id: 'system', label: 'System Logs' }
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-200 ${filter === f.id ? 'bg-[#1A4D2E] text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-8">
            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-gray-200 before:to-transparent">
              
              {/* FUTURE CASTING BLOCKS */}
              {futureLogs.map(log => (
                <div key={log.id} className="relative flex items-start group">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 border-4 border-white shadow-sm shrink-0 z-10 text-white shadow-purple-500/30">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                  <div className="ml-6 w-full pt-1">
                    <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-5 shadow-sm transform transition-transform">
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="font-bold text-purple-900 flex items-center gap-2">🔮 {log.user_name}</h3>
                        <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">In {log.days_away} days</span>
                      </div>
                      <p className="text-purple-800/80 text-sm leading-relaxed">{log.description}</p>
                    </div>
                  </div>
                </div>
              ))}

              {/* STANDARD HISTORICAL LOGS */}
              {filteredFeed.map((log: any) => {
                const isExpense = (log.action_type || '').toLowerCase().includes('expense');
                return (
                  <div 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    className="relative flex items-start group cursor-pointer hover:bg-gray-50/50 p-2 -ml-2 rounded-2xl transition-colors"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-50 border-4 border-white shadow-sm shrink-0 z-10 text-[#1A4D2E] mt-1">
                      {isExpense ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                      )}
                    </div>
                    
                    <div className="ml-6 w-full pt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-gray-900">{log.user_name}</span>
                        <time className="text-xs font-bold text-[#1A4D2E] bg-[#E8F0EB] px-2.5 py-1 rounded-lg border border-[#1A4D2E]/10">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </time>
                      </div>
                      
                      <p className="text-gray-600 text-sm leading-relaxed mb-4">{log.description}</p>

                      {/* MICRO VOICE NOTE PLAYER (IN FEED) */}
                      {log.audio_url && (
                        <div className="mb-4">
                           <audio controls src={log.audio_url} className="h-10 w-full max-w-xs outline-none rounded-full"></audio>
                        </div>
                      )}
                      
                      {/* Interaction Bar */}
                      <div className="flex gap-3">
                        <button 
                          onClick={(e) => toggleReaction(e, log.id, 'like')} 
                          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all border ${log.reactions?.['like']?.includes(userId) ? 'bg-[#E8F0EB] text-[#1A4D2E] border-[#1A4D2E]/20' : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'}`}
                        >
                          <svg className="w-4 h-4" fill={log.reactions?.['like']?.includes(userId) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                          {log.reactions?.['like']?.length || 0}
                        </button>
                        
                        <button 
                          onClick={(e) => toggleReaction(e, log.id, 'acknowledge')} 
                          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all border ${log.reactions?.['acknowledge']?.includes(userId) ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'}`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                          {log.reactions?.['acknowledge']?.length || 0}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {filteredFeed.length === 0 && futureLogs.length === 0 && (
                <div className="text-center flex flex-col items-center py-10">
                   <p className="text-gray-500 font-medium text-lg">No activity found</p>
                </div>
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
              <p className="text-sm text-gray-400 font-bold uppercase tracking-wider mb-2">Action by {selectedLog.user_name}</p>
              <p className="text-gray-800 leading-relaxed font-medium">{selectedLog.description}</p>
            </div>

            {/* VOICE RECORDER UI */}
            <div className="mb-6 p-4 rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col items-center">
              <p className="text-sm font-bold text-gray-600 mb-3 uppercase tracking-wider">Add Context (Voice Note)</p>
              
              {selectedLog.audio_url ? (
                <audio controls src={selectedLog.audio_url} className="w-full outline-none"></audio>
              ) : (
                <div className="flex items-center gap-4">
                  {!isRecording ? (
                    <button 
                      onClick={startRecording} 
                      disabled={isUploadingAudio}
                      className="flex items-center justify-center w-14 h-14 bg-red-100 hover:bg-red-200 text-red-500 rounded-full transition-colors disabled:opacity-50"
                    >
                      {isUploadingAudio ? (
                        <svg className="w-6 h-6 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                      ) : (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                      )}
                    </button>
                  ) : (
                    <button 
                      onClick={stopRecording} 
                      className="flex items-center justify-center w-14 h-14 bg-red-500 hover:bg-red-600 text-white rounded-full animate-pulse transition-colors"
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
                    </button>
                  )}
                  <div className="text-sm text-gray-500">
                    {isUploadingAudio ? "Saving..." : isRecording ? "Recording... (Tap to stop)" : "Tap mic to record"}
                  </div>
                </div>
              )}
            </div>

            {!isRecording && (
              <button onClick={() => setSelectedLog(null)} className="w-full bg-[#1A4D2E] text-white font-bold py-3 rounded-xl hover:bg-[#11331E] transition-colors">
                Close
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}