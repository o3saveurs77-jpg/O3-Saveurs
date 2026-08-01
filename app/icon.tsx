import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

const RAYS = Array.from({ length: 16 }, (_, i) => (i / 16) * 360);

export default function Icon() {
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
          borderRadius: "50%",
        }}
      >
        {RAYS.map((deg, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 3,
              height: 9,
              background: "#f2b705",
              borderRadius: 2,
              top: 3,
              left: "50%",
              marginLeft: -1.5,
              transformOrigin: "1.5px 29px",
              transform: `rotate(${deg}deg)`,
            }}
          />
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "#e8732a",
            color: "#fff",
            fontWeight: 800,
            fontSize: 26,
          }}
        >
          Ô3
        </div>
      </div>
    ),
    { ...size }
  );
}
