'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link' // 1. Add this import!
import { createClient } from '../../../utils/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Attempt to log the user in
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Success! Send them to the dashboard
      router.push('/dashboard')
    }
  }

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Log In to FamilyLedger</h2>
      
      {error && <p style={{ color: 'red' }}>{error}</p>}
      
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
        <input 
          type="email" 
          placeholder="Email address" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: '10px', fontSize: '16px' }}
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: '10px', fontSize: '16px' }}
        />
        <button 
          type="submit" 
          disabled={loading}
          style={{ padding: '10px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px' }}
        >
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>
      {/* 2. Add this linking section below your form */}
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>
          Don't have an account?{' '}
          <Link href="/signup" style={{ color: '#0070f3', textDecoration: 'none', fontWeight: 'bold' }}>
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  )
}