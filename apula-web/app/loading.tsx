"use client";
import Lottie from "lottie-react";
import fireAnimation from "@/public/lottie/fire.json";

export default function Loading() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#ffffff",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 99999,
      }}
    >
      <Lottie
        animationData={fireAnimation}
        loop={true}
        autoplay={true}
        style={{
          width: 160,
          height: 160,
        }}
      />
    </div>
  );
}