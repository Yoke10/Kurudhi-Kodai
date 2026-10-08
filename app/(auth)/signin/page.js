'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function SignIn() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { signin, googleSignIn } = useAuth();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError("");
  };

  const getFriendlyErrorMessage = (rawError) => {
    const msg = rawError?.message || rawError?.code || '';
    if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
      return 'Invalid email or password. Please check your credentials.';
    }
    if (msg.includes('too-many-requests')) {
      return 'Too many failed login attempts. Please wait a few minutes before trying again.';
    }
    if (msg.includes('network-request-failed')) {
      return 'Network connection issue. Please check your internet connection.';
    }
    return msg || 'Unable to sign in. Please try again.';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signin(formData.email.trim(), formData.password);
      router.push("/");
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setSubmitting(true);
    try {
      await googleSignIn();
      router.push("/");
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white py-12 flex items-center justify-center">
      <div className="container mx-auto px-4 max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center space-x-2">
            <img src="/kk.png" alt="Kurudhi Kodai Logo" className="h-20 w-auto" />
          </Link>
          <h1 className="text-3xl font-extrabold text-red-700 mt-2">
            Kurudhi Kodai
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Real-time blood donation coordination platform
          </p>
        </div>

        <Card className="border-2 border-red-100 shadow-xl bg-white rounded-2xl">
          <CardContent className="pt-8">
            <h2 className="text-xl font-bold text-center text-gray-800 mb-2">
              Sign In
            </h2>
            <p className="text-center text-gray-500 text-sm mb-6">
              Access your donor or requester portal
            </p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label className="text-gray-700 font-medium">Email Address</Label>
                <Input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="mt-1 border-gray-300 focus:border-red-500 focus:ring-red-500 rounded-lg"
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <Label className="text-gray-700 font-medium">Password</Label>
                </div>
                <Input
                  type="password"
                  id="password"
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="mt-1 border-gray-300 focus:border-red-500 focus:ring-red-500 rounded-lg"
                  placeholder="••••••••"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold shadow-md transition-colors"
              >
                {submitting ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>

            <div className="flex items-center my-6">
              <div className="flex-grow border-t border-gray-200"></div>
              <span className="mx-4 text-gray-400 text-xs uppercase font-medium">or continue with</span>
              <div className="flex-grow border-t border-gray-200"></div>
            </div>

            <Button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              variant="outline"
              className="w-full flex items-center justify-center border-gray-300 hover:bg-gray-50 text-gray-700 py-3 rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.2 0 5.9 1.4 7.7 2.7l5.7-5.7C33.4 3.5 29.1 1 24 1 14.8 1 6.9 6.3 2.8 14.3l6.6 5.1C10.9 13.3 16.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.1 24.6c0-1.5-.1-2.6-.3-3.8H24v7.2h12.5c-.5 3-2.2 6.1-5.2 8l6.7 5.2c3.9-3.6 6.1-8.9 6.1-16.6z" />
                <path fill="#FBBC05" d="M10.9 28.1c-.6-1.7-1-3.5-1-5.3s.4-3.6 1-5.3L4.3 12.4C2.4 15.4 1.7 18.8 1.7 22.1c0 3.3.7 6.7 2.6 9.7l6.6-5.2z" />
                <path fill="#34A853" d="M24 47c6.5 0 11.9-2.1 15.8-5.7l-6.7-5.2c-3.1 2.1-7.1 3.4-9.1 3.4-6.9 0-12.7-4.7-14.8-11l-6.6 5.2C6.9 41.7 14.8 47 24 47z" />
                <path fill="none" d="M1 1h46v46H1z" />
              </svg>
              Google
            </Button>

            <div className="mt-6 text-center text-sm text-gray-600">
              New to Kurudhi Kodai?{" "}
              <Link href="/signup" className="text-red-600 hover:text-red-700 font-semibold">
                Register here
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}