'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ROLES } from '@/lib/roles';
import { Shield, Heart, CheckCircle2 } from 'lucide-react';

const tamilNaduCities = [
  "Ambur", "Arakkonam", "Ariyalur", "Aruppukkottai", "Attur", "Chengalpattu", "Chennai",
  "Coimbatore", "Cuddalore", "Cumbum", "Dharmapuri", "Dindigul", "Erode", "Gudiyatham",
  "Hosur", "Kanchipuram", "Karaikudi", "Karur", "Kanyakumari", "Kovilpatti", "Krishnagiri",
  "Kumbakonam", "Madurai", "Mayiladuthurai", "Mettupalayam", "Nagapattinam", "Namakkal",
  "Nagercoil", "Neyveli", "Ooty", "Palani", "Paramakudi", "Perambalur", "Pollachi",
  "Pudukottai", "Rajapalayam", "Ramanathapuram", "Ranipet", "Salem", "Sivagangai",
  "Sivakasi", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tirupattur", "Tiruchendur",
  "Tiruchirappalli", "Tirunelveli", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur",
  "Tuticorin", "Udumalaipettai", "Valparai", "Vandavasi", "Vellore", "Viluppuram", "Virudhunagar"
];

const Stepper = ({ steps, currentStep }) => (
  <div className="flex justify-between mb-8 relative">
    <div className="absolute top-4 left-0 w-full h-1 bg-gray-100">
      <div 
        className="absolute h-full bg-red-600 transition-all duration-300"
        style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
      />
    </div>
    {steps.map((step, index) => (
      <div key={index} className="flex flex-col items-center relative z-10">
        <div className={`
          rounded-full h-10 w-10 flex items-center justify-center shadow-md font-semibold text-sm
          ${index <= currentStep 
            ? "bg-red-600 text-white ring-4 ring-red-100" 
            : "bg-white border-2 border-gray-200 text-gray-500"}
        `}>
          {index + 1}
        </div>
        <div className="text-xs mt-2 font-medium text-gray-700 text-center">{step}</div>
      </div>
    ))}
  </div>
);

export default function BecomeDonor() {
  const router = useRouter();
  const { user, isDonor, refreshUserProfile, loading } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState({ type: '', message: '' });

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'male',
    bloodGroup: '',
    email: '',
    mobile: '',
    whatsapp: '',
    country: 'India',
    state: 'Tamil Nadu',
    permanentCity: 'Chennai',
    residentCity: 'Chennai',
    area: '',
    sameAsPermenant: true,
    acceptTerms: false,
    dateOfBirth: '',
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/signin');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.email) {
      setFormData(prev => ({
        ...prev,
        email: user.email,
        name: user.displayName || prev.name,
      }));
    }
  }, [user]);

  // If already a donor, redirect to dashboard
  useEffect(() => {
    if (!loading && isDonor) {
      router.push('/dashboard');
    }
  }, [isDonor, loading, router]);

  const steps = ['Personal Details', 'Contact Info', 'City & Area', 'Confirmation'];

  const validateStep = (step) => {
    const errs = {};
    if (step === 0) {
      if (!formData.name.trim()) errs.name = 'Full name is required';
      if (!formData.bloodGroup) errs.bloodGroup = 'Blood group is required';
      if (!formData.dateOfBirth) {
        errs.dateOfBirth = 'Date of birth is required';
      } else {
        const dobDate = new Date(formData.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dobDate.getFullYear();
        const m = today.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
        if (age < 18 || age > 65) {
          errs.dateOfBirth = 'Donors must be between 18 and 65 years of age';
        }
      }
    } else if (step === 1) {
      if (!formData.mobile || !/^[6-9]\d{9}$/.test(formData.mobile.trim())) {
        errs.mobile = 'Valid 10-digit mobile number required';
      }
    } else if (step === 2) {
      if (!formData.permanentCity) errs.permanentCity = 'Permanent city is required';
      if (!formData.residentCity) errs.residentCity = 'Resident city is required';
    } else if (step === 3) {
      if (!formData.acceptTerms) errs.acceptTerms = 'You must accept the terms to register';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleAddressCheckbox = (checked) => {
    setFormData(prev => ({
      ...prev,
      sameAsPermenant: checked,
      residentCity: checked ? prev.permanentCity : '',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep(currentStep) || submitting || !user) return;

    try {
      setSubmitting(true);
      setSubmitStatus({ type: 'info', message: 'Saving your donor profile...' });

      const birthDate = new Date(formData.dateOfBirth);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) calculatedAge--;

      const donorRecord = {
        uid: user.uid,
        name: formData.name.trim(),
        email: user.email,
        mobile: formData.mobile.trim(),
        whatsapp: (formData.whatsapp || '').trim(),
        bloodGroup: formData.bloodGroup,
        gender: formData.gender,
        dateOfBirth: formData.dateOfBirth,
        age: calculatedAge,
        country: formData.country,
        state: formData.state,
        permanentCity: formData.permanentCity,
        residentCity: formData.residentCity || formData.permanentCity,
        area: (formData.area || '').trim(),
        availabilityStatus: 'AVAILABLE',
        availableForEmergency: true,
        lastDonationAt: null,
        reliabilityStats: {
          requestsReceived: 0,
          requestsAccepted: 0,
          requestsRejected: 0,
          successfulDonations: 0,
          cancelledDonations: 0,
        },
        registeredAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        // Backward-compatible legacy PascalCase keys
        Name: formData.name.trim(),
        Email: user.email,
        MobileNumber: formData.mobile.trim(),
        WhatsappNumber: (formData.whatsapp || '').trim(),
        BloodGroup: formData.bloodGroup,
        Gender: formData.gender,
        DateOfBirth: formData.dateOfBirth,
        Age: calculatedAge,
        Country: formData.country,
        State: formData.state,
        PermanentCity: formData.permanentCity,
        ResidentCity: formData.residentCity || formData.permanentCity,
      };

      // 1. Save directly under canonical donors/{uid}
      await setDoc(doc(db, 'donors', user.uid), donorRecord);

      // 2. Elevate user role to canonical uppercase DONOR in users/{uid}
      await updateDoc(doc(db, 'users', user.uid), {
        role: ROLES.DONOR,
        updatedAt: serverTimestamp(),
      });

      // 3. Hydrate state
      await refreshUserProfile();

      setSubmitStatus({
        type: 'success',
        message: 'Thank you for registering as a blood donor! Redirecting to your dashboard...',
      });

      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);

    } catch (error) {
      console.error('Error registering donor:', error);
      setSubmitStatus({
        type: 'error',
        message: 'Unable to save registration. Please try again.',
      });
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-red-800">
            Become a Blood Donor
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Register your willingness to be contacted when a patient nearby needs blood
          </p>
        </div>

        {submitStatus.message && (
          <Alert className={`mb-6 ${
            submitStatus.type === 'success' ? 'bg-green-50 border-green-200' :
            submitStatus.type === 'error' ? 'bg-red-50 border-red-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            <AlertDescription className={
              submitStatus.type === 'success' ? 'text-green-800' :
              submitStatus.type === 'error' ? 'text-red-800' :
              'text-blue-800'
            }>
              {submitStatus.message}
            </AlertDescription>
          </Alert>
        )}

        <Card className="border border-red-100 shadow-xl bg-white rounded-2xl overflow-hidden">
          <CardContent className="p-6 sm:p-8">
            <Stepper steps={steps} currentStep={currentStep} />

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Step 0: Personal Details */}
              {currentStep === 0 && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Full Name *</Label>
                    <Input
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="e.g. Ramesh Kumar"
                      className="mt-1 border-gray-300 rounded-lg"
                      required
                    />
                    {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-800 font-semibold text-xs uppercase">Blood Group *</Label>
                      <Select
                        value={formData.bloodGroup}
                        onValueChange={(val) => handleSelectChange('bloodGroup', val)}
                      >
                        <SelectTrigger className="mt-1 border-gray-300 rounded-lg">
                          <SelectValue placeholder="Select Blood Group" />
                        </SelectTrigger>
                        <SelectContent>
                          {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(type => (
                            <SelectItem key={type} value={type} className="font-bold">{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.bloodGroup && <p className="text-xs text-red-600 mt-1">{errors.bloodGroup}</p>}
                    </div>

                    <div>
                      <Label className="text-gray-800 font-semibold text-xs uppercase">Gender</Label>
                      <Select
                        value={formData.gender}
                        onValueChange={(val) => handleSelectChange('gender', val)}
                      >
                        <SelectTrigger className="mt-1 border-gray-300 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Date of Birth (Must be 18–65) *</Label>
                    <Input
                      type="date"
                      name="dateOfBirth"
                      value={formData.dateOfBirth}
                      onChange={handleChange}
                      className="mt-1 border-gray-300 rounded-lg"
                      required
                    />
                    {errors.dateOfBirth && <p className="text-xs text-red-600 mt-1">{errors.dateOfBirth}</p>}
                  </div>
                </div>
              )}

              {/* Step 1: Contact Info */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Email Address</Label>
                    <Input
                      name="email"
                      type="email"
                      value={formData.email}
                      disabled
                      className="mt-1 bg-gray-50 border-gray-300 rounded-lg text-gray-600"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Mobile Number *</Label>
                    <Input
                      name="mobile"
                      type="tel"
                      value={formData.mobile}
                      onChange={handleChange}
                      placeholder="10-digit mobile number"
                      className="mt-1 border-gray-300 rounded-lg font-mono"
                      required
                    />
                    {errors.mobile && <p className="text-xs text-red-600 mt-1">{errors.mobile}</p>}
                  </div>

                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">WhatsApp Number (Optional)</Label>
                    <Input
                      name="whatsapp"
                      type="tel"
                      value={formData.whatsapp}
                      onChange={handleChange}
                      placeholder="Same as mobile or different"
                      className="mt-1 border-gray-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Step 2: City & Area */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-800 font-semibold text-xs uppercase">Permanent City *</Label>
                      <Select
                        value={formData.permanentCity}
                        onValueChange={(val) => handleSelectChange('permanentCity', val)}
                      >
                        <SelectTrigger className="mt-1 border-gray-300 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {tamilNaduCities.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-gray-800 font-semibold text-xs uppercase">Resident City *</Label>
                      <Select
                        disabled={formData.sameAsPermenant}
                        value={formData.sameAsPermenant ? formData.permanentCity : formData.residentCity}
                        onValueChange={(val) => handleSelectChange('residentCity', val)}
                      >
                        <SelectTrigger className="mt-1 border-gray-300 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {tamilNaduCities.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                      id="sameAsPermenant"
                      checked={formData.sameAsPermenant}
                      onCheckedChange={handleAddressCheckbox}
                      className="border-red-300 data-[state=checked]:bg-red-600"
                    />
                    <Label htmlFor="sameAsPermenant" className="text-xs text-gray-700">
                      Resident city is same as permanent city
                    </Label>
                  </div>

                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Locality / Area Name</Label>
                    <Input
                      name="area"
                      value={formData.area}
                      onChange={handleChange}
                      placeholder="e.g. Adyar, Tambaram, T. Nagar"
                      className="mt-1 border-gray-300 rounded-lg"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Helps match you first to patients in your immediate neighborhood.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 3: Confirmation */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="bg-red-50 p-5 rounded-xl border border-red-100 text-xs sm:text-sm space-y-2">
                    <h3 className="font-bold text-red-900 border-b border-red-200 pb-2">
                      Review Donor Registration
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span className="text-gray-600">Name:</span>
                      <span className="font-semibold text-gray-900">{formData.name}</span>
                      <span className="text-gray-600">Blood Group:</span>
                      <span className="font-bold text-red-700">{formData.bloodGroup}</span>
                      <span className="text-gray-600">Mobile:</span>
                      <span className="font-semibold text-gray-900">{formData.mobile}</span>
                      <span className="text-gray-600">City / Area:</span>
                      <span className="font-semibold text-gray-900">
                        {formData.residentCity || formData.permanentCity} {formData.area ? `(${formData.area})` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2 pt-2">
                    <Checkbox
                      id="acceptTerms"
                      checked={formData.acceptTerms}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, acceptTerms: checked }))}
                      className="border-red-300 data-[state=checked]:bg-red-600 mt-0.5"
                    />
                    <Label htmlFor="acceptTerms" className="text-xs text-gray-700 leading-relaxed">
                      I self-declare that I am eligible to donate blood, and I accept the platform terms. I understand that final eligibility to donate is strictly determined by qualified healthcare personnel.
                    </Label>
                  </div>
                  {errors.acceptTerms && <p className="text-xs text-red-600">{errors.acceptTerms}</p>}
                </div>
              )}

              {/* Step Controls */}
              <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
                {currentStep > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePrevious}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </Button>
                )}
                {currentStep < steps.length - 1 ? (
                  <Button
                    type="button"
                    onClick={handleNext}
                    className="ml-auto bg-red-600 hover:bg-red-700 text-white font-semibold px-6 rounded-lg"
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="ml-auto bg-red-600 hover:bg-red-700 text-white font-bold px-8 rounded-lg shadow-md"
                  >
                    {submitting ? 'Registering...' : 'Complete Registration'}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
