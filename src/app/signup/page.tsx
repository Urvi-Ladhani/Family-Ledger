'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('Admin') // Restored: Default role state
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // 1. Sign up the user and store name/role in auth metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, role: role }
        }
      })

      if (authError) throw authError
      if (!authData.user) throw new Error("Signup failed.")

      // 2. Update their profile in public.users with name AND role
      const { error: profileError } = await supabase
        .from('users')
        .update({ full_name: name, role: role })
        .eq('id', authData.user.id)

      if (profileError) {
        console.error("Profile update error:", profileError)
      }

      alert("Signup successful!")
      
      // 3. Restored: Smart Routing based on role
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

        {/* Restored: Role Selection Radio Buttons */}
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