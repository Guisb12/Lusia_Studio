"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DocsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[Docs] Page error:", error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <div>
                <h2 className="text-lg font-medium text-brand-primary">Algo correu mal</h2>
                <p className="text-sm text-brand-primary/50 mt-1">
                    Não foi possível carregar os materiais.
                </p>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>
                Tentar novamente
            </Button>
        </div>
    );
}
