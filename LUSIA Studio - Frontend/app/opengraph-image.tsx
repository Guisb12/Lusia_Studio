import { ImageResponse } from "next/og";

export const alt = "LUSIA Studio — plataforma educativa com IA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0a0c0f",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 72,
          color: "#efe9dd",
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            opacity: 0.55,
          }}
        >
          LUSIA
        </div>
        <div style={{ marginTop: 12, fontSize: 72, fontWeight: 600, letterSpacing: "-0.03em" }}>
          Studio
        </div>
        <div style={{ marginTop: 28, fontSize: 30, opacity: 0.72, maxWidth: 720, lineHeight: 1.25 }}>
          Aprendizagem com inteligência artificial, pensada para a forma como aprendes.
        </div>
      </div>
    ),
    { ...size },
  );
}
