// src/hooks/useUserRole.ts
'use client';

import { useState, useEffect } from 'react';
import { SCHOOL_CODES, SchoolCode } from '@/lib/school-codes';

export type School = SchoolCode & {
  status: 'active' | 'suspended';
};

export type User = {
  email: string;
  name: string;
  schools: School[];
};

export function useUserRole() {
  const [user, setUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Load user and users from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const savedUsers = JSON.parse(localStorage.getItem('allUsers') || '[]');

    setUser(savedUser);
    setAllUsers(savedUsers);
    setLoading(false);
  }, []);

  // Persist changes
  useEffect(() => {
    if (user) localStorage.setItem('currentUser', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem('allUsers', JSON.stringify(allUsers));
  }, [allUsers]);

  // Add new user
  const addUser = (newUser: User) => {
    setAllUsers(prev => [...prev, newUser]);
  };

  // Claim a school code (first-come, first-served placeholder admin)
  const claimSchoolCode = (code: string) => {
    if (!user) return { success: false, message: 'User not logged in.' };

    const schoolCode = getSchoolByCode(code);
    if (!schoolCode) return { success: false, message: 'Invalid code.' };

    // Check if code already claimed
    if (schoolCode.schoolAdminEmail) {
      return { success: false, message: 'This code has already been claimed.' };
    }

    // Assign current user as school admin placeholder
    const newSchool: School = {
      ...schoolCode,
      status: 'active',
      schoolAdminEmail: user.email,
    };

    // Add school to current user
    setUser({ ...user, schools: [...user.schools, newSchool] });

    // Update the global SCHOOL_CODES record so it cannot be claimed again
    SCHOOL_CODES[code].schoolAdminEmail = user.email;

    return { success: true, school: newSchool };
  };

  return { user, setUser, allUsers, setAllUsers, addUser, claimSchoolCode, loading };
}
