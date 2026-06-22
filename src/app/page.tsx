import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#BDDDFC] px-6 font-sans antialiased">

      {/* BACKGROUND GRADIENT & GLOWS */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#BDDDFC] via-[#6A89A7]/40 to-[#384959]/20" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#88BDF2]/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-[300px] w-[300px] rounded-full bg-[#6A89A7]/10 blur-3xl" />

      {/* CONTENT CARD */}
      <div className="relative z-10 w-full max-w-md text-center p-8 rounded-3xl border border-[#6A89A7]/20 bg-[#384959] shadow-2xl shadow-slate-950/30">

        {/* Brand Mark */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#88BDF2] to-[#6A89A7] text-xl font-black text-[#384959] shadow-lg shadow-black/20">
          FL
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#88BDF2]">
          Family Finance, Simplified
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Welcome to FamilyLedger
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#BDDDFC]">
          Every bill, budget, and balance your family shares — clear, simple, and always up to date.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#88BDF2] px-6 py-3 text-sm font-bold text-[#384959] shadow-lg shadow-[#88BDF2]/20 transition-all hover:bg-[#88BDF2]/90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
          >
            Get Started
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-[#6A89A7]/50 bg-slate-950/20 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:border-[#88BDF2] hover:bg-slate-950/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}