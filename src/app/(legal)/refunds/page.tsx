import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "How cancellations and refunds work for TradeOS subscriptions.",
};

// Plain-language refund policy. Paddle (the reseller and merchant of record for
// TradeOS subscriptions) requires a published refund policy before a seller
// account is approved, and this page is what that requirement points at. Kept
// factually matched to what the product actually does: a free trial with no card,
// monthly subscriptions, cancel-anytime, access to the end of the paid period.
export default function RefundsPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Refund &amp; Cancellation Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: September 1, 2026</p>
      </header>

      <div className="rounded-lg border border-warning/40 bg-warning-muted p-4 text-sm">
        <p className="font-medium">Template notice</p>
        <p className="mt-1 text-muted-foreground">
          This page is a plain-language template prepared for the operator of TradeOS. It
          should be reviewed by a qualified lawyer before being relied on, and the
          operator&apos;s legal name and support address added at that point.
        </p>
      </div>

      <Section title="1. Try before you pay">
        <p>
          Every new account starts with a free trial that needs no card details. The trial
          gives you full access, so you can decide whether TradeOS is worth paying for
          before any money changes hands. When the trial ends, the account simply falls back
          to the free plan&apos;s limits — nothing is charged automatically.
        </p>
      </Section>

      <Section title="2. Cancelling">
        <p>
          Paid plans are monthly and you can cancel at any time from{" "}
          <strong>Settings → Billing → Manage subscription</strong>, which opens the secure
          billing page hosted by our payment provider. There is no cancellation fee and no
          notice period.
        </p>
        <p>
          When you cancel, you keep paid access until the end of the period you have already
          paid for. After that the account returns to the free plan. Your trades, journal
          entries and rulebooks stay exactly where they are — cancelling a subscription
          never deletes your data. (Deleting your account, from Settings → Data &amp;
          privacy, does.)
        </p>
      </Section>

      <Section title="3. Refunds">
        <p>
          If something has gone wrong, ask. We would rather fix it or refund it than keep
          money from somebody who is unhappy.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Within 14 days of a payment</strong> — if you have barely used the
            subscription in that period, tell us and we will refund it in full, no
            explanation needed.
          </li>
          <li>
            <strong>Charged by mistake</strong> — for example a renewal you meant to cancel,
            or a duplicate charge — we refund it in full, whenever you spot it.
          </li>
          <li>
            <strong>The service was broken</strong> — if TradeOS was unavailable or
            unusable for a meaningful part of a period you paid for, we refund that period
            in full or in part, whichever fairly matches what you lost.
          </li>
        </ul>
        <p>
          Outside those cases, payments for a period already used are generally not
          refunded, because you can cancel before the next one starts. Nothing here takes
          away rights the law gives you where you live, including any statutory
          cooling-off or cancellation rights.
        </p>
      </Section>

      <Section title="4. How to ask for one">
        <p>
          Contact the operator at the address published on this site, from the email address
          on the account, and say which payment you mean. We aim to answer within a few
          working days. Approved refunds go back to the original payment method through our
          payment provider, and usually reach you within 5–10 working days depending on your
          bank.
        </p>
        <p>
          Our payment provider, Paddle, acts as the reseller and merchant of record for
          TradeOS subscriptions and appears on your card or bank statement. You can also
          raise a billing question with them directly, and they will pass genuine refund
          decisions on to us.
        </p>
      </Section>

      <Section title="5. Chargebacks">
        <p>
          Please talk to us before asking your bank to reverse a charge — a chargeback costs
          us a fee and takes weeks, where a direct refund usually takes days. Accounts with
          an unresolved chargeback may be suspended until it is settled.
        </p>
      </Section>

      <Section title="6. Changes">
        <p>
          This policy may be updated as the product evolves; the date above changes when it
          does. The version in force when you paid is the one that applies to that payment.
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
