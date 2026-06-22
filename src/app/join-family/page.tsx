'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'

export default function JoinFamilyPage() {
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: family, error: fetchError } = await supabase
      .from('families')
      .select('id')
      .eq('join_code', joinCode.toUpperCase().trim())
      .single()

    if (!family || fetchError) {
      alert("Invalid Join Code. Please check and try again.")
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ family_id: family.id, role: 'Member' })
      .eq('id', user.id)

    if (updateError) {
      alert("Error joining family.")
    } else {
      alert("Successfully joined the family!")
      router.push('/dashboard')
    }

    setLoading(false)
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#BDDDFC] px-6 font-sans antialiased overflow-hidden">

      {/* BACKGROUND GRADIENT & GLOWS */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#BDDDFC] via-[#6A89A7]/40 to-[#384959]/20" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#88BDF2]/10 blur-3xl" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-[300px] w-[300px] rounded-full bg-[#6A89A7]/10 blur-3xl" />

      {/* CARD CONTAINER (Dark Slate #384959) */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[#6A89A7]/40 bg-[#384959] shadow-2xl shadow-slate-950/40">

        {/* Gradient accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-[#88BDF2] via-[#6A89A7] to-[#BDDDFC]" />

        <div className="p-8">

          {/* Icon Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#88BDF2]/20">
              <svg className="h-6 w-6 text-[#88BDF2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#88BDF2]">Invite Code</p>
              <h2 className="text-xl font-bold tracking-tight text-white">Join a Family</h2>
            </div>
          </div>

          <p className="text-sm text-[#BDDDFC] mb-6">
            Ask your Family Admin for their 6-character Join Code and enter it below.
          </p>

          <form onSubmit={handleJoin} className="flex flex-col gap-4">

            {/* Code Input */}
            <input
              type="text"
              placeholder="e.g. A7X9Q2"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              required
              className="w-full rounded-xl border border-[#6A89A7]/40 bg-white py-3 px-3.5 text-center text-base font-mono font-bold uppercase tracking-[0.35em] text-[#384959] placeholder:text-slate-400 placeholder:tracking-widest placeholder:font-mono focus:outline-none focus:ring-1 focus:ring-[#88BDF2] focus:border-[#88BDF2] transition-all shadow-sm"
            />

            {/* Custom Palette Alert Info Field */}
            <div className="flex items-center gap-2.5 rounded-xl bg-slate-950/30 border border-[#6A89A7]/20 px-4 py-3">
              <svg className="h-4 w-4 flex-shrink-0 text-[#88BDF2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <p className="text-xs font-medium text-[#BDDDFC]">
                Codes look like <span className="font-mono font-bold tracking-widest text-white">FAM-A7X9Q2</span> — ask your admin if you don&apos;t have one yet.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-[#88BDF2] px-4 py-2.5 text-sm font-bold text-[#384959] shadow-md transition-all hover:bg-[#88BDF2]/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none"
            >
              {loading && (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {loading ? 'Joining…' : 'Join Family'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}