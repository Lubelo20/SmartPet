import { Bell, ClipboardList, Cpu, Gauge, LayoutDashboard, PawPrint, Radio, Settings, Users, Utensils, type LucideIcon } from "lucide-react";

export type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
};

export const NAV: NavItem[] = [
  { key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard, title: "Smart Pet Feeder", subtitle: "Monitor feeding activity, pets, sensors and device status in real time." },
  { key: "live", href: "/live", label: "Live monitoring", icon: Radio, title: "Live monitoring", subtitle: "Camera stream, detection and the running feeding cycle." },
  { key: "pets", href: "/pets", label: "Pets", icon: PawPrint, title: "Pets", subtitle: "Enrolled profiles, portions and feeding schedules." },
  { key: "feeding", href: "/feeding", label: "Feeding", icon: Utensils, title: "Feeding", subtitle: "Dispense manually and manage the schedule." },
  { key: "history", href: "/history", label: "History", icon: ClipboardList, title: "History", subtitle: "Every recorded cycle, with portion accuracy analytics." },
  { key: "sensors", href: "/sensors", label: "Sensors", icon: Gauge, title: "Sensors", subtitle: "Live readings from each component on the feeder." },
  { key: "device", href: "/device", label: "Device", icon: Cpu, title: "Device", subtitle: "ESP32 connection, firmware and configuration." },
  { key: "alerts", href: "/alerts", label: "Alerts", icon: Bell, title: "Alerts", subtitle: "Low food, failed cycles, unknown pets and connectivity events." },
  { key: "household", href: "/household", label: "Household", icon: Users, title: "Household", subtitle: "Who shares this feeder, and who has been invited." },
  { key: "settings", href: "/settings", label: "Settings", icon: Settings, title: "Settings", subtitle: "Feeder defaults and notification preferences." },
];
