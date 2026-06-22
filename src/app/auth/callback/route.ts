import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  
  if (!code) return NextResponse.redirect(`${origin}/login`)

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
        remove(name: string, options: CookieOptions) { cookieStore.delete({ name, ...options }) },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/login?error=auth-failed`)

  // Check if they have a family linked
  const { data: profile } = await supabase
    .from('users')
    .select('family_id')
    .eq('id', data.user.id)
    .single()

  // Direct traffic based on family status
  if (profile?.family_id) {
    return NextResponse.redirect(`${origin}/dashboard`)
  } else {
    return NextResponse.redirect(`${origin}/join-family`)
  }
}