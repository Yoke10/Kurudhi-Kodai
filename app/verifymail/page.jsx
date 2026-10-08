"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyMailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
      <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full border border-gray-100">
        <div className="text-emerald-600 text-5xl mb-4">✉️</div>
        <h1 className="text-2xl font-bold mb-2 text-gray-900">Verification Email Sent</h1>
        <p className="text-gray-600 mb-6">
          A verification link has been dispatched to{" "}
          <span className="font-semibold text-gray-900">{email || "your registered email"}</span>. Please check your inbox and verify before logging in.
        </p>
        <button
          onClick={() => router.push("/signin")}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
        >
          Sign In Now
        </button>
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
