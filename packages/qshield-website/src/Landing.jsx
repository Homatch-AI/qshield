import { useState } from "react";

const tiers = [
  {
    id: "free",
    label: "Free",
    price: "$0",
    priceNote: "forever",
    audience: "Anyone who cares about digital safety",
    color: "#64748b",
    accentGlow: "rgba(100, 116, 139, 0.15)",
    headline: "See what's really happening to your emails.",
    subline:
      "Every email you send passes through servers you don't control. QShield shows you whether your messages arrived safely — and lets recipients verify it too.",
    valueProps: [
      {
        icon: "🛡",
        title: "Trust Score Dashboard",
        desc: "A single number (0–100) that tells you how secure your digital environment is, right now. No guessing.",
      },
      {
        icon: "✉️",
        title: "Email Verification Badges",
        desc: "Every email you send includes a verification badge. Recipients click to confirm it arrived intact and unaltered.",
      },
      {
        icon: "🕐",
        title: "24-Hour Activity Timeline",
        desc: "See what happened in the last 24 hours — every email event, every anomaly, every confirmation.",
      },
    ],
    cta: "Start Free — No Credit Card",
    proof: "Join 10,000+ users who verify their emails every day",
  },
  {
    id: "personal",
    label: "Personal",
    price: "$9",
    priceNote: "/month",
    audience: "Freelancers, attorneys, crypto holders, journalists",
    color: "#0ea5e9",
    accentGlow: "rgba(14, 165, 233, 0.15)",
    headline: "Your emails. Your crypto. Your meetings. Protected.",
    subline:
      "You handle sensitive information every day — client contracts, wallet addresses, confidential sources. QShield makes sure nobody is tampering with any of it.",
    valueProps: [
      {
        icon: "🔒",
        title: "Secure Messages",
        desc: "Send encrypted, self-destructing messages. The recipient reads it in their browser. No app needed. The message vanishes after.",
      },
      {
        icon: "💰",
        title: "Crypto Wallet Protection",
        desc: "Clipboard Guard catches address-swap malware in real time. Trusted Address Book warns you before sending to unknown wallets.",
      },
      {
        icon: "📹",
        title: "Zoom Meeting Verification",
        desc: "Verify meeting integrity for your most sensitive calls. Detect unexpected participants and unusual connection changes.",
      },
      {
        icon: "📜",
        title: "Trust Certificates",
        desc: "Generate PDF proof of your security posture. Present to clients, insurers, or counterparties before high-stakes transactions.",
      },
    ],
    cta: "Protect Yourself — $9/mo",
    proof: "Average user catches 2 anomalies per week they'd never have seen",
  },
  {
    id: "business",
    label: "Business",
    price: "$29",
    priceNote: "/seat/month",
    audience: "IT security leads and CISOs at 50–500 person orgs",
    color: "#a855f7",
    accentGlow: "rgba(168, 85, 247, 0.15)",
    headline: "Every sensitive file. Every team message. Encrypted and tracked.",
    subline:
      "Your team sends contracts, financial data, and credentials via email every day. QShield encrypts the sensitive parts and gives you a complete audit trail.",
    valueProps: [
      {
        icon: "📎",
        title: "Secure File Attachments",
        desc: "One click in Gmail turns any attachment into an encrypted download link. Recipients decrypt in their browser. The file self-destructs after.",
      },
      {
        icon: "📊",
        title: "Full Monitoring Suite",
        desc: "Email, Zoom, Teams, file system — all monitored continuously. 365-day evidence retention with tamper-proof hash chains.",
      },
      {
        icon: "⚙️",
        title: "Policy Engine & Alerts",
        desc: "Set custom rules: 'Alert me if any team member's trust score drops below 60.' Auto-escalate to Slack, email, or webhook.",
      },
      {
        icon: "📤",
        title: "Evidence Export",
        desc: "Export evidence records as PDF or JSON for legal, compliance, or insurance. Every record is cryptographically verified.",
      },
    ],
    cta: "Protect Your Team — $29/seat",
    proof: "Business users export evidence within 4 minutes of an incident",
  },
  {
    id: "enterprise",
    label: "Enterprise",
    price: "Custom",
    priceNote: "starting $50k/yr",
    audience: "Fortune 2000 CISOs and GRC teams",
    color: "#f59e0b",
    accentGlow: "rgba(245, 158, 11, 0.15)",
    headline: "Prove compliance. Reduce premiums. Sleep at night.",
    subline:
      "Your board wants proof of security. Your insurer wants evidence of controls. Your auditor wants records. QShield delivers all three from a single platform.",
    valueProps: [
      {
        icon: "🔗",
        title: "SIEM/SOAR Integration",
        desc: "Feed QShield signals directly into Splunk, Sentinel, or your existing SOC. One unified view of communication security.",
      },
      {
        icon: "🔐",
        title: "SSO & SCIM Provisioning",
        desc: "Okta, Azure AD, OneLogin. Provision seats automatically. Enforce company-wide monitoring from day one.",
      },
      {
        icon: "📋",
        title: "Compliance Dashboard",
        desc: "Pre-mapped controls for SOC 2, ISO 27001, and GDPR. Generate audit-ready reports with one click.",
      },
      {
        icon: "🏦",
        title: "Insurance Readiness",
        desc: "Pre-filled cyber insurance applications backed by continuous monitoring evidence. Companies report 15–30% premium reductions.",
      },
    ],
    cta: "Talk to Sales",
    proof: "Enterprise clients reduce cyber insurance premiums by an average of 22%",
  },
];

const motivations = [
  {
    num: "01",
    title: "You can't protect what you can't see",
    body: "Right now, your emails pass through 4–7 servers before reaching the recipient. Your files sit unencrypted on cloud drives. Your Zoom calls route through infrastructure you don't control. You have no way to know if something was intercepted, altered, or copied along the way. QShield makes the invisible visible — giving you a real-time trust score based on continuous monitoring of every communication channel you use.",
    stat: "91%",
    statLabel: "of data breaches start with email compromise",
  },
  {
    num: "02",
    title: "Proof beats promises",
    body: "When something goes wrong — and eventually it will — you need evidence, not excuses. QShield creates a tamper-proof evidence chain for every security event, linked by cryptographic hashes that make alteration impossible. Generate trust certificates as PDF proof for your insurer, your legal team, your compliance auditor, or your board. The evidence exists whether you need it or not. But when you need it, you'll be glad it's there.",
    stat: "4 min",
    statLabel: "average time from incident to evidence export",
  },
  {
    num: "03",
    title: "Security should be invisible until it isn't",
    body: "QShield runs silently in the background. Your trust score stays green. Your emails get verified. Your files get encrypted. You don't think about it. Then one day, your clipboard guard catches an address swap before you send $50,000 to the wrong wallet. Or your policy engine alerts you that a team member's email routing changed unexpectedly. Or your insurer asks for proof of security controls and you generate a certificate in 10 seconds. That's the moment QShield pays for itself — every month, forever.",
    stat: "$0",
    statLabel: "cost of the attack you prevented",
  },
];

export default function QShieldLanding() {
  const [activeTier, setActiveTier] = useState(1);
  const tier = tiers[activeTier];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0e17",
        color: "#e2e8f0",
        fontFamily:
          "'Georgia', 'Times New Roman', serif",
        overflow: "hidden",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "fixed",
          top: "-30%",
          left: "20%",
          width: "60%",
          height: "60%",
          background: `radial-gradient(ellipse, ${tier.accentGlow}, transparent 70%)`,
          pointerEvents: "none",
          transition: "background 0.8s ease",
          zIndex: 0,
        }}
      />

      {/* ── Hero ── */}
      <header
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 900,
          margin: "0 auto",
          padding: "80px 32px 40px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 32,
            padding: "8px 20px",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 100,
            fontSize: 13,
            color: "#94a3b8",
            fontFamily: "'Courier New', monospace",
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          <span style={{ fontSize: 18 }}>🛡</span>
          QShield Trust Assurance Platform
        </div>

        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 400,
            lineHeight: 1.15,
            color: "#f8fafc",
            margin: "0 0 20px",
            letterSpacing: "-0.02em",
          }}
        >
          Trust is not a feeling.
          <br />
          <span style={{ color: tier.color, transition: "color 0.5s ease" }}>
            It's a number.
          </span>
        </h1>

        <p
          style={{
            fontSize: 18,
            color: "#94a3b8",
            maxWidth: 640,
            margin: "0 auto 48px",
            lineHeight: 1.7,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          QShield monitors your emails, meetings, files, and crypto transactions
          in real time. It calculates a trust score, creates tamper-proof evidence
          of everything it detects, and encrypts your sensitive communications —
          so you always know where you stand.
        </p>
      </header>

      {/* ── Three Motivations ── */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 900,
          margin: "0 auto",
          padding: "0 32px 80px",
        }}
      >
        <h2
          style={{
            fontSize: 12,
            fontFamily: "'Courier New', monospace",
            textTransform: "uppercase",
            letterSpacing: 3,
            color: "#475569",
            marginBottom: 48,
            textAlign: "center",
          }}
        >
          Why QShield Exists
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
          {motivations.map((m) => (
            <div
              key={m.num}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 140px",
                gap: 24,
                alignItems: "start",
                padding: "32px 0",
                borderTop: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <span
                style={{
                  fontSize: 48,
                  fontWeight: 300,
                  color: "#1e293b",
                  fontFamily: "'Courier New', monospace",
                  lineHeight: 1,
                }}
              >
                {m.num}
              </span>
              <div>
                <h3
                  style={{
                    fontSize: 22,
                    fontWeight: 400,
                    color: "#f1f5f9",
                    margin: "0 0 12px",
                    lineHeight: 1.3,
                  }}
                >
                  {m.title}
                </h3>
                <p
                  style={{
                    fontSize: 15,
                    color: "#94a3b8",
                    lineHeight: 1.75,
                    margin: 0,
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  {m.body}
                </p>
              </div>
              <div style={{ textAlign: "right", paddingTop: 4 }}>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: "#f8fafc",
                    fontFamily: "'Courier New', monospace",
                    lineHeight: 1,
                  }}
                >
                  {m.stat}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    marginTop: 6,
                    lineHeight: 1.4,
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  {m.statLabel}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tier Selector ── */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 900,
          margin: "0 auto",
          padding: "0 32px 80px",
        }}
      >
        <h2
          style={{
            fontSize: 12,
            fontFamily: "'Courier New', monospace",
            textTransform: "uppercase",
            letterSpacing: 3,
            color: "#475569",
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          Choose Your Protection Level
        </h2>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 4,
            marginBottom: 48,
            padding: 4,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {tiers.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActiveTier(i)}
              style={{
                padding: "10px 24px",
                fontSize: 14,
                fontWeight: activeTier === i ? 600 : 400,
                color: activeTier === i ? "#f8fafc" : "#64748b",
                background:
                  activeTier === i
                    ? `linear-gradient(135deg, ${t.color}22, ${t.color}11)`
                    : "transparent",
                border:
                  activeTier === i
                    ? `1px solid ${t.color}44`
                    : "1px solid transparent",
                borderRadius: 8,
                cursor: "pointer",
                transition: "all 0.25s ease",
                fontFamily:
                  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Active tier card */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: `1px solid ${tier.color}33`,
            borderRadius: 20,
            padding: 48,
            transition: "border-color 0.5s ease",
          }}
        >
          {/* Price + audience */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 32,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span
                  style={{
                    fontSize: 42,
                    fontWeight: 700,
                    color: tier.color,
                    fontFamily: "'Courier New', monospace",
                    transition: "color 0.5s ease",
                  }}
                >
                  {tier.price}
                </span>
                <span style={{ fontSize: 16, color: "#64748b" }}>
                  {tier.priceNote}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  marginTop: 4,
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
              >
                {tier.audience}
              </div>
            </div>
            <div
              style={{
                padding: "6px 16px",
                background: `${tier.color}15`,
                border: `1px solid ${tier.color}30`,
                borderRadius: 100,
                fontSize: 12,
                fontWeight: 600,
                color: tier.color,
                fontFamily:
                  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                textTransform: "uppercase",
                letterSpacing: 1,
                transition: "all 0.5s ease",
              }}
            >
              {tier.label}
            </div>
          </div>

          {/* Headline */}
          <h3
            style={{
              fontSize: 28,
              fontWeight: 400,
              color: "#f1f5f9",
              margin: "0 0 8px",
              lineHeight: 1.3,
            }}
          >
            {tier.headline}
          </h3>
          <p
            style={{
              fontSize: 15,
              color: "#94a3b8",
              margin: "0 0 40px",
              lineHeight: 1.7,
              maxWidth: 640,
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            {tier.subline}
          </p>

          {/* Value props grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 20,
              marginBottom: 40,
            }}
          >
            {tier.valueProps.map((vp, i) => (
              <div
                key={i}
                style={{
                  padding: 24,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 14,
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 10 }}>{vp.icon}</div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#e2e8f0",
                    marginBottom: 6,
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  {vp.title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#94a3b8",
                    lineHeight: 1.65,
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  {vp.desc}
                </div>
              </div>
            ))}
          </div>

          {/* CTA + proof */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
            }}
          >
            <button
              style={{
                padding: "14px 36px",
                fontSize: 15,
                fontWeight: 600,
                color: "#fff",
                background: `linear-gradient(135deg, ${tier.color}, ${tier.color}cc)`,
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                fontFamily:
                  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                boxShadow: `0 4px 20px ${tier.color}40`,
                transition: "all 0.3s ease",
              }}
            >
              {tier.cta}
            </button>
            <span
              style={{
                fontSize: 13,
                color: "#64748b",
                fontStyle: "italic",
                fontFamily:
                  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
            >
              {tier.proof}
            </span>
          </div>
        </div>
      </section>

      {/* ── Comparison strip ── */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 900,
          margin: "0 auto",
          padding: "0 32px 80px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          {tiers.map((t, i) => (
            <div
              key={t.id}
              onClick={() => setActiveTier(i)}
              style={{
                padding: 24,
                background:
                  activeTier === i
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.01)",
                border:
                  activeTier === i
                    ? `1px solid ${t.color}44`
                    : "1px solid rgba(255,255,255,0.04)",
                borderRadius: 14,
                cursor: "pointer",
                transition: "all 0.3s ease",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: t.color,
                  fontFamily: "'Courier New', monospace",
                }}
              >
                {t.price}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  marginTop: 2,
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
              >
                {t.priceNote}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: activeTier === i ? "#f1f5f9" : "#94a3b8",
                  marginTop: 8,
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
              >
                {t.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#475569",
                  marginTop: 6,
                  lineHeight: 1.4,
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
              >
                {t.valueProps.length} features
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <footer
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          padding: "60px 32px 80px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <h2
          style={{
            fontSize: 32,
            fontWeight: 400,
            color: "#f1f5f9",
            margin: "0 0 12px",
          }}
        >
          Start with a number. End with proof.
        </h2>
        <p
          style={{
            fontSize: 16,
            color: "#64748b",
            margin: "0 0 32px",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          Every QShield plan includes real-time monitoring, evidence creation, and email verification.
        </p>
        <button
          style={{
            padding: "16px 48px",
            fontSize: 16,
            fontWeight: 600,
            color: "#0a0e17",
            background: "#f8fafc",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          Get QShield Free →
        </button>
        <div
          style={{
            marginTop: 16,
            fontSize: 12,
            color: "#475569",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          No credit card required • Works with Gmail & Outlook • macOS & Windows
        </div>
      </footer>
    </div>
  );
}
