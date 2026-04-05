"use client";

import { useLayoutEffect, useRef, useState } from "react";

type AsciiHeroCanvasProps = {
  ascii: string;
};

export function AsciiHeroCanvas({ ascii }: AsciiHeroCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLPreElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const art = artRef.current;

    if (!frame || !art) {
      return;
    }

    const fit = () => {
      const frameRect = frame.getBoundingClientRect();
      const artWidth = art.scrollWidth;
      const artHeight = art.scrollHeight;

      if (!frameRect.width || !frameRect.height || !artWidth || !artHeight) {
        return;
      }

      const paddingX = 48;
      const paddingY = 48;
      const nextScale = Math.min(
        (frameRect.width - paddingX) / artWidth,
        (frameRect.height - paddingY) / artHeight,
      );

      setScale(Math.max(0.06, Math.min(nextScale, 1)));
    };

    fit();

    const observer = new ResizeObserver(() => {
      fit();
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, [ascii]);

  return (
    <div
      ref={frameRef}
      className="relative aspect-[16/9] w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(12,14,18,0.96),rgba(8,10,13,0.88))] shadow-[0_30px_100px_rgba(0,0,0,0.45)]"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 560px at 52% 38%, rgba(21,49,107,0.30) 0%, rgba(21,49,107,0.10) 22%, rgba(9,11,15,0.0) 55%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))",
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-8">
        <pre
          ref={artRef}
          className="m-0 origin-center select-none whitespace-pre font-mono leading-[0.9] tracking-[-0.06em] text-[10px]"
          style={{
            transform: `scale(${scale})`,
            color: "rgba(239,233,221,0.24)",
            textShadow: "0 0 80px rgba(21,49,107,0.25)",
          }}
        >
          {ascii}
        </pre>
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 700px at 50% 78%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.30) 55%, rgba(0,0,0,0.78) 100%)",
        }}
      />
    </div>
  );
}
