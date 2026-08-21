"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Sprout, LayoutDashboard, GraduationCap, Users, Wallet, Camera,
  Calendar, CalendarOff, MessageCircle, Bell, QrCode, BookOpen,
  FileText, UserCog, Plane, Shield,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarSeparator,
} from "@/components/ui/sidebar";
import { UserMenu } from "./user-menu";
import { authClient, type SessionUser } from "@/lib/auth-client";
import { hasPermission, type Permission } from "@verger/shared/src/permissions";

type NavItem = { href: string; icon: typeof LayoutDashboard; title: string; perm: Permission };

/** Module de navigation requis pour voir chaque page (permission :read du module). */
const navItems: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, title: "Tableau de bord", perm: "dashboard:read" },
  { href: "/niveaux", icon: GraduationCap, title: "Niveaux & Classes", perm: "levels:read" },
  { href: "/eleves", icon: Users, title: "Élèves", perm: "students:read" },
  { href: "/absences", icon: CalendarOff, title: "Absences", perm: "absences:read" },
  { href: "/notes", icon: BookOpen, title: "Notes", perm: "grades:read" },
  { href: "/bulletins", icon: GraduationCap, title: "Bulletins", perm: "grades:read" },
  { href: "/factures", icon: FileText, title: "Factures", perm: "invoices:read" },
  { href: "/paiements", icon: Wallet, title: "Paiements", perm: "payments:read" },
  { href: "/notifications", icon: Bell, title: "Notifications", perm: "notifications:read" },
  { href: "/whatsapp", icon: MessageCircle, title: "WhatsApp", perm: "whatsapp:read" },
  { href: "/evenements", icon: Calendar, title: "Événements", perm: "events:read" },
  { href: "/budget", icon: Wallet, title: "Budget & Dépenses", perm: "expenses:read" },
  { href: "/personnel", icon: UserCog, title: "Personnel", perm: "staff:read" },
  { href: "/voyage", icon: Plane, title: "Voyage", perm: "travel:read" },
  { href: "/journal", icon: Shield, title: "Journal", perm: "journal:read" },
];

export function AppSidebar() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    authClient.getSession().then(({ data }) => setUser(data?.user ?? null));
  }, []);

  const visible = user ? navItems.filter((i) => hasPermission(user.role as any, i.perm)) : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" className="gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                  <Sprout className="size-5" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-base font-semibold">Le Verger</span>
                  <span className="text-xs opacity-70">Gestion scolaire</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>École</SidebarGroupLabel>
          <SidebarMenu>
            {visible.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild tooltip={item.title}>
                  <Link href={item.href}>
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator className="my-2" />
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
