'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'
import Link from 'next/link'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [familyData, setFamilyData] = useState<any>(null)
  
  const router = useRouter()
  const supabase = createClient()

  // 1. Wrapped in useCallback so it can be re-triggered dynamically
  const loadDashboardData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Get the user's custom profile from public.users
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    setUserProfile(profile)

    // If they belong to a family, fetch the family details (including avatar_url)
    if (profile?.family_id) {
      const { data: family } = await supabase
        .from('families')
        .select('*')
        .eq('id', profile.family_id)
        .single()
        
      setFamilyData(family)
    }

    setLoading(false)
  }, [router, supabase])

  // 2. Real-time listener added to useEffect
  useEffect(() => {
    // Run once on mount
    loadDashboardData()

    // Listen for any auth state changes to dynamically update the UI
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        loadDashboardData()
      }
    })

    // Cleanup the listener when the component unmounts
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [loadDashboardData, supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.refresh() // 3. Added to clear Next.js cache so the next user sees a clean state
    router.push('/login')
  }

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'sans-serif' }}>Loading Dashboard...</div>
  }

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'sans-serif', padding: '20px' }}>
      
      {/* Top Navbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #eee', paddingBottom: '20px' }}>
        {/* NEW: Displays the User's avatar next to their name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {userProfile?.avatar_url ? (
            <img 
              src={userProfile.avatar_url} 
              alt="Profile" 
              style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white' }}>
              {userProfile?.full_name?.charAt(0) || 'U'}
            </div>
          )}
          <h2 style={{ margin: 0 }}>Welcome, {userProfile?.full_name || 'User'}!</h2>
        </div>
        <button 
          onClick={handleLogout} 
          style={{ padding: '8px 16px', backgroundColor: '#ff4d4f', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Logout
        </button>
      </div>

      {/* DYNAMIC VIEW 1: User is NOT in a family yet */}
      {!userProfile?.family_id && (
        <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #eee' }}>
          <h3>You aren't part of a family yet.</h3>
          <p style={{ color: '#666', marginBottom: '20px' }}>Create a new family to manage, or join an existing one using a code.</p>
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <Link href="/create-family">
              <button style={{ padding: '10px 20px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                Create Family
              </button>
            </Link>
            <Link href="/join-family">
              <button style={{ padding: '10px 20px', backgroundColor: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                Join Family
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* DYNAMIC VIEW 2: User IS in a family */}
      {userProfile?.family_id && familyData && (
        <div>
          {/* Family Info Box Card with Avatar Integration */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '20px', 
            padding: '25px', 
            backgroundColor: '#e6f7ff', 
            borderLeft: '5px solid #0070f3', 
            borderRadius: '8px', 
            marginBottom: '30px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
          }}>
            
            {/* --- FAMILY AVATAR DISPLAY --- */}
            {familyData.avatar_url ? (
              <img 
                src={familyData.avatar_url} 
                alt={`${familyData.name} Profile`} 
                style={{ width: '75px', height: '75px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #fff', boxShadow: '0 2px 5px rgba(0,0,0,0.15)' }} 
              />
            ) : (
              /* Text Fallback Placeholder Icon if no image was uploaded */
              <div style={{ 
                width: '75px', 
                height: '75px', 
                borderRadius: '50%', 
                backgroundColor: '#0070f3', 
                color: 'white', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '28px', 
                fontWeight: 'bold',
                boxShadow: '0 2px 5px rgba(0,0,0,0.15)'
              }}>
                {familyData.name ? familyData.name.charAt(0).toUpperCase() : 'F'}
              </div>
            )}

            {/* Family Details Text */}
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '22px', color: '#0050b3' }}>Family: {familyData.name}</h3>
              <p style={{ margin: '0 0 5px 0', color: '#333' }}><strong>Your Role:</strong> <span style={{ backgroundColor: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '14px', border: '1px solid #bae7ff' }}>{userProfile.role}</span></p>
              
              {/* If they are Admin, reveal the join code */}
              {userProfile.role === 'Admin' && (
                <p style={{ margin: '0', color: '#555', fontSize: '14px' }}>
                  <strong>Join Code:</strong> <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bae7ff', letterSpacing: '1px', fontWeight: 'bold' }}>{familyData.join_code}</code>
                </p>
              )}
            </div>

          </div>

          <h3>Expenses Ledger</h3>
          <p style={{ color: '#666' }}>Your financial tracking components will go here!</p>
        </div>
      )}
    </div>
  )
}