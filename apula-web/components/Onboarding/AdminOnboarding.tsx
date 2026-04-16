"use client";

import { useEffect, useRef, useState } from "react";
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
  {
    target: "#nav-dashboard",
    title: "Dashboard",
    description:
      "This page can be found on the sidebar. It provides a summarized overview of active fire incidents, available teams, available trucks, responders, and confirmed incidents.",
    placement: "right",
  },
  {
    target: "#nav-notification",
    title: "Notifications",
    description:
      "This page can be found on the sidebar. It displays system notifications and fire-related alerts for monitoring important updates.",
    placement: "right",
  },
  {
    target: "#nav-users",
    title: "Users",
    description:
      "This page can be found on the sidebar. It allows the admin to review and manage registered users of the system.",
    placement: "right",
  },
  {
    target: "#nav-admin-activity",
    title: "Admin Activity",
    description:
      "This page can be found on the sidebar. It allows the super admin to review admin activity logs for accountability and monitoring.",
    placement: "right",
  },
  {
    target: "#nav-request",
    title: "Request",
    description:
      "This page can be found on the sidebar. It is used to review and confirm pending admin and responder account requests.",
    placement: "right",
  },
  {
    target: "#nav-team",
    title: "Truck and Team",
    description:
      "This page can be found on the sidebar. It allows the admin to add, edit, or delete responder team and truck records.",
    placement: "right",
  },
  {
    target: "#nav-assign",
    title: "Assign",
    description:
      "This page can be found on the sidebar. It is used to assign responders to their respective teams.",
    placement: "right",
  },
  {
    target: "#nav-station",
    title: "Stations",
    description:
      "This page can be found on the sidebar. It allows the admin to manage team station records and deployment locations.",
    placement: "right",
  },
  {
    target: "#nav-dispatch",
    title: "Dispatch",
    description:
      "This page can be found on the sidebar. It is used to dispatch available teams to fire incidents, with support for recommended nearest teams.",
    placement: "right",
  },
  {
    target: "#nav-reports",
    title: "Reports",
    description:
      "This page can be found on the sidebar. It allows the admin to review fire incident details and download PDF reports.",
    placement: "right",
  },
  {
    target: "#nav-settings",
    title: "Settings",
    description:
      "This page can be found on the sidebar. It allows the admin to update account information such as name and password.",
    placement: "right",
  },
  {
    target: '[aria-label="Open tutorial chatbot"]',
    title: "Chatbot Assistant",
    description:
      "This chatbot provides guidance about system features, navigation pages, alerts, and workflow-related questions.",
    placement: "left",
  },
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const alreadyShown = window.sessionStorage.getItem(SESSION_KEY);

      if (!alreadyShown) {
        setVisible(true);
        window.sessionStorage.setItem(SESSION_KEY, "true");
      }
    } catch {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (typeof document === "undefined") return;

    const filteredSteps = allSteps.filter((step) => {
      if (step.target === "#nav-admin-activity") {
        return !!document.querySelector("#nav-admin-activity");
      }
      return true;
    });

    setSteps(filteredSteps);
  }, [visible]);

  useEffect(() => {
    if (!visible || sidebarOpened) return;
    if (typeof window === "undefined") return;
    if (typeof document === "undefined") return;

    let attempts = 0;
    let cancelled = false;

    const tryOpenSidebar = () => {
      if (cancelled) return;

      window.dispatchEvent(new Event("apula-open-sidebar"));

      const dashboardEl = document.querySelector("#nav-dashboard");
      if (dashboardEl) {
        setSidebarOpened(true);
        return;
      }

      attempts += 1;
      if (attempts < 10) {
        window.setTimeout(tryOpenSidebar, 250);
      }
    };

    const timer = window.setTimeout(tryOpenSidebar, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [visible, sidebarOpened]);

  useEffect(() => {
    if (!visible || !sidebarOpened || !currentStep) return;
    if (typeof document === "undefined") return;
    if (typeof window === "undefined") return;

    const updateTargetRect = () => {
      const element = document.querySelector(currentStep.target) as HTMLElement | null;

      if (!element) {
        setRect(null);
        return;
      }

      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });

      const r = element.getBoundingClientRect();

      if (r.width === 0 || r.height === 0) {
        setRect(null);
        return;
      }

      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    };

    const timer = window.setTimeout(updateTargetRect, 450);

    const handleResizeOrScroll = () => {
      updateTargetRect();
    };

    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);

    const loop = () => {
      updateTargetRect();
      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);

      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [visible, sidebarOpened, currentStep]);

  const closeTour = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("apula-close-sidebar"));
    }
    setVisible(false);
  };

  const nextStep = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((prev) => prev + 1);
      return;
    }

    closeTour();
  };

  const prevStep = () => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1);
    }
  };

  if (!visible || !currentStep || !rect) return null;

  const padding = 10;
  const highlight = {
    top: Math.max(8, rect.top - padding),
    left: Math.max(8, rect.left - padding),
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };

  const getTooltipStyle = () => {
    if (typeof window === "undefined") {
      return { top: 20, left: 20 };
    }

    const placement = currentStep.placement ?? "right";
    const gap = 18;
    const cardWidth = 340;
    const cardHeight = 260;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = highlight.top;
    let left = highlight.left + highlight.width + gap;

    if (placement === "bottom") {
      top = highlight.top + highlight.height + gap;
      left = highlight.left;
    }

    if (placement === "left") {
      top = highlight.top;
      left = highlight.left - cardWidth - gap;
    }

    if (left + cardWidth > viewportWidth - 12) {
      left = viewportWidth - cardWidth - 12;
    }

    if (left < 12) {
      left = 12;
    }

    if (top + cardHeight > viewportHeight - 12) {
      top = viewportHeight - cardHeight - 12;
    }

    if (top < 12) {
      top = 12;
    }

    return { top, left };
  };

  const tooltipStyle = getTooltipStyle();

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} />

      <div
        className={styles.spotlight}
        style={{
          top: `${highlight.top}px`,
          left: `${highlight.left}px`,
          width: `${highlight.width}px`,
          height: `${highlight.height}px`,
          zIndex: 2,
        }}
      >
        <div className={styles.pulseRing} />
      </div>

      <div
        className={styles.tooltipCard}
        style={{
          top: `${tooltipStyle.top}px`,
          left: `${tooltipStyle.left}px`,
          zIndex: 3,
        }}
      >
        <div className={styles.cardHeader}>
          <span className={styles.stepBadge}>
            Step {stepIndex + 1} of {steps.length}
          </span>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={closeTour}
            aria-label="Close onboarding"
          >
            ×
          </button>
        </div>

        <h3 className={styles.title}>{currentStep.title}</h3>
        <p className={styles.description}>{currentStep.description}</p>

        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={closeTour}
          >
            Skip
          </button>

          <div className={styles.footerRight}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={prevStep}
              disabled={stepIndex === 0}
            >
              Back
            </button>

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={nextStep}
            >
              {stepIndex === steps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}