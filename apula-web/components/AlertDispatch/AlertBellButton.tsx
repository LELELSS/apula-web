"use client";

import { useEffect, useState } from "react";
import { FaBell } from "react-icons/fa";
import styles from "./alertBellButton.module.css";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";

const normalizeStatus = (value: unknown) =>
  String(value || "").trim().toLowerCase();

const isOpenBackupRequest = (data: Record<string, unknown>) => {
  const status =
    normalizeStatus(data.status) ||
    normalizeStatus(data.requestStatus) ||
    normalizeStatus(data.backupStatus) ||
    normalizeStatus(data.dispatchStatus);

  if (
    status === "resolved" ||
    status === "closed" ||
    status === "completed" ||
    status === "done" ||
    status === "approved" ||
    status === "dispatched" ||
    status === "accepted" ||
    status === "declined" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return false;
  }

  if (
    status === "pending" ||
    status === "active" ||
    status === "open" ||
    status === "requested" ||
    status === "waiting" ||
    status === "new"
  ) {
    return true;
  }

  if (typeof data.resolved === "boolean") return !data.resolved;
  if (typeof data.isResolved === "boolean") return !data.isResolved;
  if (typeof data.completed === "boolean") return !data.completed;
  if (typeof data.isCompleted === "boolean") return !data.isCompleted;

  return true;
};

const isOpenAlert = (data: Record<string, unknown>) => {
  const status = normalizeStatus(data.status);
  const confirmationStatus = normalizeStatus(data.confirmationStatus);
  const dispatchStatus = normalizeStatus(data.dispatchStatus);
  const monitoringStatus = normalizeStatus(data.monitoringStatus);

  if (
    status === "confirmed" ||
    status === "resolved" ||
    status === "closed" ||
    status === "completed" ||
    status === "done" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return false;
  }

  if (
    confirmationStatus === "confirmed" ||
    confirmationStatus === "resolved" ||
    confirmationStatus === "closed" ||
    confirmationStatus === "completed" ||
    confirmationStatus === "done" ||
    confirmationStatus === "cancelled" ||
    confirmationStatus === "canceled"
  ) {
    return false;
  }

  if (
    status === "pending" ||
    status === "dispatched" ||
    status === "validated"
  ) {
    return true;
  }

  if (
    dispatchStatus === "pending" ||
    dispatchStatus === "dispatched" ||
    dispatchStatus === "validated"
  ) {
    return true;
  }

  if (
    confirmationStatus === "pending" ||
    confirmationStatus === "for confirmation" ||
    confirmationStatus === "validated" ||
    confirmationStatus === "waiting"
  ) {
    return true;
  }

  if (
    monitoringStatus === "pending" ||
    monitoringStatus === "validated" ||
    monitoringStatus === "for confirmation" ||
    monitoringStatus === "waiting"
  ) {
    return true;
  }

  if (typeof data.confirmed === "boolean") return !data.confirmed;
  if (typeof data.isConfirmed === "boolean") return !data.isConfirmed;
  if (typeof data.resolved === "boolean") return !data.resolved;

  return false;
};

type AlertBellButtonProps = {
  enableSound?: boolean;
};

const AlertBellButton = ({ enableSound = true }: AlertBellButtonProps) => {
  const [alertCount, setAlertCount] = useState(0);
  const [backupCount, setBackupCount] = useState(0);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const totalCount = alertCount + backupCount;

  useEffect(() => {
    if (!enableSound) return;

    const alarm = new Audio("/sounds/fire_alarm.mp3");
    alarm.loop = true;
    setAudio(alarm);

    return () => {
      alarm.pause();
      alarm.currentTime = 0;
    };
  }, [enableSound]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "alerts"), (snap) => {
      const openCount = snap.docs.reduce((count, docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return isOpenAlert(data) ? count + 1 : count;
      }, 0);

      setAlertCount(openCount);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    let latestSnakeCount = 0;
    let latestCamelCount = 0;

    const handleCountUpdate = (source: "snake" | "camel", count: number) => {
      if (source === "snake") {
        latestSnakeCount = count;
      } else {
        latestCamelCount = count;
      }

      setBackupCount(Math.max(latestSnakeCount, latestCamelCount));
    };

    const unsubSnake = onSnapshot(collection(db, "backup_requests"), (snap) => {
      const openCount = snap.docs.reduce((count, docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return isOpenBackupRequest(data) ? count + 1 : count;
      }, 0);

      handleCountUpdate("snake", openCount);
    });

    const unsubCamel = onSnapshot(
      collection(db, "backupRequests"),
      (snap) => {
        const openCount = snap.docs.reduce((count, docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return isOpenBackupRequest(data) ? count + 1 : count;
        }, 0);

        handleCountUpdate("camel", openCount);
      },
      () => handleCountUpdate("camel", 0),
    );

    return () => {
      unsubSnake();
      unsubCamel();
    };
  }, []);

  useEffect(() => {
    if (!enableSound || !audio) return;

    const shouldPlayAlarm = alertCount > 0 || backupCount > 0;

    if (shouldPlayAlarm && !isPlaying) {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }

    if (!shouldPlayAlarm && isPlaying) {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
    }
  }, [alertCount, backupCount, audio, isPlaying, enableSound]);

  useEffect(() => {
    if (enableSound) return;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    if (isPlaying) {
      setIsPlaying(false);
    }
  }, [enableSound, audio, isPlaying]);

  const handleClick = () => {
    window.dispatchEvent(new Event("open-alert-dispatch"));
  };

  return (
    <button
      className={styles.floatingBell}
      onClick={handleClick}
      aria-label="Open fire alerts"
    >
      <span className={styles.tooltip}>Fire Alerts</span>

      <FaBell className={styles.icon} />

      {totalCount > 0 && <span className={styles.badge}>{totalCount}</span>}
    </button>
  );
};

export default AlertBellButton;