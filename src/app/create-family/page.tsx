'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'

export default function CreateFamilyPage() {
  const [familyName, setFamilyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Helper function to generate a 6-character alphanumeric code
  const generateJoinCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No user is logged in!")

      const joinCode = generateJoinCode()

      // 1. Insert the family with the new join_code
      const { data: newFamily, error: familyError } = await supabase
        .from('families')
        .insert([{ name: familyName, join_code: joinCode }])
        .select()
        .single()

      if (familyError) throw familyError

      // 2. Update the user
      const { error: userError } = await supabase
        .from('users')
        .update({ family_id: newFamily.id, role: 'Admin' })
        .eq('id', user.id)

      if (userError) throw userError

      // Instead of an alert and redirect, we show the code on screen!
      setCreatedCode(joinCode)

    } catch (err: any) {
      console.error("Full error details:", err)
      alert("Error: " + err.message)
    } finally {
      setLoading(false) 
    }
  }

  // If successfully created, show the code before letting them go to the dashboard
  if (createdCode) {
    return (
      <div style={{ maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h2>Family Created! 🎉</h2>
        <p>Share this code with your members so they can join:</p>
        <div style={{ margin: '20px 0', padding: '20px', backgroundColor: '#f0f0f0', borderRadius: '8px', fontSize: '24px', letterSpacing: '2px', fontWeight: 'bold' }}>
          {createdCode}
        </div>
        <button 
          onClick={() => router.push('/dashboard')}
          style={{ padding: '10px 20px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          Go to Dashboard
        </button>
      </div>
    )
  }

  // Default Form View
  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Create Your Family</h2>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input 
          type="text" 
          placeholder="Enter Family Name" 
          value={familyName} 
          onChange={(e) => setFamilyName(e.target.value)}
          style={{ padding: '10px', fontSize: '16px' }}
          required
        />
        <button type="submit" disabled={loading} style={{ padding: '10px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
          {loading ? 'Creating...' : 'Create Family'}
        </button>
      </form>
    </div>
  )
}