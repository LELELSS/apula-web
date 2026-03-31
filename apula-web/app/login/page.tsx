"use client";
import React, { useEffect, useState } from "react";
import styles from "./loginstyles.module.css";
import Image from "next/image";
import logo from "../../assets/fireapula.png";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  createSessionPayload,
  getSessionFromDocumentCookie,
  setSessionCookie,
} from "@/lib/session";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const session = getSessionFromDocumentCookie();
    if (session) {
      window.location.replace("/dashboard");
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please enter both email and password.");
      setShowErrorModal(true);
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        username,
        password,
      );
      const user = userCredential.user;

      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        await signOut(auth);
        throw new Error("User data not found in database.");
      }

      const userData = userDoc.data();

      // Allow admin or superadmin
      if (userData.role !== "admin" && userData.role !== "superadmin") {
        await signOut(auth);
        throw new Error("Access denied. Authorized personnel only.");
      }

      if (userData.status === "Declined") {
        await signOut(auth);
        throw new Error(
          "Your account request was declined by the super admin.",
        );
      }

      if (userData.role !== "superadmin" && userData.approved === false) {
        await signOut(auth);
        throw new Error("Your account is pending super admin approval.");
      }

      setSessionCookie(
        createSessionPayload(user.uid, userData.role || "admin"),
      );

      toast.success("Admin login successful!", {
        position: "top-center",
        autoClose: 3000,
        theme: "light",
      });

      setTimeout(() => {
        window.location.replace("/dashboard");
      }, 1500);
    } catch (err: any) {
      console.error(err);

      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        setError("Incorrect password.");
      } else if (err.code === "auth/user-not-found") {
        setError("No account found with this email.");
      } else {
        setError("Login failed. Please try again.");
      }

      setShowErrorModal(true);
    }
  };

  // 🔹 Handle Forgot Password
  const handleForgotPassword = async () => {
    if (!username) {
      toast.warn("Please enter your email first.", {
        position: "top-center",
      });
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, username);
      toast.success("Password reset link sent! Check your email.", {
        position: "top-center",
        autoClose: 4000,
      });
    } catch (error: any) {
      toast.error(
        error.message.includes("user-not-found")
          ? "No account found with that email."
          : "Failed to send reset email.",
        { position: "top-center" },
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className={styles.bgContainer}>
      <div className={styles.mainContainer}>
        {/* 🔥 Left Side */}
        <div className={styles.leftContainer}>
          <Image src={logo} alt="APULA Logo" className={styles.logo} />
          <h2 className={styles.tagline}>Prevention Starts with Detection</h2>
        </div>

        {/* 🧩 Right Side (Login Form) */}
        <div className={styles.rightContainer}>
          <div className={styles.card}>
            <h2 className={styles.title}>Admin Log In</h2>
            <form onSubmit={handleLogin}>
              <input
                className={styles.input}
                placeholder="Enter email"
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                className={styles.input}
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className={styles.forgotWrapper}>
                <a href="/forgotPass" className={styles.forgotLink}>
                  Forgot Password?
                </a>
              </div>

              <button
                type="submit"
                className={styles.button}
                disabled={loading}
              >
                {loading ? "Logging in..." : "Login"}
              </button>
            </form>

            <p className={styles.signupText}>
              Don't have an account?{" "}
              <a href="/signup" className={styles.signupLink}>
                Sign up
              </a>
            </p>
          </div>
        </div>
      </div>

      {showErrorModal && (
        <div
          className={styles.errorModalOverlay}
          onClick={() => setShowErrorModal(false)}
        >
          <div
            className={styles.errorModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.errorModalTitle}>Login Failed</h3>
            <p className={styles.errorModalText}>
              {error || "Invalid email or password."}
            </p>
            <button
              type="button"
              className={styles.errorModalBtn}
              onClick={() => setShowErrorModal(false)}
            >
              Okay
            </button>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
}
