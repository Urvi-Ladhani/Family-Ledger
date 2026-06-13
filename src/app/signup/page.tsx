'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../utils/supabase/client'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [intendedRole, setIntendedRole] = useState<'Admin' | 'Member'>('Admin') // <-- NEW STATE
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // THE NEW ROUTING LOGIC!
      if (intendedRole === 'Admin') {
        router.push('/create-family')
      } else {
        router.push('/join-family')
      }
    }
  }

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Sign Up for FamilyLedger</h2>
      
      {error && <p style={{ color: 'red' }}>{error}</p>}
      
      <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
        
        {/* THE NEW ROLE SELECTOR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
          <strong>What are you here to do?</strong>
          <label style={{ display: 'flex', gap: '10px', cursor: 'pointer' }}>
            <input 
              type="radio" 
              value="Admin" 
              checked={intendedRole === 'Admin'} 
              onChange={() => setIntendedRole('Admin')} 
            />
            Create a New Family (I will be Admin)
          </label>
          <label style={{ display: 'flex', gap: '10px', cursor: 'pointer' }}>
            <input 
              type="radio" 
              value="Member" 
              checked={intendedRole === 'Member'} 
              onChange={() => setIntendedRole('Member')} 
            />
            Join an Existing Family (I will be a Member)
          </label>
        </div>

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
          placeholder="Password (min 6 chars)" 
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
          {loading ? 'Signing up...' : `Sign Up & ${intendedRole === 'Admin' ? 'Create' : 'Join'}`}
        </button>
      </form>

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#0070f3', textDecoration: 'none', fontWeight: 'bold' }}>
            Log in here
          </Link>
        </p>
      </div>
    </div>
  )
}