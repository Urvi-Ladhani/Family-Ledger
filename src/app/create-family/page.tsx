'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'

export default function CreateFamilyPage() {
  const [familyName, setFamilyName] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No user is logged in!")

      // 1. Insert the family
      const { data: newFamily, error: familyError } = await supabase
        .from('families')
        .insert([{ name: familyName }])
        .select()
        .single()

      if (familyError) throw familyError

      // 2. Update the user
      const { error: userError } = await supabase
        .from('users')
        .update({ family_id: newFamily.id, role: 'Admin' })
        .eq('id', user.id)

      if (userError) throw userError

      alert("Family created! You are the Admin.")
      router.push('/dashboard')

    } catch (err: any) {
      console.error("Full error details:", err)
      alert("Error: " + err.message)
    } finally {
      // This guarantees the button un-freezes no matter what happens!
      setLoading(false) 
    }
  }

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
        <button type="submit" disabled={loading} style={{ padding: '10px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px' }}>
          {loading ? 'Creating...' : 'Create Family'}
        </button>
      </form>
    </div>
  )
}