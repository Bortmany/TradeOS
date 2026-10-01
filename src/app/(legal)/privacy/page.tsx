import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What TradeOS stores, why, and the controls you have over it.",
};

// Plain-language privacy policy, factually matched to what the app actually
// collects (see prisma/schema.prisma and src/lib/). No invented company
// details — the owner adds those on professional review.
export default function PrivacyPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: October 1, 2026</p>
      </header>

      <div className="rounded-lg border border-warning/40 bg-warning-muted p-4 text-sm">
        <p className="font-medium">Template notice</p>
        <p className="mt-1 text-muted-foreground">
          This page is a plain-language template prepared for the operator of TradeOS. It
          should be reviewed by a qualified lawyer or privacy professional before being
          relied on, and the operator&apos;s legal name and contact details added at that
          point.
        </p>
      </div>

      <Section title="What we store">
        <p>TradeOS stores only what the product needs to work:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account details</strong> — your email address, a display name if you set
            one, and your timezone. Your password is never stored; only a one-way bcrypt
            hash of it is.
          </li>
          <li>
            <strong>Trading data you add or import</strong> — trades (symbol, side, prices,
            quantities, times, fees, profit/loss), your trading accounts, CSV import
            history, your rulebooks and rules, prop-firm tracker settings, and the
            compliance scores, discipline snapshots and alerts computed from them.
            If you use the Testing Portal: the price-data files you upload and the
            strategy tests you save (their settings and results).
          </li>
          <li>
            <strong>Journal content</strong> — the notes, emotion tags and labels you attach
            to trades, the &quot;Why I entered&quot; text you write for a trade, the written
            answers you save in a weekly review, and any notes you add to a saved
            strategy test.
          </li>
          <li>
            <strong>Pre-trade checklists</strong> — the checklist questions you write, and
            each run you save (the wording of the questions, which ones you ticked, and when
            you saved it), including which trade you linked it to.
          </li>
          <li>
            <strong>Trade screenshots</strong> — the PNG, JPEG or WebP pictures you add to a
            trade (up to 5 per trade, 5 MB each, 200 pictures and 500 MB per person). They
            are kept in private storage that has no public links; only you can open them,
            and each time the app checks it is you. Before a JPEG, PNG or WebP is
            saved, its hidden metadata (including any GPS location a phone adds) is removed
            without changing the picture. A screenshot can
            show things like account numbers or balances, so crop out anything you don&apos;t
            want stored.
          </li>
          <li>
            <strong>Broker connection (optional)</strong> — if you link a TopstepX account:
            your broker username and API key. The key is encrypted at rest with
            AES-256-GCM, is never shown again, never appears in logs or exports, and is
            used only for <em>read-only</em> requests that fetch your fills. TradeOS never
            places, changes, or cancels orders.
          </li>
          <li>
            <strong>Billing</strong> — if paid subscriptions are enabled, payments are
            processed by Paddle, which acts as the reseller and merchant of record. We
            store a Paddle customer reference, a subscription reference, and your plan
            status; your card details go to Paddle and never touch our servers.
          </li>
        </ul>
      </Section>

      <Section title="What we don't do">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>We don&apos;t sell your data or share it with advertisers.</li>
          <li>We don&apos;t run advertising or cross-site tracking scripts.</li>
          <li>
            We use two strictly-necessary httpOnly cookies and nothing else: a session
            cookie that keeps you signed in for up to 30 days (signing out removes it), and,
            when we aren&apos;t behind a proxy, a random anti-abuse cookie that lets us rate-limit
            sign-in attempts per browser. Neither is used for advertising or tracking.
          </li>
        </ul>
      </Section>

      <Section title="Who processes data for us">
        <p>
          Your data lives in our hosting provider&apos;s database. If paid billing is enabled,
          Paddle processes payments. Your trade screenshots are stored with our private
          file-storage provider (Cloudflare R2), which holds the files for us and never
          makes them public. If error tracking is enabled, crash reports
          (technical details about an error, with credentials automatically redacted) may
          be sent to Sentry so problems can be fixed. These providers process data only to
          provide their service to us.
        </p>
      </Section>

      <Section title="Your controls">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Export</strong> — download a copy of your profile, trading accounts,
            trades, rulebooks, prop-firm data, weekly reviews and saved strategy tests
            (plus the name and date range of each uploaded price-data file) as a JSON
            file (your &quot;Why I entered&quot; text is included; screenshot pictures are not) from
            Settings → Data &amp; privacy. (Derived records the app computes for
            you — alerts, rule evaluations, score history and import logs — are
            not included, and broker connections are never exported because
            they contain your encrypted API key.)
          </li>
          <li>
            <strong>Delete</strong> — permanently delete your account and all of its data
            from the same place, including your stored screenshots. Deletion is immediate
            and cannot be undone. You can also delete a single screenshot, or a whole
            trade with its screenshots, in the app at any time.
          </li>
          <li>
            <strong>Edit</strong> — trades, journal entries, rules and profile details can
            be edited or removed in the app at any time.
          </li>
          <li>
            <strong>Broker access</strong> — you can disconnect a broker connection at any
            time, which deletes the stored credentials. You can also revoke the API key on
            the broker&apos;s side.
          </li>
        </ul>
      </Section>

      <Section title="Security">
        <p>
          Passwords are hashed with bcrypt; broker API keys are encrypted at rest with
          AES-256-GCM; sessions use signed, httpOnly cookies; every request to your data
          is checked against your session; and server logs automatically redact anything
          that looks like a credential. No system is perfectly secure, but the design
          keeps your most sensitive data unreadable even in stored form.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this policy changes materially, the date above will be updated and the change
          made visible in the app. Questions or requests about your data can be sent to
          the operator&apos;s contact address published on this site once it is added during
          professional review.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
