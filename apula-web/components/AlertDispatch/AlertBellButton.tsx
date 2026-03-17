"use client";

import { useEffect, useState } from "react";
import { FaBell } from "react-icons/fa";
import styles from "./alertBellButton.module.css";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase();

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

const AlertBellButton = () => {
  const [alertCount, setAlertCount] = useState(0);
  const [backupCount, setBackupCount] = useState(0);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const totalCount = alertCount + backupCount;

  // 🔊 Initialize alarm sound
  useEffect(() => {
    const alarm = new Audio("/sounds/fire_alarm.mp3");
    alarm.loop = true;
    setAudio(alarm);
  }, []);

  // 🔥 Real-time listen to pending alerts
  useEffect(() => {
    const q = query(
      collection(db, "alerts"),
      where("status", "==", "Pending")
    );

    const unsub = onSnapshot(q, (snap) => {
      setAlertCount(snap.size);
    });

    return () => unsub();
  }, []);

  // 🚒 Real-time listen to pending backup requests
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "backupRequests"), (snap) => {
      const openCount = snap.docs.reduce((count, docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return isOpenBackupRequest(data) ? count + 1 : count;
      }, 0);

      setBackupCount(openCount);
    });

    return () => unsub();
  }, []);

  // 🔊 Play sound if alerts or backup requests exist
  useEffect(() => {
    if (!audio) return;

    if (totalCount > 0 && !isPlaying) {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }

    if (totalCount === 0 && isPlaying) {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
    }
  }, [totalCount, audio, isPlaying]);

  const handleClick = () => {
    window.dispatchEvent(new Event("open-alert-dispatch"));
  };

  return (
    <button className={styles.floatingBell} onClick={handleClick}>
      <FaBell className={styles.icon} />

      {/* 🔴 Badge = alerts + backup requests */}
      {totalCount > 0 && (
        <span className={styles.badge}>{totalCount}</span>
      )}
    </button>
  );
};

export default AlertBellButton;