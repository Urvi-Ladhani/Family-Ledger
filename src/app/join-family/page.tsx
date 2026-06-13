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

    // 1. Check if the family exists using the short join_code
    // Note: We use .toUpperCase() just in case they typed lowercase letters
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

    // 2. Update the user's profile with the actual family UUID
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
    <div style={{ maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Join a Family</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>Ask your Family Admin for their 6-character Join Code.</p>
      <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input 
          type="text" 
          placeholder="e.g. A7X9Q2" 
          value={joinCode} 
          onChange={(e) => setJoinCode(e.target.value)}
          style={{ padding: '10px', fontSize: '16px', textTransform: 'uppercase' }}
          required
        />
        <button type="submit" disabled={loading} style={{ padding: '10px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
          {loading ? 'Joining...' : 'Join Family'}
        </button>
      </form>
    </div>
  )
}