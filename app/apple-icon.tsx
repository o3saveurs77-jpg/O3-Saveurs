import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const RAYS = Array.from({ length: 16 }, (_, i) => (i / 16) * 360);

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#a6243a",
        }}
      >
        {RAYS.map((deg, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 8,
              height: 22,
              background: "#f2b705",
              borderRadius: 4,
              top: 8,
              left: "50%",
              marginLeft: -4,
              transformOrigin: "4px 82px",
              transform: `rotate(${deg}deg)`,
            }}
          />
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 148,
            height: 148,
            borderRadius: "50%",
            background: "#e8732a",
            color: "#fff",
            fontWeight: 800,
            fontSize: 74,
          }}
        >
          Ô3
        </div>
      </div>
    ),
    { ...size }
  );
}
