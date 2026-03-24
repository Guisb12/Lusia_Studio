"use client";

import React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WizardConfirm } from "@/lib/wizard-types";

interface AgentConfirmDockProps {
    confirm: WizardConfirm;
    onConfirm: () => void;
    disabled?: boolean;
}

export function AgentConfirmDock({ confirm, onConfirm, disabled }: AgentConfirmDockProps) {
    return (
        <div className="space-y-3">
            <Button
                onClick={onConfirm}
                disabled={disabled}
                className="w-full gap-2"
            >
                <Check className="h-4 w-4" />
                Confirmar
            </Button>
        </div>
    );
}
