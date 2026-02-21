"use client";

import { motion } from "framer-motion";

export default function DashboardPage() {
  return (
    <div className="max-w-5xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <header className="mb-8">
          <h1 className="text-3xl font-serif text-[#15316b]">Bem-vindo, Professor.</h1>
          <p className="text-[#15316b]/70 mt-2">Este é o seu painel de controlo.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Quick Stats / Cards Placeholder */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#15316b]/10">
            <h3 className="font-semibold text-lg mb-2">Turmas Ativas</h3>
            <p className="text-3xl font-bold">4</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#15316b]/10">
            <h3 className="font-semibold text-lg mb-2">Alunos</h3>
            <p className="text-3xl font-bold">128</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#15316b]/10">
            <h3 className="font-semibold text-lg mb-2">Conteúdos</h3>
            <p className="text-3xl font-bold">12</p>
          </div>
        </div>

        <div className="bg-white p-8 rounded-xl shadow-sm border border-[#15316b]/10 h-96 flex items-center justify-center">
          <p className="text-[#15316b]/50 italic">O conteúdo do dashboard aparecerá aqui.</p>
        </div>

      </motion.div>
    </div>
  );
}
