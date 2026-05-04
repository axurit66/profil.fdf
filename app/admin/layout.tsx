export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:py-10">
        {children}
      </div>
    </div>
  );
}
