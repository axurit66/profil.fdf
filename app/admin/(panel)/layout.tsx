import { redirect } from "next/navigation";
import { getAdminSessionFromCookies } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = getAdminSessionFromCookies();
  if (!session) {
    redirect("/admin/login");
  }
  return <>{children}</>;
}
