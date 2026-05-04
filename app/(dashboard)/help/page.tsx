import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HelpForm } from "./help-form";

export const dynamic = "force-dynamic";

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Aide</h1>
        <p className="text-sm text-muted-foreground">
          Contactez l’équipe en cas de difficulté avec votre compte ou votre
          abonnement.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Formulaire de contact</CardTitle>
          <CardDescription>
            Les champs ci-dessous nous aident à traiter votre demande plus
            rapidement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HelpForm />
        </CardContent>
      </Card>
    </div>
  );
}
