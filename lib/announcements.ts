import type { Prisma, UserRole } from "@prisma/client";
import { hasAllPropertyAccess } from "./auth";

type User = { id: string; role: string; allProperties?: boolean; flatcloudMember?: boolean };

export function announcementAudienceWhere(user: User): Prisma.AnnouncementWhereInput {
  const audience: Prisma.AnnouncementAudienceWhereInput[] = [
    { kind: "ALL_USERS" },
    { kind: "USER", userId: user.id },
    { kind: "ROLE", role: user.role as UserRole },
  ];
  if (user.flatcloudMember) audience.push({ kind: "FLATCLOUD_MEMBERS" });
  if (hasAllPropertyAccess(user)) audience.push({ kind: "PROPERTY" });
  else audience.push(
    { kind: "PROPERTY", property: { memberships: { some: { userId: user.id } } } },
    { kind: "PROPERTY", property: { units: { some: { userAccesses: { some: { userId: user.id } } } } } },
  );
  return { audiences: { some: { OR: audience } } };
}

export function activeAnnouncementWhere(user: User, now = new Date()): Prisma.AnnouncementWhereInput {
  return {
    active: true,
    startsAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    ...announcementAudienceWhere(user),
  };
}

/** Read and hidden states are independent; neither belongs in the unread badge. */
export function unreadAnnouncementWhere(user: User): Prisma.AnnouncementWhereInput {
  return { AND: [activeAnnouncementWhere(user), {
    NOT: { userStates: { some: { userId: user.id, OR: [
      { readAt: { not: null } }, { dismissedAt: { not: null } },
    ] } } },
  }] };
}
