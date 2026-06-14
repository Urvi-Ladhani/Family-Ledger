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

  // --- NEW: Google Login Function ---
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`
      }
    })
    if (error) {
      alert("Error with Google: " + error.message)
    }
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

      const { error: profileError } = await supabase
        .from('users')
        .update({ full_name: name, role: role })
        .eq('id', authData.user.id)

      if (profileError) {
        console.error("Profile update error:", profileError)
      }

      alert("Signup successful!")
      
      if (role === 'Admin') {
        router.push('/create-family')
      } else {
        router.push('/join-family')
      }

    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Sign Up</h2>

      {/* --- NEW: Google Login Button --- */}
      <button 
        onClick={handleGoogleLogin} 
        type="button"
        style={{ width: '100%', padding: '10px', backgroundColor: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: '5px', cursor: 'pointer', marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', fontWeight: 'bold' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
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
              <input 
                type="radio" 
                name="role" 
                value="Admin" 
                checked={role === 'Admin'} 
                onChange={(e) => setRole(e.target.value)} 
              />
              Create a Family
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
              <input 
                type="radio" 
                name="role" 
                value="Member" 
                checked={role === 'Member'} 
                onChange={(e) => setRole(e.target.value)} 
              />
              Join a Family
            </label>
          </div>
        </div>

        <button type="submit" disabled={loading} style={{ padding: '10px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>
      </form>
      <p style={{ marginTop: '20px', textAlign: 'center' }}>
        Already have an account? <Link href="/login" style={{ color: '#0070f3' }}>Login</Link>
      </p>
    </div>
  )
}