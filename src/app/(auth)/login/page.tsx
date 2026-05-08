"use client";
import { useEffect, useState } from "react";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function redirectTarget() {
  const target = new URLSearchParams(window.location.search).get("redirect");
  if (target?.startsWith("/") && !target.startsWith("//")) return target;
  return "/dashboard";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery(window.location.search);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signIn.email({ email, password });
      window.location.href = redirectTarget();
    } catch {
      setError("Invalid email or password");
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
      <h1 className="text-2xl font-heading font-bold text-center">Welcome back</h1>
      <p className="text-gray-500 text-center mt-2 text-sm">Sign in to your account</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Input label="Email" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="Password" id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <p className="text-center text-sm text-gray-500 mt-6">
        Don&apos;t have an account? <a href={`/signup${query}`} className="text-brand-primary font-medium hover:underline">Sign up</a>
      </p>
    </div>
  );
}
