"use client";

import Link from "next/link";
import {
  Sprout,
  LayoutDashboard,
  GraduationCap,
  Users,
  Wallet,
  Camera,
  Calendar,
  CalendarOff,
  MessageCircle,
  Bell,
  QrCode,
  BookOpen,
  FileText,
  UserCog,
  Plane,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { UserMenu } from "./user-menu";

/** Modules actifs vs à venir (grisés jusqu'à leur épisode) */
const navItems = [
  {
    label: "École",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, title: "Tableau de bord", disabled: false },
      { href: "/niveaux", icon: GraduationCap, title: "Niveaux & Classes", disabled: false },
      { href: "/eleves", icon: Users, title: "Élèves", disabled: false },
      { href: "/absences", icon: CalendarOff, title: "Absences", disabled: false },
      { href: "/notes", icon: BookOpen, title: "Notes", disabled: false },
      { href: "/bulletins", icon: GraduationCap, title: "Bulletins", disabled: false },
      { href: "/factures", icon: FileText, title: "Factures", disabled: false },
      { href: "/notifications", icon: Bell, title: "Notifications", disabled: false },
      { href: "/whatsapp", icon: MessageCircle, title: "WhatsApp", disabled: false },
      { href: "/evenements", icon: Calendar, title: "Événements", disabled: false },
      { href: "/budget", icon: Wallet, title: "Budget & Dépenses", disabled: false },
      { href: "/personnel", icon: UserCog, title: "Personnel", disabled: false },
      { href: "/voyage", icon: Plane, title: "Voyage", disabled: false },
      { href: "/journal", icon: Shield, title: "Journal", disabled: false },
    ],
  },
];

export function AppSidebar() {
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
        {navItems.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild={!item.disabled}
                    disabled={item.disabled}
                    tooltip={item.disabled ? `${item.title} (bientôt)` : item.title}
                  >
                    {item.disabled ? (
                      <span className="flex items-center gap-2 opacity-50">
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px]">
                          bientôt
                        </span>
                      </span>
                    ) : (
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
        <SidebarSeparator className="my-2" />
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
