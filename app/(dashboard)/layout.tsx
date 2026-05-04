import { requireSessionUid } from "@/lib/session-server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { DashboardShell } from "./dashboard-shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const uid = await requireSessionUid();
  const record = await adminAuth.getUser(uid);
  const userDoc = await adminDb.collection("users").doc(uid).get();
  const source = userDoc.data()?.source as string | undefined;
  const showInvoicesTab = source !== "ios" && source !== "android";

  return (
    <DashboardShell
      email={record.email || ""}
      displayName={record.displayName}
      photoURL={record.photoURL}
      showInvoicesTab={showInvoicesTab}
    >
      {children}
    </DashboardShell>
  );
}
