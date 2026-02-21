import Image from "next/image";

export const dynamic = "force-dynamic";

export default function VerifiedPage() {
  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <Image
            src="/Logo Lusia Studio Alt.png"
            alt="LUSIA Studio"
            width={200}
            height={66}
            className="h-auto"
          />
        </div>
        <div className="mb-6 rounded-xl border border-brand-success/20 bg-brand-success/5 px-4 py-3 text-sm text-brand-success">
          Email confirmado com sucesso.
        </div>
        <p className="text-sm text-brand-primary/60">
          Fecha esta pagina e volta para a aplicacao original.
        </p>
        <p className="text-sm text-brand-primary/40 mt-3">
          Depois clica em &quot;Ja confirmei&quot; para continuar.
        </p>
      </div>
    </main>
  );
}
