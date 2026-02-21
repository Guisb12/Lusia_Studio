import { LogoutButton } from "@/components/shared/logout-button";

export default function StudentHomePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Student Home</h1>
          <LogoutButton />
        </header>
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <p className="text-slate-300">You are authenticated. This is the minimal protected student area.</p>
        </section>
      </div>
    </main>
  );
}
