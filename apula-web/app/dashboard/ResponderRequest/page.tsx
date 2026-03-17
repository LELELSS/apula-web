"use client";

import React, { useState, useEffect } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import { auth, db } from "@/lib/firebase";

import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { logActivity } from "@/lib/activityLog";

import { FaUserCheck, FaUserTimes, FaSearch } from "react-icons/fa";
import styles from "./responderRequest.module.css";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";

type Responder = {
  id: string;
  name?: string;
  email?: string;
  address?: string;
  status?: string;
  role?: string;
  verified?: boolean;
  approved?: boolean;
  uid?: string;
};

type ConfirmAction =
  | {
      action: "accept" | "decline";
      responder: Responder;
    }
  | null;

const ResponderRequestsPage = () => {
  const [responders, setResponders] = useState<Responder[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string>("");
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentRole("");
        setCheckingRole(false);
        return;
      }

      try {
        const userSnap = await getDocs(query(collection(db, "users"), where("email", "==", user.email)));
        const first = userSnap.docs[0];
        const role = (first?.data()?.role || "") as string;
        setCurrentRole(role);
      } catch (error) {
        console.error("Error checking role:", error);
        setCurrentRole("");
      } finally {
        setCheckingRole(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (checkingRole || (currentRole !== "superadmin" && currentRole !== "admin")) {
      return;
    }

    const loadResponders = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "users"));
        const list: Responder[] = querySnapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Responder))
          .filter((item) => {
            const role = String(item.role || "").toLowerCase();
            const isRequestRole =
              currentRole === "superadmin"
                ? role === "responder" || role === "admin"
                : role === "responder";
            const verified = item.verified === true;
            const pendingApproval = item.approved === false;
            const notDeclined = String(item.status || "").toLowerCase() !== "declined";
            return isRequestRole && verified && pendingApproval && notDeclined;
          });

        setResponders(list);
      } catch (error) {
        console.error("Error loading responders:", error);
      }
    };

    loadResponders();
  }, [checkingRole, currentRole]);

  const filtered = responders.filter((r) =>
    `${r.name ?? ""} ${r.email ?? ""}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  const handleAction = (action: "accept" | "decline", responder: Responder) => {
    setConfirmAction({ action, responder });
  };

  const executeAction = async () => {
    if (!confirmAction) return;

    const { responder, action } = confirmAction;

    try {
      const ref = doc(db, "users", responder.id);

      if (action === "accept") {
        if (currentRole !== "superadmin" && String(responder.role || "").toLowerCase() === "admin") {
          setErrorMessage("Only super admin can approve admin account requests.");
          setConfirmAction(null);
          return;
        }

        await updateDoc(ref, {
          approved: true,
          status: responder.role === "responder" ? "Available" : "Approved",
        });
      } else {
        if (currentRole !== "superadmin" && String(responder.role || "").toLowerCase() === "admin") {
          setErrorMessage("Only super admin can decline admin account requests.");
          setConfirmAction(null);
          return;
        }

        await updateDoc(ref, {
          approved: false,
          status: "Declined",
        });
      }

      const currentUser = auth.currentUser;
      if (currentUser) {
        await logActivity({
          actorUid: currentUser.uid,
          actorEmail: currentUser.email || "",
          actorName: currentUser.displayName || "",
          actorRole: currentRole,
          action: action === "accept" ? "approve_account_request" : "decline_account_request",
          targetId: responder.id,
          targetType: String(responder.role || "user"),
          details: `${action} ${responder.role || "account"} request (${responder.email || "no-email"})`,
          path: "/dashboard/ResponderRequest",
        });
      }

      setResponders((prev) => prev.filter((r) => r.id !== responder.id));
      setSuccessMessage(
        `${responder.name ?? "Account"} has been ${
          action === "accept" ? "approved" : "declined"
        }.`
      );
    } catch (err) {
      console.error("Error updating:", err);
      setErrorMessage("Failed to update responder.");
    }

    setConfirmAction(null);
  };

  return (
    <div>
      <AdminHeader />

      <div style={{ position: "absolute", top: 20, right: 30, zIndex: 50 }}>
        <AlertBellButton />
      </div>

      <AlertDispatchModal />

      {checkingRole ? (
        <div className={styles.container}>
          <div className={styles.contentSection}>
            <h2 className={styles.pageTitle}>Checking access...</h2>
          </div>
        </div>
      ) : currentRole !== "superadmin" && currentRole !== "admin" ? (
        <div className={styles.container}>
          <div className={styles.contentSection}>
            <h2 className={styles.pageTitle}>Access Restricted</h2>
            <p className={styles.noResults}>
              Only admin and super admin can access account permission requests.
            </p>
          </div>
        </div>
      ) : (

      <div className={styles.container}>
        <div className={styles.contentSection}>
          <div className={styles.headerRow}>
            <h2 className={styles.pageTitle}>Account Permission Requests</h2>
          </div>

          <hr className={styles.separator} />

          <div className={styles.filters}>
            <div className={styles.searchWrapper}>
              <FaSearch className={styles.searchIcon} size={18} />
              <input
                type="text"
                placeholder="Search responder..."
                value={searchTerm}
                className={styles.searchInput}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.tableSection}>
            <table className={styles.userTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.length ? (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Name">{r.name ?? "N/A"}</td>
                      <td data-label="Email">{r.email ?? "N/A"}</td>
                      <td data-label="Role">{r.role ?? "N/A"}</td>
                      <td data-label="Address">{r.address ?? "N/A"}</td>
                      <td data-label="Status">{r.status ?? "Pending"}</td>
                      <td data-label="Actions" className={styles.actionCell}>
                        <button
                          className={styles.acceptBtn}
                          onClick={() => handleAction("accept", r)}
                        >
                          <span className={styles.btnContent}>
                            <FaUserCheck />
                            Accept
                          </span>
                        </button>

                        <button
                          className={styles.declineBtn}
                          onClick={() => handleAction("decline", r)}
                        >
                          <span className={styles.btnContent}>
                            <FaUserTimes />
                            Decline
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className={styles.noResults}>
                      No pending account permission requests.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {confirmAction && (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmModal}>
            <h3 className={styles.modalTitle}>
              {confirmAction.action === "accept"
                ? "Accept Responder"
                : "Decline Responder"}
            </h3>

            <p className={styles.confirmText}>
              Are you sure you want to{" "}
              {confirmAction.action === "accept" ? "approve" : "decline"}{" "}
              <strong>{confirmAction.responder.name}</strong>?
            </p>

            <div className={styles.confirmButtons}>
              <button
                className={styles.cancelBtn}
                onClick={() => setConfirmAction(null)}
              >
                <span>Cancel</span>
              </button>

              <button
                className={
                  confirmAction.action === "accept"
                    ? styles.acceptBtn
                    : styles.declineBtn
                }
                onClick={executeAction}
              >
                <span>
                  {confirmAction.action === "accept" ? "Accept" : "Decline"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
  <div className={styles.modalOverlay}>
    <div className={styles.confirmModal}>
      <h3>Success</h3>
      <p>{successMessage}</p>

      <button
        className={styles.acceptBtn}
        onClick={() => setSuccessMessage(null)}
      >
        Okay
      </button>
    </div>
  </div>
)}

{errorMessage && (
  <div className={styles.modalOverlay}>
    <div className={styles.confirmModal}>
      <h3>Error</h3>
      <p>{errorMessage}</p>

      <button
        className={styles.cancelBtn}
        onClick={() => setErrorMessage(null)}
      >
        Close
      </button>
    </div>
  </div>
)}
    </div>
  );
};

export default ResponderRequestsPage;