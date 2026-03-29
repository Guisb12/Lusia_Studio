export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-bg px-6 py-16 text-brand-primary">
      <div className="w-full max-w-md rounded-3xl border border-brand-primary/10 bg-white p-8 shadow-[0_24px_80px_rgba(21,49,107,0.08)]">
        <p className="font-instrument-italic text-sm text-brand-accent">Offline</p>
        <h1 className="mt-3 font-lejour text-3xl uppercase tracking-[0.08em]">LUSIA Studio</h1>
        <p className="mt-4 text-sm leading-6 text-brand-primary/75">
          Esta página não está disponível sem ligação à internet. Volta a tentar quando a conexão
          for restaurada.
        </p>
      </div>
    </main>
  );
}
