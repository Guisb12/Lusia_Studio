"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);

        const supabase = createClient();
        const redirectTo = new URL("/auth/reset-password", window.location.origin).toString();

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo,
        });

        setLoading(false);

        if (error) {
            toast.error("Não foi possível enviar o email.", {
                description: error.message,
            });
            return;
        }

        setSent(true);
        toast.success("Email enviado com sucesso.");
    };

    return (
        <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="flex justify-center mb-10">
                    <Image
                        src="/lusia-symbol.png"
                        alt="LUSIA Studio"
                        width={56}
                        height={56}
                        className="h-14 w-14"
                        priority
                    />
                </div>

                {/* Header */}
                <h1 className="font-instrument text-3xl text-brand-primary text-center mb-2">
                    Recuperar password
                </h1>
                <p className="text-sm text-brand-primary/50 text-center mb-8">
                    Introduz o teu email e enviamos-te um link para redefinir a password.
                </p>

                {sent ? (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-brand-success/20 bg-brand-success/5 px-4 py-3 text-sm text-brand-success text-center">
                            Enviamos um email para <strong>{email}</strong> com um link para
                            redefinir a tua password. Verifica a tua caixa de entrada.
                        </div>
                        <Link
                            href="/login"
                            className="block w-full text-center text-sm text-brand-primary/50 hover:text-brand-primary transition-colors py-2"
                        >
                            Voltar ao login
                        </Link>
                    </div>
                ) : (
                    <>
                        <form onSubmit={onSubmit} className="space-y-3">
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="email@exemplo.com"
                                label="Email"
                                required
                            />
                            <Button type="submit" loading={loading} className="w-full">
                                Enviar link de recuperação
                            </Button>
                        </form>

                        <Link
                            href="/login"
                            className="block w-full text-center text-sm text-brand-primary/50 hover:text-brand-primary transition-colors mt-5 py-2"
                        >
                            Voltar ao login
                        </Link>
                    </>
                )}

                <p className="text-center text-xs text-brand-primary/30 mt-6">
                    Ao continuar, concordas com os nossos Termos de Serviço e Política de
                    Privacidade.
                </p>
            </div>
        </main>
    );
}
