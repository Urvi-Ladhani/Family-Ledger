'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'
import Link from 'next/link'

export default function DashboardPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Check if the user is logged in when the page loads
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login') // Kick them out to login if not authenticated
      } else {
        setUserEmail(user.email ?? '')
      }
      setLoading(false)
    }
    checkUser()
  }, [router, supabase.auth])

  // THE LOG OUT FUNCTION
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return <div style={{ padding: '40px' }}>Loading your ledger...</div>

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'sans-serif', padding: '0 20px' }}>
      
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '20px', marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>FamilyLedger</h1>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <span style={{ color: '#666' }}>{userEmail}</span>
          <button 
            onClick={handleLogout} 
            style={{ padding: '8px 15px', backgroundColor: '#ff4d4f', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
          >
            Log Out
          </button>
        </div>
      </div>

      {/* The "Traffic Cop" Area (No family yet) */}
      <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f8f9fa', borderRadius: '10px' }}>
        <h2>You aren't in a Family yet!</h2>
        <p style={{ color: '#666', marginBottom: '30px' }}>To start tracking expenses, you need to either create a new family unit or join an existing one.</p>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
          {/* Create Family Button */}
          <Link href="/create-family" style={{ padding: '15px 30px', backgroundColor: '#0070f3', color: 'white', textDecoration: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
            Create a New Family
            <div style={{ fontSize: '12px', fontWeight: 'normal', marginTop: '5px' }}>(You will be the Admin)</div>
          </Link>

          {/* Join Family Button */}
          <button style={{ padding: '15px 30px', border: '2px solid #0070f3', color: '#0070f3', backgroundColor: 'transparent', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>
            Join Existing Family
            <div style={{ fontSize: '12px', fontWeight: 'normal', marginTop: '5px' }}>(You will be a Member)</div>
          </button>
        </div>
      </div>

    </div>
  )
}