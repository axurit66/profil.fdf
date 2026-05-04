/** Site principal (ex. feuxdeforet.fr), utilisé pour le CTA « retour au site ». */
export function getMainSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_POST_LOGIN_URL?.trim() || "https://feuxdeforet.fr"
  );
}
