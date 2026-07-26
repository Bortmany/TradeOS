import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/marketing/reveal";

export function FinalCta() {
  return (
    <section className="border-b border-border">
      <div className="container py-20 text-center">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Stop guessing why you&apos;re not consistent.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Import your last 30 days and see your discipline score in under five minutes.
          </p>
          <Button asChild size="lg" className="mt-7 gap-2">
            <Link href="/register">
              Start your free trial <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
