"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ResetPasswordContent() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [exchanging, setExchanging] = useState(true);
    const [exchangeError, setExchangeError] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const doneRef = useRef(false);

    // Exchange the PKCE code on mount
    useEffect(() => {
        if (doneRef.current) return;
        doneRef.current = true;

        const run = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get("code");

            if (!code) {
                // No code — try hash params (older Supabase flows)
                const hashParams = new URLSearchParams(
                    window.location.hash.replace(/^#/, ""),
                );
                const tokenHash = hashParams.get("token_hash");
                const type = hashParams.get("type");

                if (tokenHash && type === "recovery") {
                    const supabase = createClient();
                    const { error } = await supabase.auth.verifyOtp({
                        token_hash: tokenHash,
                        type: "recovery",
                    });
                    if (error) {
                        setExchangeError(true);
                    }
                    setExchanging(false);
                    return;
                }

                // Check if user already has a session (e.g. navigated here manually)
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    setExchangeError(true);
                }
                setExchanging(false);
                return;
            }

            const supabase = createClient();
            const { error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
                // Code might already be consumed — check if session exists
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    setExchangeError(true);
                }
            }

            setExchanging(false);
        };

        void run();
    }, []);

    const onSubmit = useCallback(
        async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setError(null);

            if (password.length < 6) {
                setError("A password deve ter pelo menos 6 caracteres.");
                return;
            }
            if (password !== confirmPassword) {
                setError("As passwords não coincidem.");
                return;
            }

            setLoading(true);
            const supabase = createClient();
            const { error: updateError } = await supabase.auth.updateUser({
                password,
            });
            setLoading(false);

            if (updateError) {
                toast.error("Não foi possível atualizar a password.", {
                    description: updateError.message,
                });
                setError(updateError.message);
                return;
            }

            toast.success("Password atualizada com sucesso.");
            router.replace("/");
        },
        [password, confirmPassword, router],
    );

    // Loading state while exchanging code
    if (exchanging) {
        return (
            <main className="flex h-dvh w-full flex-col items-center justify-center">
                <p className="text-sm text-brand-primary/60">A processar...</p>
            </main>
        );
    }

    // Exchange failed
    if (exchangeError) {
        return (
            <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
                <div className="w-full max-w-md">
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
                    <h1 className="font-instrument text-3xl text-brand-primary text-center mb-2">
                        Link expirado
                    </h1>
                    <p className="text-sm text-brand-primary/50 text-center mb-8">
                        Este link de recuperação expirou ou é inválido. Pede um novo link.
                    </p>
                    <Link href="/forgot-password">
                        <Button className="w-full">Pedir novo link</Button>
                    </Link>
                    <Link
                        href="/login"
                        className="block w-full text-center text-sm text-brand-primary/50 hover:text-brand-primary transition-colors mt-5 py-2"
                    >
                        Voltar ao login
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
            <div className="w-full max-w-md">
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

                <h1 className="font-instrument text-3xl text-brand-primary text-center mb-2">
                    Definir nova password
                </h1>
                <p className="text-sm text-brand-primary/50 text-center mb-8">
                    Escolhe uma nova password para a tua conta.
                </p>

                {error && (
                    <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
                        {error}
                    </div>
                )}

                <form onSubmit={onSubmit} className="space-y-3">
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        label="Nova password"
                        required
                    />
                    <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repete a password"
                        label="Confirmar password"
                        required
                    />
                    <Button type="submit" loading={loading} className="w-full">
                        Guardar nova password
                    </Button>
                </form>

                <p className="text-center text-xs text-brand-primary/30 mt-6">
                    Ao continuar, concordas com os nossos Termos de Serviço e Política de
                    Privacidade.
                </p>
            </div>
        </main>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-dvh items-center justify-center">
                    A carregar...
                </div>
            }
        >
            <ResetPasswordContent />
        </Suspense>
    );
}
