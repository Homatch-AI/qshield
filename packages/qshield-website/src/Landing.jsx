import { useState, useEffect, useRef } from "react";

const FONT_LINK = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap";

if (typeof document !== 'undefined' && !document.querySelector('[data-qshield-fonts]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_LINK;
  link.setAttribute('data-qshield-fonts', 'true');
  document.head.appendChild(link);
}

function ShieldOrb({ score = 87 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const size = 280;
    canvas.width = size * 2;
    canvas.height = size * 2;
    ctx.scale(2, 2);

    let t = 0;
    const draw = () => {
      t += 0.008;
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2, cy = size / 2;
      const breathe = 1 + Math.sin(t * 1.2) * 0.04;

      const glow = ctx.createRadialGradient(cx, cy, 40, cx, cy, 130 * breathe);
      glow.addColorStop(0, "rgba(34,197,94,0.15)");
      glow.addColorStop(0.5, "rgba(34,197,94,0.05)");
      glow.addColorStop(1, "rgba(34,197,94,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      ctx.beginPath();
      ctx.arc(cx, cy, 80 * breathe, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(34,197,94,${0.25 + Math.sin(t) * 0.1})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const orb = ctx.createRadialGradient(cx - 10, cy - 10, 5, cx, cy, 60 * breathe);
      orb.addColorStop(0, "rgba(74,222,128,0.3)");
      orb.addColorStop(0.6, "rgba(34,197,94,0.12)");
      orb.addColorStop(1, "rgba(20,83,45,0.05)");
      ctx.beginPath();
      ctx.arc(cx, cy, 58 * breathe, 0, Math.PI * 2);
      ctx.fillStyle = orb;
      ctx.fill();

      ctx.fillStyle = "#22c55e";
      ctx.font = "700 42px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(score, cx, cy - 6);

      ctx.fillStyle = "rgba(34,197,94,0.6)";
      ctx.font = "500 11px 'DM Sans', sans-serif";
      ctx.fillText("TRUST SCORE", cx, cy + 22);

      for (let i = 0; i < 6; i++) {
        const angle = t * 0.7 + (i * Math.PI * 2) / 6;
        const r = 90 * breathe + Math.sin(t * 2 + i) * 8;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + Math.sin(t + i) * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34,197,94,${0.4 + Math.sin(t + i) * 0.2})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [score]);

  return <canvas ref={canvasRef} style={{ width: 280, height: 280 }} />;
}

function HashChain() {
  const [blocks, setBlocks] = useState([]);

  useEffect(() => {
    const chain = [
      { id: "0x7a3f", event: "meeting-started", source: "zoom", time: "0s ago" },
      { id: "0x8b2e", event: "file-modified", source: "file", time: "12s ago" },
      { id: "0xc41d", event: "email-sent", source: "email", time: "34s ago" },
      { id: "0xd93a", event: "ai-scope-check", source: "ai", time: "51s ago" },
    ];
    chain.forEach((b, i) => {
      setTimeout(() => setBlocks(prev => [...prev, b]), i * 400);
    });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontFamily: "'JetBrains Mono', monospace" }}>
      {blocks.map((b, i) => (
        <div key={b.id} style={{
          display: "flex", alignItems: "center", gap: 12,
          animation: "fadeSlideIn 0.4s ease-out",
          padding: "10px 14px",
          background: "rgba(34,197,94,0.04)",
          borderLeft: "2px solid rgba(34,197,94,0.3)",
          borderRadius: "0 6px 6px 0",
          fontSize: 12,
        }}>
          <span style={{ color: "#22c55e", fontWeight: 600, minWidth: 52 }}>{b.id}</span>
          <span style={{ color: "rgba(255,255,255,0.5)", minWidth: 40 }}>{b.source}</span>
          <span style={{ color: "rgba(255,255,255,0.7)", flex: 1 }}>{b.event}</span>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>{b.time}</span>
          {i > 0 && <span style={{ color: "rgba(34,197,94,0.4)", fontSize: 10 }}>← {blocks[i-1]?.id}</span>}
        </div>
      ))}
    </div>
  );
}

function PricingCard({ name, price, period, features, highlight, cta }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: highlight ? "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))" : "rgba(255,255,255,0.02)",
        border: `1px solid ${highlight ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 16, padding: "36px 28px", flex: 1, minWidth: 220, maxWidth: 300,
        position: "relative", transition: "all 0.3s ease",
        transform: hovered ? "translateY(-4px)" : "none",
        boxShadow: hovered ? "0 20px 40px rgba(0,0,0,0.3)" : "none",
      }}
    >
      {highlight && (
        <div style={{
          position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
          background: "#22c55e", color: "#000", fontSize: 11, fontWeight: 600,
          padding: "4px 14px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif",
        }}>MOST POPULAR</div>
      )}
      <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 8, fontFamily: "'DM Sans', sans-serif", letterSpacing: "1px", textTransform: "uppercase" }}>{name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 24 }}>
        <span style={{ fontSize: 44, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{price}</span>
        {period && <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Sans', sans-serif" }}>/{period}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4 }}>
            <span style={{ color: "#22c55e", fontSize: 14, marginTop: 1, flexShrink: 0 }}>&#10003;</span>
            <span>{f}</span>
          </div>
        ))}
      </div>
      <button style={{
        width: "100%", padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
        background: highlight ? "#22c55e" : "rgba(255,255,255,0.06)",
        color: highlight ? "#000" : "rgba(255,255,255,0.8)",
      }}>{cta}</button>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={{
      padding: "28px 24px", background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14,
      flex: 1, minWidth: 260,
    }}>
      <div style={{ fontSize: 28, marginBottom: 14 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>{title}</div>
      <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>{desc}</div>
    </div>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 40px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(8,8,12,0.85)" : "transparent",
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: scrolled ? "1px solid rgba(255,255,255,0.05)" : "1px solid transparent",
      transition: "all 0.3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>&#128737;&#65039;</span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 18, color: "#fff" }}>QShield</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 32, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
        <a href="#features" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>Features</a>
        <a href="#how-it-works" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>How It Works</a>
        <a href="#pricing" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>Pricing</a>
        <a href="https://docs.qshield.app" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>Docs</a>
        <button style={{
          padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(34,197,94,0.4)",
          background: "rgba(34,197,94,0.08)", color: "#22c55e", fontSize: 13, fontWeight: 600, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
        }}>Download</button>
      </div>
    </nav>
  );
}

export default function QShieldLanding() {
  const [emailCount, setEmailCount] = useState(2847);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeSlideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      @keyframes gridPulse { 0%,100% { opacity:0.03; } 50% { opacity:0.06; } }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html { scroll-behavior: smooth; }
      a:hover { color: rgba(255,255,255,0.8) !important; }
    `;
    document.head.appendChild(style);
    const interval = setInterval(() => setEmailCount(c => c + Math.floor(Math.random() * 3)), 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ background: "#08080c", color: "#fff", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", overflowX: "hidden" }}>
      <Nav />

      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
        backgroundSize: "60px 60px", animation: "gridPulse 8s ease-in-out infinite",
      }} />

      {/* HERO */}
      <section style={{
        position: "relative", zIndex: 1, minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "120px 40px 80px",
      }}>
        <div style={{
          position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)",
          width: 800, height: 800, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ maxWidth: 1100, width: "100%", display: "flex", alignItems: "center", gap: 80, flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ flex: 1, minWidth: 340, maxWidth: 540 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 14px", borderRadius: 20,
              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)",
              fontSize: 12, color: "#22c55e", fontWeight: 500, marginBottom: 28,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "gridPulse 2s ease-in-out infinite" }} />
              US Patent 12,452,047 B1
            </div>
            <h1 style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 58, fontWeight: 400, lineHeight: 1.1,
              letterSpacing: "-1.5px", marginBottom: 20,
            }}>
              Trust is the new<br />
              <span style={{ color: "#22c55e", fontStyle: "italic" }}>currency</span>
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.7, color: "rgba(255,255,255,0.45)", marginBottom: 36, maxWidth: 440 }}>
              QShield monitors your digital workspace in real-time — producing
              cryptographic evidence chains that prove when, where, and how
              your communications happened.
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <button style={{
                padding: "14px 32px", borderRadius: 10, border: "none", cursor: "pointer",
                background: "#22c55e", color: "#000", fontSize: 15, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", boxShadow: "0 0 30px rgba(34,197,94,0.2)",
              }}>Download Free</button>
              <button style={{
                padding: "14px 32px", borderRadius: 10, cursor: "pointer",
                background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
              }}>See Demo &#8594;</button>
            </div>
            <div style={{ marginTop: 40, display: "flex", gap: 32, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
              <span>macOS &amp; Windows</span><span>&middot;</span><span>No account required</span><span>&middot;</span><span>Encrypted locally</span>
            </div>
          </div>
          <div style={{ position: "relative" }}><ShieldOrb score={87} /></div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section style={{
        position: "relative", zIndex: 1,
        borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)",
        padding: "28px 40px", display: "flex", justifyContent: "center", gap: 60, flexWrap: "wrap",
        fontSize: 13, color: "rgba(255,255,255,0.35)",
      }}>
        <span><strong style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{emailCount.toLocaleString()}</strong> verified emails sent</span>
        <span><strong style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>143K</strong> evidence records created</span>
        <span><strong style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>99.97%</strong> chain integrity</span>
        <span><strong style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>0</strong> breaches detected</span>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ position: "relative", zIndex: 1, padding: "100px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 40, fontWeight: 400, marginBottom: 14 }}>Everything you need to prove trust</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", maxWidth: 500, margin: "0 auto" }}>Seven signal adapters, tamper-evident evidence, and AI governance — all encrypted on your device.</p>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <FeatureCard icon="&#128279;" title="Evidence Chains" desc="Every event hashed into HMAC-SHA256 chains. Tamper one record and the entire chain breaks — instant detection." />
          <FeatureCard icon="&#129302;" title="AI Governance" desc="Monitor Claude Code, Copilot, and Cursor in real-time. Set protected zones that auto-freeze agents on violation." />
          <FeatureCard icon="&#128274;" title="AES-256 Encryption" desc="Evidence encrypted at rest with keys derived via PBKDF2. Stored in your OS keychain, never on our servers." />
          <FeatureCard icon="&#9993;&#65039;" title="Email Verification" desc="Embed trust scores in email signatures. Recipients click to verify — proof that travels with every message." />
          <FeatureCard icon="&#128202;" title="Trust Scoring" desc="Real-time weighted scoring across Zoom, Teams, Email, Files, API, Crypto, and AI adapters with anomaly detection." />
          <FeatureCard icon="&#128220;" title="Trust Certificates" desc="Generate PDF certificates attesting to your evidence chain integrity, counter-signed by the QShield gateway." />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ position: "relative", zIndex: 1, padding: "80px 40px 100px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 40, fontWeight: 400, marginBottom: 14 }}>Tamper-evident by design</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", maxWidth: 520, margin: "0 auto" }}>Every action creates a cryptographic evidence record linked to the previous one. Break one link and the whole chain fails verification.</p>
        </div>
        <div style={{ display: "flex", gap: 60, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ flex: 1, minWidth: 320, maxWidth: 480 }}><HashChain /></div>
          <div style={{ flex: 1, minWidth: 280, maxWidth: 400, display: "flex", flexDirection: "column", gap: 28 }}>
            {[
              { step: "01", title: "Monitor", desc: "QShield watches your enabled adapters — Zoom calls, email sends, file changes, AI agent actions." },
              { step: "02", title: "Hash", desc: "Each event is HMAC-SHA256 hashed with the previous record's hash, forming an unbreakable chain." },
              { step: "03", title: "Encrypt", desc: "Evidence payloads are AES-256-GCM encrypted and stored in your local SQLite database." },
              { step: "04", title: "Verify", desc: "Share verification links in emails. Anyone can verify your trust chain with one click." },
            ].map(s => (
              <div key={s.step} style={{ display: "flex", gap: 16 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 500, color: "#22c55e", opacity: 0.6, marginTop: 3 }}>{s.step}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI GOVERNANCE */}
      <section style={{ position: "relative", zIndex: 1, padding: "80px 40px", maxWidth: 1100, margin: "0 auto", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", gap: 60, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ flex: 1, minWidth: 300, maxWidth: 460 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 16,
              background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)",
              fontSize: 11, color: "#fb923c", fontWeight: 500, marginBottom: 20,
            }}>NEW IN v1.1</div>
            <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 36, fontWeight: 400, marginBottom: 14 }}>
              AI agents need<br /><span style={{ fontStyle: "italic", color: "#fb923c" }}>boundaries</span>
            </h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.7, marginBottom: 24 }}>
              QShield monitors AI coding agents in real-time. Define protected zones — files and directories that AI must never touch. If an agent crosses the line, QShield auto-freezes it and logs the violation as cryptographic evidence.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              {["Claude Code, Copilot, Cursor detection", "Protected zones with warn / block / freeze", "Risk velocity state machine", "Envelope hash chains for AI audit trails"].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.6)" }}>
                  <span style={{ color: "#fb923c" }}>&#8594;</span> {f}
                </div>
              ))}
            </div>
          </div>
          <div style={{
            flex: 1, minWidth: 300, maxWidth: 400,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 16, padding: 24, fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
          }}>
            <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>// AI Agent Session</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div><span style={{ color: "rgba(255,255,255,0.4)" }}>agent:</span> <span style={{ color: "#22c55e" }}>"Claude Code"</span></div>
              <div><span style={{ color: "rgba(255,255,255,0.4)" }}>mode:</span> <span style={{ color: "#60a5fa" }}>AI_AUTONOMOUS</span></div>
              <div><span style={{ color: "rgba(255,255,255,0.4)" }}>risk:</span> <span style={{ color: "#fb923c" }}>67.2</span> <span style={{ color: "rgba(255,255,255,0.3)" }}>&#8594; DEGRADED</span></div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, marginTop: 4 }}>
                <span style={{ color: "#ef4444" }}>&#9940; ZONE VIOLATION</span>
              </div>
              <div><span style={{ color: "rgba(255,255,255,0.4)" }}>path:</span> <span style={{ color: "#ef4444" }}>~/.ssh/id_rsa</span></div>
              <div><span style={{ color: "rgba(255,255,255,0.4)" }}>action:</span> <span style={{ color: "#ef4444", fontWeight: 600 }}>AUTO-FROZEN</span></div>
              <div style={{ marginTop: 4, color: "rgba(255,255,255,0.3)" }}>evidence: 0xf7a2...3b1c</div>
            </div>
          </div>
        </div>
      </section>

      {/* PATENT */}
      <section style={{
        position: "relative", zIndex: 1, padding: "60px 40px",
        borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div style={{
          maxWidth: 700, margin: "0 auto", textAlign: "center",
          padding: "40px 32px", borderRadius: 16,
          background: "linear-gradient(135deg, rgba(34,197,94,0.04), rgba(34,197,94,0.01))",
          border: "1px solid rgba(34,197,94,0.1)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#22c55e", letterSpacing: "2px", marginBottom: 12, textTransform: "uppercase" }}>Patent Protected</div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, marginBottom: 8, color: "#fff" }}>US Patent 12,452,047 B1</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            "Quantum Secure Communication Protocol" — covering QShield's cryptographic trust verification and evidence chain methodology.
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ position: "relative", zIndex: 1, padding: "100px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 40, fontWeight: 400, marginBottom: 14 }}>Simple, transparent pricing</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", maxWidth: 420, margin: "0 auto" }}>Start free. Upgrade when you need more adapters, AI governance, or cloud verification.</p>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
          <PricingCard name="Free" price="$0" period="" features={["1 adapter", "Trust scoring", "7-day evidence history", "Encrypted local storage", "Shield overlay"]} cta="Download Free" />
          <PricingCard name="Pro" price="$9" period="mo" features={["All 7 adapters", "Unlimited history", "Email signatures", "Trust certificates", "PDF export"]} cta="Start 14-Day Trial" />
          <PricingCard name="Business" price="$29" period="mo" highlight features={["Everything in Pro", "AI governance", "Protected zones", "Gateway cloud sync", "Public verification pages", "Priority support"]} cta="Start 14-Day Trial" />
          <PricingCard name="Enterprise" price="Custom" period="" features={["Everything in Business", "SSO / SAML", "Audit log export", "On-premise gateway", "Dedicated CSM", "99.9% SLA"]} cta="Contact Sales" />
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: "relative", zIndex: 1, padding: "100px 40px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 44, fontWeight: 400, marginBottom: 16 }}>
          Start proving trust <span style={{ fontStyle: "italic", color: "#22c55e" }}>today</span>
        </h2>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", marginBottom: 36, maxWidth: 400, margin: "0 auto 36px" }}>
          Download QShield, enable your adapters, and get your first trust score in under 2 minutes.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={{
            padding: "16px 40px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "#22c55e", color: "#000", fontSize: 16, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", boxShadow: "0 0 40px rgba(34,197,94,0.25)",
          }}>Download for macOS</button>
          <button style={{
            padding: "16px 40px", borderRadius: 10, cursor: "pointer",
            background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif",
          }}>Download for Windows</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        position: "relative", zIndex: 1, borderTop: "1px solid rgba(255,255,255,0.04)",
        padding: "48px 40px", maxWidth: 1100, margin: "0 auto",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 40,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>&#128737;&#65039;</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>QShield</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.6, maxWidth: 260 }}>
            Enterprise trust monitoring platform by Homatch AI, Inc.<br />Protected by US Patent 12,452,047 B1.
          </div>
        </div>
        {[
          { title: "Product", links: ["Download", "Pricing", "Documentation", "Changelog"] },
          { title: "Legal", links: ["Privacy Policy", "Terms of Service", "License", "Security"] },
          { title: "Company", links: ["About", "Blog", "GitHub", "Contact"] },
        ].map(col => (
          <div key={col.title}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 14, letterSpacing: "1px", textTransform: "uppercase" }}>{col.title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {col.links.map(l => (<a key={l} href="#" style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>{l}</a>))}
            </div>
          </div>
        ))}
        <div style={{
          width: "100%", borderTop: "1px solid rgba(255,255,255,0.04)",
          paddingTop: 24, marginTop: 8, display: "flex", justifyContent: "space-between",
          fontSize: 12, color: "rgba(255,255,255,0.2)",
        }}>
          <span>&copy; 2026 Homatch AI, Inc. All rights reserved.</span>
          <span>Built with cryptographic certainty.</span>
        </div>
      </footer>
    </div>
  );
}
