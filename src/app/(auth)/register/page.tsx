import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Start free trial" };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
