"use client";

import React, { useState } from "react";
import { Card, Button, Badge } from "@/components/ui/Primitives";

export default function SuperAdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (username.trim() === "ARJUN" && password.trim() === "ARJUN@PULSE") {
      // Set session cookie and redirect to Super Admin dashboard
      document.cookie = "pulse_super_admin_session=authenticated; path=/; max-age=86400";
      window.location.href = "/super-admin";
    } else {
      setError("Invalid username or password. Check your credentials.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 space-y-6 bg-surface border border-hairline shadow-2xl relative">
        <div className="space-y-2 text-center">
          <Badge tone="brand">PULSE PLATFORM OWNER</Badge>
          <h1 className="text-xl font-bold tracking-tight text-ink">Super Admin Login</h1>
          <p className="text-xs text-muted">
            Enter platform owner credentials to access the system-wide command center.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded bg-down/10 border border-down/20 text-xs text-down font-semibold text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ARJUN"
              className="w-full p-2.5 rounded border border-hairline bg-raised text-sm text-ink focus:outline-none focus:border-brand font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full p-2.5 rounded border border-hairline bg-raised text-sm text-ink focus:outline-none focus:border-brand font-mono"
            />
          </div>

          <Button block variant="primary" size="md" type="submit" disabled={loading}>
            {loading ? "Authenticating..." : "Log In to Super Admin →"}
          </Button>
        </form>

        <div className="border-t border-hairline pt-3 text-center text-2xs text-faint">
          Protected System • Authorized Personnel Only
        </div>
      </Card>
    </div>
  );
}
