'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { addDoc, collection, serverTimestamp, Timestamp, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { detectDuplicateRequest } from '@/lib/duplicateDetection';
import { logAuditEvent, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { ROLES } from '@/lib/roles';
import { rankMatchingDonors } from '@/lib/matchingEngine';
import { sendBatchedNotifications, NOTIFICATION_TYPES } from '@/lib/notifications';
import { AlertTriangle, Clock, Zap, CheckCircle, Shield, Info } from 'lucide-react';

const indianStates = ["Tamil Nadu"];

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
          transition-colors duration-300
          ${index <= currentStep 
            ? "bg-red-600 text-white ring-4 ring-red-100" 
            : "bg-white text-gray-500 border-2 border-gray-200"}
        `}>
          {index + 1}
        </div>
        <div className="text-xs mt-2 font-medium text-gray-700 text-center">{step}</div>
      </div>
    ))}
  </div>
);

export default function RequestDonor() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Mode: standard or emergency (< 1 min)
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    patientName: '',
    age: '',
    gender: 'male',
    reasonForBlood: '',
    bloodGroup: '',
    anyBloodGroupAccepted: false,
    unitsNeeded: '1',
    hospital: '',
    attenderName: '',
    attenderMobile: '',
    country: 'india',
    state: 'Tamil Nadu',
    city: 'Chennai',
    area: '',
    requiredByHours: '24', // Expire in hours
    urgencyLevel: 'NORMAL',
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [submitStatus, setSubmitStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/signin');
    }
  }, [user, loading, router]);

  const steps = ['Patient Details', 'Medical Info', 'Contact Details', 'Review & Confirm'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  // Run non-blocking duplicate detection when city, hospital, or blood group changes
  const checkDuplicate = async () => {
    if (formData.city && formData.hospital && formData.bloodGroup) {
      const res = await detectDuplicateRequest({
        city: formData.city,
        hospital: formData.hospital,
        bloodGroup: formData.bloodGroup,
        patientName: formData.patientName,
      });
      if (res.hasDuplicate) {
        setDuplicateWarning(res.message);
      } else {
        setDuplicateWarning(null);
      }
    }
  };

  const validateStep = (step) => {
    const newErrors = {};
    if (step === 0) {
      if (!formData.patientName.trim()) newErrors.patientName = 'Patient name is required';
      if (!formData.age || Number(formData.age) <= 0) newErrors.age = 'Valid age is required';
    } else if (step === 1) {
      if (!formData.bloodGroup && !formData.anyBloodGroupAccepted) {
        newErrors.bloodGroup = 'Blood group is required';
      }
      if (!formData.unitsNeeded || Number(formData.unitsNeeded) < 1) {
        newErrors.unitsNeeded = 'At least 1 unit is required';
      }
      if (!formData.hospital.trim()) {
        newErrors.hospital = 'Hospital name is required';
      }
      if (!formData.reasonForBlood.trim()) {
        newErrors.reasonForBlood = 'Reason for blood requirement is required';
      }
    } else if (step === 2) {
      if (!formData.attenderName.trim()) newErrors.attenderName = 'Attender name is required';
      if (!formData.attenderMobile.trim() || !/^[6-9]\d{9}$/.test(formData.attenderMobile.trim())) {
        newErrors.attenderMobile = 'Valid 10-digit mobile number required';
      }
      if (!formData.city) newErrors.city = 'City is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep === 1) {
        checkDuplicate();
      }
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
  };

  const submitBloodRequest = async () => {
    if (!user) return;
    setIsSubmitting(true);
    setSubmitStatus({ type: '', message: '' });

    try {
      const hours = parseInt(formData.requiredByHours || '24', 10);
      const expiresAtMillis = Date.now() + hours * 60 * 60 * 1000;
      const expiresAtTimestamp = Timestamp.fromMillis(expiresAtMillis);

      const units = parseInt(formData.unitsNeeded || '1', 10);

      const requestPayload = {
        // Standardized camelCase fields
        createdByUid: user.uid,
        createdByEmail: user.email,
        patientName: formData.patientName.trim(),
        patientAge: parseInt(formData.age || '0', 10),
        gender: formData.gender,
        bloodGroup: formData.anyBloodGroupAccepted ? 'Any' : formData.bloodGroup,
        anyBloodGroupAccepted: Boolean(formData.anyBloodGroupAccepted),
        unitsNeeded: units,
        unitsDonated: 0,
        unitsPending: units,
        hospital: formData.hospital.trim(),
        hospitalName: formData.hospital.trim(),
        hospitalVerificationStatus: 'UNVERIFIED',
        state: formData.state,
        city: formData.city,
        area: (formData.area || '').trim(),
        country: formData.country,
        reason: formData.reasonForBlood.trim(),
        attenderName: formData.attenderName.trim(),
        attenderMobile: formData.attenderMobile.trim(),
        urgencyLevel: isEmergencyMode ? 'CRITICAL' : (formData.urgencyLevel || 'NORMAL'),
        isEmergency: Boolean(isEmergencyMode),
        status: 'ACTIVE',
        requiredBy: expiresAtTimestamp,
        expiresAt: expiresAtTimestamp,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        // Legacy PascalCase mirror fields for 100% backward compatibility with existing views
        uuid: user.uid,
        PatientName: formData.patientName.trim(),
        PatientAge: parseInt(formData.age || '0', 10),
        Gender: formData.gender,
        BloodGroup: formData.anyBloodGroupAccepted ? 'Any' : formData.bloodGroup,
        AnyBloodGroupAccepted: Boolean(formData.anyBloodGroupAccepted),
        UnitsNeeded: units,
        UnitsDonated: 0,
        Hospital: formData.hospital.trim(),
        State: formData.state,
        City: formData.city,
        Country: formData.country,
        Reason: formData.reasonForBlood.trim(),
        AttenderName: formData.attenderName.trim(),
        AttenderMobile: formData.attenderMobile.trim(),
        Verified: 'accepted', // legacy 'accepted' indicates active on existing dashboards
        EmergencyLevel: isEmergencyMode ? 'high' : 'medium',
      };

      const docRef = await addDoc(collection(db, 'requests'), requestPayload);

      // Audit Log
      await logAuditEvent({
        action: AUDIT_ACTIONS.REQUEST_CREATED,
        actorUid: user.uid,
        actorRole: ROLES.USER,
        entityType: 'request',
        entityId: docRef.id,
        metadata: {
          bloodGroup: requestPayload.bloodGroup,
          unitsNeeded: units,
          city: requestPayload.city,
          isEmergency: isEmergencyMode,
        },
      });

      // Dispatch batched notifications to top matching local donors (Max 10)
      try {
        const donorsQuery = query(
          collection(db, 'donors'),
          where('city', '==', requestPayload.city),
          limit(25)
        );
        const donorSnaps = await getDocs(donorsQuery);
        const candidateDonors = donorSnaps.docs.map(d => ({ id: d.id, ...d.data() }));

        const ranked = rankMatchingDonors(candidateDonors, requestPayload);
        const topMatchedUids = ranked
          .slice(0, 10)
          .map(r => r.donor.id || r.donor.uid)
          .filter(Boolean);

        if (topMatchedUids.length > 0) {
          await sendBatchedNotifications(topMatchedUids, {
            type: NOTIFICATION_TYPES.NEW_BLOOD_REQUEST,
            title: isEmergencyMode ? '🚨 EMERGENCY: Urgent Blood Match Needed!' : 'New Blood Request Matched',
            message: `${units} unit(s) of ${requestPayload.bloodGroup} needed at ${requestPayload.hospital}, ${requestPayload.city}.`,
            requestId: docRef.id,
          }, 10);
        }
      } catch (notifyErr) {
        console.warn('Batched donor notification notice:', notifyErr);
      }

      setSubmitStatus({
        type: 'success',
        message: 'Blood request activated! Matching local donors have been notified in controlled batch.',
      });

      setTimeout(() => {
        router.push('/myrequests');
      }, 1500);

    } catch (error) {
      console.error('Error submitting request:', error);
      setSubmitStatus({
        type: 'error',
        message: 'Unable to submit blood request. Please check your connection and try again.',
      });
      setIsSubmitting(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        {/* Top Header & Emergency Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-red-800">
              {isEmergencyMode ? 'Emergency Blood Request' : 'Create Blood Request'}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Connect directly with verified eligible human blood donors in your area
            </p>
          </div>

          <Button
            type="button"
            onClick={() => {
              setIsEmergencyMode(!isEmergencyMode);
              setCurrentStep(0);
            }}
            variant={isEmergencyMode ? "outline" : "default"}
            className={isEmergencyMode 
              ? "border-red-600 text-red-700 hover:bg-red-50 font-bold" 
              : "bg-red-700 hover:bg-red-800 text-white font-bold shadow-md animate-pulse"}
          >
            <Zap className="w-4 h-4 mr-2" />
            {isEmergencyMode ? 'Switch to Standard Mode' : 'Fast Emergency Flow (<1 Min)'}
          </Button>
        </div>

        {submitStatus.message && (
          <div className={`mb-6 p-4 rounded-xl text-sm border font-medium ${
            submitStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {submitStatus.message}
          </div>
        )}

        {duplicateWarning && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-sm flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Duplicate Warning</p>
              <p className="mt-0.5 leading-relaxed">{duplicateWarning}</p>
            </div>
          </div>
        )}

        <Card className="border border-red-100 shadow-xl bg-white rounded-2xl overflow-hidden">
          <CardContent className="p-6 sm:p-8">
            {/* FAST EMERGENCY FLOW */}
            {isEmergencyMode ? (
              <form onSubmit={(e) => { e.preventDefault(); submitBloodRequest(); }} className="space-y-5">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-red-600" />
                  <strong>Fast Track Mode:</strong> Minimal fields required to notify matching donors immediately.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Blood Group Required *</Label>
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
                  </div>

                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Units Needed *</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.unitsNeeded}
                      onChange={handleChange}
                      name="unitsNeeded"
                      className="mt-1 border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Hospital Name & Campus *</Label>
                    <Input
                      name="hospital"
                      value={formData.hospital}
                      onChange={handleChange}
                      placeholder="e.g. Apollo Hospital, Greams Road"
                      className="mt-1 border-gray-300 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">City *</Label>
                    <Select
                      value={formData.city}
                      onValueChange={(val) => handleSelectChange('city', val)}
                    >
                      <SelectTrigger className="mt-1 border-gray-300 rounded-lg">
                        <SelectValue placeholder="Select City" />
                      </SelectTrigger>
                      <SelectContent>
                        {tamilNaduCities.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Locality / Area</Label>
                    <Input
                      name="area"
                      value={formData.area}
                      onChange={handleChange}
                      placeholder="e.g. T. Nagar, Anna Nagar"
                      className="mt-1 border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Patient Name *</Label>
                    <Input
                      name="patientName"
                      value={formData.patientName}
                      onChange={handleChange}
                      placeholder="Patient's Full Name"
                      className="mt-1 border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Attender Contact Number *</Label>
                    <Input
                      type="tel"
                      name="attenderMobile"
                      value={formData.attenderMobile}
                      onChange={handleChange}
                      placeholder="10-digit mobile number"
                      className="mt-1 border-gray-300 rounded-lg font-mono"
                      required
                    />
                  </div>

                  <div>
                    <Label className="text-gray-800 font-semibold text-xs uppercase">Needed Within</Label>
                    <Select
                      value={formData.requiredByHours}
                      onValueChange={(val) => handleSelectChange('requiredByHours', val)}
                    >
                      <SelectTrigger className="mt-1 border-gray-300 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">Urgent: Within 6 Hours</SelectItem>
                        <SelectItem value="12">Within 12 Hours</SelectItem>
                        <SelectItem value="24">Within 24 Hours</SelectItem>
                        <SelectItem value="48">Within 48 Hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-gray-800 font-semibold text-xs uppercase">Emergency Reason</Label>
                  <Input
                    name="reasonForBlood"
                    value={formData.reasonForBlood}
                    onChange={handleChange}
                    placeholder="e.g. Emergency surgery, trauma, post-partum"
                    className="mt-1 border-gray-300 rounded-lg"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-lg shadow-lg text-base transition-colors"
                >
                  {isSubmitting ? 'Activating Emergency Request...' : 'Publish Emergency Request'}
                </Button>
              </form>
            ) : (
              /* STANDARD 4-STEP WIZARD */
              <>
                <Stepper steps={steps} currentStep={currentStep} />

                {/* Step 0: Patient Details */}
                {currentStep === 0 && (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-gray-800 font-semibold text-xs uppercase">Patient Full Name *</Label>
                      <Input
                        name="patientName"
                        value={formData.patientName}
                        onChange={handleChange}
                        onBlur={() => handleBlur('patientName')}
                        placeholder="Enter patient full name"
                        className={`mt-1 border-gray-300 rounded-lg ${errors.patientName ? 'border-red-500' : ''}`}
                      />
                      {errors.patientName && <p className="text-xs text-red-600 mt-1">{errors.patientName}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-gray-800 font-semibold text-xs uppercase">Patient Age *</Label>
                        <Input
                          type="number"
                          name="age"
                          min="0"
                          max="120"
                          value={formData.age}
                          onChange={handleChange}
                          onBlur={() => handleBlur('age')}
                          placeholder="e.g. 35"
                          className={`mt-1 border-gray-300 rounded-lg ${errors.age ? 'border-red-500' : ''}`}
                        />
                        {errors.age && <p className="text-xs text-red-600 mt-1">{errors.age}</p>}
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
                  </div>
                )}

                {/* Step 1: Medical Info */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-gray-800 font-semibold text-xs uppercase">Blood Group Required *</Label>
                        <Select
                          disabled={formData.anyBloodGroupAccepted}
                          value={formData.bloodGroup}
                          onValueChange={(val) => handleSelectChange('bloodGroup', val)}
                        >
                          <SelectTrigger className="mt-1 border-gray-300 rounded-lg">
                            <SelectValue placeholder="Select Group" />
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
                        <Label className="text-gray-800 font-semibold text-xs uppercase">Units Needed *</Label>
                        <Input
                          type="number"
                          min="1"
                          max="10"
                          name="unitsNeeded"
                          value={formData.unitsNeeded}
                          onChange={handleChange}
                          className="mt-1 border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <Checkbox
                        id="anyBloodGroupAccepted"
                        checked={formData.anyBloodGroupAccepted}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, anyBloodGroupAccepted: checked }))}
                        className="border-red-300 data-[state=checked]:bg-red-600"
                      />
                      <Label htmlFor="anyBloodGroupAccepted" className="text-xs text-gray-700 font-medium">
                        Any blood group accepted (e.g. for whole blood plasma/exchange)
                      </Label>
                    </div>

                    <div>
                      <Label className="text-gray-800 font-semibold text-xs uppercase">Hospital Name & Branch *</Label>
                      <Input
                        name="hospital"
                        value={formData.hospital}
                        onChange={handleChange}
                        onBlur={() => handleBlur('hospital')}
                        placeholder="e.g. Rajiv Gandhi Government General Hospital"
                        className={`mt-1 border-gray-300 rounded-lg ${errors.hospital ? 'border-red-500' : ''}`}
                      />
                      {errors.hospital && <p className="text-xs text-red-600 mt-1">{errors.hospital}</p>}
                    </div>

                    <div>
                      <Label className="text-gray-800 font-semibold text-xs uppercase">Medical Requirement Details *</Label>
                      <Textarea
                        name="reasonForBlood"
                        value={formData.reasonForBlood}
                        onChange={handleChange}
                        onBlur={() => handleBlur('reasonForBlood')}
                        placeholder="Please describe the medical requirement..."
                        className={`mt-1 border-gray-300 rounded-lg ${errors.reasonForBlood ? 'border-red-500' : ''}`}
                        rows={3}
                      />
                      {errors.reasonForBlood && <p className="text-xs text-red-600 mt-1">{errors.reasonForBlood}</p>}
                    </div>
                  </div>
                )}

                {/* Step 2: Contact Details */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-gray-800 font-semibold text-xs uppercase">Attender Full Name *</Label>
                        <Input
                          name="attenderName"
                          value={formData.attenderName}
                          onChange={handleChange}
                          onBlur={() => handleBlur('attenderName')}
                          placeholder="Contact person name"
                          className={`mt-1 border-gray-300 rounded-lg ${errors.attenderName ? 'border-red-500' : ''}`}
                        />
                        {errors.attenderName && <p className="text-xs text-red-600 mt-1">{errors.attenderName}</p>}
                      </div>

                      <div>
                        <Label className="text-gray-800 font-semibold text-xs uppercase">Attender Mobile Number *</Label>
                        <Input
                          type="tel"
                          name="attenderMobile"
                          value={formData.attenderMobile}
                          onChange={handleChange}
                          onBlur={() => handleBlur('attenderMobile')}
                          placeholder="10-digit mobile number"
                          className={`mt-1 border-gray-300 rounded-lg font-mono ${errors.attenderMobile ? 'border-red-500' : ''}`}
                        />
                        {errors.attenderMobile && <p className="text-xs text-red-600 mt-1">{errors.attenderMobile}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-gray-800 font-semibold text-xs uppercase">City *</Label>
                        <Select
                          value={formData.city}
                          onValueChange={(val) => handleSelectChange('city', val)}
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
                        <Label className="text-gray-800 font-semibold text-xs uppercase">Locality / Area</Label>
                        <Input
                          name="area"
                          value={formData.area}
                          onChange={handleChange}
                          placeholder="e.g. Guindy, Vadapalani"
                          className="mt-1 border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-gray-800 font-semibold text-xs uppercase">Required Within</Label>
                      <Select
                        value={formData.requiredByHours}
                        onValueChange={(val) => handleSelectChange('requiredByHours', val)}
                      >
                        <SelectTrigger className="mt-1 border-gray-300 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6">Within 6 Hours (Urgent)</SelectItem>
                          <SelectItem value="12">Within 12 Hours</SelectItem>
                          <SelectItem value="24">Within 24 Hours</SelectItem>
                          <SelectItem value="48">Within 48 Hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Step 3: Review & Confirm */}
                {currentStep === 3 && (
                  <div className="space-y-4 bg-gray-50 p-5 rounded-xl border border-gray-200 text-sm">
                    <h3 className="font-bold text-gray-800 text-base border-b pb-2">
                      Please Review Request Information
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                      <span className="text-gray-500">Patient Name:</span>
                      <span className="font-semibold text-gray-800">{formData.patientName}</span>

                      <span className="text-gray-500">Blood Group:</span>
                      <span className="font-bold text-red-700">
                        {formData.anyBloodGroupAccepted ? 'Any Group' : formData.bloodGroup}
                      </span>

                      <span className="text-gray-500">Units Needed:</span>
                      <span className="font-semibold text-gray-800">{formData.unitsNeeded} unit(s)</span>

                      <span className="text-gray-500">Hospital:</span>
                      <span className="font-semibold text-gray-800">{formData.hospital}</span>

                      <span className="text-gray-500">City / Area:</span>
                      <span className="font-semibold text-gray-800">
                        {formData.city} {formData.area ? `(${formData.area})` : ''}
                      </span>

                      <span className="text-gray-500">Attender Contact:</span>
                      <span className="font-semibold text-gray-800">{formData.attenderName} ({formData.attenderMobile})</span>
                    </div>

                    <div className="border-t pt-3 text-xs text-gray-500 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-green-600" />
                      <span>This request will be activated immediately and matched against verified local donors.</span>
                    </div>
                  </div>
                )}

                {/* Step Navigation Controls */}
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
                      type="button"
                      onClick={submitBloodRequest}
                      disabled={isSubmitting}
                      className="ml-auto bg-red-600 hover:bg-red-700 text-white font-bold px-8 rounded-lg shadow-md"
                    >
                      {isSubmitting ? 'Submitting Request...' : 'Publish Request'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
