import { redirect } from "next/navigation";
import { requireSessionUid } from "@/lib/session-server";
import { adminDb } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function statusLabel(status: string | null) {
  if (status === "paid")
    return { label: "Payée", variant: "default" as const };
  if (status === "open")
    return { label: "Ouverte", variant: "secondary" as const };
  if (status === "uncollectible" || status === "void")
    return { label: "Impayée / annulée", variant: "destructive" as const };
  if (status === "draft")
    return { label: "Brouillon", variant: "outline" as const };
  return { label: status || "—", variant: "outline" as const };
}

export default async function InvoicesPage() {
  const uid = await requireSessionUid();
  const doc = await adminDb.collection("users").doc(uid).get();
  const source = doc.data()?.source as string | undefined;
  if (source === "ios" || source === "android") {
    redirect("/subscription");
  }
  const stripeCustomerId = doc.data()?.stripeCustomerId as string | undefined;

  if (!stripeCustomerId) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Factures
        </h1>
        <p className="text-muted-foreground">Aucune facture disponible</p>
      </div>
    );
  }

  const list = await stripe.invoices.list({
    customer: stripeCustomerId,
    limit: 50,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        Factures
      </h1>
      {list.data.length === 0 ? (
        <p className="text-muted-foreground">Aucune facture pour le moment.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto rounded-md border sm:mx-0">
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((inv) => {
                const st = statusLabel(inv.status);
                const date = inv.created
                  ? new Date(inv.created * 1000).toLocaleDateString("fr-FR")
                  : "—";
                const amount = inv.total != null
                  ? `${(inv.total / 100).toFixed(2)} ${(inv.currency || "eur").toUpperCase()}`
                  : "—";
                return (
                  <TableRow key={inv.id}>
                    <TableCell>{date}</TableCell>
                    <TableCell>{amount}</TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {inv.invoice_pdf ? (
                        <a
                          className="text-primary underline"
                          href={inv.invoice_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Télécharger
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
