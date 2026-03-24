"use client";

import Image from "next/image";
import styles from "./adminheaderstyles.module.css";
import { useState, useEffect, useRef } from "react";
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
  Car,
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
  query,
  where,
} from "firebase/firestore";
import { logActivity } from "@/lib/activityLog";

export default function AdminHeader() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState<string>("Loading...");
  const [initial, setInitial] = useState<string>("?");
  const [role, setRole] = useState<string>("admin");
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [currentUid, setCurrentUid] = useState("");
  const [greeting, setGreeting] = useState("Good Morning");

  const lastLoggedPathRef = useRef<string>("");

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

  const getGreetingByHour = (date: Date) => {
    const hour = date.getHours();

    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } finally {
      clearSessionCookie();
      window.location.replace("/login");
    }
  };

  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getGreetingByHour(new Date()));
    };

    updateGreeting();

    const interval = setInterval(() => {
      updateGreeting();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // realtime unread notifications count
  useEffect(() => {
    if (!currentUid) {
      setUnreadCount(0);
      return;
    }

    let alertUnread = 0;
    let backupUnread = 0;

    const syncUnread = () => {
      setUnreadCount(alertUnread + backupUnread);
    };

    const unsubscribeAlerts = onSnapshot(collection(db, "alerts"), (snapshot) => {
      alertUnread = snapshot.docs.reduce((count, docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const readers = Array.isArray(data.readBy) ? (data.readBy as string[]) : [];
        return readers.includes(currentUid) ? count : count + 1;
      }, 0);
      syncUnread();
    });

    const unsubscribeBackup = onSnapshot(collection(db, "backup_requests"), (snapshot) => {
      backupUnread = snapshot.docs.reduce((count, docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const readers = Array.isArray(data.readBy) ? (data.readBy as string[]) : [];
        return readers.includes(currentUid) ? count : count + 1;
      }, 0);
      syncUnread();
    });

    return () => {
      unsubscribeAlerts();
      unsubscribeBackup();
    };
  }, [currentUid]);

  // pending responder account requests
  useEffect(() => {
    const unsubscribePendingRequests = onSnapshot(
      query(
        collection(db, "users"),
        where("role", "==", "responder"),
        where("approved", "==", false)
      ),
      (snapshot) => {
        setPendingRequestCount(snapshot.size);
      }
    );

    return () => unsubscribePendingRequests();
  }, []);

  // approved responders with no team yet
  useEffect(() => {
    const unsubscribeUnassigned = onSnapshot(
      query(
        collection(db, "users"),
        where("role", "==", "responder"),
        where("approved", "==", true)
      ),
      (snapshot) => {
        const count = snapshot.docs.filter((docSnap) => {
          const data = docSnap.data();
          const teamId = data.teamId;
          const teamName = data.teamName;

          return (
            !teamId ||
            String(teamId).trim() === "" ||
            !teamName ||
            String(teamName).trim() === ""
          );
        }).length;

        setUnassignedCount(count);
      }
    );

    return () => unsubscribeUnassigned();
  }, []);

  // load logged in user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        clearSessionCookie();
        setUserName("Guest");
        setInitial(getFirstNameInitial("Guest"));
        setCurrentUid("");

        if (pathname.startsWith("/dashboard")) {
          window.location.replace("/login?reason=auth-required");
        }
        return;
      }

      setCurrentUid(user.uid);

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
  }, [pathname]);

  useEffect(() => {
    if (role !== "admin" && role !== "superadmin") return;
    if (!pathname || lastLoggedPathRef.current === pathname) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    lastLoggedPathRef.current = pathname;

    logActivity({
      actorUid: currentUser.uid,
      actorEmail: currentUser.email || "",
      actorName: userName,
      actorRole: role,
      action: "page_visit",
      targetType: "route",
      targetId: pathname,
      details: `Visited ${pathname}`,
      path: pathname,
    });
  }, [pathname, role, userName]);

  return (
    <>
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

          {(role === "superadmin" || role === "admin") && (
            <a
              href="/dashboard/users"
              className={`${styles.sidebarLink} ${isActive("/dashboard/users") ? styles.activeLink : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Users size={18} className={styles.icon} />
              <span>Users</span>
            </a>
          )}

          {role === "superadmin" && (
            <a
              href="/dashboard/admin-activity"
              className={`${styles.sidebarLink} ${isActive("/dashboard/admin-activity") ? styles.activeLink : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <ClipboardList size={18} className={styles.icon} />
              <span>Admin Activity</span>
            </a>
          )}

          <a
            href="/dashboard/ResponderRequest"
            className={`${styles.sidebarLink} ${
              isActive("/dashboard/ResponderRequest") ? styles.activeLink : ""
            }`}
            onClick={() => setSidebarOpen(false)}
          >
            <div className={styles.notifWrapper}>
              <UserCheck size={18} className={styles.icon} />
              <span>Request</span>
              {pendingRequestCount > 0 && (
                <span className={styles.badge}>{pendingRequestCount}</span>
              )}
            </div>
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
            <div className={styles.notifWrapper}>
              <ClipboardList size={18} className={styles.icon} />
              <span>Assign</span>
              {unassignedCount > 0 && (
                <span className={styles.badge}>{unassignedCount}</span>
              )}
            </div>
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

          <a
            href="/dashboard/dispatch"
            className={`${styles.sidebarLink} ${
              isActive("/dashboard/dispatch") ? styles.activeLink : ""
            }`}
            onClick={() => setSidebarOpen(false)}
          >
            <Send size={18} className={styles.icon} />
            <span>Dispatch</span>
          </a>

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

      <header className={styles.header}>
        <div className={styles.logoWrapper}>
          <div className={styles.menuWrapper}>
            <button
              className={styles.menuButton}
              onClick={toggleSidebar}
              aria-label="Open sidebar"
              type="button"
            >
              <Menu size={22} />
            </button>
            {unreadCount > 0 && (
              <span className={styles.menuBadge}>{unreadCount}</span>
            )}
          </div>
          <Image src="/logo.png" alt="Logo" width={100} height={50} />
        </div>

        <div className={styles.rightWrapper}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>
              {greeting}, {userName}
            </span>
          </div>
        </div>
      </header>
    </>
  );
}