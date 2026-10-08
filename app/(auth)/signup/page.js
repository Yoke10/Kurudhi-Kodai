'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function SignUp() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitStatus, setSubmitStatus] = useState({ type: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { signup, googleSignIn } = useAuth();

  const validateField = (name, value) => {
    switch (name) {
      case 'firstName':
      case 'lastName':
        if (!value.trim()) return 'This field is required';
        if (value.trim().length < 2) return 'Must be at least 2 characters';
        if (!/^[a-zA-Z\s]+$/.test(value)) return 'Can only contain letters';
        return '';
      case 'dob':
        if (!value) return 'Date of Birth is required';
        const dobDate = new Date(value);
        const today = new Date();
        let age = today.getFullYear() - dobDate.getFullYear();
        const m = today.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
          age--;
        }
        if (age < 18 || age > 65) return 'Age must be between 18 and 65 years';
        return '';
      case 'email':
        if (!value.trim()) return 'Email address is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
        return '';
      case 'password':
        if (!value) return 'Password is required';
        if (value.length < 6) return 'Password must be at least 6 characters';
        return '';
      default:
        return '';
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleBlur = (name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    const error = validateField(name, formData[name]);
    setErrors(prev => ({ ...prev, [name]: error }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitStatus({ type: '', message: '' });

    // Validate all fields
    const newErrors = {};
    Object.keys(formData).forEach(field => {
      const err = validateField(field, formData[field]);
      if (err) newErrors[field] = err;
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setTouched({ firstName: true, lastName: true, dob: true, email: true, password: true });
      return;
    }

    setSubmitting(true);
    try {
      await signup(
        formData.firstName.trim(),
        formData.lastName.trim(),
        formData.dob,
        formData.email.trim(),
        formData.password
      );

      setSubmitStatus({
        type: 'success',
        message: 'Account created! Verification email has been sent. Redirecting...'
      });

      setTimeout(() => {
        router.push(`/verifymail?email=${encodeURIComponent(formData.email.trim())}`);
      }, 1500);

    } catch (error) {
      const raw = error?.message || '';
      let friendly = 'Failed to create account. Please try again.';
      if (raw.includes('email-already-in-use')) {
        friendly = 'An account with this email already exists. Please sign in instead.';
      } else if (raw.includes('weak-password')) {
        friendly = 'The password is too weak. Please choose a stronger password.';
      }
      setSubmitStatus({ type: 'error', message: friendly });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setSubmitStatus({ type: '', message: '' });
    try {
      await googleSignIn();
      router.push("/");
    } catch (error) {
      setSubmitStatus({
        type: 'error',
        message: error.message || 'Google sign-in was cancelled or failed.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white py-12 flex items-center justify-center">
      <div className="container mx-auto px-4 max-w-xl">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center space-x-2">
            <img src="/kk.png" alt="Kurudhi Kodai Logo" className="h-20 w-auto" />
          </Link>
          <h1 className="text-3xl font-extrabold text-red-700 mt-2">
            Join Kurudhi Kodai
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Create an account to coordinate life-saving blood donations
          </p>
        </div>

        <Card className="border-2 border-red-100 shadow-xl bg-white rounded-2xl">
          <CardContent className="pt-8">
            {submitStatus.message && (
              <div className={`mb-6 p-4 rounded-lg text-sm border ${
                submitStatus.type === 'success' 
                  ? 'bg-green-50 border-green-200 text-green-800' 
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {submitStatus.message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-700 font-medium">First Name</Label>
                  <Input
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    onBlur={() => handleBlur('firstName')}
                    className={`mt-1 border-gray-300 focus:border-red-500 rounded-lg ${
                      touched.firstName && errors.firstName ? 'border-red-500' : ''
                    }`}
                    placeholder="Kavitha"
                    required
                  />
                  {touched.firstName && errors.firstName && (
                    <p className="text-xs text-red-600 mt-1">{errors.firstName}</p>
                  )}
                </div>

                <div>
                  <Label className="text-gray-700 font-medium">Last Name</Label>
                  <Input
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    onBlur={() => handleBlur('lastName')}
                    className={`mt-1 border-gray-300 focus:border-red-500 rounded-lg ${
                      touched.lastName && errors.lastName ? 'border-red-500' : ''
                    }`}
                    placeholder="Raman"
                    required
                  />
                  {touched.lastName && errors.lastName && (
                    <p className="text-xs text-red-600 mt-1">{errors.lastName}</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-gray-700 font-medium">Date of Birth</Label>
                <Input
                  type="date"
                  name="dob"
                  value={formData.dob}
                  onChange={handleChange}
                  onBlur={() => handleBlur('dob')}
                  className={`mt-1 border-gray-300 focus:border-red-500 rounded-lg ${
                    touched.dob && errors.dob ? 'border-red-500' : ''
                  }`}
                  required
                />
                {touched.dob && errors.dob && (
                  <p className="text-xs text-red-600 mt-1">{errors.dob}</p>
                )}
              </div>

              <div>
                <Label className="text-gray-700 font-medium">Email Address</Label>
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur('email')}
                  className={`mt-1 border-gray-300 focus:border-red-500 rounded-lg ${
                    touched.email && errors.email ? 'border-red-500' : ''
                  }`}
                  placeholder="donor@example.com"
                  required
                />
                {touched.email && errors.email && (
                  <p className="text-xs text-red-600 mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <Label className="text-gray-700 font-medium">Password</Label>
                <Input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={() => handleBlur('password')}
                  className={`mt-1 border-gray-300 focus:border-red-500 rounded-lg ${
                    touched.password && errors.password ? 'border-red-500' : ''
                  }`}
                  placeholder="Minimum 6 characters"
                  required
                />
                {touched.password && errors.password && (
                  <p className="text-xs text-red-600 mt-1">{errors.password}</p>
                )}
              </div>

              <Button 
                type="submit"
                disabled={submitting}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg shadow-md transition-colors mt-2"
              >
                {submitting ? 'Creating Account...' : 'Create Account'}
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
              Already have an account?{" "}
              <Link href="/signin" className="text-red-600 hover:text-red-700 font-semibold">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}