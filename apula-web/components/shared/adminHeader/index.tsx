"use client";

import Image from "next/image";
import styles from "./adminheaderstyles.module.css";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Bell,
  FileText,
  Settings,
  LogOut,
  Send,
  ClipboardList,
  CarFront, Car,
  MapPin,
  Menu,
  X,
} from "lucide-react";

import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { clearSessionCookie } from "@/lib/session";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
} from "firebase/firestore";

export default function AdminHeader() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState<string>("Loading...");
  const [initial, setInitial] = useState<string>("?");
  const [role, setRole] = useState<string>("admin");
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] = useState(0);

  // 🔊 SOUND STATES
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const isActive = (path: string) => pathname === path;

  const getFirstNameInitial = (value?: string) => {
    if (!value) return "U";

    const trimmed = value.trim();
    if (!trimmed) return "U";

    const firstToken = trimmed.split(/\s+/)[0];
    const base = firstToken.includes("@") ? firstToken.split("@")[0] : firstToken;
    const match = base.match(/[A-Za-z0-9]/);

    return match ? match[0].toUpperCase() : "U";
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } finally {
      clearSessionCookie();
      window.location.replace("/login");
    }
  };

  // 🔊 INITIALIZE LOOPING SOUND (GLOBAL)
  useEffect(() => {
    const audioElement = new Audio("/sounds/fire_alarm.mp3");
    audioElement.loop = true; // keep looping
    setAudio(audioElement);
  }, []);

  // 🔥 Realtime unread count (GLOBAL)
  useEffect(() => {
    let alertUnread = 0;
    let backupUnread = 0;

    const syncUnread = () => {
      setUnreadCount(alertUnread + backupUnread);
    };

    const unsubscribeAlerts = onSnapshot(collection(db, "alerts"), (snapshot) => {
      alertUnread = snapshot.docs.reduce((count, docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return data.read === true ? count : count + 1;
      }, 0);
      syncUnread();
    });

    const unsubscribeBackup = onSnapshot(collection(db, "backup_requests"), (snapshot) => {
      backupUnread = snapshot.docs.reduce((count, docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return data.read === true ? count : count + 1;
      }, 0);
      syncUnread();
    });

    return () => {
      unsubscribeAlerts();
      unsubscribeBackup();
    };
  }, []);

  // 🔊 Play or stop sound based on unreadCount (GLOBAL)
  useEffect(() => {
    if (!audio) return;

    if (unreadCount > 0 && !isPlaying) {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }

    if (unreadCount === 0 && isPlaying) {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
    }
  }, [unreadCount, audio]);

  // 👤 Load user name/role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserName("Guest");
        setInitial(getFirstNameInitial("Guest"));
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const name = data.name || "User";

          setUserName(name);
          setInitial(getFirstNameInitial(name));
          setRole(data.role || "admin");
        } else {
          const display = user.displayName || "User";
          setUserName(display);
          setInitial(getFirstNameInitial(display || user.email || "User"));
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
        setUserName("User");
        setInitial(getFirstNameInitial("User"));
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarHeader}>
          <Image src="/logo.png" alt="Sidebar Logo" width={150} height={75} />
          <button
            className={styles.closeSidebar}
            onClick={toggleSidebar}
            aria-label="Close sidebar"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <nav className={styles.sidebarNav}>
          <a
            href="/dashboard"
            className={`${styles.sidebarLink} ${isActive("/dashboard") ? styles.activeLink : ""}`}
            onClick={() => setSidebarOpen(false)}
          >
            <LayoutDashboard size={18} className={styles.icon} />
            <span>Dashboard</span>
          </a>

          {/* Notifications with real-time badge */}
          <a
            href="/dashboard/notifications"
            className={`${styles.sidebarLink} ${
              isActive("/dashboard/notifications") ? styles.activeLink : ""
            }`}
            onClick={() => setSidebarOpen(false)}
          >
            <div className={styles.notifWrapper}>
              <Bell size={18} className={styles.icon} />
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className={styles.badge}>{unreadCount}</span>
              )}
            </div>
          </a>

          {/* SUPER ADMIN ONLY */}
          {role === "superadmin" && (
            <a
              href="/dashboard/users"
              className={`${styles.sidebarLink} ${isActive("/dashboard/users") ? styles.activeLink : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Users size={18} className={styles.icon} />
              <span>Users</span>
            </a>
          )}

          <a
            href="/dashboard/ResponderRequest"
            className={`${styles.sidebarLink} ${
              isActive("/dashboard/ResponderRequest") ? styles.activeLink : ""
            }`}
            onClick={() => setSidebarOpen(false)}
          >
            <UserCheck size={18} className={styles.icon} />
            <span>Request</span>
          </a>

<a
  href="/dashboard/Management"
  className={`${styles.sidebarLink} ${
    isActive("/dashboard/Management") ? styles.activeLink : ""
  }`}
  onClick={() => setSidebarOpen(false)}
>
  <Car size={18} className={styles.icon} />
  <span>Truck & Team</span>
</a>


          <a
  href="/dashboard/Assign"
  className={`${styles.sidebarLink} ${
    isActive("/dashboard/Assign") ? styles.activeLink : ""
  }`}
            onClick={() => setSidebarOpen(false)}
>
  <ClipboardList size={18} className={styles.icon} />
<span>Assign</span>

</a>

          <a
            href="/dashboard/stations"
            className={`${styles.sidebarLink} ${
              isActive("/dashboard/stations") ? styles.activeLink : ""
            }`}
            onClick={() => setSidebarOpen(false)}
          >
            <MapPin size={18} className={styles.icon} />
            <span>Stations</span>
          </a>

          {<a
            href="/dashboard/dispatch"
            className={`${styles.sidebarLink} ${
              isActive("/dashboard/dispatch") ? styles.activeLink : ""
            }`}
            onClick={() => setSidebarOpen(false)}
          >
            <Send size={18} className={styles.icon} />
            <span>Dispatch</span>
          </a>/* DISPATCHER ONLY */}

          <a
            href="/dashboard/reports"
            className={`${styles.sidebarLink} ${
              isActive("/dashboard/reports") ? styles.activeLink : ""
            }`}
            onClick={() => setSidebarOpen(false)}
          >
            <FileText size={18} className={styles.icon} />
            <span>Reports</span>
          </a>

          <a
            href="/dashboard/settings"
            className={`${styles.sidebarLink} ${
              isActive("/dashboard/settings") ? styles.activeLink : ""
            }`}
            onClick={() => setSidebarOpen(false)}
          >
            <Settings size={18} className={styles.icon} />
            <span>Settings</span>
          </a>
        </nav>

        <button className={styles.logoutLink} onClick={handleLogout}>
          <LogOut size={18} className={styles.icon} />
          Logout
        </button>
      </aside>

      {sidebarOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoWrapper}>
          <div className={styles.menuWrapper}>
            <button className={styles.menuButton} onClick={toggleSidebar} aria-label="Open sidebar" type="button">
              <Menu size={22} />
            </button>
            {unreadCount > 0 && <span className={styles.menuBadge}>{unreadCount}</span>}
          </div>
          <Image src="/logo.png" alt="Logo" width={100} height={50} />
        </div>

        <div className={styles.rightWrapper}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>Welcome, {userName}!</span>
            <div className={styles.userIcon}>{initial}</div>
          </div>
        </div>
      </header>
    </>
  );
}
