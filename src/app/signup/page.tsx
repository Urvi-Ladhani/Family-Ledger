'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('Admin')
  const [loading, setLoading] = useState(false)
  
  const router = useRouter()
  const supabase = createClient()

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
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
          data: { full_name: name, role: role }
        }
      })

      if (authError) throw authError
      if (!authData.user) throw new Error("Signup failed.")

      if (!authData.session) {
        alert("Signup successful! Please check your email to confirm your account, then log in.")
        router.push('/login')
        return
      }

      router.push(role === 'Admin' ? '/create-family' : '/join-family')

    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : 'Signup failed.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Sign Up</h2>

      <button 
        onClick={handleGoogleLogin} 
        type="button"
        style={{ width: '100%', padding: '10px', backgroundColor: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: '5px', cursor: 'pointer', marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', fontWeight: 'bold' }}
      >
        Sign up with Google
      </button>

      <div style={{ textAlign: 'center', color: '#666', marginBottom: '20px' }}>or sign up with email</div>

      <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <input 
          type="text" 
          placeholder="Full Name" 
          value={name} 
          onChange={(e) => setName(e.target.value)}
          style={{ padding: '10px', fontSize: '16px' }}
          required
        />
        
        <input 
          type="email" 
          placeholder="Email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '10px', fontSize: '16px' }}
          required
        />
        
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: '10px', fontSize: '16px' }}
          required
        />

        <div style={{ padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
          <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>I want to:</p>
          <div style={{ display: 'flex', gap: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
              <input type="radio" name="role" value="Admin" checked={role === 'Admin'} onChange={(e) => setRole(e.target.value)} />
              Create a Family
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
              <input type="radio" name="role" value="Member" checked={role === 'Member'} onChange={(e) => setRole(e.target.value)} />
              Join a Family
            </label>
          </div>
        </div>

        <button type="submit" disabled={loading} style={{ padding: '10px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>
      </form>

      {/* NEW: Added Login Option */}
      <p style={{ textAlign: 'center', marginTop: '20px' }}>
        Already have an account? <Link href="/login" style={{ color: '#0070f3', fontWeight: 'bold' }}>Login</Link>
      </p>
    </div>
  )
}
