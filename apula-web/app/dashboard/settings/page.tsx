"use client";

import React, { useState } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import styles from "./settingsStyles.module.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { auth, db } from "@/lib/firebase";
import { updatePassword, updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";

const SettingsPage = () => {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ❌ AUTH PROTECTION + USER DATA LOADING (COMMENTED OUT)
  /*
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setName(data.name || user.displayName || "");
        } else {
          setName(user.displayName || "");
        }
      } catch (error) {
        console.error("Error loading user data:", error);
        toast.error("Failed to load user data");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);
  */

  // ✅ Save changes handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
      toast.error("No user is logged in");
      return;
    }

    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }

    if (password && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      await updateProfile(user, { displayName: name });
      await updateDoc(doc(db, "users", user.uid), { name });

      if (password) {
        await updatePassword(user, password);
      }

      toast.success("Settings updated successfully!");
      setPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Error updating settings:", error);
      toast.error(error.message || "Failed to update settings");
    }
  };

  return (
    <div>
      <AdminHeader />

      {/* 🔔 Bell Icon */}
      <div style={{ position: "absolute", top: 20, right: 30, zIndex: 50 }}>
        <AlertBellButton />
      </div>

      {/* 🚨 Alert Dispatch Modal */}
      <AlertDispatchModal />

      <div className={styles.container}>
        <div className={styles.contentSection}>
          <div className={styles.headerRow}>
            <h2 className={styles.pageTitle}>Account Settings</h2>
          </div>

          <hr className={styles.separator} />

          <form onSubmit={handleSave} className={styles.form}>

            <label className={styles.label}>Full Name</label>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
            />

            <label className={styles.label}>New Password</label>
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
            />

            <label className={styles.label}>Confirm Password</label>
            <input
              type="password"
              className={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />

            <button type="submit" className={styles.saveBtn}>
              <span>Save Changes</span>
            </button>
          </form>

          <ToastContainer position="top-center" autoClose={2500} />
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;