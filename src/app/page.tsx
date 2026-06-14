import Link from 'next/link'

export default function HomePage() {
  return (
    <div style={{ maxWidth: '600px', margin: '100px auto', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>Welcome to FamilyLedger</h1>
      <p style={{ marginBottom: '20px' }}>Your family's shared financial hub.</p>
      
      <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
        <Link href="/signup" style={{ padding: '10px 20px', backgroundColor: '#0070f3', color: 'white', textDecoration: 'none', borderRadius: '5px' }}>
          Sign Up
        </Link>
        <Link href="/dashboard" style={{ padding: '10px 20px', border: '1px solid #ccc', color: 'black', textDecoration: 'none', borderRadius: '5px' }}>
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}