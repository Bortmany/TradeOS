import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you use TradeOS.",
};

// Plain-language terms, factually matched to what the product actually does.
// No invented company details — the owner adds those on professional review.
export default function TermsPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: July 18, 2026</p>
      </header>

      <div className="rounded-lg border border-warning/40 bg-warning-muted p-4 text-sm">
        <p className="font-medium">Template notice</p>
        <p className="mt-1 text-muted-foreground">
          This page is a plain-language template prepared for the operator of TradeOS. It
          should be reviewed by a qualified lawyer before being relied on, and company
          details (legal name, registered address, governing law) added at that point.
        </p>
      </div>

      <Section title="1. What TradeOS is — and is not">
        <p>
          TradeOS is an analytics and journaling tool for traders. It imports the trades
          you give it, grades them against rules you define yourself, and shows you
          statistics about your own trading.
        </p>
        <p>
          <strong>
            TradeOS is for educational analytics only. Nothing in the product is financial,
            investment, tax, or legal advice,
          </strong>{" "}
          and nothing in it is a recommendation to buy or sell any instrument. Trading
          futures and other leveraged products involves substantial risk of loss. Decisions
          you make while trading are yours alone.
        </p>
        <p>
          TradeOS is not a broker. It never places, modifies, or cancels orders. If you
          connect a broker account, the connection is read-only: it is used solely to fetch
          your past fills so they can be analyzed.
        </p>
      </Section>

      <Section title="2. Your account">
        <p>
          You need an account (email + password) to use the app. Keep your password to
          yourself and tell us if you believe your account has been compromised. You must
          be old enough to form a binding contract where you live.
        </p>
        <p>
          You are responsible for what you upload. Only import trade data you are allowed
          to use, and only connect broker credentials that belong to you.
        </p>
      </Section>

      <Section title="3. Plans, trials and billing">
        <p>
          New accounts start on a free trial with full access; after it ends the account
          falls back to the free plan's limits unless you subscribe. Paid subscriptions,
          when available, are billed through Stripe. You can cancel any time and keep
          access until the end of the period you paid for. Card details are handled by
          Stripe and never stored by TradeOS.
        </p>
      </Section>

      <Section title="4. Your data">
        <p>
          Your trades, journal entries, rulebooks and settings remain yours. You can export
          them as a file, or delete your account — which permanently removes all of your
          data — at any time from Settings. How data is handled is described in the{" "}
          <a href="/privacy" className="text-primary underline-offset-2 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>
          Don&apos;t attempt to break, overload, or probe the service, access other users&apos;
          data, resell the service, or use it for anything unlawful. We may suspend or
          close accounts that do.
        </p>
      </Section>

      <Section title="6. Service and liability">
        <p>
          The service is provided &quot;as is&quot;, without warranties of any kind. We work to keep
          it accurate and available but do not guarantee either — statistics are computed
          from the data you supply, and imports or broker feeds can contain errors. To the
          maximum extent the law allows, the operator of TradeOS is not liable for trading
          losses or for indirect or consequential damages arising from use of the service.
        </p>
      </Section>

      <Section title="7. Changes">
        <p>
          These terms may be updated as the product evolves; the date above will change
          when they do. If a change is significant we will make it visible in the app.
          Continuing to use TradeOS after a change means you accept the updated terms.
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
