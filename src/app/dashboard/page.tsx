'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'
import Link from 'next/link'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [familyData, setFamilyData] = useState<any>(null)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadDashboardData() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      // 1. Get the user's custom profile from public.users
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      setUserProfile(profile)

      // 2. If they belong to a family, fetch the family details
      if (profile?.family_id) {
        const { data: family } = await supabase
          .from('families')
          .select('*')
          .eq('id', profile.family_id)
          .single()
          
        setFamilyData(family)
      }

      setLoading(false)
    }

    loadDashboardData()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: '50px' }}>Loading Dashboard...</div>
  }

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'sans-serif', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <h2>Welcome, {userProfile?.full_name || 'User'}!</h2>
        <button onClick={handleLogout} style={{ padding: '8px 16px', cursor: 'pointer' }}>Logout</button>
      </div>

      {/* DYNAMIC VIEW 1: User is NOT in a family yet */}
      {!userProfile?.family_id && (
        <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <h3>You aren't part of a family yet.</h3>
          <p style={{ color: '#666', marginBottom: '20px' }}>Create a new family to manage, or join an existing one using a code.</p>
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <Link href="/create-family">
              <button style={{ padding: '10px 20px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                Create Family
              </button>
            </Link>
            <Link href="/join-family">
              <button style={{ padding: '10px 20px', backgroundColor: '#eaeaea', color: 'black', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                Join Family
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* DYNAMIC VIEW 2: User IS in a family */}
      {userProfile?.family_id && familyData && (
        <div>
          <div style={{ padding: '20px', backgroundColor: '#e6f7ff', borderLeft: '5px solid #0070f3', borderRadius: '4px', marginBottom: '30px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Family: {familyData.name}</h3>
            <p style={{ margin: '0 0 5px 0' }}><strong>Your Role:</strong> {userProfile.role}</p>
            
            {/* If they are Admin, remind them of the join code so they can add people later */}
            {userProfile.role === 'Admin' && (
              <p style={{ margin: '0' }}>
                <strong>Join Code:</strong> {familyData.join_code}
              </p>
            )}
          </div>

          <h3>Expenses Ledger</h3>
          <p style={{ color: '#666' }}>Your financial tracking components will go here!</p>
        </div>
      )}
    </div>
  )
}