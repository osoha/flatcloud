"use client";

import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Building2, CalendarCheck2, ClipboardCheck, DoorOpen, FileText, Hammer, Handshake, LayoutDashboard, ListChecks, Search, Settings, UserRound, Users, UsersRound, WalletCards } from "lucide-react";
import type { ComponentProps } from "react";

/** The same icon family as navigation; the artwork is sized to the font's cap height. */
export function PageHeading({ children, className = "", ...props }: ComponentProps<"h1">) {
  const path = usePathname();
  const Icon = path.includes("/jednotky/") ? DoorOpen
    : path.startsWith("/nemovitosti") ? Building2
    : path.startsWith("/portfolio/kvalita") ? Hammer
    : path.startsWith("/portfolio") ? LayoutDashboard
    : path.startsWith("/reporty") ? BarChart3
    : path.startsWith("/ukoly") ? ListChecks
    : path.startsWith("/revize") ? ClipboardCheck
    : path.startsWith("/smlouvy") ? CalendarCheck2
    : path.startsWith("/najemnici") || path.startsWith("/uzivatele") ? Users
    : path.startsWith("/vlastnici") ? UsersRound
    : path.startsWith("/distribuce") ? Handshake
    : path.startsWith("/dokumenty") ? FileText
    : path.startsWith("/metodika") ? BookOpen
    : path.startsWith("/nastaveni") ? Settings
    : path.startsWith("/hledat") ? Search
    : path.startsWith("/platby") || path.startsWith("/kauce") ? WalletCards : UserRound;
  return <h1 className={`flatberry-page-heading ${className}`.trim()} {...props}><Icon className="flatberry-heading-icon" aria-hidden="true"/><span>{children}</span></h1>;
}
