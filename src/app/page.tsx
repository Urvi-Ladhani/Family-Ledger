import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center">
      <div className="max-w-6xl mx-auto w-full px-6 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <section>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">FamilyLedger — Shared finance, simplified</h1>
            <p className="mt-6 text-gray-600 text-lg">Track bills, share expenses, and get insights for your household. Easy OCR uploads, role-based access, and beautiful analytics.</p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/signup" className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow">
                Get Started
              </Link>
              <Link href="/dashboard" className="inline-flex items-center px-6 py-3 border border-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-50">
                View Demo Dashboard
              </Link>
            </div>

            <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600">
              <li>• OCR bill extraction</li>
              <li>• Family & role permissions</li>
              <li>• Category-level analytics</li>
              <li>• Secure Supabase backend</li>
            </ul>
          </section>

          <aside className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500">Live Snapshot</h3>
            <div className="mt-4">
              <div className="h-40 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg flex items-center justify-center text-gray-400">Dashboard preview</div>
            </div>
            <p className="mt-4 text-xs text-gray-500">Works great on mobile and desktop — start by creating a family and inviting members.</p>
          </aside>
        </div>
      </div>
    </main>
  )
}