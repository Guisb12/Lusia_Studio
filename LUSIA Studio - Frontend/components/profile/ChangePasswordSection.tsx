"use client";

import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

export function ChangePasswordButton() {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasEmailProvider, setHasEmailProvider] = useState<boolean | null>(null);

    // Check if user signed up with email (has a password to change)
    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            const providers: string[] = data.user?.app_metadata?.providers ?? [];
            setHasEmailProvider(providers.includes("email"));
        });
    }, []);

    const resetForm = () => {
        setPassword("");
        setConfirmPassword("");
        setError(null);
    };

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
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
            toast.error("Não foi possível alterar a password.", {
                description: updateError.message,
            });
            setError(updateError.message);
            return;
        }

        toast.success("Password alterada com sucesso.");
        resetForm();
        setOpen(false);
    };

    // Hide for Google-only users (no email provider = no password)
    if (hasEmailProvider === null || !hasEmailProvider) return null;

    return (
        <>
            <button
                onClick={() => { resetForm(); setOpen(true); }}
                className="w-full bg-brand-primary/[0.04] rounded-lg p-0.5"
            >
                <span className="w-full flex items-center justify-center gap-2 bg-white rounded-md shadow-sm py-2.5 text-sm font-medium text-brand-primary/70 hover:text-brand-primary hover:bg-brand-primary/[0.02] transition-colors">
                    <KeyRound className="h-3.5 w-3.5" /> Alterar password
                </span>
            </button>

            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-brand-primary">Alterar password</DialogTitle>
                        <DialogDescription>
                            Escolhe uma nova password para a tua conta.
                        </DialogDescription>
                    </DialogHeader>

                    {error && (
                        <div className="rounded-lg border border-brand-error/20 bg-brand-error/5 px-3 py-2 text-xs text-brand-error">
                            {error}
                        </div>
                    )}

                    <form onSubmit={onSubmit} className="space-y-3">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Nova password"
                            required
                            className="w-full text-[13px] text-brand-primary bg-brand-primary/[0.03] border border-brand-primary/[0.08] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent/20 placeholder:text-brand-primary/25 transition-all"
                        />
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirmar nova password"
                            required
                            className="w-full text-[13px] text-brand-primary bg-brand-primary/[0.03] border border-brand-primary/[0.08] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent/20 placeholder:text-brand-primary/25 transition-all"
                        />
                        <button
                            type="submit"
                            disabled={loading || !password || !confirmPassword}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Guardar nova password
                        </button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
