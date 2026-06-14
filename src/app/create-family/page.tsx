'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'

export default function CreateFamilyPage() {
  const [familyName, setFamilyName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const generateJoinCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No user is logged in!")

      let avatarUrl = ''

      if (file) {
        // FIXED: Better, collision-proof file naming
        const fileExt = file.name.split('.').pop()
        const filePath = `${user.id}-${Date.now()}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage
          .from('family-avatars')
          .upload(filePath, file)
        
        if (uploadError) {
          console.error("Upload Error:", uploadError)
          throw new Error("Failed to upload image. Check Supabase Storage Policies.")
        }

        const { data } = supabase.storage.from('family-avatars').getPublicUrl(filePath)
        avatarUrl = data.publicUrl
      }

      const joinCode = generateJoinCode()

      const { data: newFamily, error: familyError } = await supabase
        .from('families')
        .insert([{ name: familyName, join_code: joinCode, avatar_url: avatarUrl }])
        .select()
        .single()

      if (familyError) throw familyError

      const { error: userError } = await supabase
        .from('users')
        .update({ family_id: newFamily.id, role: 'Admin' })
        .eq('id', user.id)

      if (userError) throw userError

      setCreatedCode(joinCode)
      router.refresh()

    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setLoading(false) 
    }
  }

  const handleCopy = () => {
    if (createdCode) {
      navigator.clipboard.writeText(createdCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (createdCode) {
    return (
      <div style={{ maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h2>Family Created! 🎉</h2>
        <div style={{ margin: '20px 0', padding: '20px', backgroundColor: '#f0f0f0', borderRadius: '8px', fontSize: '24px', letterSpacing: '2px', fontWeight: 'bold' }}>
          {createdCode}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={handleCopy} style={{ padding: '10px 20px', backgroundColor: copied ? '#28a745' : '#666', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '10px 20px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Create Your Family</h2>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          {previewUrl ? (
            <img src={previewUrl} alt="Preview" style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #0070f3' }} />
          ) : (
            <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: '#eaeaea', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '40px' }}>
              📷
            </div>
          )}
          
          <label style={{ padding: '8px 16px', backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '5px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
            Choose Photo
            <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>

        <input 
          type="text" 
          placeholder="Enter Family Name" 
          value={familyName} 
          onChange={(e) => setFamilyName(e.target.value)}
          style={{ padding: '12px', fontSize: '16px', borderRadius: '5px', border: '1px solid #ccc' }}
          required
        />

        <button type="submit" disabled={loading} style={{ padding: '12px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
          {loading ? 'Creating...' : 'Create Family'}
        </button>
      </form>
    </div>
  )
}