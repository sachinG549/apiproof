import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f3ecdf",
          color: "#1c1612",
          padding: "72px",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 4, color: "#1f5c40" }}>APIPROOF</div>
        <div style={{ display: "flex", fontSize: 68, lineHeight: 1.05, maxWidth: 900 }}>
          Can an AI agent actually complete a task with your API?
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#3e362f" }}>
          Task success for OpenAPI. Not a document score.
        </div>
      </div>
    ),
    size,
  );
}
