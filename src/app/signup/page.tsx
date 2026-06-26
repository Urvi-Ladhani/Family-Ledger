'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('Admin')
  const [loading, setLoading] = useState(false)
  
  // FIXED: Added the missing mounted state
  const [mounted, setMounted] = useState(false) 

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) alert("Error: " + error.message)
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, role: role },
        },
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('Signup failed.')

      alert('Signup successful!')
      router.push(role === 'Admin' ? '/create-family' : '/join-family')
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#BDDDFC] px-6 py-12 font-sans antialiased overflow-hidden">
      
      {/* BACKGROUND GRADIENT */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#BDDDFC] via-[#6A89A7]/40 to-[#384959]/20" />

      {/* CARD CONTAINER (Dark Slate #384959) */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#6A89A7]/40 bg-[#384959] p-8 shadow-2xl shadow-slate-950/40">
        
        {/* MAIN NAVIGATION TABS */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-950/30 p-1">
          <Link href="/login" className="rounded-lg py-2 text-center text-sm font-medium text-[#BDDDFC] hover:text-white transition-all">
            Log In
          </Link>
          <button className="rounded-lg bg-[#88BDF2] py-2 text-center text-sm font-bold text-[#384959] shadow-sm transition-all">
            Sign Up
          </button>
        </div>

        <h2 className="text-xl font-bold tracking-tight text-white">
          Create your account
        </h2>

        {/* GOOGLE SIGNUP */}
        <button
          onClick={handleGoogleLogin}
          type="button"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#6A89A7]/40 bg-white px-4 py-2.5 text-sm font-semibold text-[#384959] shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#88BDF2]"
        >
          Sign up with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-[#6A89A7]">
          <div className="h-px flex-1 bg-[#6A89A7]/30" />
          or sign up with email
          <div className="h-px flex-1 bg-[#6A89A7]/30" />
        </div>

        {/* REPLICATED INPUT FIELDS */}
        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-xl border border-[#6A89A7]/40 bg-white px-3.5 py-2.5 text-sm text-[#384959] placeholder:text-slate-400 outline-none focus:border-[#88BDF2] focus:ring-1 focus:ring-[#88BDF2] transition-all shadow-sm"
          />

          <input
            type="email"
            placeholder="Email"
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

          {/* INNER WORKFLOW OPTIONS */}
          <div>
            <p className="mb-2.5 text-sm font-medium text-[#BDDDFC]">I want to:</p>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all shadow-sm ${
                  role === 'Admin'
                    ? 'border-[#88BDF2] bg-[#88BDF2]/20 text-white ring-1 ring-[#88BDF2]'
                    : 'border-[#6A89A7]/30 bg-slate-950/20 text-[#BDDDFC] hover:bg-slate-950/40'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="Admin"
                  checked={role === 'Admin'}
                  onChange={(e) => setRole(e.target.value)}
                  className="h-4 w-4 text-[#88BDF2] focus:ring-[#88BDF2] border-slate-300"
                />
                Create a Family
              </label>
              <label
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all shadow-sm ${
                  role === 'Member'
                    ? 'border-[#88BDF2] bg-[#88BDF2]/20 text-white ring-1 ring-[#88BDF2]'
                    : 'border-[#6A89A7]/30 bg-slate-950/20 text-[#BDDDFC] hover:bg-slate-950/40'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="Member"
                  checked={role === 'Member'}
                  onChange={(e) => setRole(e.target.value)}
                  className="h-4 w-4 text-[#88BDF2] focus:ring-[#88BDF2] border-slate-300"
                />
                Join a Family
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-[#88BDF2] px-4 py-2.5 text-sm font-bold text-[#384959] shadow-md transition-colors hover:bg-[#88BDF2]/90 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#88BDF2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#384959]"
          >
            {loading ? 'Signing up…' : 'Sign Up'}
          </button>
        </form>
      </div>
    </main>
  )
}