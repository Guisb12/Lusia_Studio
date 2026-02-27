"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChatInput } from "./ChatInput";

interface ChatSplashProps {
  userName?: string | null;
  onSend: (text: string, images?: string[]) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onCancel?: () => void;
}

export function ChatSplash({
  userName,
  onSend,
  disabled,
  isStreaming,
  onCancel,
}: ChatSplashProps) {
  const firstName = userName?.split(" ")[0] || "Aluno";

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
      {/* Animated logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.4, type: "spring", stiffness: 200, damping: 20 }}
        className="relative mb-8"
      >
        {/* Pulsing glow */}
        <div
          className="absolute pulse-glow"
          style={{
            background: "radial-gradient(circle, rgba(10,27,182,0.10) 0%, transparent 70%)",
            width: 220,
            height: 220,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            filter: "blur(25px)",
            borderRadius: "50%",
          }}
        />
        <motion.div
          whileHover={{ rotate: 8, scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className="relative w-[140px] h-[140px]"
        >
          <Image
            src="/lusia-symbol.png"
            alt="Lusia"
            fill
            className="object-contain drop-shadow-lg"
            priority
          />
        </motion.div>
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="text-2xl sm:text-3xl font-instrument text-brand-primary text-center mb-2"
      >
        Como posso ajudar hoje,{" "}
        <span className="font-extrabold text-brand-accent">{firstName}</span>?
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.7 }}
        className="text-sm text-brand-primary/50 text-center"
      >
        A tua tutora de inteligência artificial
      </motion.p>

      {/* Gradient divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="w-full max-w-md my-6"
      >
        <div
          className="h-px mx-auto animate-divider"
          style={{
            background: "linear-gradient(to right, transparent, rgba(21,49,107,0.15), transparent)",
          }}
        />
      </motion.div>

      {/* Input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.0 }}
        className="w-full max-w-2xl"
      >
        <ChatInput
          onSend={onSend}
          onCancel={onCancel}
          disabled={disabled}
          isStreaming={isStreaming}
        />
      </motion.div>
    </div>
  );
}
