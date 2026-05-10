"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export default function LogoutPage() {
  const { signOut } = useAuth();

  useEffect(() => {
    void signOut();
  }, [signOut]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-white">
      <p className="text-muted-foreground">Déconnexion…</p>
    </div>
  );
}
