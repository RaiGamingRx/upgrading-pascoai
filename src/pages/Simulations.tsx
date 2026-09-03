import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { GlassPanel } from "@/components/motion/GlassPanel";
import { PageTransition } from "@/components/motion/PageTransition";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useAuth } from "@/hooks/useAuth";
import { scansApi } from "@/lib/api";
import {
  Shield,
  KeyRound,
  MailWarning,
  Network,
  Cloud,
  Users,
  ShieldCheck,
  Play,
  RotateCcw,
  BookOpen,
  Info,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  FileText,
  Pause,
  ChevronLeft,
  Sparkles,
  SlidersHorizontal,
  Activity,
  ArrowRight,
  Layers,
  Terminal,
  Loader2,
  Check,
  Zap,
} from "lucide-react";

/**
 * SIMULATIONS TAB (Future + Current Proof)
 * - Category tabs -> tool grid -> focus-mode tool panel
 * - After selecting a tool: tools auto-hide, user sees ONLY the selected tool working
 * - Split view: Visual Simulation (left) + Explanation/Prevention/Log (right)
 * - User interactions (safe inputs) influence outcome & risk (education-only)
 */

type Risk = "LOW" | "MEDIUM" | "HIGH";
type Outcome = "PREVENTED" | "PARTIAL" | "HIGH_RISK";

type CategoryId = "password" | "phishing" | "network" | "cloud" | "social" | "defense";

type ToolId =
  | "dictionary"
  | "bruteforce"
  | "rainbow"
  | "stuffing"
  | "spraying"
  | "reuse"
  | "weakpolicy"
  | "phish_landing"
  | "phish_spear"
  | "phish_oauth"
  | "dns_spoof_concept"
  | "mitm_concept"
  | "port_exposure"
  | "s3_public"
  | "iam_overpriv"
  | "secrets_leak"
  | "pretexting"
  | "baiting"
  | "tailgating"
  | "mfa_rollout"
  | "log_alerting"
  | "backup_restore";

type SimTool = {
  id: ToolId;
  title: string;
  short: string;
  risk: Risk;
  impact: number; // 0..100
  difficulty: number; // 0..100 (simulation complexity, not attack difficulty)
  tags: string[];
  educationOnly: true;

  whatIsIt: string;
  howItWorks: string[];
  whatCanGoWrong: string[];
  howToBeSafe: string[];

  stages: { label: string; detail: string }[];
};

type SimCategory = {
  id: CategoryId;
  label: string;
  icon: any;
  description: string;
  tools: SimTool[];
};

type RunHistoryItem = {
  toolId: ToolId;
  categoryId: CategoryId;
  title: string;
  date: string; // YYYY-MM-DD
};

type SimInputs = {
  // universal knobs
  mfaEnabled: boolean;
  rateLimit: boolean;
  monitoring: boolean;

  // password-specific
  passwordLength: number; // 6..32
  reuseDetected: boolean;

  // phishing-specific
  userAwareness: number; // 0..100
  domainSimilarity: number; // 0..100 (higher = more convincing)

  // cloud/network/general hardening
  patched: boolean;
  leastPrivilege: boolean;
  publicExposure: boolean;

  // animation / training
  learningMode: number; // 0..100 (higher = slower/more explanatory)
};

const HISTORY_KEY = "pasco_simulations_history_v2";
const MAX_HISTORY = 20;

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function riskBadgeClass(r: Risk) {
  if (r === "HIGH") return "threat-high";
  if (r === "MEDIUM") return "threat-medium";
  return "threat-low";
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fmtAttempts(n: number) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return `${n}`;
}

/* ----------------------- DATA (same as your file; extend later safely) ----------------------- */
const categories: SimCategory[] = [
  {
    id: "password",
    label: "🔐 Password Attacks",
    icon: KeyRound,
    description: "Learn common password compromise patterns and defenses (simulation-only).",
    tools: [
      {
        id: "dictionary",
        title: "Dictionary Attack Simulation",
        short: "Common words + patterns guessing (education-only).",
        risk: "HIGH",
        impact: 80,
        difficulty: 35,
        tags: ["Simulation", "Credential Risk", "Defense-first"],
        educationOnly: true,
        whatIsIt:
          "A dictionary attack is a credential-risk scenario where weak passwords are guessed using common wordlists and predictable patterns.",
        howItWorks: [
          "A list of common passwords/patterns is tested conceptually.",
          "Weak passwords match quickly because users reuse simple words and variations.",
          "Rate-limits and MFA dramatically reduce real-world risk.",
        ],
        whatCanGoWrong: [
          "Account takeover if weak/reused passwords exist.",
          "Credential reuse increases blast radius across services.",
          "Inadequate rate-limiting allows repeated attempts.",
        ],
        howToBeSafe: [
          "Use long, unique passwords (passphrases).",
          "Enable MFA (prefer app/hardware keys).",
          "Use rate limiting, lockouts, and anomaly detection.",
          "Monitor failed login spikes & credential stuffing signals.",
        ],
        stages: [
          { label: "Setup", detail: "Load common password patterns (education simulation)." },
          { label: "Testing", detail: "Simulate repeated guesses against a protected login." },
          { label: "Detection", detail: "Show how rate limiting & alerts reduce risk." },
          { label: "Outcome", detail: "Summarize risk factors and defensive controls." },
        ],
      },
      {
        id: "bruteforce",
        title: "Brute Force Simulation",
        short: "Combination guessing concept (education-only).",
        risk: "MEDIUM",
        impact: 65,
        difficulty: 45,
        tags: ["Simulation", "Rate Limiting", "MFA"],
        educationOnly: true,
        whatIsIt:
          "Brute force is the concept of trying many combinations. In modern systems, online brute force is usually mitigated by rate-limits and MFA.",
        howItWorks: [
          "Attempts increase in volume over time (concept).",
          "Online protections slow attempts dramatically (rate-limits/lockouts).",
          "Password length and uniqueness change feasibility.",
        ],
        whatCanGoWrong: [
          "Without rate limits, attackers can try many guesses quickly.",
          "Weak policies (short passwords) reduce search space.",
          "Credential reuse makes compromise easier through other paths.",
        ],
        howToBeSafe: [
          "Enforce minimum length + complexity + banned passwords list.",
          "Enable MFA and adaptive challenges.",
          "Rate limit by IP/user/device; add progressive delays.",
          "Alert on abnormal failed logins.",
        ],
        stages: [
          { label: "Setup", detail: "Define password policy context (education-only)." },
          { label: "Attempt Burst", detail: "Simulate rapid attempts and throttling." },
          { label: "Controls", detail: "Show lockout/delay and MFA stop conditions." },
          { label: "Outcome", detail: "Explain feasibility vs defenses." },
        ],
      },
      {
        id: "rainbow",
        title: "Rainbow Tables Concept (Safe)",
        short: "Precomputed hash lookup concept (education-only).",
        risk: "MEDIUM",
        impact: 60,
        difficulty: 50,
        tags: ["Concept", "Hashing", "Salts"],
        educationOnly: true,
        whatIsIt:
          "Rainbow tables are a historical concept involving precomputed hash lookups. Modern best practice uses unique salts and slow hashing to reduce this risk.",
        howItWorks: [
          "Hashes can be compared to precomputed sets (conceptually).",
          "Unique salts prevent reuse of precomputed results.",
          "Slow password hashing increases work required for guessing.",
        ],
        whatCanGoWrong: [
          "Unsalted or weakly hashed password databases are at risk.",
          "Reuse of the same hash scheme across systems increases exposure.",
        ],
        howToBeSafe: [
          "Use Argon2id/bcrypt/scrypt for password hashing.",
          "Always use unique per-user salts.",
          "Rotate credentials if exposure suspected; monitor breach sources.",
        ],
        stages: [
          { label: "Setup", detail: "Explain hashes + why precomputation matters (education-only)." },
          { label: "Comparison", detail: "Simulate lookup vs salted hashes." },
          { label: "Hardening", detail: "Show effect of salts + slow hashing." },
          { label: "Outcome", detail: "Summarize defensive posture." },
        ],
      },
      {
        id: "stuffing",
        title: "Credential Stuffing Simulation",
        short: "Reuse of leaked credentials (education-only).",
        risk: "HIGH",
        impact: 85,
        difficulty: 55,
        tags: ["Simulation", "BOT Signals", "MFA"],
        educationOnly: true,
        whatIsIt:
          "Credential stuffing is an account risk scenario where previously leaked credentials are tried across other services due to password reuse.",
        howItWorks: [
          "Large volumes of login attempts come from automation (concept).",
          "Attackers rely on password reuse across sites.",
          "Detection uses rate-limit, IP reputation, device fingerprinting, and behavior analytics.",
        ],
        whatCanGoWrong: ["Account takeover if reused passwords exist.", "Fraud, data exposure, and lockouts impacting real users."],
        howToBeSafe: [
          "Enforce MFA, especially on high-value accounts.",
          "Add bot mitigation and anomaly detection.",
          "Use breached-password checks at login and password change.",
          "Throttle + challenge suspicious attempts (CAPTCHA/step-up).",
        ],
        stages: [
          { label: "Setup", detail: "Simulate leaked credential reuse scenario." },
          { label: "Attempt Wave", detail: "Show burst behavior patterns (education-only)." },
          { label: "Detection", detail: "Highlight bot signals + rate limiting." },
          { label: "Outcome", detail: "Explain controls that stop the risk." },
        ],
      },
      {
        id: "spraying",
        title: "Password Spraying Simulation",
        short: "Few common passwords across many accounts (education-only).",
        risk: "MEDIUM",
        impact: 70,
        difficulty: 50,
        tags: ["Simulation", "Identity", "Policy"],
        educationOnly: true,
        whatIsIt:
          "Password spraying is a risk pattern where a small set of common passwords is tried across many accounts to avoid lockouts.",
        howItWorks: [
          "Attempts are spread across accounts and time windows (concept).",
          "Attackers try 'popular' passwords rather than many tries on one user.",
          "Detection needs cross-account correlation.",
        ],
        whatCanGoWrong: [
          "Weak default passwords or poor hygiene can lead to compromise.",
          "If monitoring is per-user only, attacks can slip through.",
        ],
        howToBeSafe: [
          "Block common passwords and enforce strong password policies.",
          "Use MFA and conditional access.",
          "Detect patterns across many users, not just single accounts.",
        ],
        stages: [
          { label: "Setup", detail: "Define many-user environment (education-only)." },
          { label: "Spray", detail: "Simulate low-and-slow cross-account attempts." },
          { label: "Correlation", detail: "Show how SOC detects multi-user patterns." },
          { label: "Outcome", detail: "Summarize defenses." },
        ],
      },
      {
        id: "reuse",
        title: "Reused Password Risk Simulator",
        short: "See how reuse amplifies breach impact (education-only).",
        risk: "HIGH",
        impact: 75,
        difficulty: 30,
        tags: ["Education", "Hygiene", "Best Practice"],
        educationOnly: true,
        whatIsIt:
          "Password reuse isn't an 'attack tool'—it's a user-risk pattern. This simulation demonstrates how one breach can affect multiple accounts.",
        howItWorks: [
          "A single set of leaked credentials is assumed (concept).",
          "Reuse across multiple services increases takeover probability.",
          "MFA and unique passwords break the chain.",
        ],
        whatCanGoWrong: ["Cascade compromise across email, banking, and social accounts.", "Identity theft and long-term account recovery issues."],
        howToBeSafe: [
          "Use a password manager to generate unique passwords.",
          "Enable MFA on email and critical services first.",
          "Change passwords quickly after breach notifications.",
        ],
        stages: [
          { label: "Setup", detail: "Assume a breach event (education-only)." },
          { label: "Propagation", detail: "Simulate reuse across services." },
          { label: "Controls", detail: "Show how MFA + uniqueness prevents spread." },
          { label: "Outcome", detail: "Best-practice summary." },
        ],
      },
      {
        id: "weakpolicy",
        title: "Weak Policy Simulation",
        short: "Short length, no blocklist, no MFA (education-only).",
        risk: "HIGH",
        impact: 78,
        difficulty: 40,
        tags: ["Simulation", "Policy", "Governance"],
        educationOnly: true,
        whatIsIt:
          "This simulation shows how weak password policies increase credential risk—even without any 'attack steps'.",
        howItWorks: ["Short minimum length reduces entropy (concept).", "No banned-password list allows common passwords.", "No MFA leaves single-factor accounts vulnerable."],
        whatCanGoWrong: ["High success rates for guessing and reuse patterns.", "Support burden increases due to account lockouts and compromises."],
        howToBeSafe: [
          "Enforce length (12–16+), block common passwords.",
          "Add MFA and adaptive authentication.",
          "Monitor auth logs and implement risk-based access controls.",
        ],
        stages: [
          { label: "Setup", detail: "Choose a weak policy (education-only)." },
          { label: "Risk", detail: "Simulate how common patterns succeed." },
          { label: "Harden", detail: "Apply stronger policy + MFA and compare." },
          { label: "Outcome", detail: "Policy recommendations summary." },
        ],
      },
    ],
  },

  {
    id: "phishing",
    label: "🎣 Phishing Simulation",
    icon: MailWarning,
    description: "Understand phishing patterns and defenses (simulation-only).",
    tools: [
      {
        id: "phish_landing",
        title: "Phishing Landing Page Simulation",
        short: "How fake login flows trick users (education-only).",
        risk: "HIGH",
        impact: 85,
        difficulty: 45,
        tags: ["Simulation", "User Training", "MFA"],
        educationOnly: true,
        whatIsIt:
          "A simulation of how attackers mimic login pages to steal credentials—focused on recognition and prevention.",
        howItWorks: ["User receives a deceptive message with urgency cues.", "User is redirected to a look-alike page (concept).", "Credentials entered are captured by attacker (concept)."],
        whatCanGoWrong: ["Account takeover, mailbox compromise, and downstream resets.", "Business email compromise (BEC) if corporate email is affected."],
        howToBeSafe: ["Verify domains carefully; use password managers (they detect wrong domains).", "Enable MFA; prefer phishing-resistant methods.", "Use email security + user awareness training."],
        stages: [
          { label: "Setup", detail: "Present a deceptive message scenario (education-only)." },
          { label: "Redirect", detail: "Show look-alike domain warning cues." },
          { label: "Detection", detail: "Simulate user/reporting and email filtering." },
          { label: "Outcome", detail: "Defense checklist summary." },
        ],
      },
      {
        id: "phish_spear",
        title: "Spear Phishing Simulation",
        short: "Targeted message patterns & SOC response (education-only).",
        risk: "HIGH",
        impact: 88,
        difficulty: 55,
        tags: ["Simulation", "SOC", "Detection"],
        educationOnly: true,
        whatIsIt:
          "Spear phishing is targeted deception (often personalized). This simulation shows detection signals and safe response.",
        howItWorks: ["Attacker uses public info to craft a believable message (concept).", "Message requests action: invoice, credential check, or urgent approval.", "SOC correlates sender anomalies + link reputation + user reports."],
        whatCanGoWrong: ["Fraudulent payments, credential theft, or sensitive data leaks."],
        howToBeSafe: ["Out-of-band verification for payment/urgent requests.", "DMARC/SPF/DKIM + email security gateway.", "User reporting workflows + SOC triage playbooks."],
        stages: [
          { label: "Setup", detail: "Simulate a targeted request scenario." },
          { label: "Signal", detail: "Highlight anomaly indicators (headers, domain, wording)." },
          { label: "Response", detail: "Simulate reporting + SOC triage steps." },
          { label: "Outcome", detail: "Prevention checklist summary." },
        ],
      },
      {
        id: "phish_oauth",
        title: "OAuth Consent Phishing (Concept)",
        short: "Consent screen abuse awareness (education-only).",
        risk: "MEDIUM",
        impact: 70,
        difficulty: 60,
        tags: ["Concept", "Identity", "App Controls"],
        educationOnly: true,
        whatIsIt:
          "A consent phishing concept where users grant access to a malicious app. This simulation focuses on safe review and controls.",
        howItWorks: ["User is prompted to approve app permissions (concept).", "Over-broad scopes can allow mailbox/data access.", "Admins can restrict app consent and monitor risky grants."],
        whatCanGoWrong: ["Persistent access without password compromise.", "Data exposure through granted scopes."],
        howToBeSafe: ["Restrict app consent; review OAuth grants regularly.", "Educate users about scopes and verified publishers.", "Use conditional access and identity governance."],
        stages: [
          { label: "Setup", detail: "Show a permission request scenario." },
          { label: "Scopes", detail: "Explain risk of over-broad scopes." },
          { label: "Controls", detail: "Simulate admin restrictions + monitoring." },
          { label: "Outcome", detail: "Best practices summary." },
        ],
      },
    ],
  },

  {
    id: "network",
    label: "🌐 Network Attacks",
    icon: Network,
    description: "Network threat concepts and defenses (simulation-only).",
    tools: [
      {
        id: "dns_spoof_concept",
        title: "DNS Spoofing Concept",
        short: "How wrong DNS responses mislead traffic (education-only).",
        risk: "MEDIUM",
        impact: 65,
        difficulty: 55,
        tags: ["Concept", "DNS", "Defense"],
        educationOnly: true,
        whatIsIt:
          "A conceptual simulation of how incorrect DNS answers can redirect users—focused on recognizing and preventing the risk.",
        howItWorks: ["User requests a domain; DNS answer determines destination (concept).", "If answers are manipulated, traffic may go to a malicious destination.", "DNSSEC and secure resolvers reduce risk."],
        whatCanGoWrong: ["Traffic redirection and credential capture through deception."],
        howToBeSafe: ["Use secure DNS resolvers and enable DNSSEC where possible.", "Use HTTPS with certificate validation (HSTS).", "Monitor DNS anomalies and resolver logs."],
        stages: [
          { label: "Setup", detail: "Simulate DNS resolution flow." },
          { label: "Anomaly", detail: "Introduce incorrect DNS response concept." },
          { label: "Defense", detail: "Show DNSSEC/HTTPS validation protection." },
          { label: "Outcome", detail: "Defense checklist summary." },
        ],
      },
      {
        id: "mitm_concept",
        title: "Man-in-the-Middle (Concept)",
        short: "Interception risk on untrusted networks (education-only).",
        risk: "MEDIUM",
        impact: 60,
        difficulty: 60,
        tags: ["Concept", "HTTPS", "VPN"],
        educationOnly: true,
        whatIsIt:
          "A conceptual simulation of interception risk on untrusted networks—focused on defenses like HTTPS and VPN.",
        howItWorks: ["On untrusted networks, traffic can be observed (concept).", "HTTPS encrypts application traffic; VPN adds a secure tunnel.", "Certificate warnings are critical indicators."],
        whatCanGoWrong: ["Sensitive data exposure on misconfigured or non-HTTPS services."],
        howToBeSafe: ["Prefer HTTPS everywhere; heed certificate warnings.", "Use VPN on public networks.", "Use secure Wi-Fi and disable auto-join to open networks."],
        stages: [
          { label: "Setup", detail: "Simulate untrusted network scenario." },
          { label: "Exposure", detail: "Explain where plaintext would be visible." },
          { label: "Defense", detail: "Show HTTPS/VPN protection conceptually." },
          { label: "Outcome", detail: "Best practices summary." },
        ],
      },
      {
        id: "port_exposure",
        title: "Service Exposure Risk (Concept)",
        short: "Why exposed services need hardening (education-only).",
        risk: "HIGH",
        impact: 78,
        difficulty: 45,
        tags: ["Concept", "Hardening", "SOC"],
        educationOnly: true,
        whatIsIt:
          "A safe simulation showing why publicly exposed services increase risk and why hardening and patching matter.",
        howItWorks: ["Public services are discoverable (concept).", "Outdated software increases vulnerability risk.", "Defense: patching, WAF, allowlists, and monitoring."],
        whatCanGoWrong: ["Increased attack surface and potential compromise when misconfigured."],
        howToBeSafe: ["Minimize exposure; use allowlists/VPN/Zero Trust access.", "Patch regularly; monitor vulnerabilities.", "Add WAF/reverse proxy and strong authentication."],
        stages: [
          { label: "Setup", detail: "List service exposure assumptions." },
          { label: "Risk", detail: "Explain attack surface concept." },
          { label: "Hardening", detail: "Apply controls and show risk reduction." },
          { label: "Outcome", detail: "Hardening checklist summary." },
        ],
      },
    ],
  },

  {
    id: "cloud",
    label: "☁️ Cloud Misconfigurations",
    icon: Cloud,
    description: "Cloud misconfig patterns and prevention (simulation-only).",
    tools: [
      {
        id: "s3_public",
        title: "Public Storage Bucket Risk",
        short: "Why public buckets leak data (education-only).",
        risk: "HIGH",
        impact: 90,
        difficulty: 35,
        tags: ["Simulation", "Cloud", "Data Exposure"],
        educationOnly: true,
        whatIsIt:
          "A simulation of how public storage misconfigurations can expose sensitive data—focused on safe prevention steps.",
        howItWorks: ["Buckets/containers can be accidentally set to public (concept).", "Sensitive files become downloadable by anyone with access.", "Defense: least privilege, policies, and continuous monitoring."],
        whatCanGoWrong: ["Data leakage, compliance violations, and incident response costs."],
        howToBeSafe: ["Block public access and enforce least privilege policies.", "Enable logging and alerts for permission changes.", "Use CSPM checks and regular audits."],
        stages: [
          { label: "Setup", detail: "Assume a bucket with misconfigured ACL/policy." },
          { label: "Exposure", detail: "Show how data becomes accessible (concept)." },
          { label: "Fix", detail: "Apply block-public-access + least privilege." },
          { label: "Outcome", detail: "Prevention checklist summary." },
        ],
      },
      {
        id: "iam_overpriv",
        title: "Over-Privileged IAM Role Risk",
        short: "Least privilege simulation (education-only).",
        risk: "HIGH",
        impact: 85,
        difficulty: 50,
        tags: ["Simulation", "IAM", "Governance"],
        educationOnly: true,
        whatIsIt:
          "A simulation showing why over-privileged roles are risky and how least privilege reduces blast radius.",
        howItWorks: ["Broad permissions allow unintended actions (concept).", "Compromised credentials become more damaging with admin scopes.", "Defense: least privilege, role separation, and monitoring."],
        whatCanGoWrong: ["Unauthorized access to data, infra changes, and persistence."],
        howToBeSafe: ["Audit IAM permissions; remove unused privileges.", "Use role separation and just-in-time access.", "Alert on privilege changes and anomalous actions."],
        stages: [
          { label: "Setup", detail: "Assume a role with excessive permissions." },
          { label: "Risk", detail: "Show what broad access enables (concept)." },
          { label: "Harden", detail: "Reduce scopes; enable monitoring." },
          { label: "Outcome", detail: "IAM checklist summary." },
        ],
      },
      {
        id: "secrets_leak",
        title: "Secrets in Code Risk",
        short: "API keys in repos (education-only).",
        risk: "HIGH",
        impact: 88,
        difficulty: 40,
        tags: ["Education", "Secrets", "DevSecOps"],
        educationOnly: true,
        whatIsIt:
          "A simulation of the risk when API keys/secrets are committed to code repositories and later abused.",
        howItWorks: ["Secrets in code can be discovered by scans or leaks (concept).", "Keys may grant access to APIs, storage, or services.", "Defense: secret managers, scanning, and rotation."],
        whatCanGoWrong: ["Unauthorized API usage, data access, and unexpected billing."],
        howToBeSafe: ["Use secret managers and environment variables.", "Enable secret scanning in CI and repositories.", "Rotate exposed keys and add least privilege scopes."],
        stages: [
          { label: "Setup", detail: "Assume a secret is committed (education-only)." },
          { label: "Discovery", detail: "Explain how secrets get found." },
          { label: "Response", detail: "Rotate keys; revoke and monitor usage." },
          { label: "Outcome", detail: "DevSecOps checklist summary." },
        ],
      },
    ],
  },

  {
    id: "social",
    label: "🧠 Social Engineering",
    icon: Users,
    description: "Human-focused deception patterns (education-only).",
    tools: [
      {
        id: "pretexting",
        title: "Pretexting Simulation",
        short: "Fake identity + urgency (education-only).",
        risk: "MEDIUM",
        impact: 70,
        difficulty: 45,
        tags: ["Simulation", "Training", "Policy"],
        educationOnly: true,
        whatIsIt:
          "Pretexting is a deception method where an attacker pretends to be a trusted person to obtain sensitive information.",
        howItWorks: ["Attacker creates a believable story (concept).", "Uses urgency/authority cues to pressure action.", "Defense: verification procedures and training."],
        whatCanGoWrong: ["Data disclosure, credential exposure, or unauthorized changes."],
        howToBeSafe: ["Require verification for sensitive requests (callbacks).", "Train staff to identify pressure tactics.", "Use approval workflows for high-risk actions."],
        stages: [
          { label: "Setup", detail: "Simulate a request from a 'trusted' role." },
          { label: "Pressure", detail: "Highlight urgency cues." },
          { label: "Verify", detail: "Apply verification workflow." },
          { label: "Outcome", detail: "Training checklist summary." },
        ],
      },
      {
        id: "baiting",
        title: "Baiting Simulation",
        short: "Tempting offer leads to risk (education-only).",
        risk: "MEDIUM",
        impact: 60,
        difficulty: 35,
        tags: ["Education", "Awareness"],
        educationOnly: true,
        whatIsIt:
          "Baiting is a deception method that uses curiosity or offers to lure users into unsafe actions.",
        howItWorks: ["A tempting offer or file is presented (concept).", "User interacts without verification.", "Defense: policies and safe handling."],
        whatCanGoWrong: ["Malicious downloads, account compromise, or data exposure."],
        howToBeSafe: ["Follow safe download policies and verify sources.", "Use endpoint protection and sandboxing.", "Educate on social-engineering tactics."],
        stages: [
          { label: "Setup", detail: "Present a tempting offer scenario." },
          { label: "Decision", detail: "Show safe vs unsafe decision points." },
          { label: "Control", detail: "Apply endpoint controls conceptually." },
          { label: "Outcome", detail: "Best practices summary." },
        ],
      },
      {
        id: "tailgating",
        title: "Tailgating Awareness",
        short: "Physical access awareness (education-only).",
        risk: "LOW",
        impact: 45,
        difficulty: 30,
        tags: ["Awareness", "Physical Security"],
        educationOnly: true,
        whatIsIt:
          "Tailgating is when an unauthorized person follows someone into a restricted area. This simulation focuses on awareness and policy.",
        howItWorks: ["Attacker relies on politeness and social norms (concept).", "Access controls are bypassed by following closely.", "Defense: badges, mantraps, and policy enforcement."],
        whatCanGoWrong: ["Unauthorized physical access can lead to theft or device compromise."],
        howToBeSafe: ["Enforce badge checks and escort policies.", "Use physical access controls (turnstiles/mantraps).", "Security awareness training."],
        stages: [
          { label: "Setup", detail: "Simulate entering a restricted area." },
          { label: "Risk", detail: "Show how tailgating happens conceptually." },
          { label: "Policy", detail: "Apply escort/badge verification." },
          { label: "Outcome", detail: "Physical security checklist summary." },
        ],
      },
    ],
  },

  {
    id: "defense",
    label: "🛡️ Defense Scenarios",
    icon: ShieldCheck,
    description: "Blue-team playbooks and hardening simulations.",
    tools: [
      {
        id: "mfa_rollout",
        title: "MFA Rollout Planner (Simulation)",
        short: "Step-by-step hardening rollout plan (education-only).",
        risk: "LOW",
        impact: 40,
        difficulty: 35,
        tags: ["Defense", "Identity", "Roadmap"],
        educationOnly: true,
        whatIsIt:
          "A defensive simulation to plan MFA rollout in phases—focused on reducing account takeover risk.",
        howItWorks: ["Identify high-value accounts first (admins, email, finance).", "Choose MFA methods and recovery policies.", "Roll out with monitoring, training, and enforcement."],
        whatCanGoWrong: ["Poor rollout can lock out users or create support overload."],
        howToBeSafe: ["Use staged rollout + pilot groups.", "Provide recovery mechanisms and support playbooks.", "Monitor sign-in logs and enforce conditional access."],
        stages: [
          { label: "Inventory", detail: "Identify critical accounts and apps." },
          { label: "Pilot", detail: "Simulate pilot rollout and training." },
          { label: "Enforce", detail: "Gradual enforcement with monitoring." },
          { label: "Outcome", detail: "Hardening checklist summary." },
        ],
      },
      {
        id: "log_alerting",
        title: "SOC Alert Tuning (Simulation)",
        short: "Reduce noise and catch real signals (education-only).",
        risk: "LOW",
        impact: 35,
        difficulty: 55,
        tags: ["Defense", "SOC", "Playbook"],
        educationOnly: true,
        whatIsIt:
          "A defense scenario that simulates improving alerts: reduce false positives and highlight high-signal detections.",
        howItWorks: ["Group alerts by source/asset and add context.", "Set severity based on business impact and confidence.", "Validate with test cases and monitoring."],
        whatCanGoWrong: ["Over-tuning can suppress important alerts."],
        howToBeSafe: ["Use change control and validation checks.", "Track metrics: precision, recall, and analyst time.", "Keep a rollback plan."],
        stages: [
          { label: "Baseline", detail: "Measure current alert noise." },
          { label: "Tune", detail: "Add context and thresholds." },
          { label: "Validate", detail: "Simulate validation and QA." },
          { label: "Outcome", detail: "SOC checklist summary." },
        ],
      },
      {
        id: "backup_restore",
        title: "Backup & Restore Readiness",
        short: "Recovery readiness simulation (education-only).",
        risk: "LOW",
        impact: 30,
        difficulty: 45,
        tags: ["Defense", "Resilience", "IR"],
        educationOnly: true,
        whatIsIt:
          "A defensive simulation for backup hygiene and restore drills to improve resilience.",
        howItWorks: ["Define RPO/RTO targets and critical assets.", "Test restores regularly and document steps.", "Monitor backup integrity and access controls."],
        whatCanGoWrong: ["Untested backups may fail when needed most."],
        howToBeSafe: ["Run restore drills and keep runbooks updated.", "Use immutable backups and least privilege access.", "Monitor backup jobs and storage health."],
        stages: [
          { label: "Plan", detail: "Set RPO/RTO and critical scope." },
          { label: "Drill", detail: "Simulate restore test and validation." },
          { label: "Harden", detail: "Apply immutability and access controls." },
          { label: "Outcome", detail: "Resilience checklist summary." },
        ],
      },
    ],
  },
];

/* ----------------------- Visual Simulation (safe + deterministic) ----------------------- */
function seededRng(seed: number) {
  // deterministic pseudo-rng (educational visuals only)
  let a = (seed + 1) * 0x9e3779b1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toolAttemptsPerTick(toolId: ToolId) {
  // Visual-only counters to convey scale; NOT real cracking.
  if (toolId === "dictionary") return 1400;
  if (toolId === "stuffing") return 70;
  if (toolId === "rainbow") return 9000;
  if (toolId === "bruteforce") return 42000;
  if (toolId === "spraying") return 200;
  if (toolId === "reuse") return 90;
  if (toolId === "weakpolicy") return 650;
  if (toolId.startsWith("phish")) return 90;
  if (toolId === "port_exposure") return 250;
  if (toolId === "s3_public") return 180;
  if (toolId === "iam_overpriv") return 120;
  if (toolId === "secrets_leak") return 140;
  if (toolId === "pretexting") return 40;
  if (toolId === "baiting") return 40;
  if (toolId === "tailgating") return 20;
  if (toolId === "mfa_rollout") return 25;
  if (toolId === "log_alerting") return 25;
  if (toolId === "backup_restore") return 25;
  return 120;
}

function VisualSimulationPanel({
  tool,
  inputs,
  visualRunning,
  setVisualRunning,
  speedMs,
  setSpeedMs,
  onResetVisual,
  outcome,
  adjustedImpact,
  adjustedRisk,
}: {
  tool: SimTool;
  inputs: SimInputs;
  visualRunning: boolean;
  setVisualRunning: (v: boolean) => void;
  speedMs: number;
  setSpeedMs: (n: number) => void;
  onResetVisual: () => void;
  outcome: Outcome;
  adjustedImpact: number;
  adjustedRisk: Risk;
}) {
  const [tick, setTick] = useState(0);
  const [events, setEvents] = useState<Array<{ t: number; msg: string; ok?: boolean }>>([]);

  // reset when tool changes
  useEffect(() => {
    setTick(0);
    setEvents([]);
    // do not auto-play here; controlled by parent
  }, [tool.id]);

  useEffect(() => {
    if (!visualRunning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), Math.max(30, speedMs));
    return () => window.clearInterval(id);
  }, [visualRunning, speedMs]);

  const rng = useMemo(() => seededRng(tick + tool.id.length * 17 + inputs.learningMode), [tick, tool.id, inputs.learningMode]);

  const attempts = useMemo(() => tick * toolAttemptsPerTick(tool.id), [tick, tool.id]);
  const progressPct = useMemo(() => Math.min(100, (tick % 100) * 1), [tick]); // looped visual

  const dictionaryWords = useMemo(
    () => ["password", "welcome", "admin", "qwerty", "iloveyou", "pakistan", "summer", "football", "letmein", "abc123"],
    []
  );
  const charset = useMemo(() => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$", []);
  const fakeGuess = useMemo(() => {
    const len = 8 + Math.floor(rng() * 5);
    let s = "";
    for (let i = 0; i < len; i++) s += charset[Math.floor(rng() * charset.length)];
    return s;
  }, [rng, charset]);

  const fakeHash = useMemo(() => {
    const hex = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < 48; i++) out += hex[Math.floor(rng() * 16)];
    return out;
  }, [rng]);

  // outcome styling
  const outcomeBadge = useMemo(() => {
    if (outcome === "PREVENTED") return { text: "Prevented", cls: "border-emerald-400/30 text-emerald-300 bg-emerald-400/10" };
    if (outcome === "PARTIAL") return { text: "Partial Risk", cls: "border-yellow-400/30 text-yellow-200 bg-yellow-400/10" };
    return { text: "High Risk", cls: "border-red-500/30 text-red-300 bg-red-500/10" };
  }, [outcome]);

  const pushEvent = (msg: string, ok?: boolean) => {
    setEvents((prev) => {
      const next = [{ t: Date.now(), msg, ok }, ...prev];
      return next.slice(0, 9);
    });
  };

  useEffect(() => {
    if (!visualRunning) return;

    // Keep these *conceptual*, no real steps, no payloads
    const mfa = inputs.mfaEnabled ? "MFA ON" : "MFA OFF";
    const rl = inputs.rateLimit ? "Rate-limit ON" : "Rate-limit OFF";
    const mon = inputs.monitoring ? "Monitoring ON" : "Monitoring OFF";

    if (tool.id === "dictionary") {
      const w = dictionaryWords[tick % dictionaryWords.length];
      const variant =
        rng() < 0.33 ? w : rng() < 0.66 ? `${w}${Math.floor(rng() * 100)}` : `${w}${["!", "@", "#"][Math.floor(rng() * 3)]}`;
      pushEvent(`Guess pattern (demo): “${variant}” → ${rl}`, inputs.rateLimit);
      if (tick % 10 === 0) pushEvent(`Controls: ${mfa} | ${mon}`, inputs.mfaEnabled && inputs.monitoring);
    } else if (tool.id === "bruteforce") {
      pushEvent(`Enumerate combos (demo): “${fakeGuess}” → ${rl}`, inputs.rateLimit);
      if (tick % 10 === 0) pushEvent(`Password length factor (demo): ${inputs.passwordLength} chars`, inputs.passwordLength >= 12);
    } else if (tool.id === "rainbow") {
      pushEvent(`Lookup hash prefix (concept): ${fakeHash.slice(0, 10)}… → salt stops reuse`, true);
      if (tick % 12 === 0) pushEvent(`Defense: slow hashing + unique salts`, true);
    } else if (tool.id === "stuffing") {
      const services = ["Email", "Shop", "Social", "Bank", "Cloud"];
      const svc = services[Math.floor(rng() * services.length)];
      const blocked = inputs.mfaEnabled || inputs.rateLimit;
      pushEvent(`${svc}: reuse attempt (demo) → ${blocked ? "Blocked" : "Denied/Retry"} (${mfa})`, blocked);
      if (tick % 10 === 0) pushEvent(`Signal: bot-like login wave (concept) → ${mon}`, inputs.monitoring);
    } else if (tool.id.startsWith("phish")) {
      const score = Math.round((inputs.domainSimilarity * 0.6 + (100 - inputs.userAwareness) * 0.4));
      const caught = inputs.userAwareness >= 60 || inputs.mfaEnabled;
      pushEvent(`Inbox lure (demo): similarity ${inputs.domainSimilarity}% → risk ${score}%`, !caught);
      if (tick % 10 === 0) pushEvent(`User awareness ${inputs.userAwareness}% + ${mfa}`, caught);
    } else if (tool.id === "port_exposure") {
      pushEvent(`Public service exposure (concept) → ${inputs.publicExposure ? "Exposed" : "Restricted"}`, !inputs.publicExposure);
      if (tick % 10 === 0) pushEvent(`Patch state: ${inputs.patched ? "Up-to-date" : "Outdated"} + ${mon}`, inputs.patched && inputs.monitoring);
    } else if (tool.id === "s3_public") {
      pushEvent(`Bucket policy (concept) → ${inputs.publicExposure ? "PUBLIC" : "BLOCKED"}`, !inputs.publicExposure);
      if (tick % 12 === 0) pushEvent(`Least privilege: ${inputs.leastPrivilege ? "Enforced" : "Over-broad"}`, inputs.leastPrivilege);
    } else if (tool.id === "iam_overpriv") {
      pushEvent(`Role scopes (concept) → ${inputs.leastPrivilege ? "Minimal" : "Admin-like"}`, inputs.leastPrivilege);
      if (tick % 12 === 0) pushEvent(`Monitoring: ${mon}`, inputs.monitoring);
    } else if (tool.id === "secrets_leak") {
      pushEvent(`Repo scan (concept) → secret detected? ${rng() < 0.4 ? "Yes" : "No"}`, true);
      if (tick % 12 === 0) pushEvent(`Response: rotate keys + limit scopes (best practice)`, true);
    } else if (tool.id === "pretexting" || tool.id === "baiting" || tool.id === "tailgating") {
      const aware = inputs.userAwareness >= 60;
      pushEvent(`Human factor (demo) → verify & follow policy: ${aware ? "Yes" : "No"}`, aware);
      if (tick % 10 === 0) pushEvent(`Controls: training + procedure + reporting`, true);
    } else {
      // defense scenarios or generic
      pushEvent(`Defense playbook step (demo): ${tool.stages[Math.floor(rng() * tool.stages.length)].label}`, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, tool.id, visualRunning]);

  return (
    <GlassPanel variant="cyber" className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-border/40 gap-3">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            Visual Simulation Console
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Safe live protocol telemetry simulation — educational demonstration only.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`font-mono text-xs ${riskBadgeClass(adjustedRisk)}`}>
            {adjustedRisk} RISK
          </Badge>
          <Badge variant="outline" className={`font-mono text-xs ${outcomeBadge.cls}`}>
            {outcomeBadge.text}
          </Badge>
        </div>
      </div>

      <div className="space-y-4 pt-1">
        {/* Controls */}
        <div className="flex flex-wrap gap-2.5 items-center justify-between bg-card/40 p-2.5 rounded-xl border border-border/50">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setVisualRunning(!visualRunning)}
              variant={visualRunning ? "outline" : "default"}
              size="sm"
              className="gap-1.5 font-semibold text-xs transition-all active:scale-[0.98]"
            >
              {visualRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {visualRunning ? "Pause Stream" : "Play Stream"}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onResetVisual}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground active:scale-[0.98] group"
            >
              <RotateCcw className="w-3.5 h-3.5 group-hover:-rotate-90 transition-transform duration-standard" />
              Reset
            </Button>

            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background/40 border border-border/40 text-[11px] font-mono">
              {visualRunning ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="text-emerald-400 font-semibold">STREAM ACTIVE</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <span className="text-muted-foreground">STREAM PAUSED</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">Clock Speed</span>
            <input
              type="range"
              min={40}
              max={160}
              value={speedMs}
              onChange={(e) => setSpeedMs(Number(e.target.value))}
              className="w-full sm:w-32 accent-primary cursor-pointer"
            />
            <span className="text-xs font-mono text-primary w-14 text-right">{speedMs}ms</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-card/60 p-3.5 border border-border/60 transition-all hover:border-primary/30">
            <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Engine Protocol</div>
            <div className="mt-1 text-sm font-bold font-mono text-foreground">{tool.id}</div>
          </div>

          <div className="rounded-xl bg-card/60 p-3.5 border border-border/60 transition-all hover:border-primary/30">
            <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Simulated Invocations</div>
            <div className="mt-1 text-base font-bold font-mono text-primary tracking-wide">{fmtAttempts(attempts)}</div>
          </div>

          <div className="rounded-xl bg-card/60 p-3.5 border border-border/60 transition-all hover:border-primary/30">
            <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Adjusted Impact Rating</div>
            <div className="mt-1 text-base font-bold font-mono text-amber-400">{adjustedImpact}%</div>
          </div>
        </div>

        {/* Main visual */}
        <div className={`rounded-xl bg-card/60 p-4 border border-border/60 space-y-3 relative overflow-hidden ${visualRunning ? "scan-line" : ""}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
              <Activity className={`w-3.5 h-3.5 text-primary ${visualRunning ? "animate-pulse" : ""}`} />
              Live Simulation Telemetry
            </span>
            <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary bg-primary/5">
              ISOLATED RUNTIME
            </Badge>
          </div>

          <div className="w-full h-1.5 rounded-full bg-background/60 overflow-hidden border border-border/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-cyan-400 to-secondary transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Tool-specific visuals */}
          {tool.id === "dictionary" && (
            <div>
              <div className="text-xs font-mono text-muted-foreground mb-2">Simulated Dictionary Vector:</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {dictionaryWords.slice(0, 8).map((w, i) => {
                  const active = (tick % dictionaryWords.length) === i;
                  return (
                    <div
                      key={w}
                      className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs transition duration-200 ${
                        active
                          ? "border-primary text-primary font-bold bg-primary/15 shadow-neon-cyan-sm scale-[1.02]"
                          : "border-border/60 bg-card/40 text-muted-foreground"
                      }`}
                    >
                      {w}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tool.id === "bruteforce" && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-4 font-mono">
              <div className="text-xs text-muted-foreground">Active Keyspace Permutation (Demo)</div>
              <div className="mt-1.5 text-lg text-primary font-bold tracking-widest flex items-center">
                <span>{fakeGuess}</span>
                {visualRunning && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />}
              </div>
              <div className="mt-3 text-xs text-muted-foreground font-sans">
                Search space expands exponentially with <span className="text-foreground font-medium">length</span> and <span className="text-foreground font-medium">character sets</span>. Multi-factor auth and adaptive rate-limits reduce online viability to near-zero.
              </div>
            </div>
          )}

          {tool.id === "rainbow" && (
            <div className="rounded-xl border border-border/60 bg-card/50 p-4 font-mono text-xs">
              <div className="text-xs text-muted-foreground">Precomputed Digest Probe (Demo)</div>
              <div className="mt-1.5 text-primary font-bold break-all flex items-center">
                <span>{fakeHash}</span>
                {visualRunning && <span className="inline-block w-1.5 h-3.5 bg-primary animate-pulse ml-1 shrink-0" />}
              </div>
              <div className="mt-3 text-xs text-muted-foreground font-sans">
                Unique cryptographic salts ensure identical plaintext produces distinct hashes, rendering precomputed tables ineffective.
              </div>
            </div>
          )}

          {(tool.id === "stuffing" || tool.id.startsWith("phish") || tool.id === "s3_public" || tool.id === "iam_overpriv" || tool.id === "port_exposure") && (
            <div className="space-y-2">
              <div className="text-xs font-mono text-muted-foreground">Simulated SOC Event Signals:</div>
              {events.slice(0, 6).map((e) => (
                <div
                  key={e.t}
                  className={`rounded-lg border px-3 py-2 text-xs font-mono transition-all motion-safe:animate-reveal-up ${
                    e.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-border/60 bg-card/40 text-muted-foreground"
                  }`}
                >
                  {e.msg}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Event log */}
        <div className="rounded-xl bg-card/60 p-4 border border-border/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              Runtime Protocol Transcript
            </span>
            <Badge variant="outline" className="text-[10px] font-mono border-amber-400/30 bg-amber-400/10 text-amber-300">
              NON-INTRUSIVE LAB
            </Badge>
          </div>

          <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto font-mono text-xs">
            {events.length === 0 ? (
              <div className="rounded-lg border border-border/40 bg-card/30 p-3 text-muted-foreground text-center">
                Press <span className="text-primary font-semibold">Play Stream</span> to activate telemetry signal generation.
              </div>
            ) : (
              events.map((e) => (
                <div key={e.t} className="rounded-lg border border-border/40 bg-card/30 px-3 py-1.5 text-muted-foreground leading-relaxed motion-safe:animate-fade-in">
                  {e.msg}
                </div>
              ))
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-border/40 text-xs text-muted-foreground">
            Defensive Focus: <span className="text-foreground font-semibold">Enforce Hardware MFA • Adaptive Rate Limiting • Threat Telemetry Logging</span>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

/* ----------------------- Inputs (safe interaction layer) ----------------------- */
function defaultInputsForCategory(categoryId: CategoryId): SimInputs {
  // tuned defaults: looks good in demo, still realistic.
  const base: SimInputs = {
    mfaEnabled: true,
    rateLimit: true,
    monitoring: true,

    passwordLength: 14,
    reuseDetected: false,

    userAwareness: 65,
    domainSimilarity: 70,

    patched: true,
    leastPrivilege: true,
    publicExposure: false,

    learningMode: 35,
  };

  if (categoryId === "password") return { ...base, passwordLength: 14, reuseDetected: false, mfaEnabled: true, rateLimit: true };
  if (categoryId === "phishing") return { ...base, mfaEnabled: true, userAwareness: 60, domainSimilarity: 72, rateLimit: true };
  if (categoryId === "network") return { ...base, patched: true, monitoring: true, publicExposure: false };
  if (categoryId === "cloud") return { ...base, leastPrivilege: true, monitoring: true, publicExposure: false };
  if (categoryId === "social") return { ...base, userAwareness: 65, monitoring: true };
  return { ...base };
}

function computeAdjusted(tool: SimTool, categoryId: CategoryId, inputs: SimInputs): { impact: number; risk: Risk; outcome: Outcome; rationale: string[] } {
  // start from tool defaults
  let impact = tool.impact;
  const rationale: string[] = [];

  // universal reducers
  if (inputs.mfaEnabled) {
    impact -= 10;
    rationale.push("MFA reduces account takeover likelihood.");
  } else {
    impact += 10;
    rationale.push("No MFA increases takeover risk.");
  }

  if (inputs.rateLimit) {
    impact -= 8;
    rationale.push("Rate limiting slows automated attempts and reduces online feasibility.");
  } else {
    impact += 8;
    rationale.push("No rate limiting allows repeated attempts to accumulate.");
  }

  if (inputs.monitoring) {
    impact -= 6;
    rationale.push("Monitoring/alerts improve detection and response speed.");
  } else {
    impact += 6;
    rationale.push("No monitoring delays detection and increases dwell time.");
  }

  // category-specific factors
  if (categoryId === "password") {
    const len = inputs.passwordLength;
    if (len >= 16) {
      impact -= 10;
      rationale.push("Long password length increases entropy (harder to guess conceptually).");
    } else if (len >= 12) {
      impact -= 4;
      rationale.push("12+ characters improves baseline strength.");
    } else {
      impact += 10;
      rationale.push("Short password length increases guessability.");
    }

    if (inputs.reuseDetected) {
      impact += 12;
      rationale.push("Password reuse amplifies breach impact across services.");
    } else {
      impact -= 2;
      rationale.push("No reuse reduces cascading compromise risk.");
    }
  }

  if (categoryId === "phishing") {
    const lure = inputs.domainSimilarity;
    const aware = inputs.userAwareness;
    // more convincing + low awareness => higher impact
    const delta = Math.round(((lure - 50) * 0.18 + (50 - aware) * 0.22));
    impact += delta;
    rationale.push(`Phishing risk shifts with domain similarity (${lure}%) and user awareness (${aware}%).`);
  }

  if (categoryId === "network") {
    if (!inputs.patched) {
      impact += 10;
      rationale.push("Unpatched services increase risk exposure over time.");
    } else {
      impact -= 4;
      rationale.push("Patching reduces known-risk exposure.");
    }
    if (inputs.publicExposure) {
      impact += 10;
      rationale.push("Public exposure increases attack surface.");
    } else {
      impact -= 2;
      rationale.push("Restricted exposure reduces attack surface.");
    }
  }

  if (categoryId === "cloud") {
    if (!inputs.leastPrivilege) {
      impact += 12;
      rationale.push("Over-privileged access increases blast radius.");
    } else {
      impact -= 6;
      rationale.push("Least privilege reduces blast radius.");
    }
    if (inputs.publicExposure) {
      impact += 12;
      rationale.push("Public access misconfig can expose data broadly.");
    } else {
      impact -= 4;
      rationale.push("Blocking public access reduces accidental leaks.");
    }
  }

  if (categoryId === "social") {
    const aware = inputs.userAwareness;
    if (aware >= 70) {
      impact -= 8;
      rationale.push("High user awareness reduces successful social engineering.");
    } else if (aware >= 50) {
      impact -= 2;
      rationale.push("Moderate awareness helps, but gaps remain.");
    } else {
      impact += 10;
      rationale.push("Low awareness increases susceptibility to pressure tactics.");
    }
  }

  if (categoryId === "defense") {
    // defensive scenarios should generally reduce risk
    impact -= 10;
    rationale.push("Defense scenarios focus on risk reduction and readiness improvements.");
  }

  impact = clamp(impact, 0, 100);

  // map adjusted impact => adjusted risk
  let risk: Risk = "LOW";
  if (impact >= 75) risk = "HIGH";
  else if (impact >= 50) risk = "MEDIUM";

  // determine outcome
  let outcome: Outcome = "PARTIAL";
  if (impact <= 40) outcome = "PREVENTED";
  if (impact >= 75) outcome = "HIGH_RISK";

  // small guard: if MFA + monitoring + rateLimit are all ON, rarely show HIGH_RISK (unless extreme)
  if (inputs.mfaEnabled && inputs.monitoring && inputs.rateLimit && impact < 85 && outcome === "HIGH_RISK") {
    outcome = "PARTIAL";
    rationale.push("Strong baseline controls often prevent worst-case outcomes.");
  }

  return { impact, risk, outcome, rationale: rationale.slice(0, 6) };
}

/* ----------------------- Page ----------------------- */
export default function Simulations() {
  const prefersReduced = useReducedMotion();

  const [activeCategoryId, setActiveCategoryId] = useState<CategoryId>("password");
  const [activeToolId, setActiveToolId] = useState<ToolId>("dictionary");

  // focus mode: after selecting a tool, show only that tool experience
  const [focusMode, setFocusMode] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // stage simulation (original engine)
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [runLog, setRunLog] = useState<string[]>([]);
  const runTimerRef = useRef<number | null>(null);

  // visual simulation
  const [visualRunning, setVisualRunning] = useState(false);
  const [speedMs, setSpeedMs] = useState(80);

  /* ---------------- Auth & Tenant Context ---------------- */
  const { user, isDemo } = useAuth();

  const [history, setHistory] = useState<RunHistoryItem[]>([]);

  // safe user inputs
  const [inputs, setInputs] = useState<SimInputs>(() => defaultInputsForCategory("password"));

  useEffect(() => {
    if (user && !isDemo) {
      // REAL USER: Query simulation history from authenticated Neon PostgreSQL database
      scansApi.list()
        .then(({ scans }) => {
          const simScans = (scans || []).filter(
            (s: any) => s.raw_summary?.type === "security_simulation" || s.rawSummary?.type === "security_simulation"
          );
          const formatted: RunHistoryItem[] = simScans.map((s: any) => {
            const raw = s.raw_summary || s.rawSummary || {};
            return {
              toolId: raw.toolId || "unknown",
              categoryId: raw.categoryId || "general",
              title: raw.title || "Security Simulation",
              date: raw.date || (s.created_at ? s.created_at.slice(0, 10) : todayISO()),
            };
          });
          setHistory(formatted.slice(0, MAX_HISTORY));
        })
        .catch((err) => {
          console.error("Failed to load simulation history from Neon:", err);
        });
    } else {
      // DEMO USER: Load from local browser storage / memory (ZERO Neon reads)
      const saved = safeJson<RunHistoryItem[]>(localStorage.getItem(HISTORY_KEY), []);
      setHistory(Array.isArray(saved) ? saved.slice(0, MAX_HISTORY) : []);
    }
  }, [user, isDemo]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId) ?? categories[0],
    [activeCategoryId]
  );

  const tools = activeCategory.tools;

  useEffect(() => {
    if (!tools.some((t) => t.id === activeToolId)) {
      setActiveToolId(tools[0].id);
    }
    // update default inputs when switching category (keeps UX predictable)
    setInputs(defaultInputsForCategory(activeCategoryId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategoryId]);

  const activeTool = useMemo(() => tools.find((t) => t.id === activeToolId) ?? tools[0], [tools, activeToolId]);

  const adjusted = useMemo(() => computeAdjusted(activeTool, activeCategoryId, inputs), [activeTool, activeCategoryId, inputs]);

  const systemBadge = useMemo(() => {
    if (running) return { text: "Simulation running", cls: "border-yellow-500/40 text-yellow-300" };
    if (focusMode) return { text: "Focus Mode", cls: "border-cyan-500/40 text-cyan-300" };
    return { text: "Education Mode", cls: "border-green-500/40 text-green-400" };
  }, [running, focusMode]);

  // adaptive animation: higher learningMode => slower
  useEffect(() => {
    // base style: punchy default, slows down with learningMode
    const slowFactor = Math.round((inputs.learningMode / 100) * 70); // 0..70
    const newSpeed = clamp(70 + slowFactor, 40, 160);
    setSpeedMs(newSpeed);
  }, [inputs.learningMode]);

  const clearHistory = () => {
    if (isDemo || !user) {
      try {
        localStorage.removeItem(HISTORY_KEY);
      } catch {
        // ignore
      }
    }
    setHistory([]);
    toast.success("Simulation history cleared");
  };

  const addHistory = (tool: SimTool) => {
    const item: RunHistoryItem = {
      toolId: tool.id,
      categoryId: activeCategoryId,
      title: tool.title,
      date: todayISO(),
    };
    const next = [item, ...history].slice(0, MAX_HISTORY);
    setHistory(next);

    if (user && !isDemo) {
      // REAL USER: Persist simulation run to Neon via authenticated RLS endpoint
      scansApi.create({
        target: "security_simulations",
        targetType: "url_endpoint",
        isVerified: true,
        overallScore: null,
        rawSummary: {
          type: "security_simulation",
          toolId: tool.id,
          categoryId: activeCategoryId,
          title: tool.title,
          date: todayISO(),
          risk: tool.risk,
          impact: tool.impact,
        },
        findings: [{
          domainCategory: "DEFENSE_SIMULATION",
          title: `Simulation: ${tool.title}`,
          description: `Interactive defense simulation completed: ${tool.short}`,
          severity: tool.risk === "HIGH" ? "medium" : tool.risk === "MEDIUM" ? "low" : "info",
          verificationClass: "TRAINING_SIMULATION",
          recommendation: tool.howToBeSafe?.[0] || "Follow standard hardening procedures.",
        }],
      }).catch((err) => {
        console.error("Failed to persist simulation run to Neon:", err);
      });
    } else {
      // DEMO USER: Store in local browser storage only (ZERO Neon writes)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    }
  };

  const resetRunUI = () => {
    setRunning(false);
    setProgress(0);
    setStageIndex(0);
    setRunLog([]);
    if (runTimerRef.current) {
      window.clearInterval(runTimerRef.current);
      runTimerRef.current = null;
    }
  };

  const resetVisualUI = () => {
    setVisualRunning(false);
    window.setTimeout(() => setVisualRunning(true), prefersReduced ? 0 : 40);
  };

  const executeTool = () => {
    if (running) return;

    resetRunUI();
    setRunning(true);
    setVisualRunning(true);
    toast.message("Running educational simulation...");

    const totalStages = activeTool.stages.length;
    let p = 0;
    let idx = 0;

    setRunLog([
      `Started: ${activeTool.title}`,
      `Mode: Education-only simulation (no real attack actions)`,
      `Adjusted Risk: ${adjusted.risk} | Adjusted Impact: ${adjusted.impact}%`,
      `Outcome: ${adjusted.outcome}`,
      `Inputs: MFA=${inputs.mfaEnabled ? "ON" : "OFF"}, RateLimit=${inputs.rateLimit ? "ON" : "OFF"}, Monitoring=${inputs.monitoring ? "ON" : "OFF"}`,
      `---`,
      `Stage 1/${totalStages}: ${activeTool.stages[0].label} — ${activeTool.stages[0].detail}`,
    ]);

    runTimerRef.current = window.setInterval(() => {
      // faster base loop; learningMode slows via speedMs in visual only. Stage timer stays readable.
      p = clamp(p + 7, 0, 100);
      setProgress(p);

      const nextStage = Math.min(totalStages - 1, Math.floor((p / 100) * totalStages));
      if (nextStage !== idx) {
        idx = nextStage;
        setStageIndex(idx);
        setRunLog((prev) => [
          ...prev,
          `Stage ${idx + 1}/${totalStages}: ${activeTool.stages[idx].label} — ${activeTool.stages[idx].detail}`,
        ]);
      }

      if (p >= 100) {
        if (runTimerRef.current) {
          window.clearInterval(runTimerRef.current);
          runTimerRef.current = null;
        }

        setRunLog((prev) => [
          ...prev,
          `---`,
          `Completed: ${activeTool.title}`,
          `Result: Educational simulation only — demonstrated risk patterns and defenses.`,
          `Top Reasons:`,
          ...adjusted.rationale.map((x) => `- ${x}`),
        ]);

        setRunning(false);
        addHistory(activeTool);
        toast.success("Simulation complete");
      }
    }, 280);
  };

  const exportRun = () => {
    if (isExporting || runLog.length === 0) return;
    setIsExporting(true);
    toast.message("Preparing TXT report...");

    window.setTimeout(() => {
      const content = [
        `PascoAI — Simulations Report`,
        `Date: ${new Date().toISOString()}`,
        ``,
        `Category: ${activeCategory.label}`,
        `Tool: ${activeTool.title}`,
        `Base Risk: ${activeTool.risk}`,
        `Base Impact: ${activeTool.impact}%`,
        `Base Difficulty: ${activeTool.difficulty}%`,
        ``,
        `Adjusted Risk: ${adjusted.risk}`,
        `Adjusted Impact: ${adjusted.impact}%`,
        `Outcome: ${adjusted.outcome}`,
        ``,
        `Inputs (safe):`,
        `- MFA: ${inputs.mfaEnabled ? "ON" : "OFF"}`,
        `- Rate limiting: ${inputs.rateLimit ? "ON" : "OFF"}`,
        `- Monitoring: ${inputs.monitoring ? "ON" : "OFF"}`,
        `- Password length (if applicable): ${inputs.passwordLength}`,
        `- Reuse detected (if applicable): ${inputs.reuseDetected ? "Yes" : "No"}`,
        `- User awareness (if applicable): ${inputs.userAwareness}%`,
        `- Domain similarity (if applicable): ${inputs.domainSimilarity}%`,
        `- Patched: ${inputs.patched ? "Yes" : "No"}`,
        `- Least privilege: ${inputs.leastPrivilege ? "Yes" : "No"}`,
        `- Public exposure: ${inputs.publicExposure ? "Yes" : "No"}`,
        ``,
        `Rationale:`,
        ...adjusted.rationale.map((x) => `- ${x}`),
        ``,
        `What is it:`,
        activeTool.whatIsIt,
        ``,
        `How it works:`,
        ...activeTool.howItWorks.map((x) => `- ${x}`),
        ``,
        `What can go wrong:`,
        ...activeTool.whatCanGoWrong.map((x) => `- ${x}`),
        ``,
        `How to be safe:`,
        ...activeTool.howToBeSafe.map((x) => `- ${x}`),
        ``,
        `Simulation Log:`,
        ...runLog.map((x) => x),
        ``,
      ].join("\n");

      downloadTextFile(`pascoai_sim_${activeTool.id}_${todayISO()}.txt`, content);
      setIsExporting(false);
      toast.success("Report exported");
    }, prefersReduced ? 0 : 350);
  };

  const enterFocusModeForTool = (toolId: ToolId) => {
    setActiveToolId(toolId);
    resetRunUI();
    setVisualRunning(false);

    if (prefersReduced) {
      setFocusMode(true);
      toast.message("Focus mode enabled");
    } else {
      setIsInitializing(true);
      setFocusMode(true);
      toast.message("Initializing simulation console...");
      window.setTimeout(() => {
        setIsInitializing(false);
      }, 420);
    }
  };

  const exitFocusMode = () => {
    setFocusMode(false);
    setIsInitializing(false);
    resetRunUI();
    setVisualRunning(false);
    toast.message("Back to tool library");
  };

  // small helper UI for toggles without importing extra switch component
  const ToggleRow = ({
    label,
    value,
    onChange,
    hint,
  }: {
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
    hint?: string;
  }) => (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/30 p-3 transition-all duration-standard cursor-pointer group">
      <div className="min-w-0">
        <div className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</div>
        {hint ? <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint}</div> : null}
      </div>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer shrink-0 transition-transform active:scale-95"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );

  const InputsPanel = () => {
    const cat = activeCategoryId;

    return (
      <GlassPanel variant="cyber" className="p-4 sm:p-5 space-y-4">
        <div className="pb-2 border-b border-border/40">
          <h3 className="flex items-center gap-2 text-sm sm:text-base font-bold text-foreground">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            Adaptive Defenses (Controls)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Modify defensive parameters to observe live outcome & risk shifts.
          </p>
        </div>

        <div className="space-y-2.5">
          <ToggleRow
            label="Hardware / App MFA"
            value={inputs.mfaEnabled}
            onChange={(v) => setInputs((p) => ({ ...p, mfaEnabled: v }))}
            hint="Phishing-resistant MFA (FIDO2/WebAuthn/Authenticator)."
          />
          <ToggleRow
            label="Rate Limiting & Lockouts"
            value={inputs.rateLimit}
            onChange={(v) => setInputs((p) => ({ ...p, rateLimit: v }))}
            hint="Throttles automated credential attacks and bursts."
          />
          <ToggleRow
            label="SOC Telemetry & Anomaly Alerts"
            value={inputs.monitoring}
            onChange={(v) => setInputs((p) => ({ ...p, monitoring: v }))}
            hint="Real-time detection and rapid containment."
          />

          {cat === "password" && (
            <>
              <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2 transition-all hover:border-primary/30">
                <div className="flex items-center justify-between text-xs sm:text-sm font-mono">
                  <span className="text-muted-foreground">Password Length:</span>
                  <span className="text-primary font-bold">{inputs.passwordLength} chars</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={32}
                  value={inputs.passwordLength}
                  onChange={(e) => setInputs((p) => ({ ...p, passwordLength: Number(e.target.value) }))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="text-[11px] text-muted-foreground font-mono">
                  Length exponentially raises Shannon entropy against guessing.
                </div>
              </div>

              <ToggleRow
                label="Simulate Credential Reuse"
                value={inputs.reuseDetected}
                onChange={(v) => setInputs((p) => ({ ...p, reuseDetected: v }))}
                hint="Reuse cascades breaches across multiple independent accounts."
              />
            </>
          )}

          {(cat === "phishing" || cat === "social") && (
            <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2 transition-all hover:border-primary/30">
              <div className="flex items-center justify-between text-xs sm:text-sm font-mono">
                <span className="text-muted-foreground">Staff Security Awareness:</span>
                <span className="text-primary font-bold">{inputs.userAwareness}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={inputs.userAwareness}
                onChange={(e) => setInputs((p) => ({ ...p, userAwareness: Number(e.target.value) }))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="text-[11px] text-muted-foreground font-mono">
                Higher awareness correlates with immediate reporting of suspicious signals.
              </div>
            </div>
          )}

          {cat === "phishing" && (
            <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2 transition-all hover:border-primary/30">
              <div className="flex items-center justify-between text-xs sm:text-sm font-mono">
                <span className="text-muted-foreground">Typosquatting Lure Similarity:</span>
                <span className="text-primary font-bold">{inputs.domainSimilarity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={inputs.domainSimilarity}
                onChange={(e) => setInputs((p) => ({ ...p, domainSimilarity: Number(e.target.value) }))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="text-[11px] text-muted-foreground font-mono">
                Higher visual parity increases lure effectiveness without domain validation.
              </div>
            </div>
          )}

          {(cat === "network" || cat === "cloud") && (
            <>
              <ToggleRow
                label="Vulnerability Patching Enforced"
                value={inputs.patched}
                onChange={(v) => setInputs((p) => ({ ...p, patched: v }))}
                hint="Eliminates known public CVE exploits."
              />
              <ToggleRow
                label="IAM Least Privilege Scoping"
                value={inputs.leastPrivilege}
                onChange={(v) => setInputs((p) => ({ ...p, leastPrivilege: v }))}
                hint="Constrains potential blast radius to specific resources."
              />
              <ToggleRow
                label="Public Service Exposure"
                value={inputs.publicExposure}
                onChange={(v) => setInputs((p) => ({ ...p, publicExposure: v }))}
                hint="Direct internet access dramatically increases attack surface."
              />
            </>
          )}

          <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2 transition-all hover:border-primary/30">
            <div className="flex items-center justify-between text-xs sm:text-sm font-mono">
              <span className="text-muted-foreground">Simulation Pace:</span>
              <span className="text-primary font-bold">{inputs.learningMode}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={inputs.learningMode}
              onChange={(e) => setInputs((p) => ({ ...p, learningMode: Number(e.target.value) }))}
              className="w-full accent-primary cursor-pointer"
            />
            <div className="text-[11px] text-muted-foreground font-mono">
              Higher = slower step-by-step training. Lower = rapid live demo.
            </div>
          </div>
        </div>
      </GlassPanel>
    );
  };

  return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto select-none">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          {focusMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={exitFocusMode}
              className="gap-1.5 mt-1 border-primary/40 text-primary hover:bg-primary/10 font-semibold active:scale-95 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              Library
            </Button>
          ) : null}

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gradient-cyber tracking-tight">
                {focusMode ? activeTool.title : "Cyber Defense Simulations"}
              </h1>
              <Badge variant="outline" className="border-primary/40 text-primary font-mono text-[11px] bg-primary/10 hidden sm:inline-flex">
                22 PROTOCOL ENGINES
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {focusMode
                ? activeTool.short
                : "Interactive, safe educational simulations — understand adversary techniques and defensive mitigations."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Badge
            variant="outline"
            className={`py-1 px-3 flex items-center gap-1.5 font-mono text-xs ${systemBadge.cls}`}
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span>{systemBadge.text}</span>
          </Badge>
        </div>
      </div>

      {/* Category Tabs (hidden in focus mode to eliminate distraction) */}
      {!focusMode && (
        <GlassPanel variant="default" className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Layers className="w-4 h-4 text-primary" />
              <span>Simulation Domain Categories</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">Select Domain</span>
          </div>

          <Tabs value={activeCategoryId} onValueChange={(v) => setActiveCategoryId(v as CategoryId)}>
            <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 h-auto gap-2 bg-transparent p-0">
              {categories.map((c) => {
                const isCatActive = c.id === activeCategoryId;
                return (
                  <TabsTrigger
                    key={c.id}
                    value={c.id}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all duration-200 active:scale-95 ${
                      isCatActive
                        ? "border-primary/60 bg-primary/15 text-primary shadow-neon-cyan-sm"
                        : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:bg-card/70"
                    }`}
                  >
                    <c.icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{c.label.replace(/^.*? /, "")}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {categories.map((c) => (
              <TabsContent
                key={c.id}
                value={c.id}
                className="mt-3 text-xs sm:text-sm text-muted-foreground font-mono bg-card/30 p-2.5 rounded-lg border border-border/40 motion-safe:animate-fade-in"
              >
                {c.description}
              </TabsContent>
            ))}
          </Tabs>
        </GlassPanel>
      )}

      {/* TOOL SELECTION GRID (hidden in focus mode) */}
      {!focusMode && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-base font-bold text-foreground">
              <Shield className="w-4 h-4 text-primary" />
              <span>{activeCategory.label} Scenarios</span>
            </div>
            <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
              {activeCategory.tools.length} Scenarios Available
            </Badge>
          </div>

          <div key={activeCategoryId} className="grid grid-cols-1 md:grid-cols-2 gap-4 motion-safe:animate-reveal-up">
            {tools.map((t, idx) => {
              const active = t.id === activeToolId;
              return (
                <RevealOnScroll key={t.id} direction="up" delay={30 * Math.min(idx, 6)}>
                  <InteractiveCard
                    glowColor={active ? "cyan" : t.risk === "HIGH" ? "amber" : "cyan"}
                    enableTilt={false}
                    className={`p-5 cursor-pointer group flex flex-col justify-between h-full transition-all duration-standard hover:-translate-y-1 ${
                      active ? "border-primary/70 shadow-neon-cyan-subtle ring-1 ring-primary/30" : ""
                    }`}
                    onClick={() => enterFocusModeForTool(t.id)}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors truncate">
                            {t.title}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                            {t.short}
                          </p>
                        </div>
                        <Badge variant="outline" className={`shrink-0 font-mono text-xs font-semibold ${riskBadgeClass(t.risk)}`}>
                          {t.risk} RISK
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary bg-primary/5">
                          Simulation
                        </Badge>
                        {t.tags.slice(0, 2).map((x) => (
                          <Badge key={x} variant="outline" className="text-[10px] font-mono border-border/60 text-muted-foreground">
                            {x}
                          </Badge>
                        ))}
                      </div>

                      <div className="space-y-2 pt-1">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
                            <span>Threat Impact</span>
                            <span className="font-bold text-foreground">{t.impact}%</span>
                          </div>
                          <div className="h-1.5 group-hover:h-2 w-full bg-background/60 rounded-full overflow-hidden border border-border/40 transition-all duration-standard">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-500 to-amber-500 rounded-full transition-all duration-300"
                              style={{ width: `${t.impact}%` }}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
                            <span>Simulation Depth</span>
                            <span className="font-bold text-foreground">{t.difficulty}%</span>
                          </div>
                          <div className="h-1.5 group-hover:h-2 w-full bg-background/60 rounded-full overflow-hidden border border-border/40 transition-all duration-standard">
                            <div
                              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-300"
                              style={{ width: `${t.difficulty}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs font-mono text-primary">
                      <span>{active ? "Active in Console" : "Launch Scenario Console"}</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1.5 transition-transform duration-standard" />
                    </div>
                  </InteractiveCard>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      )}

      {/* FOCUS MODE: Initialization state OR Active Split View */}
      {focusMode && isInitializing && (
        <div className="min-h-[420px] flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-primary/40 bg-card/60 backdrop-blur-md relative overflow-hidden scan-line motion-safe:animate-fade-in">
          <div className="relative mb-6 flex items-center justify-center">
            <div className="absolute w-20 h-20 rounded-full bg-primary/20 animate-ping opacity-40" />
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/40 flex items-center justify-center shadow-neon-cyan-sm">
              <Sparkles className="w-7 h-7 text-primary animate-pulse" />
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border border-primary/40 bg-primary/10 text-primary mb-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            INITIALIZING ISOLATED PROTOCOL
          </div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
            {activeTool.title}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-md font-mono">
            Allocating isolated parameters • Calibrating attack vectors & defense matrices...
          </p>
          <div className="w-64 max-w-full h-1.5 rounded-full bg-background/80 mt-6 overflow-hidden border border-border/60">
            <div className="h-full bg-gradient-to-r from-primary via-cyan-400 to-secondary animate-shimmer bg-[length:200%_100%] rounded-full w-full" />
          </div>
        </div>
      )}

      {/* FOCUS MODE: Active Split View (Visuals + Explanation + Controls) */}
      {focusMode && !isInitializing && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 motion-safe:animate-fade-in">
          {/* Left: Execution & Visual Telemetry (xl:col-span-7) */}
          <div className="xl:col-span-7 space-y-6">
            <GlassPanel variant="default" className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Active Focus Scenario</div>
                  <div className="text-lg sm:text-xl font-bold text-foreground truncate">{activeTool.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{activeTool.short}</div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`font-mono text-xs ${riskBadgeClass(activeTool.risk)}`}>
                    Base: {activeTool.risk}
                  </Badge>
                  <Badge variant="outline" className={`font-mono text-xs ${riskBadgeClass(adjusted.risk)}`}>
                    Adjusted: {adjusted.risk}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-xs border-primary/40 text-primary">
                    Impact: {adjusted.impact}%
                  </Badge>
                </div>
              </div>
            </GlassPanel>

            {/* Run controls */}
            <GlassPanel variant="cyber" className={`p-4 sm:p-6 space-y-4 relative overflow-hidden ${running ? "scan-line" : ""}`}>
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <div className="flex items-center gap-2 font-bold text-base text-foreground">
                  <FileText className="w-4 h-4 text-primary" />
                  <span>Execution Controller</span>
                </div>
                <Badge variant="outline" className={`font-mono text-xs ${riskBadgeClass(adjusted.risk)}`}>
                  {adjusted.outcome}
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="flex gap-2.5">
                  <Button
                    onClick={executeTool}
                    disabled={running}
                    size="lg"
                    className="w-full font-semibold shadow-neon-cyan-sm active:scale-[0.98] transition-all"
                  >
                    {running ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Executing Stage {stageIndex + 1}/{activeTool.stages.length}...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Run Scenario Simulation
                      </>
                    )}
                  </Button>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={resetRunUI}
                        disabled={running && progress < 100}
                        className="px-3 active:scale-95 group"
                      >
                        <RotateCcw className="w-4 h-4 group-hover:-rotate-90 transition-transform duration-standard" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset simulation stages</TooltipContent>
                  </Tooltip>
                </div>

                <div className="space-y-2 bg-card/40 p-3.5 rounded-xl border border-border/50">
                  <div className="flex justify-between text-xs font-mono text-muted-foreground">
                    <span>Protocol Stage Progress</span>
                    <span className="font-bold text-primary">{progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-background/60 rounded-full overflow-hidden border border-border/40">
                    <div
                      className="h-full bg-gradient-to-r from-primary via-cyan-400 to-secondary transition-all duration-300 rounded-full shadow-neon-cyan-sm"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-xs font-mono text-muted-foreground flex items-center justify-between">
                    <span>
                      Stage {Math.min(stageIndex + 1, activeTool.stages.length)} of {activeTool.stages.length}:{" "}
                      <span className="text-foreground font-semibold">
                        {activeTool.stages[Math.min(stageIndex, activeTool.stages.length - 1)].label}
                      </span>
                    </span>
                    {running && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-primary animate-pulse">
                        <Activity className="w-3 h-3" />
                        STREAMING
                      </span>
                    )}
                  </div>
                </div>

                {/* Completion Feedback Banner */}
                {progress === 100 && !running && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-xs font-mono motion-safe:animate-reveal-up">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold">SIMULATION COMPLETE — DEFENSIVE POSTURE EVALUATED</span>
                  </div>
                )}

                <div className="rounded-xl bg-card/50 p-3.5 border border-border/60">
                  <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                    Security Posture Factors
                  </div>
                  <ul className="space-y-1.5">
                    {adjusted.rationale.map((x, i) => (
                      <li key={i} className="text-xs text-muted-foreground font-mono flex items-start gap-2 motion-safe:animate-fade-in">
                        <span className="w-4 h-4 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] text-primary shrink-0 mt-0.5 font-bold">
                          {i + 1}
                        </span>
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </GlassPanel>

            {/* Visual split panel */}
            <VisualSimulationPanel
              tool={activeTool}
              inputs={inputs}
              visualRunning={visualRunning}
              setVisualRunning={setVisualRunning}
              speedMs={speedMs}
              setSpeedMs={setSpeedMs}
              onResetVisual={resetVisualUI}
              outcome={adjusted.outcome}
              adjustedImpact={adjusted.impact}
              adjustedRisk={adjusted.risk}
            />
          </div>

          {/* Right: Explanation + Safe Inputs (xl:col-span-5) */}
          <div className="xl:col-span-5 space-y-6">
            <InputsPanel />

            <GlassPanel variant="default" className="p-4 sm:p-5 space-y-4">
              <div className="pb-2 border-b border-border/40">
                <h3 className="flex items-center gap-2 font-bold text-base text-foreground">
                  <Info className="w-4 h-4 text-primary" />
                  <span>Technical & Defensive Analysis</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Concept breakdown, mechanics, mitigation controls & run log.
                </p>
              </div>

              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid grid-cols-4 h-9 bg-card/60 p-1 border border-border/60 rounded-xl">
                  <TabsTrigger value="overview" className="text-xs font-medium gap-1 active:scale-95 transition-all">
                    <Info className="w-3.5 h-3.5" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="how" className="text-xs font-medium gap-1 active:scale-95 transition-all">
                    <BookOpen className="w-3.5 h-3.5" />
                    How
                  </TabsTrigger>
                  <TabsTrigger value="safe" className="text-xs font-medium gap-1 active:scale-95 transition-all">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Mitigate
                  </TabsTrigger>
                  <TabsTrigger value="log" className="text-xs font-medium gap-1 active:scale-95 transition-all">
                    <Clock className="w-3.5 h-3.5" />
                    Log
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-3.5 space-y-3 motion-safe:animate-fade-in">
                  <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {activeTool.whatIsIt}
                  </div>

                  <div className="flex flex-wrap gap-1.5 font-mono">
                    <Badge variant="outline" className="text-[11px]">
                      Base Impact: {activeTool.impact}%
                    </Badge>
                    <Badge variant="outline" className="text-[11px] border-primary/30 text-primary">
                      Adjusted: {adjusted.impact}%
                    </Badge>
                    <Badge variant="outline" className="text-[11px]">
                      Depth: {activeTool.difficulty}%
                    </Badge>
                  </div>

                  <div className="rounded-xl bg-card/50 p-3.5 border border-border/60">
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                      Consequences & Risks
                    </div>
                    <ul className="space-y-1.5">
                      {activeTool.whatCanGoWrong.slice(0, 3).map((x, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>{x}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </TabsContent>

                <TabsContent value="how" className="mt-3.5 space-y-3 motion-safe:animate-fade-in">
                  <div className="rounded-xl bg-card/50 p-3.5 border border-border/60">
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                      Adversary Mechanics (Concept)
                    </div>
                    <ol className="space-y-2">
                      {activeTool.howItWorks.map((x, i) => (
                        <li key={i} className="text-xs text-muted-foreground font-mono flex items-start gap-2">
                          <Badge variant="outline" className="h-4 px-1.5 text-[10px] shrink-0 mt-0.5">
                            {i + 1}
                          </Badge>
                          <span>{x}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-xl bg-card/50 p-3.5 border border-border/60">
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                      Simulation Sequence
                    </div>
                    <ol className="space-y-2">
                      {activeTool.stages.map((s, i) => (
                        <li key={s.label} className="text-xs text-muted-foreground font-mono flex items-start gap-2">
                          <Badge variant="outline" className="h-4 px-1.5 text-[10px] shrink-0 mt-0.5">
                            {i + 1}
                          </Badge>
                          <span>
                            <span className="text-foreground font-semibold">{s.label}:</span> {s.detail}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </TabsContent>

                <TabsContent value="safe" className="mt-3.5 space-y-3 motion-safe:animate-fade-in">
                  <div className="rounded-xl bg-card/50 p-3.5 border border-border/60">
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                      Defense & Hardening Playbook
                    </div>
                    <ul className="space-y-2">
                      {activeTool.howToBeSafe.map((x, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{x}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-[11px] text-muted-foreground font-mono bg-card/30 p-2.5 rounded-lg border border-border/40">
                    Defense-First Protocol: All simulated vectors demonstrate defensive controls without actual offensive exploits.
                  </div>
                </TabsContent>

                <TabsContent value="log" className="mt-3.5 space-y-3 motion-safe:animate-fade-in">
                  <div className="rounded-xl bg-card/50 p-3 border border-border/60">
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Execution Transcript</span>
                      {running && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-primary animate-pulse">
                          <Terminal className="w-3 h-3" />
                          RECORDING
                        </span>
                      )}
                    </div>
                    {runLog.length === 0 ? (
                      <div className="text-xs font-mono text-muted-foreground py-6 text-center">
                        Click <span className="text-primary font-semibold">Run Scenario Simulation</span> to generate execution telemetry.
                      </div>
                    ) : (
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
{runLog.join("\n")}
{running && <span className="inline-block w-2 h-3.5 bg-primary animate-pulse ml-1 align-middle" />}
                      </pre>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportRun}
                      disabled={runLog.length === 0 || isExporting}
                      className="text-xs font-mono active:scale-95 transition-all"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Preparing TXT...
                        </>
                      ) : (
                        <>
                          <FileText className="w-3.5 h-3.5 mr-1.5" />
                          Export TXT Report
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRunLog([]);
                        toast.message("Log cleared");
                      }}
                      disabled={runLog.length === 0}
                      className="text-xs font-mono text-muted-foreground hover:text-foreground active:scale-95"
                    >
                      Clear Log
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </GlassPanel>
          </div>
        </div>
      )}

      {/* History (Visible outside focus mode) */}
      {!focusMode && (
        <GlassPanel variant="default" className="p-4 sm:p-6">
          <div className="flex flex-row items-center justify-between pb-3 border-b border-border/40 gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-secondary" />
              <div>
                <h3 className="font-bold text-sm sm:text-base text-foreground">Simulation Run History</h3>
                <p className="text-xs text-muted-foreground">Quick access to previously executed scenarios</p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={clearHistory}
              disabled={history.length === 0}
              className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          </div>

          <div className="mt-4">
            {history.length === 0 ? (
              <p className="text-xs sm:text-sm text-muted-foreground text-center py-6">
                No simulation runs recorded yet. Launch any scenario above to populate this log.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {history.map((h, i) => (
                  <button
                    key={`${h.date}-${h.toolId}-${i}`}
                    onClick={() => {
                      setActiveCategoryId(h.categoryId);
                      setTimeout(() => {
                        setActiveToolId(h.toolId);
                        setFocusMode(true);
                        toast.message("Loaded scenario into focus console");
                      }, 0);
                    }}
                    className="text-left rounded-xl p-3 border border-border/40 bg-card/30 hover:bg-card/70 hover:border-primary/40 transition-all duration-standard active:scale-[0.99] group motion-safe:animate-reveal-up"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {h.title}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground mt-1 flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {categories.find((c) => c.id === h.categoryId)?.label.replace(/^.*? /, "") ?? h.categoryId}
                          </Badge>
                          <span>{h.date}</span>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-standard shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </GlassPanel>
      )}
    </PageTransition>
  );
}
