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
      { threshold: 0.05 }
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
            opacity: 0.3;
            filter: brightness(1);
          }
          50% {
            opacity: 0.45;
            filter: brightness(1.12);
          }
        }

        .ascii-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .ascii-scroll {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ascii-pre {
          margin: 0;
          width: max-content;
          overflow: hidden;
          font-family: monospace;
          line-height: 1;
          letter-spacing: 0;
          white-space: pre;
          user-select: none;
          color: rgba(239, 233, 221, 0.3);
          text-shadow: 0 0 60px rgba(10, 27, 182, 0.3);
          font-size: min(
            calc(100vw / 200),
            calc(100dvh / 61)
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
            rgba(102, 192, 238, 0.1) 45%,
            rgba(10, 27, 182, 0.16) 50%,
            rgba(102, 192, 238, 0.1) 55%,
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

        .ascii-edge-fade {
          position: absolute;
          inset: 0;
          -webkit-mask-image: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 1) 6%,
            rgba(0, 0, 0, 1) 85%,
            rgba(0, 0, 0, 0) 100%
          );
          mask-image: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 1) 6%,
            rgba(0, 0, 0, 1) 85%,
            rgba(0, 0, 0, 0) 100%
          );
        }
      `}</style>

      <div ref={ref} className="ascii-bg">
        <div className="ascii-edge-fade">
          <div className="ascii-scroll">
            <pre
              className={`ascii-pre ${revealed ? "ascii-visible" : "ascii-hidden"}`}
            >
              {ascii}
            </pre>
          </div>
          <div className={`ascii-glow ${revealed ? "active" : ""}`} />
        </div>
      </div>
    </>
  );
}
