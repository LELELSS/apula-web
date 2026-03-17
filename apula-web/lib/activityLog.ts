import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type ActivityPayload = {
  actorUid?: string;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details?: string;
  path?: string;
};

export const logActivity = async (payload: ActivityPayload) => {
  try {
    await addDoc(collection(db, "admin_activity_logs"), {
      ...payload,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
};
