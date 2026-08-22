import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Shield,
  Key,
  Search,
  Settings,
  Globe,
  Scan,
  FileText,
  Lock,
  MailCheck,
  Beaker,
} from "lucide-react";

const navigationItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Shield, label: "AI Security Scanner", path: "/scanner" },
  { icon: Globe, label: "Web Security Suite", path: "/web-security" },
  { icon: MailCheck, label: "Email Security Checker", path: "/email-security" },
  { icon: Lock, label: "Crypto Lab (AES-256-GCM)", path: "/crypto" },
  { icon: Key, label: "Password Security Lab", path: "/password-lab" },
  { icon: Search, label: "Research Suite (AI Assistant)", path: "/research" },
  { icon: Beaker, label: "Educational Simulations", path: "/simulations" },
  { icon: Settings, label: "Platform Settings", path: "/settings" },
];

const quickActions = [
  { icon: Scan, label: "Run Domain / IP Security Scan", path: "/scanner" },
  { icon: Globe, label: "Audit Live HTTP Headers & SSL", path: "/web-security" },
  { icon: MailCheck, label: "Verify Email DNS & Phishing Signals", path: "/email-security" },
  { icon: Lock, label: "Encrypt File or Secure Message", path: "/crypto" },
  { icon: Key, label: "Analyze Password Entropy & Breaches", path: "/password-lab" },
  { icon: FileText, label: "Launch AI Security Research", path: "/research" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    const handleCustomOpen = () => setOpen(true);

    document.addEventListener("keydown", down);
    window.addEventListener("open-command-palette", handleCustomOpen);

    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("open-command-palette", handleCustomOpen);
    };
  }, []);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a security command or navigate to a lab..." className="font-mono text-sm" />
      <CommandList className="max-h-[380px]">
        <CommandEmpty>No matching security tool found.</CommandEmpty>

        <CommandGroup heading="Quick Security Actions">
          {quickActions.map((item) => (
            <CommandItem
              key={item.label}
              onSelect={() => handleSelect(item.path)}
              className="flex items-center gap-3 cursor-pointer py-2.5"
            >
              <item.icon className="w-4 h-4 text-primary shrink-0" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Lab Navigation">
          {navigationItems.map((item) => (
            <CommandItem
              key={item.path}
              onSelect={() => handleSelect(item.path)}
              className="flex items-center gap-3 cursor-pointer py-2.5"
            >
              <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
