import { useState } from 'react';
import { ArrowLeft, Building2, Plus, Trash2, Loader2, Users, Copy, CheckCircle, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSuperAdmin } from '@/hooks/useSchoolAdmin';
import { useUserRole } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';
import { z } from 'zod';

export const SCHOOL_CODES: Record<string, { name: string; id: string }> = {
  'QMM0.01': { name: 'Qimam EL Hayat International Schools', id: 'qimam-el-hayat' },
  'LUMI100': { name: 'LUMI', id: 'lumi' },
  'TEST999': { name: 'Test School', id: 'test-school' },
};

export function getSchoolByCode(code: string): { name: string; id: string } | null {
  const normalized = code.trim().toUpperCase();
  return SCHOOL_CODES[normalized] || null;
}

'use client';

import { useState, useEffect } from 'react';
import { getSchoolByCode } from './school-codes';

type Profile = { email: string; name: string; schoolId: string };

export default function EnterSchoolCode() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // In-memory storage (persisted in localStorage)
  const [schoolsUsed, setSchoolsUsed] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      return JSON.parse(localStorage.getItem('schoolsUsed') || '[]');
    }
    return [];
  });
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    if (typeof window !== 'undefined') {
      return JSON.parse(localStorage.getItem('profiles') || '[]');
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('schoolsUsed', JSON.stringify(schoolsUsed));
    localStorage.setItem('profiles', JSON.stringify(profiles));
  }, [schoolsUsed, profiles]);

  const handleSubmit = () => {
    setStatus('loading');
    setMessage('');

    const school = getSchoolByCode(code);
    if (!school) {
      setStatus('error');
      setMessage('Invalid code.');
      return;
    }

    if (schoolsUsed.includes(code)) {
      setStatus('error');
      setMessage('This code has already been used.');
      return;
    }

    // "Create" school & profile
    setSchoolsUsed([...schoolsUsed, code]);
    setProfiles([...profiles, { email, name, schoolId: school.id }]);

    setStatus('success');
    setMessage(Welcome! You're now admin of ${school.name}.);
    setCode('');
    setName('');
    setEmail('');
  };

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Activate Your School</h1>
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Enter code (e.g. QMM0.01)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="w-full p-3 border rounded"
        />
        <input
          type="text"
          placeholder="Your full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-3 border rounded"
        />
        <input
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 border rounded"
        />
        <button
          onClick={handleSubmit}
          disabled={status === 'loading'}
          className="w-full p-3 bg-blue-600 text-white rounded disabled:opacity-50"

        >
          {status === 'loading' ? 'Activating...' : 'Activate School'}
        </button>
        {status === 'success' && <p className="text-green-600">{message}</p>}
        {status === 'error' && <p className="text-red-600">{message}</p>}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { SCHOOL_CODES } from './school-codes';

type School = { code: string; name: string; status: 'active' | 'suspended' };

export default function SuperAdminPanel() {
  const [schools, setSchools] = useState<School[]>(() => {
    if (typeof window !== 'undefined') {
      return JSON.parse(localStorage.getItem('superAdminSchools') || '[]');
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('superAdminSchools', JSON.stringify(schools));
  }, [schools]);

  const suspendSchool = (code: string) => {
    setSchools(schools.map(s => s.code === code ? { ...s, status: 'suspended' } : s));
  };

  const deleteSchool = (code: string) => {
    setSchools(schools.filter(s => s.code !== code));
  };

  if (schools.length === 0) return <div className="p-8">No schools activated yet.</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Super Admin Panel</h1>
      <ul>
        {schools.map(s => (
          <li key={s.code} className="mb-2">
            {s.name} ({s.status})
            {s.status === 'active' && (
              <button onClick={() => suspendSchool(s.code)} className="ml-4 text-yellow-600">
                Suspend
              </button>
            )}
            <button onClick={() => deleteSchool(s.code)} className="ml-2 text-red-600">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
