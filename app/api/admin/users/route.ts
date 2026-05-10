import type { UserRecord } from "firebase-admin/auth";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { sessionService } from "@/lib/session-service";

export const runtime = "nodejs";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 100;

type FirestoreUser = {
  isPremium?: boolean;
  source?: string;
  expiryDate?: Timestamp;
};

function serializeUser(
  authUser: UserRecord,
  fs: FirestoreUser | undefined
): {
  uid: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  providers: string[];
  createdAt: string | null;
  lastSignInAt: string | null;
  subscription: {
    isPremium: boolean;
    source: string | null;
    expiryDate: string | null;
  } | null;
  sessionsTotal: number;
  sessionsActive: number;
} {
  const expiryDate = fs?.expiryDate;
  const expiryIso =
    expiryDate instanceof Timestamp ? expiryDate.toDate().toISOString() : null;
  const expired =
    expiryIso != null && new Date(expiryIso).getTime() < Date.now();
  const isPremium = Boolean(fs?.isPremium && !expired);

  return {
    uid: authUser.uid,
    email: authUser.email ?? null,
    displayName: authUser.displayName ?? null,
    disabled: authUser.disabled,
    providers: (authUser.providerData ?? []).map((p) => p.providerId),
    createdAt: authUser.metadata.creationTime ?? null,
    lastSignInAt: authUser.metadata.lastSignInTime ?? null,
    subscription: fs
      ? {
          isPremium,
          source: fs.source ?? null,
          expiryDate: expiryIso,
        }
      : null,
    sessionsTotal: 0,
    sessionsActive: 0,
  };
}

async function loadFirestoreMap(uids: string[]): Promise<Map<string, FirestoreUser>> {
  const map = new Map<string, FirestoreUser>();
  const chunkSize = 10;
  for (let i = 0; i < uids.length; i += chunkSize) {
    const chunk = uids.slice(i, i + chunkSize);
    const refs = chunk.map((uid) => adminDb.collection("users").doc(uid));
    const snaps: DocumentSnapshot[] = await adminDb.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) {
        map.set(snap.id, snap.data() as FirestoreUser);
      }
    }
  }
  return map;
}

export async function GET(request: NextRequest) {
  const admin = getAdminSessionFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const emailExact = searchParams.get("email")?.trim();

  if (emailExact && emailExact.includes("@")) {
    try {
      const user = await adminAuth.getUserByEmail(emailExact);
      const fsMap = await loadFirestoreMap([user.uid]);
      const counts = await sessionService.sessionCountsByUserIds([user.uid]);
      const c = counts.get(user.uid) ?? { total: 0, active: 0 };
      const merged = {
        ...serializeUser(user, fsMap.get(user.uid)),
        sessionsTotal: c.total,
        sessionsActive: c.active,
      };
      return NextResponse.json({
        users: [merged],
        nextPageToken: undefined as string | undefined,
      });
    } catch {
      return NextResponse.json({
        users: [],
        nextPageToken: undefined as string | undefined,
      });
    }
  }

  let pageSize = Number.parseInt(searchParams.get("pageSize") ?? "", 10);
  if (Number.isNaN(pageSize) || pageSize < 1) pageSize = PAGE_SIZE_DEFAULT;
  pageSize = Math.min(pageSize, PAGE_SIZE_MAX);

  const pageToken = searchParams.get("pageToken")?.trim() || undefined;

  let listResult;
  try {
    listResult = await adminAuth.listUsers(pageSize, pageToken);
  } catch (e) {
    console.error("[admin/users] listUsers", e);
    return NextResponse.json(
      { error: "Impossible de lister les utilisateurs." },
      { status: 500 }
    );
  }

  const uids = listResult.users.map((u) => u.uid);
  const fsMap = await loadFirestoreMap(uids);
  const sessionCounts = await sessionService.sessionCountsByUserIds(uids);

  const users = listResult.users.map((u) => {
    const c = sessionCounts.get(u.uid) ?? { total: 0, active: 0 };
    return {
      ...serializeUser(u, fsMap.get(u.uid)),
      sessionsTotal: c.total,
      sessionsActive: c.active,
    };
  });

  return NextResponse.json({
    users,
    nextPageToken: listResult.pageToken || undefined,
  });
}
