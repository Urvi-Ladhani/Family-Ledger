'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const supabase = createClient()

    // 1. Sign up user in Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
      setLoading(false)
      return
    }

    setMessage('Signup successful! You can now log in.')
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', padding: '20px' }}>
      <h2>Sign Up for FamilyLedger</h2>
      <form onSubmit={handleSignup}>
        <div style={{ marginBottom: '12px' }}>
          <label>Name:</label>
          <input 
            type="text" 
            style={{ width: '100%', padding: '8px' }}
            value={displayName} 
            onChange={(e) => setDisplayName(e.target.value)} 
            required 
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label>Email:</label>
          <input 
            type="email" 
            style={{ width: '100%', padding: '8px' }}
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label>Password:</label>
          <input 
            type="password" 
            style={{ width: '100%', padding: '8px' }}
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
          />
        </div>
        <button type="submit" disabled={loading} style={{ padding: '10px 20px' }}>
          {loading ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>
      {message && <p style={{ marginTop: '12px' }}>{message}</p>}
    </div>
  )
}