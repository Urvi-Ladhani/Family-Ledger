'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'

export default function CreateFamilyPage() {
  const [familyName, setFamilyName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const generateJoinCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No user is logged in!")

      let avatarUrl = ''

      if (file) {
        const fileExt = file.name.split('.').pop()
        const filePath = `${user.id}-${Date.now()}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage
          .from('family-avatars')
          .upload(filePath, file)
        
        if (uploadError) {
          console.error("Upload Error:", uploadError)
          throw new Error("Failed to upload image. Check Supabase Storage Policies.")
        }

        const { data } = supabase.storage.from('family-avatars').getPublicUrl(filePath)
        avatarUrl = data.publicUrl
      }

      const joinCode = generateJoinCode()

      const { data: newFamily, error: familyError } = await supabase
        .from('families')
        .insert([{ name: familyName, join_code: joinCode, avatar_url: avatarUrl }])
        .select()
        .single()

      if (familyError) throw familyError

      const { error: userError } = await supabase
        .from('users')
        .update({ family_id: newFamily.id, role: 'Admin' })
        .eq('id', user.id)

      if (userError) throw userError

      setCreatedCode(joinCode)
      router.refresh()

    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (createdCode) {
      navigator.clipboard.writeText(createdCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  /* ── SUCCESS STATE ── */
  if (createdCode) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-[#BDDDFC] px-6 font-sans antialiased overflow-hidden">
        
        {/* UNIFIED BACKGROUND DESIGN */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#BDDDFC] via-[#6A89A7]/40 to-[#384959]/20" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#88BDF2]/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-[300px] w-[300px] rounded-full bg-[#6A89A7]/10 blur-3xl" />

        {/* DARK ACCENT CONTAINER CARD (#384959) */}
        <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[#6A89A7]/40 bg-[#384959] text-center shadow-2xl shadow-slate-950/40">
          <div className="h-1.5 bg-gradient-to-r from-[#88BDF2] via-[#6A89A7] to-[#BDDDFC]" />
          <div className="p-8">

            {/* success icon overlay theme */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#88BDF2]/20 shadow-md">
              <svg className="h-7 w-7 text-[#88BDF2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-white">Family Created! 🎉</h2>
            <p className="mt-1 text-sm text-[#BDDDFC]">Share this code so family members can join.</p>

            {/* code token visualization field */}
            <div className="my-6 rounded-xl border border-[#6A89A7]/40 bg-slate-950/30 py-5 text-2xl font-bold tabular-nums tracking-widest text-[#88BDF2] shadow-sm">
              {createdCode}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-all active:scale-[0.98] focus:outline-none ${
                  copied
                    ? 'bg-[#6A89A7] text-white hover:bg-[#6A89A7]/90'
                    : 'bg-slate-950/40 border border-[#6A89A7]/30 hover:bg-slate-950/60 text-[#BDDDFC]'
                }`}
              >
                {copied ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9H10.5a1.125 1.125 0 00-1.125 1.125v3.375" />
                  </svg>
                )}
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
              
              <button
                onClick={() => router.push('/dashboard')}
                className="flex-1 rounded-xl bg-[#88BDF2] px-5 py-2.5 text-sm font-bold text-[#384959] shadow-md transition-all hover:bg-[#88BDF2]/90 active:scale-[0.98] focus:outline-none"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  /* ── FORM STATE ── */
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#BDDDFC] px-6 font-sans antialiased overflow-hidden">
      
      {/* UNIFIED BACKGROUND DESIGN */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#BDDDFC] via-[#6A89A7]/40 to-[#384959]/20" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#88BDF2]/10 blur-3xl" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-[300px] w-[300px] rounded-full bg-[#6A89A7]/10 blur-3xl" />

      {/* CARD CONTAINER (Dark Slate #384959) */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[#6A89A7]/40 bg-[#384959] shadow-2xl shadow-slate-950/40">
        <div className="h-1.5 bg-gradient-to-r from-[#88BDF2] via-[#6A89A7] to-[#BDDDFC]" />
        <div className="p-8">

          {/* header nodes */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#88BDF2]/20">
              <svg className="h-6 w-6 text-[#88BDF2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#88BDF2]">Step 1 of 1</p>
              <h2 className="text-xl font-bold tracking-tight text-white">Create Your Family</h2>
            </div>
          </div>

          <form onSubmit={handleCreate} className="flex flex-col gap-5">

            {/* avatar picture profile element view slot */}
            <div className="flex flex-col items-center gap-3">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-24 w-24 rounded-full border-2 border-[#88BDF2] object-cover shadow-md"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#6A89A7]/30 to-[#BDDDFC]/20 shadow-sm">
                  <svg className="h-9 w-9 text-[#6A89A7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                </div>
              )}

              <label className="cursor-pointer rounded-xl border border-[#6A89A7]/40 bg-slate-950/20 px-4 py-2 text-sm font-semibold text-[#BDDDFC] shadow-sm transition-all hover:border-[#88BDF2] hover:bg-slate-950/40 hover:text-white active:scale-[0.98]">
                Choose Photo
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            {/* family target input form element */}
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6A89A7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <input
                type="text"
                placeholder="Enter Family Name"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                required
                className="w-full rounded-xl border border-[#6A89A7]/40 bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#384959] placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-[#88BDF2] focus:border-[#88BDF2] transition-all shadow-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#88BDF2] px-4 py-2.5 text-sm font-bold text-[#384959] shadow-md transition-all hover:bg-[#88BDF2]/90 hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none"
            >
              {loading && (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {loading ? 'Creating…' : 'Create Family'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}