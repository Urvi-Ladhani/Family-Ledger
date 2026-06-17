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
      
      const { data: profile } = await supabase
        .from('users')
        .select('family_id')
        .eq('id', user.id)
        .maybeSingle();

      let currentFamilyId = null;

      if (profile?.family_id) {
        const { data: familyData } = await supabase
          .from('families')
          .select('*')
          .eq('id', profile.family_id)
          .maybeSingle();
        setFamily(familyData);
        currentFamilyId = profile.family_id;
      } else {
        setFamily(null);
      }

      let dbQuery = supabase
        .from('bills')
        .select('*, uploader:users(full_name, display_name, email)');

      if (currentFamilyId) {
        dbQuery = dbQuery.eq('family_id', currentFamilyId);
      } else {
        dbQuery = dbQuery.eq('user_id', user.id);
      }

      const { data: billData } = await dbQuery.order('created_at', { ascending: false });
      setBills(billData || []);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateFamily = async () => {
    if (!familyName.trim() || !userId) {
      alert("Please enter a valid family name.");
      return;
    }
    try {
      const generatedCode = 'FAM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const { data: newFamily, error: famError } = await supabase
        .from('families')
        .insert([{ name: familyName.trim(), join_code: generatedCode }])
        .select()
        .single();

      if (famError) throw famError;

      const { error: userError } = await supabase
        .from('users')
        .update({ family_id: newFamily.id })
        .eq('id', userId);

      if (userError) throw userError;

      setFamilyName('');
      setFamilyAction('none');
      await fetchData(); 
      alert(`Family created successfully! Share this code: ${generatedCode}`);
    } catch (error: any) {
      alert(`Error creating family: ${error.message}`);
    }
  };

  const handleJoinFamily = async () => {
    if (!joinCode.trim() || !userId) {
      alert("Please enter a family invitation code.");
      return;
    }
    try {
      const { data: existingFamily, error: famError } = await supabase
        .from('families')
        .eq('join_code', joinCode.trim().toUpperCase())
        .maybeSingle();

      if (famError) throw famError;
      if (!existingFamily) {
        alert("Invalid code. No matching family group found.");
        return;
      }

      const { error: userError } = await supabase
        .from('users')
        .update({ family_id: existingFamily.id })
        .eq('id', userId);

      if (userError) throw userError;

      setJoinCode('');
      setFamilyAction('none');
      await fetchData(); 
      alert(`Successfully joined ${existingFamily.name}!`);
    } catch (error: any) {
      alert(`Error joining family: ${error.message}`);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;
      if (!userId) {
        alert("Authentication context missing. Please re-login.");
        return;
      }
      
      setUploading(true);
      try {
        const fileExt = file.name.split('.').pop();
        const uniquePath = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('bills')
          .upload(uniquePath, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('bills')
          .getPublicUrl(uniquePath);

        const { error: dbError } = await supabase
          .from('bills')
          .insert([
            { 
              filename: file.name, 
              file_url: urlData.publicUrl, 
              parse_status: 'DONE',
              user_id: userId,
              family_id: family?.id || null 
            }
          ]);
        if (dbError) throw dbError;

        await fetchData();
      } catch (err: any) {
        alert(err.message);
      } finally {
        setUploading(false);
      }
    }
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const avatarInitial = userName.trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-gray-50/50 p-8 font-sans text-gray-800">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER SECTION */}
        <div className="flex justify-between items-center pb-6 border-b border-gray-200 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              {avatarInitial}
            </div>
            <h1 className="text-xl font-medium text-gray-900">
              Welcome, {userName}!
            </h1>
          </div>
          <button 
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 text-white font-medium px-5 py-2 rounded-lg transition-colors text-sm shadow-sm"
          >
            Logout
          </button>
        </div>

        {/* NAVIGATION TAB CONTROLS */}
        <div className="flex gap-2 my-6 border-b border-gray-200/60 pb-px">
          <button 
            onClick={() => setActiveTab('ledger')} 
            className={`pb-3 px-4 text-sm font-medium ${activeTab === 'ledger' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
          >
            Bill Ledger (Upload & History)
          </button>
          <button 
            onClick={() => setActiveTab('family')} 
            className={`pb-3 px-4 text-sm font-medium ${activeTab === 'family' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
          >
            Manage Family
          </button>
        </div>

        {/* WORKSPACE CONTENT AREA */}
        <div className="mt-6">
          
          {/* LEDGER WORKSPACE VIEW */}
          {activeTab === 'ledger' && (
            <div className="space-y-8">
              <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Upload New Bill</h2>
                <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input {...getInputProps()} />
                  {uploading ? "Uploading file to cloud bucket..." : "Drag and drop or browse files"}
                </div>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Bill Ledger History</h2>
                {bills.length === 0 ? (
                  <div className="text-sm text-gray-500">No logs or records found for this workspace view.</div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="text-gray-400 border-b">
                      <tr>
                        <th className="pb-3">ID</th>
                        <th className="pb-3">FILE NAME</th>
                        <th className="pb-3">UPLOADED BY</th>
                        <th className="pb-3 text-right">STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((bill) => {
                        const uploaderName = bill.uploader?.full_name || bill.uploader?.display_name || bill.uploader?.email || 'Unknown User';
                        
                        return (
                          <tr key={bill.id} className="border-b last:border-0 text-gray-700 font-medium">
                            <td className="py-4 text-gray-400">#{bill.id}</td>
                            <td className="py-4">
                              <a href={bill.file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                                {bill.filename}
                              </a>
                            </td>
                            <td className="py-4 text-gray-500 font-normal">
                              {uploaderName}
                            </td>
                            <td className="py-4 text-right">
                              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                {bill.parse_status || "DONE"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* FAMILY CONFIGURATION WORKSPACE VIEW */}
          {activeTab === 'family' && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
              {family ? (
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Connected Active Family Workspace</h2>
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                    <p className="text-sm font-medium text-gray-700">Family Name: <span className="font-bold text-gray-900">{family.name}</span></p>
                    <p className="text-sm font-medium text-gray-700">Invitation Join Code: <code className="bg-white border text-blue-600 font-mono font-bold px-2 py-0.5 rounded text-xs select-all">{family.join_code}</code></p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  {familyAction === 'none' && (
                    <>
                      <h2 className="text-lg font-medium text-gray-900 mb-2">You aren't part of a family yet.</h2>
                      <p className="text-gray-500 mb-6">Create a new family to manage, or join an existing one using a code.</p>
                      <div className="flex gap-4 justify-center">
                        <button 
                          onClick={() => setFamilyAction('creating')}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                          Create Family
                        </button>
                        <button 
                          onClick={() => setFamilyAction('joining')}
                          className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                          Join Family
                        </button>
                      </div>
                    </>
                  )}

                  {/* Create View */}
                  {familyAction === 'creating' && (
                    <div className="max-w-sm mx-auto text-left">
                      <h3 className="text-md font-medium text-gray-900 mb-1">Create a Family Group</h3>
                      <p className="text-xs text-gray-500 mb-4">This initializes a shared ledger instance workspace.</p>
                      <input 
                        type="text" 
                        placeholder="Enter unique family name" 
                        value={familyName}
                        onChange={(e) => setFamilyName(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2.5 mb-4 text-sm outline-none focus:border-blue-500 transition-colors" 
                      />
                      <div className="flex gap-2">
                        <button onClick={handleCreateFamily} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium">
                          Confirm Create
                        </button>
                        <button onClick={() => setFamilyAction('none')} className="px-4 border rounded-lg text-sm text-gray-500 hover:bg-gray-50">
                          Back
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Join View */}
                  {familyAction === 'joining' && (
                    <div className="max-w-sm mx-auto text-left">
                      <h3 className="text-md font-medium text-gray-900 mb-1">Join with Verification Token</h3>
                      <p className="text-xs text-gray-500 mb-4">Input the target code (e.g. FAM-XXXXXX).</p>
                      <input 
                        type="text" 
                        placeholder="Enter 10-digit code" 
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2.5 mb-4 text-sm font-mono uppercase tracking-wide outline-none focus:border-blue-500 transition-colors" 
                      />
                      <div className="flex gap-2">
                        <button onClick={handleJoinFamily} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium">
                          Confirm Join
                        </button>
                        <button onClick={() => setFamilyAction('none')} className="px-4 border rounded-lg text-sm text-gray-500 hover:bg-gray-50">
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
    </div>
  );
}