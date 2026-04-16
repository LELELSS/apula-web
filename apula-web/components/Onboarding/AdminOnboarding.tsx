"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./adminOnboarding.module.css";

type Step = {
  target: string;
  title: string;
  description: string;
  placement?: "right" | "bottom" | "left";
};

type RectState = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const SESSION_KEY = "apula_onboarding_shown";

const allSteps: Step[] = [
  { target: "#nav-dashboard", title: "Dashboard", description: "Overview of system data.", placement: "right" },
  { target: "#nav-notification", title: "Notifications", description: "View alerts and updates.", placement: "right" },
  { target: "#nav-users", title: "Users", description: "Manage system users.", placement: "right" },
  { target: "#nav-admin-activity", title: "Admin Activity", description: "View admin logs.", placement: "right" },
  { target: "#nav-request", title: "Request", description: "Approve account requests.", placement: "right" },
  { target: "#nav-team", title: "Truck and Team", description: "Manage teams and trucks.", placement: "right" },
  { target: "#nav-assign", title: "Assign", description: "Assign responders.", placement: "right" },
  { target: "#nav-station", title: "Stations", description: "Manage stations.", placement: "right" },
  { target: "#nav-dispatch", title: "Dispatch", description: "Dispatch teams.", placement: "right" },
  { target: "#nav-reports", title: "Reports", description: "View reports.", placement: "right" },
  { target: "#nav-settings", title: "Settings", description: "Account settings.", placement: "right" },
];

export default function AdminOnboarding() {
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<RectState | null>(null);
  const [sidebarOpened, setSidebarOpened] = useState(false);

  const rafRef = useRef<number | null>(null);

  const currentStep = steps[stepIndex];
  const progress = steps.length > 0 ? ((stepIndex + 1) / steps.length) * 100 : 0;

  // ✅ Show once per session
  useEffect(() => {
  if (typeof window === "undefined") return; // 🔥 prevent SSR crash

  try {
    const shown = window.sessionStorage.getItem(SESSION_KEY);

    if (!shown) {
      setVisible(true);
      window.sessionStorage.setItem(SESSION_KEY, "true");
    }
  } catch (err) {
    // fallback if storage is blocked
    setVisible(true);
  }
}, []);

  // ✅ SAFE: filter steps ONLY on client
  useEffect(() => {
    if (!visible) return;

    const filtered = allSteps.filter((step) => {
      if (step.target === "#nav-admin-activity") {
        return !!document.querySelector("#nav-admin-activity");
      }
      return true;
    });

    setSteps(filtered);
  }, [visible]);

  // ✅ Open sidebar
  useEffect(() => {
    if (!visible || sidebarOpened) return;

    window.dispatchEvent(new Event("apula-open-sidebar"));
    setSidebarOpened(true);
  }, [visible, sidebarOpened]);

  // ✅ Highlight logic
  useEffect(() => {
    if (!visible || !sidebarOpened || !currentStep) return;

    const update = () => {
      const el = document.querySelector(currentStep.target) as HTMLElement | null;

      if (!el) return;

      const r = el.getBoundingClientRect();

      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    };

    const timer = setTimeout(update, 400);

    const loop = () => {
      update();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [visible, sidebarOpened, currentStep]);

  const closeTour = () => {
    window.dispatchEvent(new Event("apula-close-sidebar"));
    setVisible(false);
  };

  const next = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((prev) => prev + 1);
    } else {
      closeTour();
    }
  };

  const prev = () => {
    if (stepIndex > 0) setStepIndex((prev) => prev - 1);
  };

  if (!visible || !rect || !currentStep) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} />

      <div
        className={styles.spotlight}
        style={{
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
        }}
      />

      <div className={styles.tooltipCard}>
        <h3>{currentStep.title}</h3>
        <p>{currentStep.description}</p>

        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className={styles.footer}>
          <button onClick={closeTour}>Skip</button>
          <button onClick={prev}>Back</button>
          <button onClick={next}>
            {stepIndex === steps.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}