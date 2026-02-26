import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════
   FONTS
   ═══════════════════════════════════════════════════════════════════ */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap";
if (!document.querySelector("[data-qs-f]")) {
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = FONT_LINK; l.setAttribute("data-qs-f", "1"); document.head.appendChild(l);
}

/* ═══════════════════════════════════════════════════════════════════
   GLOBAL STYLES
   ═══════════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.querySelector("[data-qs-s]")) return;
  const s = document.createElement("style"); s.setAttribute("data-qs-s", "1");
  s.textContent = `
    @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes slideIn { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
    @keyframes breathe { 0%,100% { opacity:0.03; } 50% { opacity:0.06; } }
    @keyframes marquee { from { transform:translateX(0); } to { transform:translateX(-50%); } }
    @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.3); } 50% { box-shadow: 0 0 0 8px rgba(34,197,94,0); } }
    @keyframes orbFloat { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
    * { box-sizing:border-box; margin:0; padding:0; }
    html { scroll-behavior:smooth; }
    body { overflow-x:hidden; }
    a:hover { color:rgba(255,255,255,0.85) !important; }
    .qs-reveal { opacity:0; transform:translateY(20px); transition:opacity 0.7s ease,transform 0.7s ease; }
    .qs-reveal.visible { opacity:1; transform:translateY(0); }
    .qs-card:hover { border-color:rgba(34,197,94,0.2) !important; transform:translateY(-3px); box-shadow:0 16px 40px rgba(0,0,0,0.3); }
    .qs-btn-primary { transition:all 0.25s; } .qs-btn-primary:hover { box-shadow:0 0 50px rgba(34,197,94,0.35); transform:translateY(-1px); }
    .qs-btn-ghost { transition:all 0.25s; } .qs-btn-ghost:hover { border-color:rgba(255,255,255,0.25) !important; background:rgba(255,255,255,0.04) !important; }
    .qs-tab { transition:all 0.3s; cursor:pointer; } .qs-tab:hover { color:#fff !important; }
    ::selection { background:rgba(34,197,94,0.25); color:#fff; }
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════════
   SCROLL REVEAL HOOK
   ═══════════════════════════════════════════════════════════════════ */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add("visible"); obs.disconnect(); } }, { threshold: 0.12 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return ref;
}
function Reveal({ children, delay = 0, style = {} }) {
  const r = useReveal();
  return <div ref={r} className="qs-reveal" style={{ transitionDelay: `${delay}ms`, ...style }}>{children}</div>;
}

/* ═══════════════════════════════════════════════════════════════════
   COLORS / TOKENS
   ═══════════════════════════════════════════════════════════════════ */
const C = {
  bg: "#06060a", surface: "rgba(255,255,255,0.02)", surfaceHover: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.06)", borderHover: "rgba(34,197,94,0.2)",
  green: "#22c55e", greenDim: "rgba(34,197,94,0.6)", greenGlow: "rgba(34,197,94,0.08)",
  orange: "#fb923c", red: "#ef4444", blue: "#60a5fa", purple: "#a78bfa",
  text1: "#fff", text2: "rgba(255,255,255,0.7)", text3: "rgba(255,255,255,0.45)", text4: "rgba(255,255,255,0.25)",
  serif: "'Instrument Serif', serif", sans: "'DM Sans', sans-serif", mono: "'JetBrains Mono', monospace",
};

/* ═══════════════════════════════════════════════════════════════════
   SHIELD ORB (enhanced with rings)
   ═══════════════════════════════════════════════════════════════════ */
function ShieldOrb({ score = 87 }) {
  const cvs = useRef(null), raf = useRef(0);
  useEffect(() => {
    const c = cvs.current; if (!c) return; const ctx = c.getContext("2d"), S = 300;
    c.width = S * 2; c.height = S * 2; ctx.scale(2, 2);
    let t = 0;
    const draw = () => {
      t += 0.006; ctx.clearRect(0, 0, S, S);
      const cx = S / 2, cy = S / 2, br = 1 + Math.sin(t * 1.2) * 0.03;
      // outer glow
      const g = ctx.createRadialGradient(cx, cy, 30, cx, cy, 145 * br);
      g.addColorStop(0, "rgba(34,197,94,0.12)"); g.addColorStop(0.6, "rgba(34,197,94,0.03)"); g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      // outer ring
      ctx.beginPath(); ctx.arc(cx, cy, 110 * br, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(34,197,94,0.06)"; ctx.lineWidth = 1; ctx.stroke();
      // middle ring
      ctx.beginPath(); ctx.arc(cx, cy, 88 * br, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(34,197,94,${0.12 + Math.sin(t * 0.8) * 0.05})`; ctx.lineWidth = 1; ctx.stroke();
      // arc segment
      const aStart = t * 0.4, aEnd = aStart + Math.PI * 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, 88 * br, aStart, aEnd);
      ctx.strokeStyle = `rgba(34,197,94,${0.25 + Math.sin(t) * 0.1})`; ctx.lineWidth = 2; ctx.stroke();
      // inner orb
      const o = ctx.createRadialGradient(cx - 8, cy - 8, 3, cx, cy, 62 * br);
      o.addColorStop(0, "rgba(74,222,128,0.25)"); o.addColorStop(0.5, "rgba(34,197,94,0.08)"); o.addColorStop(1, "rgba(20,83,45,0.02)");
      ctx.beginPath(); ctx.arc(cx, cy, 60 * br, 0, Math.PI * 2); ctx.fillStyle = o; ctx.fill();
      // score text
      ctx.fillStyle = C.green; ctx.font = `700 44px ${C.sans}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(score, cx, cy - 8);
      ctx.fillStyle = C.greenDim; ctx.font = `600 10px ${C.sans}`; ctx.letterSpacing = "2px"; ctx.fillText("TRUST SCORE", cx, cy + 20);
      // particles
      for (let i = 0; i < 8; i++) {
        const a = t * 0.5 + (i * Math.PI * 2) / 8, r = 100 * br + Math.sin(t * 1.5 + i * 1.3) * 12;
        const sz = 1.2 + Math.sin(t + i) * 0.5;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, sz, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34,197,94,${0.35 + Math.sin(t + i) * 0.2})`; ctx.fill();
      }
      raf.current = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(raf.current);
  }, [score]);
  return <canvas ref={cvs} style={{ width: 300, height: 300, animation: "orbFloat 6s ease-in-out infinite" }} />;
}

/* ═══════════════════════════════════════════════════════════════════
   HASH CHAIN VISUALIZATION
   ═══════════════════════════════════════════════════════════════════ */
function HashChain() {
  const [blocks, setBlocks] = useState([]);
  useEffect(() => {
    const data = [
      { id: "0x7a3f", event: "zoom-meeting-started", src: "zoom", dt: "0s" },
      { id: "0x8b2e", event: "contract-v3.pdf modified", src: "file", dt: "12s" },
      { id: "0xc41d", event: "email-sent → client@acme.co", src: "email", dt: "34s" },
      { id: "0xd93a", event: "claude-code scope-check", src: "ai", dt: "51s" },
      { id: "0xe52b", event: "btc-wallet-balance-check", src: "crypto", dt: "1m04s" },
    ];
    data.forEach((b, i) => setTimeout(() => setBlocks(p => [...p, b]), 200 + i * 350));
  }, []);
  const srcColor = { zoom: C.blue, file: C.green, email: C.purple, ai: C.orange, crypto: "#facc15" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: C.mono }}>
      {blocks.map((b, i) => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.surface, borderLeft: `2px solid ${srcColor[b.src] || C.green}40`, borderRadius: "0 8px 8px 0", fontSize: 11.5, animation: "slideIn 0.4s ease-out" }}>
          <span style={{ color: srcColor[b.src] || C.green, fontWeight: 600, minWidth: 50 }}>{b.id}</span>
          <span style={{ color: C.text3, minWidth: 36, fontSize: 10, textTransform: "uppercase" }}>{b.src}</span>
          <span style={{ color: C.text2, flex: 1 }}>{b.event}</span>
          <span style={{ color: C.text4, fontSize: 10 }}>{b.dt}</span>
          {i > 0 && <span style={{ color: `${srcColor[blocks[i - 1]?.src] || C.green}60`, fontSize: 9 }}>← {blocks[i - 1]?.id}</span>}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   NAV
   ═══════════════════════════════════════════════════════════════════ */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const h = () => setScrolled(window.scrollY > 50); window.addEventListener("scroll", h, { passive: true }); return () => window.removeEventListener("scroll", h); }, []);
  return (
    <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 max(24px, calc((100vw - 1200px)/2))", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(6,6,10,0.92)" : "transparent", backdropFilter: scrolled ? "blur(24px) saturate(1.2)" : "none",
      borderBottom: scrolled ? `1px solid ${C.border}` : "1px solid transparent", transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg, #22c55e, #15803d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🛡️</div>
        <span style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 17, color: C.text1, letterSpacing: "-0.3px" }}>QShield</span>
        <span style={{ fontSize: 9.5, color: C.greenDim, fontWeight: 600, background: C.greenGlow, padding: "2px 7px", borderRadius: 4 }}>v1.1</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 13 }}>
        {["Features", "Security", "Pricing"].map(t => <a key={t} href={`#${t.toLowerCase()}`} style={{ color: C.text3, textDecoration: "none", fontWeight: 500, transition: "color 0.2s" }}>{t}</a>)}
        <a href="https://api.qshield.app" target="_blank" rel="noopener" style={{ color: C.text3, textDecoration: "none", fontWeight: 500 }}>API</a>
        <a href="https://github.com/Homatch-AI/qshield" target="_blank" rel="noopener" style={{ color: C.text3, textDecoration: "none", fontWeight: 500 }}>GitHub</a>
        <button className="qs-btn-primary" style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: C.green, color: "#000", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: C.sans }}>Download</button>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SCROLLING LOGO/TRUST BAR (Quarkslab style)
   ═══════════════════════════════════════════════════════════════════ */
function TrustLogoBar() {
  const logos = ["Zoom", "Gmail", "Claude Code", "GitHub Copilot", "Cursor", "Microsoft Teams", "macOS Keychain", "SQLite", "Fastify", "Node.js", "Electron", "Let's Encrypt"];
  return (
    <div style={{ overflow: "hidden", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "18px 0", position: "relative", zIndex: 1 }}>
      <div style={{ display: "flex", animation: "marquee 30s linear infinite", width: "max-content" }}>
        {[...logos, ...logos].map((l, i) => (
          <div key={i} style={{ padding: "0 36px", fontSize: 13, fontWeight: 500, color: C.text4, fontFamily: C.sans, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.text4, opacity: 0.5 }} />
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   HERO CAROUSEL (Quarkslab rotating banner)
   ═══════════════════════════════════════════════════════════════════ */
function HeroBannerCarousel() {
  const items = [
    { tag: "WHITEPAPER", text: "How hash chains provide tamper-evident audit trails for enterprise communications", cta: "Read the whitepaper", color: C.green },
    { tag: "PATENT", text: "US Patent 12,452,047 B1 — Quantum Secure Communication Protocol", cta: "Learn about our IP", color: C.blue },
    { tag: "NEW IN v1.1", text: "AI Governance — monitor and constrain coding agents with protected zones", cta: "Explore AI governance", color: C.orange },
    { tag: "OPEN API", text: "Gateway API live at api.qshield.app — verify trust chains programmatically", cta: "View API docs", color: C.purple },
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => { const t = setInterval(() => setIdx(i => (i + 1) % items.length), 4500); return () => clearInterval(t); }, []);
  const it = items[idx];
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, maxWidth: 520, animation: "fadeIn 0.5s ease", cursor: "pointer", transition: "border-color 0.3s" }}>
      <div style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: it.color, letterSpacing: "1.5px", background: `${it.color}12`, padding: "4px 8px", borderRadius: 4 }}>{it.tag}</div>
      <div style={{ flex: 1, fontSize: 12.5, color: C.text2, lineHeight: 1.5 }}>{it.text}</div>
      <div style={{ flexShrink: 0, fontSize: 11, color: it.color, fontWeight: 600, whiteSpace: "nowrap" }}>{it.cta} →</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECURITY LIFECYCLE (Quarkslab 3-phase)
   ═══════════════════════════════════════════════════════════════════ */
function SecurityLifecycle() {
  const phases = [
    { num: "01", icon: "⚡", phase: "COMMUNICATION", title: "Unverified Communications", desc: "Emails, meetings, and file transfers lack cryptographic proof. Anyone can claim a meeting happened or a file was sent — with zero verifiable evidence.", color: C.red },
    { num: "02", icon: "🤖", phase: "AI EXPOSURE", title: "AI Agent Overreach", desc: "AI coding agents operate without boundaries — accessing credentials, private directories, and sensitive files with no oversight or audit trail.", color: C.orange },
    { num: "03", icon: "🕳️", phase: "INTEGRITY", title: "Undetectable Tampering", desc: "Without cryptographic chains, any log can be altered after the fact. There's no way to prove evidence hasn't been modified, deleted, or fabricated.", color: C.purple },
  ];
  const r = useReveal();
  return (
    <section id="security" style={{ position: "relative", zIndex: 1, padding: "120px 40px 100px", maxWidth: 1140, margin: "0 auto" }}>
      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: "2.5px", textTransform: "uppercase" }}>THE PROBLEM</span>
          <h2 style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 400, marginTop: 12, lineHeight: 1.15 }}>Security risks across the<br/>digital workspace lifecycle</h2>
          <p style={{ fontSize: 15, color: C.text3, maxWidth: 540, margin: "16px auto 0" }}>Without cryptographic verification, your communications, files, and AI interactions have no proof of integrity.</p>
        </div>
      </Reveal>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        {phases.map((p, i) => (
          <Reveal key={i} delay={i * 120}>
            <div className="qs-card" style={{ flex: 1, minWidth: 280, maxWidth: 350, padding: "36px 28px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, transition: "all 0.35s", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${p.color}, transparent)` }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.color, letterSpacing: "2px", fontFamily: C.mono }}>{p.num}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: p.color, letterSpacing: "1.5px" }}>{p.phase}</span>
              </div>
              <div style={{ fontSize: 36, marginBottom: 18 }}>{p.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: C.text1, marginBottom: 10, lineHeight: 1.3 }}>{p.title}</div>
              <div style={{ fontSize: 13.5, color: C.text3, lineHeight: 1.7 }}>{p.desc}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   HOLISTIC PROTECTION — TABBED (Quarkslab style)
   ═══════════════════════════════════════════════════════════════════ */
function HolisticProtection() {
  const [tab, setTab] = useState(0);
  const tabs = [
    { label: "Advanced Protection", icon: "🛡️", points: [
      { title: "HMAC-SHA256 Hash Chains", desc: "Every evidence event is chained to the previous via HMAC-SHA256 — tamper one record and the entire chain fails verification instantly." },
      { title: "AES-256-GCM Encryption", desc: "Evidence payloads encrypted at rest with keys derived via PBKDF2 (100K iterations) and stored in your OS keychain." },
      { title: "Real-time Trust Scoring", desc: "Weighted scoring across 7 signal adapters with anomaly detection and configurable alert thresholds." },
      { title: "AI Agent Governance", desc: "Protected zones with warn/block/freeze modes. Risk velocity state machine detects and stops agent overreach." },
    ]},
    { label: "Universal Compatibility", icon: "🌐", points: [
      { title: "Cross-Platform Desktop", desc: "Native Electron app for macOS and Windows with auto-update, tray monitoring, and system keychain integration." },
      { title: "7 Signal Adapters", desc: "Zoom, Microsoft Teams, Gmail (OAuth), file watcher (chokidar), AI agents, cryptocurrency wallets, and API." },
      { title: "Gateway API", desc: "Fastify server with REST + WebSocket for cloud sync, public verification pages, and trust certificate generation." },
      { title: "Email Integration", desc: "Embed verification links and trust scores in email signatures — proof that travels with every message." },
    ]},
    { label: "Scalable & Private", icon: "🔐", points: [
      { title: "Zero-Knowledge Architecture", desc: "Encryption keys never leave your device. No telemetry, no keystrokes, no screen captures — your data stays yours." },
      { title: "Local-First Storage", desc: "SQLite database with HMAC-signed evidence chains. Gateway sync is optional and encrypted end-to-end." },
      { title: "Low Resource Footprint", desc: "Runs silently in your system tray. Minimal CPU and memory usage even with all 7 adapters active." },
      { title: "Enterprise Ready", desc: "SSO/SAML support, on-premise gateway option, audit log export, and 99.9% SLA for enterprise deployments." },
    ]},
  ];
  const active = tabs[tab];
  return (
    <section style={{ position: "relative", zIndex: 1, padding: "120px 40px", maxWidth: 1140, margin: "0 auto" }}>
      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: "2.5px", textTransform: "uppercase" }}>HOLISTIC PROTECTION</span>
          <h2 style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 400, marginTop: 12, lineHeight: 1.15 }}>Secure your sensitive assets<br/>with <span style={{ fontStyle: "italic", color: C.green }}>QShield</span></h2>
          <p style={{ fontSize: 15, color: C.text3, maxWidth: 580, margin: "16px auto 0" }}>Comprehensive trust monitoring that protects evidence, governs AI, and provides cryptographic verification throughout the entire lifecycle.</p>
        </div>
      </Reveal>
      <Reveal delay={100}>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 48, flexWrap: "wrap" }}>
          {tabs.map((t, i) => (
            <div key={i} className="qs-tab" onClick={() => setTab(i)} style={{
              padding: "12px 24px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, fontFamily: C.sans,
              background: tab === i ? C.greenGlow : "transparent", color: tab === i ? C.green : C.text3,
              border: `1px solid ${tab === i ? "rgba(34,197,94,0.2)" : "transparent"}`,
            }}>
              <span style={{ marginRight: 8 }}>{t.icon}</span>{t.label}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {active.points.map((p, i) => (
            <div key={`${tab}-${i}`} className="qs-card" style={{ padding: "28px 24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, transition: "all 0.35s", animation: `fadeUp 0.4s ease ${i * 80}ms both` }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text1, marginBottom: 8, lineHeight: 1.3 }}>{p.title}</div>
              <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.65 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FOUR PILLARS (grid cards)
   ═══════════════════════════════════════════════════════════════════ */
function FourPillars() {
  const pillars = [
    { icon: "🔗", title: "Evidence Protection", sub: "Tamper-evident chains", desc: "Every event hashed into HMAC-SHA256 chains with AES-256-GCM encrypted payloads.", features: ["HMAC-SHA256 hash chains", "AES-256-GCM encryption", "PBKDF2 key derivation"], color: C.green },
    { icon: "🤖", title: "AI Governance", sub: "Agent boundaries", desc: "Monitor and constrain AI coding agents in real-time with auto-freeze on violation.", features: ["Protected zones (warn/block/freeze)", "Risk velocity state machine", "Envelope hash audit trails"], color: C.orange },
    { icon: "🔑", title: "Key Protection", sub: "OS keychain integration", desc: "Encryption keys never leave your device. Derived via PBKDF2, stored in secure keychain.", features: ["Electron safeStorage API", "No keys on remote servers", "Key rotation + re-encryption"], color: C.blue },
    { icon: "📡", title: "Verification", sub: "Public proof of trust", desc: "Share verification links that let anyone validate your trust chain with one click.", features: ["One-click verification pages", "Server-side chain attestation", "Open Graph link previews"], color: C.purple },
  ];
  return (
    <section id="features" style={{ position: "relative", zIndex: 1, padding: "100px 40px", maxWidth: 1140, margin: "0 auto", borderTop: `1px solid ${C.border}` }}>
      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.text4, letterSpacing: "2.5px", textTransform: "uppercase" }}>BUILD YOUR CYBER-DEFENSE</span>
          <h2 style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 400, marginTop: 12 }}>Four pillars of trust</h2>
        </div>
      </Reveal>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(255px, 1fr))", gap: 16 }}>
        {pillars.map((p, i) => (
          <Reveal key={i} delay={i * 100}>
            <div className="qs-card" style={{ padding: "32px 24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, transition: "all 0.35s", height: "100%" }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: `${p.color}10`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 18 }}>{p.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: C.text1, marginBottom: 4 }}>{p.title}</div>
              <div style={{ fontSize: 12, color: p.color, marginBottom: 14, fontWeight: 500 }}>{p.sub}</div>
              <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.65, marginBottom: 20 }}>{p.desc}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                {p.features.map((f, j) => <div key={j} style={{ fontSize: 12, color: C.text2, display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: p.color, fontSize: 8 }}>●</span>{f}</div>)}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   HOW IT WORKS
   ═══════════════════════════════════════════════════════════════════ */
function HowItWorks() {
  return (
    <section style={{ position: "relative", zIndex: 1, padding: "100px 40px", maxWidth: 1140, margin: "0 auto", borderTop: `1px solid ${C.border}` }}>
      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 400, marginBottom: 12 }}>Tamper-evident by design</h2>
          <p style={{ fontSize: 15, color: C.text3, maxWidth: 480, margin: "0 auto" }}>Every action creates a cryptographic evidence record linked to the one before it.</p>
        </div>
      </Reveal>
      <div style={{ display: "flex", gap: 60, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
        <Reveal style={{ flex: 1, minWidth: 340, maxWidth: 500 }}><HashChain /></Reveal>
        <Reveal delay={200} style={{ flex: 1, minWidth: 280, maxWidth: 420 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {[{ s: "01", t: "Monitor", d: "QShield watches your enabled adapters — Zoom calls, email sends, file changes, AI agent actions, crypto wallets." },
              { s: "02", t: "Hash", d: "Each event is HMAC-SHA256 hashed with the previous record's hash, forming an unbreakable chain." },
              { s: "03", t: "Encrypt", d: "Evidence payloads are AES-256-GCM encrypted. Keys are derived via PBKDF2 and stored in your OS keychain." },
              { s: "04", t: "Verify", d: "Share verification links. Anyone can validate your entire trust chain with one click — no account needed." }]
            .map((x, i) => (
              <div key={x.s} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: C.green, opacity: 0.5, marginTop: 4, flexShrink: 0 }}>{x.s}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: C.text1, marginBottom: 4 }}>{x.t}</div>
                  <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.65 }}>{x.d}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   AI GOVERNANCE SPOTLIGHT
   ═══════════════════════════════════════════════════════════════════ */
function AIGovernance() {
  return (
    <section style={{ position: "relative", zIndex: 1, padding: "100px 40px", maxWidth: 1140, margin: "0 auto", borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", gap: 60, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <Reveal style={{ flex: 1, minWidth: 300, maxWidth: 480 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 20, background: `${C.orange}14`, border: `1px solid ${C.orange}30`, fontSize: 11, color: C.orange, fontWeight: 600, marginBottom: 24 }}>NEW IN v1.1</div>
          <h2 style={{ fontFamily: C.serif, fontSize: 40, fontWeight: 400, marginBottom: 16, lineHeight: 1.15 }}>AI agents need<br /><span style={{ fontStyle: "italic", color: C.orange }}>boundaries</span></h2>
          <p style={{ fontSize: 14.5, color: C.text3, lineHeight: 1.7, marginBottom: 28 }}>QShield monitors AI coding agents in real-time. Define protected zones — files and directories that AI must never touch. If an agent crosses the line, QShield auto-freezes it and logs the violation as cryptographic evidence.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13.5 }}>
            {[{ t: "Agent detection", d: "Claude Code, Copilot, Cursor" }, { t: "Protection modes", d: "Warn → Block → Auto-freeze" }, { t: "Risk scoring", d: "Velocity state machine with escalation" }, { t: "Audit trail", d: "Envelope hash chains for every session" }]
            .map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ color: C.orange, fontWeight: 700, marginTop: 1 }}>→</span>
                <div><span style={{ color: C.text1, fontWeight: 600 }}>{f.t}</span><span style={{ color: C.text3 }}> — {f.d}</span></div>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={200} style={{ flex: 1, minWidth: 300, maxWidth: 420 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "10px 20px", background: "rgba(255,255,255,0.03)", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.orange }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
              <span style={{ fontSize: 11, color: C.text4, marginLeft: 8, fontFamily: C.mono }}>ai-governance.log</span>
            </div>
            <div style={{ padding: 20, fontFamily: C.mono, fontSize: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div><span style={{ color: C.text4 }}>agent</span> <span style={{ color: C.green }}>"Claude Code"</span></div>
              <div><span style={{ color: C.text4 }}>session</span> <span style={{ color: C.blue }}>sid_8f2a91</span></div>
              <div><span style={{ color: C.text4 }}>mode</span> <span style={{ color: C.blue }}>AI_AUTONOMOUS</span></div>
              <div><span style={{ color: C.text4 }}>risk</span> <span style={{ color: C.orange }}>67.2</span> <span style={{ color: C.text4 }}>→</span> <span style={{ color: C.orange }}>DEGRADED</span></div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 2 }} />
              <div><span style={{ color: C.red }}>⛔ ZONE VIOLATION</span></div>
              <div><span style={{ color: C.text4 }}>path</span> <span style={{ color: C.red }}>~/.ssh/id_rsa</span></div>
              <div><span style={{ color: C.text4 }}>zone</span> <span style={{ color: C.text2 }}>credentials (freeze)</span></div>
              <div><span style={{ color: C.text4 }}>action</span> <span style={{ color: C.red, fontWeight: 700 }}>AUTO-FROZEN</span></div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 2 }} />
              <div><span style={{ color: C.text4 }}>evidence</span> <span style={{ color: C.text3 }}>0xf7a2...3b1c</span></div>
              <div><span style={{ color: C.text4 }}>chain</span> <span style={{ color: C.green }}>✓ valid</span></div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CUSTOMER SUCCESS STORY (Quarkslab-inspired)
   ═══════════════════════════════════════════════════════════════════ */
function SuccessStory() {
  return (
    <section style={{ position: "relative", zIndex: 1, padding: "100px 40px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 44px", background: "linear-gradient(135deg, rgba(34,197,94,0.04), rgba(96,165,250,0.03))", border: `1px solid ${C.border}`, borderRadius: 20 }}>
        <Reveal>
          <div style={{ display: "flex", gap: 48, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.green, letterSpacing: "2px", textTransform: "uppercase" }}>CUSTOMER SUCCESS</span>
              <h3 style={{ fontFamily: C.serif, fontSize: 30, fontWeight: 400, marginTop: 12, marginBottom: 16, lineHeight: 1.25 }}>How a compliance team eliminated<br/>manual evidence gathering</h3>
              <p style={{ fontSize: 14, color: C.text3, lineHeight: 1.7, marginBottom: 20 }}>A mid-size financial services firm was spending 15+ hours per week manually assembling communication records for regulatory audits. After deploying QShield across their team, evidence gathering became automatic.</p>
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 24 }}>
                {[{ val: "93%", label: "time saved on audit prep" }, { val: "12K+", label: "evidence records/month" }, { val: "100%", label: "chain integrity score" }]
                .map((s, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: C.green, fontFamily: C.sans }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: C.text4, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 0, minWidth: 280, maxWidth: 320, padding: "28px 24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14 }}>
              <div style={{ fontSize: 14.5, color: C.text2, lineHeight: 1.7, fontStyle: "italic", marginBottom: 20 }}>"QShield gave us verifiable proof for every client interaction. Our compliance team finally has the evidence chain they always wanted — and it's fully automatic."</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: `linear-gradient(135deg, ${C.greenGlow}, rgba(34,197,94,0.2))`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: C.green }}>S</div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text1 }}>Sarah Chen</div>
                  <div style={{ fontSize: 12, color: C.text4 }}>Head of Compliance</div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TECH SPECS + COMPLIANCE
   ═══════════════════════════════════════════════════════════════════ */
function TechAndCompliance() {
  const specs = [
    { l: "Encryption", v: "AES-256-GCM" }, { l: "Hash Chain", v: "HMAC-SHA256" },
    { l: "Key Derivation", v: "PBKDF2 · 100K" }, { l: "Auth", v: "JWT + HMAC" },
    { l: "Transport", v: "TLS 1.3" }, { l: "Storage", v: "SQLite + Keychain" },
  ];
  return (
    <section style={{ position: "relative", zIndex: 1, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "36px 40px", display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap" }}>
        {specs.map((s, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: C.text4, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 13, color: C.text2, fontFamily: C.mono, fontWeight: 500 }}>{s.v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   RESOURCES SECTION (Quarkslab-inspired)
   ═══════════════════════════════════════════════════════════════════ */
function Resources() {
  const items = [
    { type: "DOCUMENTATION", title: "Getting Started Guide", desc: "Install QShield, configure adapters, and generate your first trust score in under 2 minutes.", cta: "Read the docs", color: C.green },
    { type: "API REFERENCE", title: "Gateway REST & WebSocket API", desc: "Full reference for the QShield gateway at api.qshield.app — authentication, endpoints, webhooks.", cta: "Explore API", color: C.blue },
    { type: "WHITEPAPER", title: "Hash Chains for Trust Verification", desc: "Technical deep-dive into HMAC-SHA256 evidence chains, threat models, and cryptographic proofs.", cta: "Download PDF", color: C.purple },
  ];
  return (
    <section style={{ position: "relative", zIndex: 1, padding: "100px 40px", maxWidth: 1140, margin: "0 auto", borderTop: `1px solid ${C.border}` }}>
      <Reveal>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.text4, letterSpacing: "2.5px", textTransform: "uppercase" }}>RESOURCES</span>
          <h2 style={{ fontFamily: C.serif, fontSize: 40, fontWeight: 400, marginTop: 12 }}>Learn, integrate, verify</h2>
        </div>
      </Reveal>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
        {items.map((r, i) => (
          <Reveal key={i} delay={i * 100}>
            <div className="qs-card" style={{ flex: 1, minWidth: 280, maxWidth: 350, padding: "32px 24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, transition: "all 0.35s", cursor: "pointer" }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: r.color, letterSpacing: "2px" }}>{r.type}</span>
              <div style={{ fontSize: 18, fontWeight: 600, color: C.text1, marginTop: 12, marginBottom: 8, lineHeight: 1.3 }}>{r.title}</div>
              <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.65, marginBottom: 20 }}>{r.desc}</div>
              <span style={{ fontSize: 13, color: r.color, fontWeight: 600 }}>{r.cta} →</span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PRICING
   ═══════════════════════════════════════════════════════════════════ */
function PricingCard({ name, price, period, features, highlight, cta }) {
  return (
    <div className="qs-card" style={{
      background: highlight ? "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))" : C.surface,
      border: `1px solid ${highlight ? "rgba(34,197,94,0.25)" : C.border}`, borderRadius: 18, padding: "36px 28px",
      flex: 1, minWidth: 230, maxWidth: 270, position: "relative", transition: "all 0.35s",
    }}>
      {highlight && <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: C.green, color: "#000", fontSize: 10, fontWeight: 700, padding: "4px 14px", borderRadius: 20, letterSpacing: "0.5px" }}>MOST POPULAR</div>}
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text4, marginBottom: 8, letterSpacing: "1.5px", textTransform: "uppercase" }}>{name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: 24 }}>
        <span style={{ fontSize: 42, fontWeight: 700, color: C.text1, letterSpacing: "-1px" }}>{price}</span>
        {period && <span style={{ fontSize: 14, color: C.text4 }}>/{period}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 28 }}>
        {features.map((f, i) => <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: C.text2, lineHeight: 1.4 }}><span style={{ color: C.green, flexShrink: 0, marginTop: 1 }}>✓</span>{f}</div>)}
      </div>
      <button className={highlight ? "qs-btn-primary" : "qs-btn-ghost"} style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: highlight ? "none" : `1px solid ${C.border}`, cursor: "pointer", fontSize: 13.5, fontWeight: 600, background: highlight ? C.green : "transparent", color: highlight ? "#000" : C.text2, fontFamily: C.sans }}>{cta}</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function QShieldLanding() {
  const [emailCount, setEmailCount] = useState(2847);
  useEffect(() => {
    injectStyles();
    const t = setInterval(() => setEmailCount(c => c + Math.floor(Math.random() * 3)), 4200);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ background: C.bg, color: C.text1, minHeight: "100vh", fontFamily: C.sans, overflowX: "hidden" }}>
      <Nav />

      {/* Grid background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)", backgroundSize: "64px 64px", animation: "breathe 10s ease-in-out infinite" }} />

      {/* ═══ HERO ═══ */}
      <section style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "100px 40px 60px" }}>
        <div style={{ position: "absolute", top: "8%", left: "50%", transform: "translateX(-50%)", width: 900, height: 900, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,197,94,0.05) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 1140, width: "100%", display: "flex", alignItems: "center", gap: 80, flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ flex: 1, minWidth: 360, maxWidth: 560 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 24, background: C.greenGlow, border: `1px solid rgba(34,197,94,0.15)`, fontSize: 12, color: C.green, fontWeight: 600, marginBottom: 28, animation: "pulse 3s ease infinite" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
              US Patent 12,452,047 B1
            </div>
            <h1 style={{ fontFamily: C.serif, fontSize: 60, fontWeight: 400, lineHeight: 1.08, letterSpacing: "-2px", marginBottom: 22 }}>
              Secure your business,<br/>safeguard <span style={{ color: C.green, fontStyle: "italic" }}>digital trust</span>
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.75, color: C.text3, marginBottom: 36, maxWidth: 480 }}>
              Your digital communications are both a business cornerstone and a trust liability. QShield produces cryptographic evidence chains that prove integrity across emails, meetings, files, and AI interactions.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 32 }}>
              <button className="qs-btn-primary" style={{ padding: "15px 36px", borderRadius: 10, border: "none", cursor: "pointer", background: C.green, color: "#000", fontSize: 15, fontWeight: 600, fontFamily: C.sans, boxShadow: "0 0 40px rgba(34,197,94,0.2)" }}>Download Free</button>
              <button className="qs-btn-ghost" style={{ padding: "15px 36px", borderRadius: 10, cursor: "pointer", background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, color: C.text2, fontSize: 15, fontWeight: 500, fontFamily: C.sans }}>Request Demo →</button>
            </div>
            <HeroBannerCarousel />
          </div>
          <div style={{ position: "relative" }}><ShieldOrb score={87} /></div>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF BAR ═══ */}
      <section style={{ position: "relative", zIndex: 1, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "24px 40px", display: "flex", justifyContent: "center", gap: 56, flexWrap: "wrap", fontSize: 13.5, color: C.text3 }}>
        {[
          { val: emailCount.toLocaleString(), label: "verified emails" },
          { val: "143K", label: "evidence records" },
          { val: "99.97%", label: "chain integrity" },
          { val: "7", label: "signal adapters" },
        ].map((s, i) => (
          <span key={i}><strong style={{ color: C.text2, fontWeight: 600 }}>{s.val}</strong> {s.label}</span>
        ))}
      </section>

      {/* ═══ SCROLLING LOGO BAR (Quarkslab) ═══ */}
      <TrustLogoBar />

      {/* ═══ SECURITY LIFECYCLE ═══ */}
      <SecurityLifecycle />

      {/* ═══ HOLISTIC PROTECTION (Tabbed) ═══ */}
      <HolisticProtection />

      {/* ═══ TECH SPECS BAR ═══ */}
      <TechAndCompliance />

      {/* ═══ FOUR PILLARS ═══ */}
      <FourPillars />

      {/* ═══ HOW IT WORKS ═══ */}
      <HowItWorks />

      {/* ═══ AI GOVERNANCE ═══ */}
      <AIGovernance />

      {/* ═══ SUCCESS STORY (Quarkslab) ═══ */}
      <SuccessStory />

      {/* ═══ PATENT ═══ */}
      <section style={{ position: "relative", zIndex: 1, padding: "60px 40px", borderTop: `1px solid ${C.border}` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", padding: "44px 36px", borderRadius: 18, background: "linear-gradient(135deg, rgba(34,197,94,0.04), rgba(34,197,94,0.01))", border: `1px solid rgba(34,197,94,0.12)` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.green, letterSpacing: "2.5px", marginBottom: 14, textTransform: "uppercase" }}>Patent Protected</div>
            <div style={{ fontFamily: C.serif, fontSize: 30, marginBottom: 10 }}>US Patent 12,452,047 B1</div>
            <div style={{ fontSize: 14.5, color: C.text3, lineHeight: 1.65 }}>"Quantum Secure Communication Protocol" — covering QShield's cryptographic trust verification and evidence chain methodology.</div>
          </div>
        </Reveal>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" style={{ position: "relative", zIndex: 1, padding: "100px 40px", maxWidth: 1140, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <h2 style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 400, marginBottom: 14 }}>Simple, transparent pricing</h2>
            <p style={{ fontSize: 15, color: C.text3, maxWidth: 440, margin: "0 auto" }}>Start free. Upgrade when you need more adapters, AI governance, or cloud verification.</p>
          </div>
        </Reveal>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { name: "Free", price: "$0", period: "", features: ["1 adapter", "Trust scoring", "7-day history", "Encrypted storage", "Shield overlay"], cta: "Download Free" },
            { name: "Pro", price: "$9", period: "mo", features: ["All 7 adapters", "Unlimited history", "Email signatures", "Trust certificates", "PDF export"], cta: "Start 14-Day Trial" },
            { name: "Business", price: "$29", period: "mo", highlight: true, features: ["Everything in Pro", "AI governance", "Protected zones", "Gateway cloud sync", "Verification pages", "Priority support"], cta: "Start 14-Day Trial" },
            { name: "Enterprise", price: "Custom", period: "", features: ["Everything in Business", "SSO / SAML", "Audit log export", "On-premise gateway", "Dedicated CSM", "99.9% SLA"], cta: "Contact Sales" },
          ].map((p, i) => <Reveal key={i} delay={i * 80}><PricingCard {...p} /></Reveal>)}
        </div>
      </section>

      {/* ═══ RESOURCES (Quarkslab) ═══ */}
      <Resources />

      {/* ═══ CTA ═══ */}
      <section style={{ position: "relative", zIndex: 1, padding: "120px 40px", textAlign: "center" }}>
        <Reveal>
          <h2 style={{ fontFamily: C.serif, fontSize: 48, fontWeight: 400, marginBottom: 18, lineHeight: 1.15 }}>Ready to augment your<br/><span style={{ fontStyle: "italic", color: C.green }}>trust operations</span>?</h2>
          <p style={{ fontSize: 15.5, color: C.text3, marginBottom: 40, maxWidth: 460, margin: "0 auto 40px" }}>Download QShield, enable your adapters, and get your first trust score in under 2 minutes. No account required.</p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="qs-btn-primary" style={{ padding: "16px 44px", borderRadius: 10, border: "none", cursor: "pointer", background: C.green, color: "#000", fontSize: 16, fontWeight: 600, fontFamily: C.sans, boxShadow: "0 0 50px rgba(34,197,94,0.25)" }}>Download for macOS</button>
            <button className="qs-btn-ghost" style={{ padding: "16px 44px", borderRadius: 10, cursor: "pointer", background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, color: C.text2, fontSize: 16, fontWeight: 500, fontFamily: C.sans }}>Download for Windows</button>
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 24, justifyContent: "center", fontSize: 12, color: C.text4 }}>
            <span>macOS & Windows</span><span>·</span><span>No account required</span><span>·</span><span>14-day free trial</span>
          </div>
        </Reveal>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ position: "relative", zIndex: 1, borderTop: `1px solid ${C.border}`, padding: "56px 40px 40px", maxWidth: 1140, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 40, marginBottom: 40 }}>
          <div style={{ maxWidth: 280 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg, #22c55e, #15803d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🛡️</div>
              <span style={{ fontWeight: 700, fontSize: 16 }}>QShield</span>
            </div>
            <div style={{ fontSize: 12.5, color: C.text4, lineHeight: 1.65 }}>Enterprise trust monitoring platform.<br/>Built by Homatch AI, Inc.<br/>Protected by US Patent 12,452,047 B1.</div>
          </div>
          {[
            { title: "Product", links: [{ t: "Download", h: "#" }, { t: "Pricing", h: "#pricing" }, { t: "Changelog", h: "#" }, { t: "API Reference", h: "https://api.qshield.app" }] },
            { title: "Legal", links: [{ t: "Privacy Policy", h: "#" }, { t: "Terms of Service", h: "#" }, { t: "License", h: "#" }, { t: "Security Policy", h: "#" }] },
            { title: "Company", links: [{ t: "About", h: "#" }, { t: "GitHub", h: "https://github.com/Homatch-AI/qshield" }, { t: "Contact", h: "#" }, { t: "Careers", h: "#" }] },
          ].map(col => (
            <div key={col.title}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, marginBottom: 16, letterSpacing: "1.5px", textTransform: "uppercase" }}>{col.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>{col.links.map(l => <a key={l.t} href={l.h} style={{ fontSize: 13, color: C.text4, textDecoration: "none", transition: "color 0.2s" }}>{l.t}</a>)}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.15)" }}>
          <span>© 2026 Homatch AI, Inc. All rights reserved.</span>
          <span>Built with cryptographic certainty.</span>
        </div>
      </footer>
    </div>
  );
}