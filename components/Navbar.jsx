"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import NotificationCenter from "@/components/NotificationCenter";
import { Menu, User, X, LogOut, HeartHandshake, PlusCircle, AlertTriangle, Shield, ShieldAlert } from "lucide-react";
import { isAdminRole, isSuperAdminRole } from "@/lib/roles";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { user, userRole, isDonor, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout();
    setShowLogoutConfirm(false);
    setShowProfileDropdown(false);
  };

  const navLinkClass = (path) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      pathname === path
        ? "text-white bg-red-800/80 font-bold shadow-inner"
        : "text-white/90 hover:text-white hover:bg-red-700/60"
    }`;

  const mobileNavLinkClass = (path) =>
    `block px-3 py-2 rounded-lg text-base font-medium transition-colors ${
      pathname === path
        ? "text-white bg-red-800 font-bold"
        : "text-white/90 hover:text-white hover:bg-red-700/60"
    }`;

  const isAdmin = isAdminRole(userRole);
  const isSuperAdmin = isSuperAdminRole(userRole);

  return (
    <nav className="bg-gradient-to-r from-red-700 via-red-600 to-red-700 shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo Section */}
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <img src="/kk.png" alt="Kurudhi Kodai" className="h-10 w-auto object-contain" />
              <span className="text-white font-extrabold text-xl tracking-tight hidden sm:inline">
                Kurudhi Kodai
              </span>
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center space-x-2">
            <Link href="/" className={navLinkClass("/")}>
              Home
            </Link>
            <Link href="/dashboard" className={navLinkClass("/dashboard")}>
              Donor Portal
            </Link>
            <Link href="/needdonor" className={navLinkClass("/needdonor")}>
              Need Blood
            </Link>
            {user && (
              <Link href="/myrequests" className={navLinkClass("/myrequests")}>
                My Requests
              </Link>
            )}
            <Link href="/camp" className={navLinkClass("/camp")}>
              Blood Camps
            </Link>
            <Link href="/about" className={navLinkClass("/about")}>
              About
            </Link>
          </div>

          {/* Right Header: Notification + User Actions */}
          <div className="hidden md:flex items-center space-x-3">
            {user ? (
              <>
                <NotificationCenter />

                <div className="relative">
                  <button
                    onClick={() => setShowProfileDropdown(prev => !prev)}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-white shadow-sm transition-transform active:scale-95"
                    title="User Profile"
                  >
                    <User className="w-5 h-5" />
                  </button>

                  {showProfileDropdown && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-xs text-gray-500">Signed in as</p>
                        <p className="text-sm font-bold text-gray-900 truncate">{user.email}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {userRole && (
                            <span className={`inline-block px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded ${
                              isSuperAdmin
                                ? 'bg-purple-100 text-purple-800'
                                : isAdmin
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              Role: {userRole}
                            </span>
                          )}
                          {isDonor && (
                            <span className="inline-block px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded bg-green-100 text-green-800">
                              Donor
                            </span>
                          )}
                        </div>
                      </div>

                      <Link
                        href="/profile"
                        onClick={() => setShowProfileDropdown(false)}
                        className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors"
                      >
                        <User className="w-4 h-4 mr-2 text-gray-400" />
                        My Profile
                      </Link>

                      {isDonor ? (
                        <Link
                          href="/dashboard"
                          onClick={() => setShowProfileDropdown(false)}
                          className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors font-medium"
                        >
                          <HeartHandshake className="w-4 h-4 mr-2 text-red-500" />
                          Donor Dashboard
                        </Link>
                      ) : (
                        <Link
                          href="/newdonor"
                          onClick={() => setShowProfileDropdown(false)}
                          className="flex items-center px-4 py-2.5 text-sm text-green-700 hover:bg-green-50 transition-colors font-medium"
                        >
                          <PlusCircle className="w-4 h-4 mr-2" />
                          Register as Donor
                        </Link>
                      )}

                      {isAdmin && (
                        <Link
                          href="/admin"
                          onClick={() => setShowProfileDropdown(false)}
                          className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors font-medium"
                        >
                          <Shield className="w-4 h-4 mr-2 text-red-600" />
                          Admin Console
                        </Link>
                      )}

                      {isSuperAdmin && (
                        <Link
                          href="/superadmin"
                          onClick={() => setShowProfileDropdown(false)}
                          className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors font-medium"
                        >
                          <ShieldAlert className="w-4 h-4 mr-2 text-purple-600" />
                          Superadmin Console
                        </Link>
                      )}

                      <div className="border-t border-gray-100 mt-1">
                        <button
                          onClick={() => {
                            setShowProfileDropdown(false);
                            setShowLogoutConfirm(true);
                          }}
                          className="w-full text-left flex items-center px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <LogOut className="w-4 h-4 mr-2" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={() => router.push('/signin')}
                className="bg-white text-red-700 hover:bg-red-50 px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-all"
              >
                Sign In
              </button>
            )}
          </div>

          {/* Mobile Right Bar: Notifications + Menu Button */}
          <div className="md:hidden flex items-center space-x-2">
            {user && <NotificationCenter />}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-white hover:text-red-100 focus:outline-none p-1.5"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isOpen && (
          <div className="md:hidden pb-4 pt-2 border-t border-red-500/50 space-y-1">
            <Link href="/" onClick={() => setIsOpen(false)} className={mobileNavLinkClass("/")}>
              Home
            </Link>
            <Link href="/dashboard" onClick={() => setIsOpen(false)} className={mobileNavLinkClass("/dashboard")}>
              Donor Portal
            </Link>
            <Link href="/needdonor" onClick={() => setIsOpen(false)} className={mobileNavLinkClass("/needdonor")}>
              Need Blood
            </Link>
            {user && (
              <Link href="/myrequests" onClick={() => setIsOpen(false)} className={mobileNavLinkClass("/myrequests")}>
                My Requests
              </Link>
            )}
            <Link href="/camp" onClick={() => setIsOpen(false)} className={mobileNavLinkClass("/camp")}>
              Blood Camps
            </Link>
            <Link href="/about" onClick={() => setIsOpen(false)} className={mobileNavLinkClass("/about")}>
              About
            </Link>

            {user ? (
              <div className="pt-3 border-t border-red-500/50 space-y-1">
                <Link href="/profile" onClick={() => setIsOpen(false)} className={mobileNavLinkClass("/profile")}>
                  My Profile
                </Link>
                {!isDonor && (
                  <Link href="/newdonor" onClick={() => setIsOpen(false)} className={mobileNavLinkClass("/newdonor")}>
                    Register as Donor
                  </Link>
                )}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setShowLogoutConfirm(true);
                  }}
                  className="w-full text-left block px-3 py-2 rounded-lg text-base font-medium text-white hover:bg-red-800"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="pt-3">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    router.push('/signin');
                  }}
                  className="w-full bg-white text-red-700 py-2.5 rounded-lg font-bold text-center"
                >
                  Sign In / Register
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
          <div className="bg-white rounded-2xl p-6 relative z-10 w-full max-w-sm shadow-2xl text-gray-800 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Sign Out</h3>
            <p className="text-gray-600 text-sm mb-6">
              Are you sure you want to sign out of Kurudhi Kodai?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
