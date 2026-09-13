"use client";

import React, { useState } from "react";
import { Card, Button, Badge } from "@/components/ui/Primitives";

export default function OnboardingPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 Form Data
  const [accountType, setAccountType] = useState<"individual" | "company">("company");
  const [capacity, setCapacity] = useState("10-50");

  // Step 2 Form Data
  const [profession, setProfession] = useState("Digital Marketer");
  const [purpose, setPurpose] = useState("Automated Email & Social Campaigns");

  // Step 3 Form Data
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");

  // Step 4 OTP Data
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email }),
      });
      const data = await res.json();
      if (res.ok) {
        setOtpSent(true);
        setStep(4);
      } else {
        setError(data.error || "Failed to send OTP");
      }
    } catch {
      setError("Network error sending OTP");
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, code: otpCode }),
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 1500);
      } else {
        setError(data.error || "Invalid OTP Code");
        setVerifying(false);
      }
    } catch {
      setError("Network error verifying OTP");
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <Card className="max-w-xl w-full p-6 space-y-6 bg-surface border border-hairline shadow-2xl relative">
        <div className="space-y-1 text-center border-b border-hairline pb-4">
          <Badge tone="brand">STEP {step} OF 4</Badge>
          <h1 className="text-xl font-bold tracking-tight text-ink">Account Onboarding & OTP Verification</h1>
          <p className="text-xs text-muted">
            {step === 1 && "Select account type and organization capacity."}
            {step === 2 && "Tell us your profession and marketing objective."}
            {step === 3 && "Enter your contact details and address."}
            {step === 4 && "Verify your 6-digit OTP code to complete registration."}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded bg-down/10 border border-down/20 text-xs text-down font-semibold text-center">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 rounded bg-up/10 border border-up/20 text-xs text-up font-semibold text-center">
            ✓ Account Verified Successfully! Redirecting to Dashboard...
          </div>
        )}

        {/* ---------------------------------------------------- Step 1 -- */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-2">Account Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAccountType("individual")}
                  className={`p-3 rounded border text-xs font-semibold ${
                    accountType === "individual" ? "border-brand bg-brand/10 text-brand" : "border-hairline bg-raised text-muted"
                  }`}
                >
                  👤 Individual Use
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType("company")}
                  className={`p-3 rounded border text-xs font-semibold ${
                    accountType === "company" ? "border-brand bg-brand/10 text-brand" : "border-hairline bg-raised text-muted"
                  }`}
                >
                  🏢 Company / Organization
                </button>
              </div>
            </div>

            {accountType === "company" && (
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Organization Employee Capacity</label>
                <select
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="w-full p-2.5 rounded border border-hairline bg-raised text-sm text-ink"
                >
                  <option value="1-10">1 - 10 Employees</option>
                  <option value="10-50">10 - 50 Employees</option>
                  <option value="50-100">50 - 100 Employees</option>
                  <option value="100-300">100 - 300 Employees</option>
                  <option value="500-1000">500 - 1,000 Employees</option>
                  <option value="1000+">1,000+ Enterprise</option>
                </select>
              </div>
            )}

            <Button block variant="primary" size="md" onClick={() => setStep(2)}>
              Next: Profession & Purpose →
            </Button>
          </div>
        )}

        {/* ---------------------------------------------------- Step 2 -- */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Your Profession / Role</label>
              <select
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                className="w-full p-2.5 rounded border border-hairline bg-raised text-sm text-ink"
              >
                <option value="Content Creator">Content Creator</option>
                <option value="Digital Marketer">Digital Marketer</option>
                <option value="Operations">Operations Manager</option>
                <option value="Developer / Engineering">Developer / Engineering</option>
                <option value="Founder / Executive">Founder / Executive</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Primary Marketing Purpose</label>
              <input
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full p-2.5 rounded border border-hairline bg-raised text-sm text-ink"
                placeholder="e.g. Automated Email & Social Campaigns"
              />
            </div>

            <div className="flex space-x-2">
              <Button variant="outline" size="md" onClick={() => setStep(1)}>Back</Button>
              <Button block variant="primary" size="md" onClick={() => setStep(3)}>Next: Contact Details →</Button>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- Step 3 -- */}
        {step === 3 && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Arjun Ramachandran"
                  className="w-full p-2 rounded border border-hairline bg-raised text-sm text-ink"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="arjun@adityatrading.com"
                  className="w-full p-2 rounded border border-hairline bg-raised text-sm text-ink"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full p-2 rounded border border-hairline bg-raised text-sm text-ink"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Location / City</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Mumbai, India"
                  className="w-full p-2 rounded border border-hairline bg-raised text-sm text-ink"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Full Postal Address</label>
              <textarea
                required
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Financial District, Mumbai, Maharashtra 400001"
                className="w-full p-2 rounded border border-hairline bg-raised text-sm text-ink"
              />
            </div>

            <div className="flex space-x-2">
              <Button variant="outline" size="md" onClick={() => setStep(2)}>Back</Button>
              <Button block variant="primary" size="md" type="submit">
                Request 6-Digit OTP →
              </Button>
            </div>
          </form>
        )}

        {/* ---------------------------------------------------- Step 4 OTP -- */}
        {step === 4 && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="text-center space-y-2">
              <p className="text-xs text-muted">
                Enter 6-digit OTP sent to <span className="font-mono text-ink font-bold">{email}</span>
              </p>
              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-48 mx-auto p-3 text-center text-xl tracking-widest font-mono rounded border border-hairline bg-raised text-ink focus:outline-none focus:border-brand"
              />
              <p className="text-2xs text-faint">Tip: Enter 123456 or recent OTP to verify instantly</p>
            </div>

            <Button block variant="primary" size="md" type="submit" disabled={verifying}>
              {verifying ? "Verifying OTP..." : "Verify OTP & Access Dashboard →"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
