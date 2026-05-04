import MailComposer from "nodemailer/lib/mail-composer";
import { google } from "googleapis";

const HELP_TO_DEFAULT = "admin@feuxdeforet.fr";

/**
 * Deux modes (Google Cloud Console → activer l’API Gmail) :
 *
 * 1) Google Workspace — compte de service + délégation au domaine (recommandé)
 *    HELP_GMAIL_SERVICE_ACCOUNT_JSON + HELP_GMAIL_DELEGATED_USER
 *    Admin Console : déléguer le scope https://www.googleapis.com/auth/gmail.send
 *
 * 2) OAuth2 — client « Bureau » / refresh token (ex. expéditeur Gmail)
 *    HELP_GMAIL_OAUTH_CLIENT_ID + HELP_GMAIL_OAUTH_CLIENT_SECRET +
 *    HELP_GMAIL_OAUTH_REFRESH_TOKEN + HELP_GMAIL_OAUTH_FROM_EMAIL
 */

type GmailSendContext = {
  gmail: ReturnType<typeof google.gmail>;
  fromMailbox: string;
};

export function isHelpMailConfigured(): boolean {
  if (hasServiceAccountDelegation()) return true;
  if (hasOAuthConfig()) return true;
  return false;
}

function hasServiceAccountDelegation(): boolean {
  const sa = parseServiceAccountJson();
  const sub = process.env.HELP_GMAIL_DELEGATED_USER?.trim();
  return Boolean(sa && sub);
}

function hasOAuthConfig(): boolean {
  return Boolean(
    process.env.HELP_GMAIL_OAUTH_CLIENT_ID?.trim() &&
      process.env.HELP_GMAIL_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.HELP_GMAIL_OAUTH_REFRESH_TOKEN?.trim() &&
      process.env.HELP_GMAIL_OAUTH_FROM_EMAIL?.trim()
  );
}

function parseServiceAccountJson(): {
  client_email: string;
  private_key: string;
} | null {
  const raw = process.env.HELP_GMAIL_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as {
      client_email?: string;
      private_key?: string;
    };
    if (!j.client_email || !j.private_key) return null;
    return {
      client_email: j.client_email,
      private_key: j.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

async function getGmailContext(): Promise<GmailSendContext> {
  const sa = parseServiceAccountJson();
  const delegated = process.env.HELP_GMAIL_DELEGATED_USER?.trim();
  if (sa && delegated) {
    const jwt = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      subject: delegated,
    });
    await jwt.authorize();
    return {
      gmail: google.gmail({ version: "v1", auth: jwt }),
      fromMailbox: delegated,
    };
  }

  const clientId = process.env.HELP_GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.HELP_GMAIL_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.HELP_GMAIL_OAUTH_REFRESH_TOKEN?.trim();
  const fromEmail = process.env.HELP_GMAIL_OAUTH_FROM_EMAIL?.trim();

  if (clientId && clientSecret && refreshToken && fromEmail) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    return {
      gmail: google.gmail({ version: "v1", auth: oauth2 }),
      fromMailbox: fromEmail,
    };
  }

  throw new Error("Gmail API non configurée");
}

function buildRawMessageBuffer(options: {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}): Promise<Buffer> {
  const composer = new MailComposer({
    from: options.from,
    to: options.to,
    replyTo: options.replyTo,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
  return new Promise((resolve, reject) => {
    composer.compile().build((err, message) => {
      if (err) reject(err);
      else resolve(message as Buffer);
    });
  });
}

function toGmailRaw(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendHelpRequestEmail(params: {
  fromUserEmail: string;
  accountUid: string;
  subscriptionOnLabel: string;
  subscriptionDate: string;
  message: string;
}): Promise<void> {
  const { gmail, fromMailbox } = await getGmailContext();

  const to = process.env.HELP_GMAIL_TO?.trim() || HELP_TO_DEFAULT;
  const fromName =
    process.env.HELP_GMAIL_FROM_NAME?.trim() || "Profil Feux de forêt";
  const from = `"${fromName}" <${fromMailbox}>`;

  const text = [
    "Demande d'aide — Profil Feux de forêt",
    "",
    `E-mail (compte) : ${params.fromUserEmail}`,
    `UID Firebase : ${params.accountUid}`,
    `Abonnement souscrit sur : ${params.subscriptionOnLabel}`,
    `Date d'abonnement : ${params.subscriptionDate}`,
    "",
    "Problème rencontré :",
    params.message,
  ].join("\n");

  const html = `
<!DOCTYPE html><html><body style="font-family:sans-serif;line-height:1.5">
<p><strong>Demande d'aide — Profil Feux de forêt</strong></p>
<ul>
<li>E-mail (compte) : ${escapeHtml(params.fromUserEmail)}</li>
<li>UID Firebase : ${escapeHtml(params.accountUid)}</li>
<li>Abonnement souscrit sur : ${escapeHtml(params.subscriptionOnLabel)}</li>
<li>Date d'abonnement : ${escapeHtml(params.subscriptionDate)}</li>
</ul>
<p><strong>Problème rencontré</strong></p>
<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(params.message)}</pre>
</body></html>`;

  const subject = `[Profil] Aide — ${params.fromUserEmail}`;

  const rawBuf = await buildRawMessageBuffer({
    from,
    to,
    replyTo: params.fromUserEmail,
    subject,
    text,
    html,
  });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: toGmailRaw(rawBuf) },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
