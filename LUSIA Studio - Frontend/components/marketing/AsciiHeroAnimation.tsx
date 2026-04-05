"use client";

import { useEffect, useRef, useState } from "react";

interface AsciiHeroAnimationProps {
  ascii: string;
}

export function AsciiHeroAnimation({ ascii }: AsciiHeroAnimationProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style jsx>{`
        @keyframes ascii-reveal {
          from {
            -webkit-mask-position: 200% 0;
            mask-position: 200% 0;
          }
          to {
            -webkit-mask-position: 0% 0;
            mask-position: 0% 0;
          }
        }

        @keyframes ascii-glow-sweep {
          0% {
            background-position: -100% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        @keyframes ascii-breathe {
          0%,
          100% {
            opacity: 0.35;
            filter: brightness(1);
          }
          50% {
            opacity: 0.5;
            filter: brightness(1.15);
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
          color: rgba(239, 233, 221, 0.35);
          text-shadow: 0 0 50px rgba(10, 27, 182, 0.25);
          font-size: min(
            calc((100vw - 2.5rem) / 400),
            calc((100dvh - 14rem) / 121)
          );
        }

        .ascii-hidden {
          opacity: 0;
        }

        .ascii-visible {
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
          animation: ascii-reveal 2.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)
              forwards,
            ascii-breathe 7s ease-in-out 3s infinite;
        }

        /* Glow sweep overlay — adds a moving highlight across the art */
        .ascii-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 1s ease 3s;
          background: linear-gradient(
            105deg,
            transparent 0%,
            transparent 35%,
            rgba(102, 192, 238, 0.12) 45%,
            rgba(10, 27, 182, 0.18) 50%,
            rgba(102, 192, 238, 0.12) 55%,
            transparent 65%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: ascii-glow-sweep 8s ease-in-out 3.5s infinite;
          mix-blend-mode: screen;
        }

        .ascii-glow.active {
          opacity: 1;
        }

        .ascii-vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(
            600px 380px at 50% 55%,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 0.45) 65%,
            rgba(0, 0, 0, 0.75) 100%
          );
        }

        .ascii-edge-fade {
          position: relative;
          -webkit-mask-image: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 1) 10%,
            rgba(0, 0, 0, 1) 78%,
            rgba(0, 0, 0, 0) 100%
          );
          mask-image: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 1) 10%,
            rgba(0, 0, 0, 1) 78%,
            rgba(0, 0, 0, 0) 100%
          );
        }
      `}</style>

      <div ref={ref} className="ascii-container">
        <div className="ascii-edge-fade">
          <pre className={`ascii-pre ${revealed ? "ascii-visible" : "ascii-hidden"}`}>
            {ascii}
          </pre>
          <div className={`ascii-glow ${revealed ? "active" : ""}`} />
        </div>
        <div className="ascii-vignette" />
      </div>
    </>
  );
}
