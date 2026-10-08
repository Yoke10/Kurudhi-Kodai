'use client';

import Navbar from '@/components/Navbar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { calculateDonorCooldown } from '@/lib/matchingEngine';
import { ROLES, normalizeRole } from '@/lib/roles';
import { UserCircle, Shield, Droplets, Calendar, MapPin, CheckCircle, Clock, HeartHandshake, PlusCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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

export default function ProfilePage() {
  const { user, userRole, donorProfile, isDonor, refreshUserProfile } = useAuth();
  const router = useRouter();
  const [donorData, setDonorData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [sameAsPermanent, setSameAsPermanent] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (donorProfile) {
      setDonorData({
        name: donorProfile.name || donorProfile.Name || '',
        email: donorProfile.email || donorProfile.Email || user?.email || '',
        mobile: donorProfile.mobile || donorProfile.MobileNumber || '',
        whatsapp: donorProfile.whatsapp || donorProfile.WhatsappNumber || '',
        bloodGroup: donorProfile.bloodGroup || donorProfile.BloodGroup || '',
        gender: donorProfile.gender || donorProfile.Gender || '',
        dateOfBirth: donorProfile.dateOfBirth || donorProfile.DateOfBirth || '',
        permanentCity: donorProfile.permanentCity || donorProfile.PermanentCity || '',
        residentCity: donorProfile.residentCity || donorProfile.ResidentCity || '',
        area: donorProfile.area || '',
        availabilityStatus: donorProfile.availabilityStatus || 'AVAILABLE',
        availableForEmergency: donorProfile.availableForEmergency !== false,
        lastDonationAt: donorProfile.lastDonationAt || donorProfile.lastDonationDate || null,
      });
      const perm = donorProfile.permanentCity || donorProfile.PermanentCity;
      const res = donorProfile.residentCity || donorProfile.ResidentCity;
      setSameAsPermanent(perm === res);
      setLoading(false);
    } else if (user) {
      // Check Firestore directly if donorProfile isn't populated yet
      const checkDirect = async () => {
        try {
          const docRef = doc(db, 'donors', user.uid);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            setDonorData({
              name: data.name || data.Name || '',
              email: data.email || data.Email || user.email,
              mobile: data.mobile || data.MobileNumber || '',
              whatsapp: data.whatsapp || data.WhatsappNumber || '',
              bloodGroup: data.bloodGroup || data.BloodGroup || '',
              gender: data.gender || data.Gender || '',
              dateOfBirth: data.dateOfBirth || data.DateOfBirth || '',
              permanentCity: data.permanentCity || data.PermanentCity || '',
              residentCity: data.residentCity || data.ResidentCity || '',
              area: data.area || '',
              availabilityStatus: data.availabilityStatus || 'AVAILABLE',
              availableForEmergency: data.availableForEmergency !== false,
              lastDonationAt: data.lastDonationAt || data.lastDonationDate || null,
            });
          }
        } catch (e) {
          console.error('Error fetching profile:', e);
        } finally {
          setLoading(false);
        }
      };
      checkDirect();
    } else {
      setLoading(false);
    }
  }, [user, donorProfile]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const donorRef = doc(db, 'donors', user.uid);
      const payload = {
        uid: user.uid,
        name: donorData.name,
        email: user.email,
        mobile: donorData.mobile,
        whatsapp: donorData.whatsapp,
        bloodGroup: donorData.bloodGroup,
        gender: donorData.gender,
        dateOfBirth: donorData.dateOfBirth,
        permanentCity: donorData.permanentCity,
        residentCity: donorData.residentCity || donorData.permanentCity,
        area: donorData.area,
        availabilityStatus: donorData.availabilityStatus,
        availableForEmergency: donorData.availableForEmergency,
        // Also sync legacy PascalCase keys for backward compatibility
        Name: donorData.name,
        Email: user.email,
        MobileNumber: donorData.mobile,
        WhatsappNumber: donorData.whatsapp,
        BloodGroup: donorData.bloodGroup,
        Gender: donorData.gender,
        DateOfBirth: donorData.dateOfBirth,
        PermanentCity: donorData.permanentCity,
        ResidentCity: donorData.residentCity || donorData.permanentCity,
        updatedAt: serverTimestamp(),
      };

      await setDoc(donorRef, payload, { merge: true });
      await refreshUserProfile();
      setUpdateStatus({ type: 'success', message: 'Profile updated successfully!' });
      setIsEditing(false);
      setTimeout(() => setUpdateStatus(null), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setUpdateStatus({ type: 'error', message: 'Failed to update profile. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setDonorData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleCityChange = (field, val) => {
    setDonorData(prev => ({
      ...prev,
      [field]: val,
      ...(field === 'permanentCity' && sameAsPermanent ? { residentCity: val } : {})
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const currentRole = normalizeRole(userRole);
  const { isEligible, remainingDays } = calculateDonorCooldown(donorData?.lastDonationAt);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full">
        {/* Account Role & Capability Overview Header */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-red-600 tracking-wider uppercase">User Account</span>
              <h1 className="text-2xl font-black text-gray-900 mt-0.5">My Profile</h1>
              <p className="text-xs text-gray-500 mt-1">
                Signed in as <strong className="text-gray-800 font-semibold">{user?.email}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100">
              <div className="bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-200 text-center min-w-[130px]">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Account Role
                </span>
                <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wide border ${
                  currentRole === ROLES.SUPERADMIN
                    ? 'bg-purple-100 text-purple-800 border-purple-200'
                    : currentRole === ROLES.ADMIN
                    ? 'bg-red-100 text-red-800 border-red-200'
                    : 'bg-slate-100 text-slate-800 border-slate-200'
                }`}>
                  {currentRole}
                </span>
              </div>

              <div className="bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-200 text-center min-w-[140px]">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Donor Status
                </span>
                <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-black tracking-wide border ${
                  donorData
                    ? 'bg-green-100 text-green-800 border-green-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200'
                }`}>
                  {donorData ? 'Registered Donor' : 'Not Registered'}
                </span>
              </div>

              {currentRole === ROLES.SUPERADMIN && (
                <div className="pt-1 sm:pt-0">
                  <Button
                    onClick={() => router.push('/superadmin')}
                    className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-sm px-4 py-2.5 flex items-center gap-1.5"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Superadmin Console
                  </Button>
                </div>
              )}

              {currentRole === ROLES.ADMIN && (
                <div className="pt-1 sm:pt-0">
                  <Button
                    onClick={() => router.push('/admin')}
                    className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-sm px-4 py-2.5 flex items-center gap-1.5"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Admin Console
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {updateStatus && (
          <Alert className={`mb-6 ${updateStatus.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <AlertDescription className={updateStatus.type === 'success' ? 'text-green-800' : 'text-red-800'}>
              {updateStatus.message}
            </AlertDescription>
          </Alert>
        )}

        {!donorData ? (
          <Card className="border border-gray-200 shadow-sm bg-white rounded-2xl p-8 text-center max-w-xl mx-auto my-8">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <HeartHandshake className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">No Donor Profile Registered</h2>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              You are signed in with account role <strong className="font-bold text-gray-800">{currentRole}</strong>.
              Registering as a blood donor activates matching capabilities for your profile while preserving your <strong className="font-bold text-gray-800">{currentRole}</strong> administrative status.
            </p>
            <Button
              onClick={() => router.push('/newdonor')}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl py-3 px-6 font-bold shadow-sm"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Register as Blood Donor
            </Button>
          </Card>
        ) : (
          <>
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-gray-800">Donor Profile</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Manage your contact details, city, and donation availability status
                </p>
              </div>
              <div>
                {!isEditing ? (
                  <Button
                    onClick={() => setIsEditing(true)}
                    className="bg-red-600 hover:bg-red-700 text-white font-medium px-5 py-2 rounded-lg shadow-sm"
                  >
                    Edit Profile
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      className="border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      className="bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg"
                    >
                      Save Changes
                    </Button>
                  </div>
                )}
              </div>
            </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Quick Status Card */}
          <div className="md:col-span-1 space-y-6">
            <Card className="border border-gray-200 shadow-sm bg-white rounded-2xl overflow-hidden">
              <div className="bg-red-600 p-6 text-white text-center">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl font-black text-white">{donorData.bloodGroup || '—'}</span>
                </div>
                <h2 className="text-xl font-bold">{donorData.name}</h2>
                <p className="text-red-100 text-xs mt-1">{donorData.email}</p>
              </div>

              <CardContent className="p-5 space-y-4 text-sm">
                <div>
                  <span className="text-gray-500 text-xs block mb-1">Availability Status</span>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${donorData.availabilityStatus === 'AVAILABLE' ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="font-semibold text-gray-800">{donorData.availabilityStatus}</span>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <span className="text-gray-500 text-xs block mb-1">Cooldown Eligibility</span>
                  {isEligible ? (
                    <div className="flex items-center text-green-700 font-medium gap-1.5">
                      <CheckCircle className="w-4 h-4" /> Eligible to Donate
                    </div>
                  ) : (
                    <div className="flex items-center text-amber-700 font-medium gap-1.5">
                      <Clock className="w-4 h-4" /> Eligible in {remainingDays} day{remainingDays === 1 ? '' : 's'}
                    </div>
                  )}
                </div>

                <div className="border-t pt-3">
                  <span className="text-gray-500 text-xs block mb-1">Location</span>
                  <div className="flex items-center text-gray-700 gap-1.5 font-medium">
                    <MapPin className="w-4 h-4 text-red-500" />
                    {donorData.residentCity || donorData.permanentCity}
                    {donorData.area ? `, ${donorData.area}` : ''}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 leading-relaxed">
              <Shield className="w-4 h-4 text-blue-700 inline mr-1 -mt-0.5" />
              <strong>Privacy Protection:</strong> Your exact residential address is never made public. Donors and requesters connect via locality and contact details only during active coordination.
            </div>
          </div>

          {/* Right Column: Detailed Form */}
          <div className="md:col-span-2">
            <Card className="border border-gray-200 shadow-sm bg-white rounded-2xl">
              <CardHeader className="border-b border-gray-100 pb-4">
                <CardTitle className="text-lg font-bold text-gray-800">
                  Donor Information
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-700 text-xs font-semibold uppercase">Full Name</Label>
                    <Input
                      name="name"
                      disabled={!isEditing}
                      value={donorData.name}
                      onChange={handleChange}
                      className="mt-1 border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-700 text-xs font-semibold uppercase">Blood Group</Label>
                    <Input
                      name="bloodGroup"
                      disabled
                      value={donorData.bloodGroup}
                      className="mt-1 bg-gray-100 border-gray-300 rounded-lg font-bold text-red-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-700 text-xs font-semibold uppercase">Mobile Number</Label>
                    <Input
                      name="mobile"
                      disabled={!isEditing}
                      value={donorData.mobile}
                      onChange={handleChange}
                      className="mt-1 border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-700 text-xs font-semibold uppercase">WhatsApp (Optional)</Label>
                    <Input
                      name="whatsapp"
                      disabled={!isEditing}
                      value={donorData.whatsapp}
                      onChange={handleChange}
                      className="mt-1 border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-700 text-xs font-semibold uppercase">Date of Birth</Label>
                    <Input
                      type="date"
                      name="dateOfBirth"
                      disabled={!isEditing}
                      value={donorData.dateOfBirth}
                      onChange={handleChange}
                      className="mt-1 border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-700 text-xs font-semibold uppercase">Gender</Label>
                    <Input
                      name="gender"
                      disabled
                      value={donorData.gender}
                      className="mt-1 bg-gray-100 border-gray-300 rounded-lg capitalize"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-700 text-xs font-semibold uppercase">Resident City</Label>
                    {isEditing ? (
                      <Select
                        value={donorData.residentCity}
                        onValueChange={(val) => handleCityChange('residentCity', val)}
                      >
                        <SelectTrigger className="mt-1 border-gray-300 rounded-lg">
                          <SelectValue placeholder="Select City" />
                        </SelectTrigger>
                        <SelectContent>
                          {tamilNaduCities.map(city => (
                            <SelectItem key={city} value={city}>{city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        disabled
                        value={donorData.residentCity}
                        className="mt-1 bg-gray-50 border-gray-300 rounded-lg"
                      />
                    )}
                  </div>

                  <div>
                    <Label className="text-gray-700 text-xs font-semibold uppercase">Locality / Area</Label>
                    <Input
                      name="area"
                      disabled={!isEditing}
                      value={donorData.area}
                      onChange={handleChange}
                      placeholder="e.g. Adyar, Anna Nagar"
                      className="mt-1 border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* Availability Section */}
                <div className="border-t border-gray-200 pt-5 space-y-4">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                    Donation Preferences
                  </h3>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">Active Donor Status</p>
                      <p className="text-gray-500 text-xs">
                        {donorData.availabilityStatus === 'AVAILABLE'
                          ? 'You will receive notifications when matching patients need blood.'
                          : 'You are temporarily paused and will not receive match alerts.'}
                      </p>
                    </div>
                    {isEditing ? (
                      <Select
                        value={donorData.availabilityStatus}
                        onValueChange={(val) => setDonorData(prev => ({ ...prev, availabilityStatus: val }))}
                      >
                        <SelectTrigger className="w-36 border-gray-300 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AVAILABLE">AVAILABLE</SelectItem>
                          <SelectItem value="UNAVAILABLE">UNAVAILABLE</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        donorData.availabilityStatus === 'AVAILABLE' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {donorData.availabilityStatus}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 p-3 bg-red-50/50 rounded-xl border border-red-100">
                    <Checkbox
                      id="availableForEmergency"
                      disabled={!isEditing}
                      checked={donorData.availableForEmergency}
                      onCheckedChange={(checked) => setDonorData(prev => ({ ...prev, availableForEmergency: checked }))}
                      className="border-red-300 data-[state=checked]:bg-red-600"
                    />
                    <Label htmlFor="availableForEmergency" className="text-xs text-gray-700 font-medium">
                      Available for critical emergency blood requests in my area
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        </>
        )}
      </main>
    </div>
  );
}
