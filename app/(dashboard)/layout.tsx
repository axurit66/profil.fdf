import { requireSessionUid } from "@/lib/session-server";
import { adminAuth } from "@/lib/firebase-admin";
import { DashboardNav } from "./dashboard-nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const uid = await requireSessionUid();
  const record = await adminAuth.getUser(uid);

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 border-r bg-card p-4">
        <DashboardNav
          email={record.email || ""}
          displayName={record.displayName}
          photoURL={record.photoURL}
        />
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
