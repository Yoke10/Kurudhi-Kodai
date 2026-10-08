"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

function VerifyMailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const router = useRouter();
  const { resendVerificationEmail } = useAuth();
  const [resendStatus, setResendStatus] = useState("");
  const [isResending, setIsResending] = useState(false);

  const handleResend = async () => {
    setIsResending(true);
    setResendStatus("");
    try {
      await resendVerificationEmail();
      setResendStatus("A fresh verification link has been sent to your inbox!");
    } catch (e) {
      setResendStatus("Sign in with your email & password first, then you can request a new link.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
      <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full border border-gray-100">
        <div className="text-emerald-600 text-5xl mb-4">✉️</div>
        <h1 className="text-2xl font-bold mb-2 text-gray-900">Verification Email Sent</h1>
        <p className="text-gray-600 mb-6">
          A verification link has been dispatched to{" "}
          <span className="font-semibold text-gray-900">{email || "your registered email"}</span>.
        </p>

        {resendStatus && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg mb-4">
            {resendStatus}
          </p>
        )}

        <div className="space-y-3">
          <button
            onClick={() => router.push("/signin")}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors shadow-sm"
          >
            Sign In Now
          </button>

          <button
            onClick={handleResend}
            disabled={isResending}
            className="w-full bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg border border-gray-200 text-xs transition-colors"
          >
            {isResending ? "Sending..." : "Resend Verification Email"}
          </button>
        </div>

        <p className="text-[11px] text-gray-400 mt-4">
          Note: You can sign in and use the platform immediately even before verifying.
        </p>
      </div>
    </div>
  );
}

export default function VerifyMail() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading verification details...</div>}>
      <VerifyMailContent />
    </Suspense>
  );
}
