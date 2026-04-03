"use client";
import { useState } from "react";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { config } from "@/lib/config";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signUp.email({ name, email, password });
      window.location.href = "/dashboard";
    } catch {
      setError("Could not create account. Try a different email.");
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
      <h1 className="text-2xl font-heading font-bold text-center">Create your account</h1>
      <p className="text-gray-500 text-center mt-2 text-sm">Start using {config.product.name} for free</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Input label="Name" id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Email" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="Password" id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>
      <p className="text-center text-sm text-gray-500 mt-6">
        Already have an account? <a href="/login" className="text-brand-primary font-medium hover:underline">Sign in</a>
      </p>
    </div>
  );
}
