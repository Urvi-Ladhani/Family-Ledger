'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../utils/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#BDDDFC] px-6 font-sans antialiased overflow-hidden">
      
      {/* BACKGROUND GRADIENT */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#BDDDFC] via-[#6A89A7]/40 to-[#384959]/20" />

      {/* CARD CONTAINER (Dark Slate #384959) */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#6A89A7]/40 bg-[#384959] p-8 shadow-2xl shadow-slate-950/40">
        
        {/* MAIN NAVIGATION TABS */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-950/30 p-1">
          <button className="rounded-lg bg-[#88BDF2] py-2 text-center text-sm font-bold text-[#384959] shadow-sm transition-all">
            Log In
          </button>
          <Link href="/signup" className="rounded-lg py-2 text-center text-sm font-medium text-[#BDDDFC] hover:text-white transition-all">
            Sign Up
          </Link>
        </div>

        <h2 className="text-xl font-bold tracking-tight text-white">
          Welcome back to FamilyLedger
        </h2>

        {error && (
          <p className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm font-medium text-red-400">
            {error}
          </p>
        )}

        {/* GOOGLE BUTTON */}
        <button
          onClick={handleGoogleLogin}
          type="button"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#6A89A7]/40 bg-white px-4 py-2.5 text-sm font-semibold text-[#384959] shadow-sm transition-all hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#88BDF2]/40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-[#6A89A7]">
          <div className="h-px flex-1 bg-[#6A89A7]/30" />
          or log in with email
          <div className="h-px flex-1 bg-[#6A89A7]/30" />
        </div>

        {/* CREDENTIALS FORM */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-xl border border-[#6A89A7]/40 bg-white px-3.5 py-2.5 text-sm text-[#384959] placeholder:text-slate-400 outline-none focus:border-[#88BDF2] focus:ring-1 focus:ring-[#88BDF2] transition-all shadow-sm"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-xl border border-[#6A89A7]/40 bg-white px-3.5 py-2.5 text-sm text-[#384959] placeholder:text-slate-400 outline-none focus:border-[#88BDF2] focus:ring-1 focus:ring-[#88BDF2] transition-all shadow-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-[#88BDF2] px-4 py-2.5 text-sm font-bold text-[#384959] shadow-md transition-colors hover:bg-[#88BDF2]/90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#88BDF2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#384959]"
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>
      </div>
    </main>
  )
}