"use client";

import { useEffect, useRef, useState } from "react";

interface AsciiHeroAnimationProps {
  ascii: string;
}

export function AsciiHeroAnimation({ ascii }: AsciiHeroAnimationProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"hidden" | "revealing" | "idle">("hidden");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPhase("revealing");
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== "revealing") return;
    const timer = setTimeout(() => setPhase("idle"), 3200);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <>
      <style jsx>{`
        @keyframes ascii-sweep {
          from {
            -webkit-mask-position: 200% 0;
            mask-position: 200% 0;
          }
          to {
            -webkit-mask-position: 0% 0;
            mask-position: 0% 0;
          }
        }

        @keyframes ascii-breathe {
          0%,
          100% {
            opacity: 0.16;
            text-shadow: 0 0 40px rgba(10, 27, 182, 0.15);
          }
          50% {
            opacity: 0.22;
            text-shadow: 0 0 80px rgba(10, 27, 182, 0.35);
          }
        }

        .ascii-container {
          position: relative;
        }

        .ascii-pre {
          margin: 0;
          width: max-content;
          max-width: 92vw;
          overflow: hidden;
          font-family: monospace;
          line-height: 1;
          letter-spacing: 0;
          white-space: pre;
          user-select: none;
          color: rgba(239, 233, 221, 0.2);
          font-size: min(
            calc((100vw - 2.5rem) / 400),
            calc((100dvh - 14rem) / 121)
          );
        }

        .ascii-hidden {
          opacity: 0;
        }

        .ascii-revealing {
          -webkit-mask-image: linear-gradient(
            to right,
            black,
            black 60%,
            transparent 100%
          );
          mask-image: linear-gradient(
            to right,
            black,
            black 60%,
            transparent 100%
          );
          -webkit-mask-size: 300% 100%;
          mask-size: 300% 100%;
          -webkit-mask-position: 200% 0;
          mask-position: 200% 0;
          animation: ascii-sweep 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)
            forwards;
        }

        .ascii-idle {
          animation: ascii-breathe 6s ease-in-out infinite;
        }

        .ascii-vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(
            600px 380px at 50% 55%,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 0.55) 70%,
            rgba(0, 0, 0, 0.85) 100%
          );
        }

        .ascii-edge-fade {
          position: absolute;
          inset: 0;
          pointer-events: none;
          -webkit-mask-image: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 1) 12%,
            rgba(0, 0, 0, 1) 75%,
            rgba(0, 0, 0, 0) 100%
          );
          mask-image: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 1) 12%,
            rgba(0, 0, 0, 1) 75%,
            rgba(0, 0, 0, 0) 100%
          );
        }
      `}</style>

      <div ref={ref} className="ascii-container">
        <div className="ascii-edge-fade">
          <pre
            className={`ascii-pre ${
              phase === "hidden"
                ? "ascii-hidden"
                : phase === "revealing"
                  ? "ascii-revealing"
                  : "ascii-idle"
            }`}
            style={{
              textShadow: "0 0 70px rgba(10,27,182,0.35)",
            }}
          >
            {ascii}
          </pre>
        </div>
        <div className="ascii-vignette" />
      </div>
    </>
  );
}
