import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { signupMode, SIGNUP_CLOSED_ERROR } from "@/lib/signup-mode";

export const metadata: Metadata = { title: "Start free trial" };

// The sign-up mode comes from environment variables that can change between
// deploys, so read it per request rather than baking it in at build time.
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  const mode = signupMode();

  if (mode === "closed") {
    return (
      <div>
        <div className="card-highlight rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{SIGNUP_CLOSED_ERROR}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We are not taking new accounts at the moment. Please check back later.
          </p>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return <AuthForm mode="register" inviteRequired={mode === "invite"} />;
}
