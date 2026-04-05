export function LandingDeviceParitySection() {
  return (
    <section className="bg-brand-bg px-5 py-20 sm:px-8 md:py-28 lg:px-12">
      <div className="mx-auto max-w-7xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-brand-accent">
          Desktop e mobile
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
          Pensada para os dois ecrãs desde o primeiro dia
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-brand-primary/60">
          Gestão completa no desktop. Consulta rápida e chat IA no telemóvel.
          Nenhuma experiência é secundária.
        </p>

        <div className="mx-auto mt-14 grid max-w-4xl gap-8 md:grid-cols-2">
          {/* Desktop */}
          <div className="overflow-hidden rounded-2xl border-2 border-brand-primary/8 bg-white shadow-sm">
            <div className="bg-brand-primary/4 px-6 py-4">
              <p className="text-sm font-semibold text-brand-primary">
                💻 Desktop
              </p>
            </div>
            <div className="p-6">
              <ul className="space-y-3 text-left text-sm text-brand-primary/65">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-brand-accent">✓</span>
                  Calendário completo com drag-and-drop
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-brand-accent">✓</span>
                  Editor de conteúdos lado a lado
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-brand-accent">✓</span>
                  Dashboards de analítica com gráficos
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-brand-accent">✓</span>
                  Gestão de turmas e alunos em tabela
                </li>
              </ul>
            </div>
          </div>

          {/* Mobile */}
          <div className="overflow-hidden rounded-2xl border-2 border-brand-primary/8 bg-white shadow-sm">
            <div className="bg-brand-primary/4 px-6 py-4">
              <p className="text-sm font-semibold text-brand-primary">
                📱 Mobile
              </p>
            </div>
            <div className="p-6">
              <ul className="space-y-3 text-left text-sm text-brand-primary/65">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-brand-accent">✓</span>
                  Chat IA com resposta imediata
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-brand-accent">✓</span>
                  Consulta de trabalhos e submissão
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-brand-accent">✓</span>
                  Notas e classificações sempre à mão
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-brand-accent">✓</span>
                  Acesso rápido sem setup
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
