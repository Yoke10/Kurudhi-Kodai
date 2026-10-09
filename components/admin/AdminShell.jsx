'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  Droplets,
  HeartHandshake,
  Users,
  Calendar,
  LifeBuoy,
  ShieldAlert,
  FileText,
  Menu,
  X,
  ArrowLeft,
  LogOut,
  MapPin,
  Shield,
  Building,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminShell({
  role = 'ADMIN', // 'ADMIN' | 'SUPERADMIN'
  assignedCity = '',
  activeTab = 'overview',
  onTabChange,
  badgeCounts = {},
  children,
}) {
  const { user, logOut } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isSuperAdmin = role === 'SUPERADMIN';

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'requests', label: 'Blood Requests', icon: Droplets, badge: badgeCounts.requests },
    { id: 'donations', label: 'Donations Tracking', icon: HeartHandshake, badge: badgeCounts.donations },
    { id: 'donors', label: 'Donor Directory', icon: Users, badge: badgeCounts.donors },
    { id: 'camps', label: 'Blood Camps', icon: Calendar },
    ...(isSuperAdmin
      ? [
          { id: 'users', label: 'User & Roles', icon: ShieldAlert, badge: badgeCounts.users },
          { id: 'audit', label: 'Audit Logs', icon: FileText },
        ]
      : []),
    { id: 'support', label: 'Support Tickets', icon: LifeBuoy, badge: badgeCounts.support },
  ];

  const handleSelectTab = (tabId) => {
    onTabChange && onTabChange(tabId);
    setMobileMenuOpen(false);
  };

  const handleSignOut = async () => {
    try {
      await logOut();
      router.push('/');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div>
            <span className="font-extrabold text-sm text-gray-900 tracking-tight flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              Kurudhi Kodai
            </span>
            <span className="text-[10px] text-gray-400 block font-semibold uppercase tracking-wider">
              {isSuperAdmin ? 'Superadmin Console' : `Admin: ${assignedCity || 'Regional'}`}
            </span>
          </div>
        </div>

        <Link
          href="/"
          className="text-xs text-red-600 font-semibold hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Exit
        </Link>
      </header>

      {/* Sidebar for Desktop & Mobile Overlay */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-base shadow-sm">
                K
              </div>
              <div>
                <h1 className="font-extrabold text-sm text-white tracking-tight">Kurudhi Kodai</h1>
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                  {isSuperAdmin ? 'Superadmin Hub' : 'Regional Console'}
                </p>
              </div>
            </div>
            {assignedCity && !isSuperAdmin && (
              <div className="mt-2.5 inline-flex items-center gap-1 bg-slate-800 text-slate-300 text-[11px] font-medium px-2 py-0.5 rounded-full border border-slate-700">
                <MapPin className="w-3 h-3 text-red-400" />
                {assignedCity} City Admin
              </div>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white text-red-700' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer: User Identity & Sign Out */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-2">
          <div className="px-3 py-2">
            <span className="text-[11px] text-slate-400 block truncate">
              {user?.email || 'Administrator'}
            </span>
            <span className="text-[10px] font-mono text-slate-500 uppercase">
              Role: {role}
            </span>
          </div>

          <div className="flex items-center gap-2 px-1">
            <Link
              href="/"
              className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-white py-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Public App
            </Link>
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center gap-1 text-xs text-red-400 hover:text-red-300 py-2 px-3 rounded-lg hover:bg-slate-800 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Desktop Topbar */}
        <header className="hidden md:flex bg-white border-b border-gray-200 px-6 py-3.5 items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400 font-medium">Console</span>
            <span className="text-gray-300">/</span>
            <span className="font-bold text-gray-800 capitalize">
              {navItems.find((i) => i.id === activeTab)?.label || activeTab}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {assignedCity && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
                <MapPin className="w-3 h-3 text-red-500" />
                {assignedCity}
              </span>
            )}
            <Link
              href="/"
              className="text-xs font-semibold text-gray-500 hover:text-red-600 flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Portal
            </Link>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
        />
      )}
    </div>
  );
}
