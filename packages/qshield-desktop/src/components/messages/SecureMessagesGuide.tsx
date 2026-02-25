// ── Helper components ────────────────────────────────────────────────────────

function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wider mb-2">
          <span className="w-1.5 h-1.5 bg-sky-400 rounded-full" />
          {label}
        </div>
        <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Step({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="flex gap-4 bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-sky-500/20 transition-colors">
      <div className="flex-shrink-0 w-8 h-8 bg-sky-500/10 border border-sky-500/20 rounded-lg flex items-center justify-center text-sm font-semibold text-sky-400">
        {num}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <p className="text-sm text-slate-400 mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-slate-200">{q}</h3>
      <p className="text-sm text-slate-400">{a}</p>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function SecureMessagesGuide() {
  return (
    <div className="p-6 space-y-8 max-w-3xl mx-auto">
      {/* Hero */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-slate-100">Send messages nobody else can read</h1>
        <p className="text-base text-slate-400 leading-relaxed max-w-xl">
          QShield Secure Messages use end-to-end AES-256-GCM encryption. The decryption key never
          leaves your browser — not even QShield can read your messages.
        </p>
      </div>

      {/* Flow diagram */}
      <div className="flex flex-wrap items-center gap-2">
        {['Compose', 'Encrypt', 'Share Link', 'Read & Destroy'].map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <span className="rounded-full bg-sky-500/10 border border-sky-500/20 px-4 py-1.5 text-sm font-medium text-sky-400">
              {step}
            </span>
            {i < 3 && (
              <svg className="h-4 w-4 text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            )}
          </div>
        ))}
      </div>

      {/* URL structure */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">URL Structure</div>
        <code className="block text-sm font-mono text-slate-300">
          <span className="text-slate-500">https://</span>
          <span className="text-sky-400">api.qshield.app/m/</span>
          <span className="text-amber-400">a1b2c3d4e5f6</span>
          <span className="text-slate-500">#</span>
          <span className="text-emerald-400">base64url(AES-256-key)</span>
        </code>
        <div className="flex flex-wrap gap-4 text-xs text-slate-500 mt-1">
          <span><span className="text-amber-400">ID</span> — message identifier (sent to server)</span>
          <span><span className="text-emerald-400">Key</span> — decryption key (never sent to server)</span>
        </div>
      </div>

      {/* Sending steps */}
      <Section label="Sending" title="How to send a secure message">
        <Step num="1" title="Open Secure Messages" desc="Navigate to Secure Messages in the sidebar." />
        <Step num="2" title="Compose your message" desc="Enter a subject and your sensitive content. The content is encrypted locally before it ever leaves your device." />
        <Step num="3" title="Set security options" desc="Choose an expiration time (1 hour to 30 days), maximum views, and whether recipients must verify their email before reading." />
        <Step num="4" title="Create and share" desc="Click Encrypt & Create. Copy the generated link and send it to your recipient through a trusted channel (Signal, in-person, etc.)." />
        <Step num="5" title="Monitor access" desc="View the access log in the message detail page. See when the message was viewed and by whom." />
      </Section>

      {/* Receiving steps */}
      <Section label="Receiving" title="How to read a secure message">
        <Step num="1" title="Open the link" desc="Click or paste the share link in your browser. The page loads the encrypted message from the server." />
        <Step num="2" title="Verify your identity" desc="If the sender enabled verification, enter your email and the 6-digit code sent to you." />
        <Step num="3" title="Read the message" desc="The message is decrypted entirely in your browser using the key from the URL fragment. The server never sees the plaintext." />
        <Step num="4" title="Self-destruct" desc="After the maximum views are reached or the expiration time passes, the message is permanently destroyed." />
      </Section>

      {/* Security callout */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          Security Architecture
        </div>
        <ul className="space-y-2 text-sm text-slate-300">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
            <span><strong className="text-emerald-400">AES-256-GCM</strong> — military-grade authenticated encryption with integrity verification</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
            <span><strong className="text-emerald-400">Key in URL fragment</strong> — the # fragment is never sent to the server by browsers</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
            <span><strong className="text-emerald-400">Browser-side decryption</strong> — SubtleCrypto API decrypts directly in the recipient's browser</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
            <span><strong className="text-emerald-400">Access logging</strong> — every view is recorded with timestamp, IP, and user agent</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
            <span><strong className="text-emerald-400">Self-destruct</strong> — messages are permanently destroyed after max views or expiration</span>
          </li>
        </ul>
      </div>

      {/* Warning callout */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          Important Considerations
        </div>
        <ul className="space-y-2 text-sm text-slate-300">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
            <span><strong className="text-amber-400">The link IS the key</strong> — anyone with the full URL can decrypt and read the message</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
            <span><strong className="text-amber-400">Share via trusted channels</strong> — use Signal, encrypted email, or in-person delivery for the link</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
            <span><strong className="text-amber-400">Enable verification</strong> — require email verification for high-sensitivity messages</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
            <span><strong className="text-amber-400">Destruction is permanent</strong> — once destroyed, the encrypted data is deleted and cannot be recovered</span>
          </li>
        </ul>
      </div>

      {/* Use cases */}
      <Section label="Use Cases" title="When to use Secure Messages">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { title: 'Legal', desc: 'Attorney-client privileged communications, settlement terms, case details' },
            { title: 'Financial', desc: 'Account numbers, wire transfer instructions, tax documents' },
            { title: 'Credentials', desc: 'API keys, passwords, SSH keys, access tokens' },
            { title: 'Business Intel', desc: 'M&A discussions, pre-announcement details, board communications' },
            { title: 'Source Protection', desc: 'Whistleblower tips, journalist-source communications, anonymous reports' },
          ].map((uc) => (
            <div key={uc.title} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-200">{uc.title}</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{uc.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Tier comparison */}
      <Section label="Plans" title="Feature comparison">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="py-3 pr-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Feature</th>
                <th className="py-3 px-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Personal</th>
                <th className="py-3 px-4 text-center text-xs font-semibold text-purple-400 uppercase tracking-wider">Business</th>
                <th className="py-3 pl-4 text-center text-xs font-semibold text-amber-400 uppercase tracking-wider">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {[
                ['Messages / month', '50', '500', 'Unlimited'],
                ['Max message size', '10 KB', '100 KB', '1 MB'],
                ['Expiration options', '1h, 24h', '1h — 7d', '1h — 30d'],
                ['Email verification', 'No', 'Yes', 'Yes'],
                ['File attachments', 'No', 'Coming soon', 'Coming soon'],
                ['Threaded replies', 'No', 'No', 'Coming soon'],
              ].map(([feature, personal, business, enterprise]) => (
                <tr key={feature} className="text-slate-300">
                  <td className="py-2.5 pr-4 text-slate-400">{feature}</td>
                  <td className="py-2.5 px-4 text-center">{personal}</td>
                  <td className="py-2.5 px-4 text-center">{business}</td>
                  <td className="py-2.5 pl-4 text-center">{enterprise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* FAQ */}
      <Section label="FAQ" title="Frequently asked questions">
        <div className="space-y-4 bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <FAQ
            q="Can QShield read my messages?"
            a="No. The encryption key is stored in the URL fragment (#), which browsers never send to the server. Decryption happens entirely in the recipient's browser."
          />
          <div className="border-t border-slate-700" />
          <FAQ
            q="Does the recipient need QShield installed?"
            a="No. Recipients just need a modern browser. The decryption page is a standalone HTML page that uses the browser's built-in SubtleCrypto API."
          />
          <div className="border-t border-slate-700" />
          <FAQ
            q="What happens when a message expires?"
            a="The encrypted content is permanently deleted from storage. The message ID remains in your history as a record, but the content cannot be recovered."
          />
          <div className="border-t border-slate-700" />
          <FAQ
            q="Can I manually destroy a message before it expires?"
            a="Yes. Open the message detail page and click Destroy Message. This immediately deletes the encrypted content. The action cannot be undone."
          />
          <div className="border-t border-slate-700" />
          <FAQ
            q="Can the recipient take screenshots?"
            a="Yes. Like any content displayed on screen, the recipient can capture it. Secure Messages protect data in transit and at rest, not from a trusted recipient."
          />
          <div className="border-t border-slate-700" />
          <FAQ
            q="Is it safe to send the link via email?"
            a="The link works via email, but a more secure channel (Signal, in-person) is recommended. If you must use email, enable email verification so only the intended recipient can decrypt the message."
          />
        </div>
      </Section>
    </div>
  );
}
