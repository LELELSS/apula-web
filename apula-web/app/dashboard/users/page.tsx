"use client";

import React, { useEffect, useMemo, useState } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import styles from "./userpagestyles.module.css";
import {
  FaUsers,
  FaUserShield,
  FaUserTie,
  FaUser,
  FaSearch,
} from "react-icons/fa";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

type User = {
  id: string;
  name?: string;
  role?: string;
  department?: string;
  contact?: string;
  address?: string;
  email?: string;
  status?: string;
  createdAt?: any;
  created_time?: string;
};

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("All");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [currentRole, setCurrentRole] = useState<string>("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentRole("");
        return;
      }

      try {
        const snap = await getDocs(collection(db, "users"));
        const current = snap.docs.find((item) => item.id === user.uid);
        const role = String(current?.data()?.role || "");
        setCurrentRole(role);
      } catch (err) {
        console.error("Error loading current role:", err);
        setCurrentRole("");
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as User[];
        setUsers(list);
      } catch (err) {
        console.error("Error fetching users:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const norm = (r?: string) => (r ? r.toLowerCase() : "");

  const totalAll = users.length;
  const totalAdmins = users.filter(
    (u) => norm(u.role) === "admin" || norm(u.role) === "superadmin"
  ).length;
  const totalResponders = users.filter((u) => norm(u.role) === "responder").length;
  const totalUsers = users.filter((u) => norm(u.role) === "user").length;

  const roleMatches = (user: User) => {
    if (selectedRole === "All") return true;

    const role = norm(user.role);

    if (selectedRole === "Admin") {
      return role === "admin" || role === "superadmin";
    }

    return role === selectedRole.toLowerCase();
  };

  const matchesSearch = (user: User) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;

    return (
      (user.name || "").toLowerCase().includes(q) ||
      (user.role || "").toLowerCase().includes(q) ||
      (user.contact || "").toLowerCase().includes(q) ||
      (user.email || "").toLowerCase().includes(q)
    );
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => roleMatches(u) && matchesSearch(u));
  }, [users, selectedRole, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedRole, searchTerm]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

  const openModal = (user: User) => setSelectedUser(user);
  const closeModal = () => setSelectedUser(null);

  const canEditUser = (user: User) => {
    const targetRole = norm(user.role);
    const actorRole = norm(currentRole);

    if (actorRole === "superadmin") {
      return true;
    }

    if (actorRole === "admin") {
      return targetRole === "responder";
    }

    return false;
  };

  const formatCreatedAt = (createdAt: any, created_time?: string) => {
    if (!createdAt && created_time) return created_time;
    if (!createdAt) return "N/A";

    if (createdAt.seconds) {
      return new Date(createdAt.seconds * 1000).toLocaleString();
    }

    try {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) return d.toLocaleString();
    } catch {}

    return String(createdAt);
  };

  return (
    <div>
      <AdminHeader />

      <div style={{ position: "absolute", top: 20, right: 30, zIndex: 50 }}>
        <AlertBellButton />
      </div>

      <AlertDispatchModal />

      <div className={styles.container}>
        <div data-aos="fade-up" className={styles.contentSection}>
          <div className={styles.headerRow}>
            <h2 className={styles.pageTitle}>Users</h2>
          </div>

          <hr className={styles.separator} />

          <div className={styles.summaryRow}>

  <div
    className={`${styles.summaryCard} ${selectedRole === "All" ? styles.activeCard : ""}`}
    onClick={() => setSelectedRole("All")}
  >
    <FaUsers className={styles.summaryIcon} />
    <div className={styles.summaryText}>
      <h4>All</h4>
      <p>{totalAll}</p>
    </div>
  </div>

  <div
    className={`${styles.summaryCard} ${selectedRole === "Admin" ? styles.activeCard : ""}`}
    onClick={() => setSelectedRole("Admin")}
  >
    <FaUserShield className={styles.summaryIcon} />
    <div className={styles.summaryText}>
      <h4>Admin</h4>
      <p>{totalAdmins}</p>
    </div>
  </div>

  <div
    className={`${styles.summaryCard} ${selectedRole === "Responder" ? styles.activeCard : ""}`}
    onClick={() => setSelectedRole("Responder")}
  >
    <FaUserTie className={styles.summaryIcon} />
    <div className={styles.summaryText}>
      <h4>Responder</h4>
      <p>{totalResponders}</p>
    </div>
  </div>

  <div
    className={`${styles.summaryCard} ${selectedRole === "User" ? styles.activeCard : ""}`}
    onClick={() => setSelectedRole("User")}
  >
    <FaUser className={styles.summaryIcon} />
    <div className={styles.summaryText}>
      <h4>User</h4>
      <p>{totalUsers}</p>
    </div>
  </div>

</div>

          <div className={styles.tableSection}>
            <div className={styles.filters}>
              <div className={styles.searchWrapper}>
                <FaSearch className={styles.searchIcon} size={18} />
                <input
                  type="text"
                  placeholder="Search users..."
                  className={styles.searchInput}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <table className={styles.userTable}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Contact</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className={styles.noResults}>
                      Loading...
                    </td>
                  </tr>
                ) : paginatedUsers.length > 0 ? (
                  paginatedUsers.map((user) => (
                    <tr key={user.id}>
                      <td data-label="ID">{user.id}</td>
                      <td data-label="Name">{user.name ?? "N/A"}</td>
                      <td data-label="Role">{user.role ?? "N/A"}</td>
                      <td data-label="Status">{user.status ?? "N/A"}</td>
                      <td data-label="Contact">{user.contact ?? "N/A"}</td>
                      <td data-label="Actions" className={styles.actionCell}>
                        <button
                          className={styles.viewBtn}
                          onClick={() => openModal(user)}
                        >
                          <span>View</span>
                        </button>

                        {canEditUser(user) && (
                          <button
                            className={styles.editBtn}
                            onClick={() => setEditTarget(user)}
                          >
                            <span>Edit</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className={styles.noResults}>
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {!loading && filteredUsers.length > 0 && (
              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </button>

                <span className={styles.pageInfo}>
                  Page {currentPage} of {totalPages || 1}
                </span>

                <button
                  className={styles.pageBtn}
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages || totalPages === 0}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedUser && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>User Information</h3>

            <div className={styles.modalDetails}>
              <p><strong>ID:</strong> {selectedUser.id}</p>
              <p><strong>Name:</strong> {selectedUser.name ?? "N/A"}</p>
              <p><strong>Role:</strong> {selectedUser.role ?? "N/A"}</p>
              <p><strong>Contact:</strong> {selectedUser.contact ?? "N/A"}</p>
              <p><strong>Address:</strong> {selectedUser.address ?? "N/A"}</p>
              <p><strong>Email:</strong> {selectedUser.email ?? "N/A"}</p>
              <p>
                <strong>Created Time:</strong>{" "}
                {formatCreatedAt(selectedUser.createdAt, selectedUser.created_time)}
              </p>
            </div>

            <button className={styles.closeBtn} onClick={closeModal}>
              <span>Close</span>
            </button>
          </div>
        </div>
      )}

      {editTarget && (
        <div className={styles.modalOverlay} onClick={() => setEditTarget(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Edit Responder Status</h3>
            {norm(currentRole) === "superadmin" && (
              <>
                <label className={styles.inputLabel}><strong>Role:</strong></label>
                <select
                  value={editTarget.role ?? "user"}
                  onChange={(e) =>
                    setEditTarget((prev) => prev && { ...prev, role: e.target.value })
                  }
                  className={styles.inputField}
                >
                  <option value="superadmin">superadmin</option>
                  <option value="admin">admin</option>
                  <option value="responder">responder</option>
                  <option value="user">user</option>
                </select>
              </>
            )}

            <div className={styles.modalDetails}>
              <p><strong>Name:</strong> {editTarget.name ?? "N/A"}</p>
              <p><strong>Role:</strong> {editTarget.role ?? "N/A"}</p>

              <label className={styles.inputLabel}><strong>Status:</strong></label>
              <select
                value={editTarget.status ?? "Available"}
                onChange={(e) =>
                  setEditTarget((prev) => prev && { ...prev, status: e.target.value })
                }
                className={styles.inputField}
              >
                {norm(editTarget.role) === "responder" ? (
                  <>
                    <option value="Available">Available</option>
                    <option value="Unavailable">Unavailable</option>
                  </>
                ) : (
                  <>
                    <option value="Approved">Approved</option>
                    <option value="Pending">Pending</option>
                    <option value="Declined">Declined</option>
                  </>
                )}
              </select>

              <p><strong>Email:</strong> {editTarget.email ?? "N/A"}</p>
              <p><strong>Contact:</strong> {editTarget.contact ?? "N/A"}</p>
            </div>

            <button
              className={styles.saveBtn}
              onClick={async () => {
                if (!editTarget) return;

                try {
                  if (!canEditUser(editTarget)) {
                    alert("You are not allowed to edit this account.");
                    return;
                  }

                  const payload: Record<string, unknown> = {
                    status: editTarget.status,
                  };

                  if (norm(currentRole) === "superadmin") {
                    const nextRole = norm(editTarget.role);
                    payload.role = editTarget.role;

                    if (nextRole === "admin" || nextRole === "superadmin") {
                      const nextStatusRaw = norm(editTarget.status);
                      const isAllowedAdminStatus =
                        nextStatusRaw === "approved" ||
                        nextStatusRaw === "pending" ||
                        nextStatusRaw === "declined";

                      const nextStatus = isAllowedAdminStatus
                        ? nextStatusRaw.charAt(0).toUpperCase() + nextStatusRaw.slice(1)
                        : "Approved";

                      payload.status = nextStatus;
                      payload.approved = nextStatus === "Approved";
                    } else if (nextRole === "responder") {
                      payload.approved = true;
                      payload.status =
                        norm(editTarget.status) === "unavailable" ? "Unavailable" : "Available";
                    }
                  }

                  await updateDoc(doc(db, "users", editTarget.id), payload);

                  setUsers((prev) =>
                    prev.map((u) =>
                      u.id === editTarget.id
                        ? { ...u, status: editTarget.status, role: editTarget.role }
                        : u
                    )
                  );

                  setShowSuccess(true);
                  setTimeout(() => setShowSuccess(false), 2000);
                } catch (err) {
                  console.error("Error updating status:", err);
                  const message =
                    typeof err === "object" && err && "message" in err
                      ? String((err as { message?: string }).message)
                      : "Failed to update status.";
                  alert(message);
                }

                setEditTarget(null);
              }}
            >
              <span>Save</span>
            </button>

            <button
              className={styles.closeBtn}
              onClick={() => setEditTarget(null)}
            >
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className={styles.successOverlay}>
          <div className={styles.successModal}>
            <h3>Status Updated!</h3>
            <p>The responder’s status has been successfully saved.</p>
          </div>
        </div>
      )}
    </div>
  );
}