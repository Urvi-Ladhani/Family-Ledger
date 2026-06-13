'use client'

import { useState } from 'react'

export default function CreateFamilyPage() {
  const [familyName, setFamilyName] = useState('')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Create family API call goes here for:", familyName)
  }

  return (
    <div style={{ maxWidth: '400px', margin: '40px auto' }}>
      <h2>Create Your Family</h2>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input 
          type="text" 
          placeholder="Enter Family Name" 
          value={familyName} 
          onChange={(e) => setFamilyName(e.target.value)}
          style={{ padding: '8px' }}
        />
        <button type="submit" style={{ padding: '10px' }}>Create Family</button>
      </form>
    </div>
  )
}