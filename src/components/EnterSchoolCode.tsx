'use client';

import { useState } from 'react';
import { useUserRole } from '@/hooks/useUserRole';

export default function EnterSchoolCode() {
  const { user, claimSchoolCode } = useUserRole();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = () => {
    if (!code.trim()) return;

    setStatus('loading');
    const result = claimSchoolCode(code.toUpperCase());

    if (result.success) {
      setStatus('success');
      setMessage(You are now the school admin placeholder of ${result.school?.name}.);
    } else {
      setStatus('error');
      setMessage(result.message || 'Error claiming code.');
    }

    setCode('');
  };

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Activate Your School</h1>

      <input
        type="text"
        placeholder="Enter school code"
        value={code}
        onChange={e => setCode(e.target.value)}
        className="w-full p-3 border rounded mb-4"
      />
      <button
        onClick={handleSubmit}
        className="w-full p-3 bg-blue-600 text-white rounded"
      >
        Activate
      </button>

      {status === 'success' && <p className="text-green-600 mt-4">{message}</p>}
      {status === 'error' && <p className="text-red-600 mt-4">{message}</p>}
    </div>
  );
}
