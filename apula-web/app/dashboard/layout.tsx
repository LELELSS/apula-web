import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SESSION_COOKIE_NAME, type SessionPayload } from "@/lib/session";

type DashboardLayoutProps = {
  children: ReactNode;
};

const parseSession = (raw: string | undefined): SessionPayload | null => {
  if (!raw) return null;

  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as Partial<SessionPayload>;

    if (
      typeof parsed.uid !== "string" ||
      !parsed.uid.trim() ||
      typeof parsed.role !== "string" ||
      !parsed.role.trim() ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      return null;
    }

    return {
      uid: parsed.uid,
      role: parsed.role,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = parseSession(rawSession);

  if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
    redirect("/login?reason=auth-required");
  }

  return <>{children}</>;
}
