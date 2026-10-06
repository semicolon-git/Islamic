import type { Role } from "@/lib/auth";

/** Portal navigation. Feature builders own the pages; this list is scaffold-owned. */
export const PORTAL_NAV: { href: string; key: string; icon: string; roles?: Role[] }[] = [
  { href: "/portal", key: "portal.nav.home", icon: "LayoutDashboard" },
  { href: "/portal/manuscripts", key: "portal.nav.manuscripts", icon: "ScrollText" },
  { href: "/portal/cards", key: "portal.nav.cards", icon: "LayoutList", roles: ["student", "researcher", "institution_admin"] },
  { href: "/portal/items", key: "portal.nav.items", icon: "Landmark", roles: ["student", "researcher", "institution_admin"] },
  { href: "/portal/library", key: "portal.nav.library", icon: "Library", roles: ["student", "researcher", "institution_admin"] },
  { href: "/portal/demand", key: "portal.nav.demand", icon: "Inbox", roles: ["researcher", "institution_admin"] },
  { href: "/portal/inbox", key: "portal.nav.inbox", icon: "MessagesSquare", roles: ["specialist", "researcher"] },
  { href: "/portal/eval", key: "portal.nav.eval", icon: "ShieldCheck", roles: ["researcher", "institution_admin"] },
  { href: "/portal/people", key: "portal.nav.people", icon: "Users", roles: ["researcher", "institution_admin"] },
];
