"use client";

import React, { useState } from "react";
import styles from "./signupStyles.module.css";
import Image from "next/image";
import logo from "../../assets/fireapula.png";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { FaChevronLeft } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function Signup() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [details, setDetails] = useState({
    password: "",
    confirmPassword: "",
    name: "",
    contact: "",
    address: "",
  });
  const [error, setError] = useState("");

  // ✅ Step 1: Email submission (send OTP)
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return setError("Please enter your email.");
    if (!email.endsWith("@gmail.com"))
      return setError("Email must be a Gmail address.");

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");

      toast.success("OTP sent successfully!");
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Step 2: Verify OTP
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otp) return setError("Please enter the OTP.");
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid OTP");

      toast.success("OTP verified successfully!");
      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Step 3: Password setup
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { password, confirmPassword } = details;

    if (!password || !confirmPassword)
      return setError("Please enter both password fields.");
    if (password !== confirmPassword)
      return setError("Passwords do not match.");

    setError("");
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      toast.success("Password set successfully!");
      setStep(4);
    }, 800);
  };

  // ✅ Step 4: Final registration (only now store in Firebase)
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, contact, address, password } = details;

    if (!name || !contact || !address) {
      return setError("Please fill in all fields.");
    }

    setError("");
    setLoading(true);

    try {
      // 🔒 Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // 🔒 Store extra details only after password is set
      await setDoc(doc(db, "users", user.uid), {
        email,
        name,
        contact,
        address,
        role: "admin", // default role
        createdAt: new Date(),
        verified: true,
        approved: false,
        status: "Pending",
      });

      toast.success("Account created. Waiting for super admin approval.", {
        position: "top-center",
        autoClose: 3000,
        theme: "light",
      });

      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to register. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.bgContainer}>
      <div className={styles.mainContainer}>
        {/* ✅ Left Side */}
        <div className={styles.leftContainer}>
          <Image src={logo} alt="APULA Logo" className={styles.logo} />
          <h2 className={styles.tagline}>Prevention Starts with Detection</h2>
        </div>

        {/* ✅ Right Side */}
        <div className={styles.rightContainer}>
          <div className={styles.card}>
            {step > 1 && (
              <button
                type="button"
                className={styles.backButton}
                onClick={() => setStep(step - 1)}
                aria-label="Go back"
              >
                <FaChevronLeft size={18} />
              </button>
            )}

            {/* Step 1: Email */}
            {step === 1 && (
              <form onSubmit={handleEmailSubmit}>
                <h2 className={styles.title}>Sign Up</h2>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="Enter your Gmail address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {error && <p className={styles.error}>{error}</p>}
                <button type="submit" className={styles.button} disabled={loading}>
                  {loading ? "Sending OTP..." : "Send OTP"}
                </button>
              </form>
            )}

            {/* Step 2: OTP */}
            {step === 2 && (
              <form onSubmit={handleOtpSubmit}>
                <h2 className={styles.title}>Enter OTP</h2>
                <p className={styles.subtitle}>
                  Please enter the 6-digit OTP sent to your Gmail.
                </p>
                <input
                  className={styles.input}
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
                {error && <p className={styles.error}>{error}</p>}
                <button type="submit" className={styles.button} disabled={loading}>
                  {loading ? "Verifying..." : "Verify OTP"}
                </button>
              </form>
            )}

            {/* Step 3: Password setup */}
            {step === 3 && (
              <form onSubmit={handlePasswordSubmit}>
                <h2 className={styles.title}>Set Your Password</h2>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Enter password"
                  value={details.password}
                  onChange={(e) =>
                    setDetails({ ...details, password: e.target.value })
                  }
                />
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Confirm password"
                  value={details.confirmPassword}
                  onChange={(e) =>
                    setDetails({ ...details, confirmPassword: e.target.value })
                  }
                />
                {error && <p className={styles.error}>{error}</p>}
                <button type="submit" className={styles.button} disabled={loading}>
                  {loading ? "Checking..." : "Next"}
                </button>
              </form>
            )}

            {/* Step 4: Additional Details */}
            {step === 4 && (
              <form onSubmit={handleFinalSubmit}>
                <h2 className={styles.title}>Additional Details</h2>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Full Name"
                  value={details.name}
                  onChange={(e) =>
                    setDetails({ ...details, name: e.target.value })
                  }
                />
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Contact Number"
                  value={details.contact}
                  onChange={(e) =>
                    setDetails({ ...details, contact: e.target.value })
                  }
                />
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Address"
                  value={details.address}
                  onChange={(e) =>
                    setDetails({ ...details, address: e.target.value })
                  }
                />
                {error && <p className={styles.error}>{error}</p>}
                <button type="submit" className={styles.button} disabled={loading}>
                  {loading ? "Registering..." : "Register"}
                </button>
              </form>
            )}

            {/* ✅ Always show login link */}
            <p className={styles.loginText}>
              Already have an account?{" "}
              <a href="/login" className={styles.loginLink}>
                Login
              </a>
            </p>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}
