import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GatewayDatabase, StoredVerification } from '../services/database.js';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function trustColor(level: string): string {
  switch (level) {
    case 'verified': return '#06d6a0';
    case 'normal': return '#22d3ee';
    case 'elevated': return '#fbbf24';
    case 'warning': return '#f97316';
    case 'critical': return '#ef4444';
    default: return '#94a3b8';
  }
}

function renderPage(title: string, ogTitle: string, ogDescription: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(ogTitle)}">
<meta property="og:description" content="${escapeHtml(ogDescription)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{max-width:520px;width:100%;background:#1e293b;border-radius:16px;padding:40px;text-align:center;box-shadow:0 25px 50px rgba(0,0,0,.4)}
  .shield{width:80px;height:80px;margin:0 auto 24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:40px}
  .shield.ok{background:linear-gradient(135deg,#06d6a0,#22d3ee);animation:pulse 3s infinite}
  .shield.warn{background:linear-gradient(135deg,#f97316,#ef4444)}
  .shield.miss{background:#334155}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(6,214,160,.3)}50%{box-shadow:0 0 0 16px rgba(6,214,160,0)}}
  h1{font-size:1.5rem;margin-bottom:8px}
  .subtitle{color:#94a3b8;font-size:.9rem;margin-bottom:24px}
  .detail{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #334155;font-size:.9rem}
  .detail:last-child{border:none}
  .label{color:#94a3b8}
  .score{font-size:2rem;font-weight:700;margin:16px 0}
  .level{display:inline-block;padding:4px 12px;border-radius:999px;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
  .cta{display:inline-block;margin-top:24px;padding:12px 28px;background:linear-gradient(135deg,#06d6a0,#22d3ee);color:#0f172a;font-weight:600;border-radius:8px;text-decoration:none;font-size:.9rem;transition:transform .2s}
  .cta:hover{transform:translateY(-2px)}
  .footer{margin-top:24px;font-size:.75rem;color:#475569}
</style>
</head>
<body>
<div class="card">
${body}
<div class="footer">QShield Trust Verification</div>
</div>
</body>
</html>`;
}

function renderVerified(v: StoredVerification): string {
  const color = trustColor(v.trust_level);
  const referralParam = v.referral_id ? `?ref=${v.referral_id}` : '';
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'DigitalDocument',
    name: `QShield Trust Verification`,
    description: `Email verified with trust score ${v.trust_score}/100`,
    dateCreated: v.created_at,
    creator: { '@type': 'Person', name: v.sender_name },
  });

  const body = `
<script type="application/ld+json">${jsonLd}</script>
<div class="shield ok">&#x1f6e1;</div>
<h1>This email was verified by QShield</h1>
<div class="subtitle">The sender's identity and communication trust was verified at the time of sending.</div>
<div class="score" style="color:${color}">${v.trust_score}<span style="font-size:1rem;color:#94a3b8">/100</span></div>
<div><span class="level" style="background:${color};color:#0f172a">${escapeHtml(v.trust_level)}</span></div>
<div style="margin-top:24px">
  <div class="detail"><span class="label">Sender</span><span>${escapeHtml(v.sender_name)}</span></div>
  <div class="detail"><span class="label">Sent</span><span>${formatDate(v.created_at)}</span></div>
  <div class="detail"><span class="label">Evidence chain</span><span>${v.evidence_count} records</span></div>
  <div class="detail"><span class="label">Verification ID</span><span style="font-family:monospace;font-size:.8rem">${escapeHtml(v.id)}</span></div>
</div>
<a class="cta" href="https://www.qshield.app/download${referralParam}">Protect your emails too &rarr; Get QShield</a>`;

  return renderPage(
    `Verified by QShield — ${v.sender_name}`,
    `Verified by QShield — Trust Score: ${v.trust_score}`,
    `${v.sender_name}'s email was verified with a trust score of ${v.trust_score}/100 (${v.trust_level})`,
    body,
  );
}

function renderNotFound(): string {
  return renderPage(
    'Verification Not Found — QShield',
    'Verification Not Found',
    'This QShield verification ID was not found.',
    `
<div class="shield miss">&#x2753;</div>
<h1>Verification not found</h1>
<div class="subtitle">This verification ID was not found in our records. It may have expired or may be invalid.</div>
<a class="cta" href="https://www.qshield.app">Learn about QShield</a>`,
  );
}

function renderTampered(): string {
  return renderPage(
    'WARNING: Integrity Check Failed — QShield',
    'WARNING: Evidence chain integrity check failed',
    'The trust data for this email may have been tampered with.',
    `
<div class="shield warn">&#x26a0;</div>
<h1>Evidence chain integrity check failed</h1>
<div class="subtitle">The trust data for this email may have been tampered with. Exercise caution.</div>
<a class="cta" href="https://www.qshield.app">Learn about QShield</a>`,
  );
}

export async function verifyPublicRoutes(app: FastifyInstance, db: GatewayDatabase): Promise<void> {
  // GET /v/:verificationId — public verification page
  app.get('/v/:verificationId', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Params: { verificationId: string } }>, reply: FastifyReply) => {
    const { verificationId } = request.params;
    const record = db.getVerification(verificationId);

    if (!record) {
      return reply.type('text/html').send(renderNotFound());
    }

    // Increment click counter
    db.incrementClickCount(verificationId);

    return reply.type('text/html').send(renderVerified(record));
  });
}
