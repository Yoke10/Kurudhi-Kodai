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
import { UserCircle, Shield, Droplets, Calendar, MapPin, CheckCircle, Clock } from 'lucide-react';
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
  const { user, donorProfile, refreshUserProfile } = useAuth();
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

  if (!donorData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <Card className="w-full max-w-md p-6 text-center border-2 border-red-100 shadow-lg rounded-2xl">
            <CardHeader>
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserCircle className="w-12 h-12" />
              </div>
              <CardTitle className="text-2xl font-bold text-gray-800">No Donor Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-6">
                You have not registered as a blood donor yet. Register now to help save lives in your city.
              </p>
              <Button
                onClick={() => router.push('/newdonor')}
                className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg py-3 font-semibold"
              >
                Become a Donor
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { isEligible, remainingDays } = calculateDonorCooldown(donorData.lastDonationAt);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-800">Donor Profile</h1>
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

        {updateStatus && (
          <Alert className={`mb-6 ${updateStatus.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <AlertDescription className={updateStatus.type === 'success' ? 'text-green-800' : 'text-red-800'}>
              {updateStatus.message}
            </AlertDescription>
          </Alert>
        )}

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
      </main>
    </div>
  );
}
