import Link from "next/link";
import { prisma } from "@/lib/db";
import { unreadAnnouncementWhere } from "@/lib/announcements";

export async function TaskSectionNav({ user, active }: { user: { id: string; role: string; allProperties?: boolean; flatcloudMember?: boolean }; active: "tasks" | "announcements" }) {
  const count = await prisma.announcement.count({ where: unreadAnnouncementWhere(user) });
  return <nav className="section-nav" aria-label="Úkoly a oznámení">
    <Link href="/ukoly" className={active === "tasks" ? "active" : ""} aria-current={active === "tasks" ? "page" : undefined}>Úkoly</Link>
    <Link href="/ukoly/oznameni" className={active === "announcements" ? "active" : ""} aria-current={active === "announcements" ? "page" : undefined}>Oznámení{count > 0 && <span className="nav-count">{count > 99 ? "99+" : count}</span>}</Link>
  </nav>;
}
