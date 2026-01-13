import { useState } from 'react';
import { ArrowLeft, Building2, Plus, Trash2, Loader2, Users, Copy, CheckCircle, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSuperAdmin } from '@/hooks/useSchoolAdmin';
import { useUserRole } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';
import { z } from 'zod';

const schoolSchema = z.object({
  name: z.string().min(2, 'School name is required').max(100),
  code: z.string().min(3, 'Code must be at least 3 characters').max(20).regex(/^[A-Z0-9]+$/, 'Code must be uppercase letters and numbers only'),
  address: z.string().max(200).optional()
});

interface SuperAdminPanelProps {
  onBack: () => void;
}

export function SuperAdminPanel({ onBack }: SuperAdminPanelProps) {
  const { isAdmin } = useUserRole();
  const { schools, loading, createSchool, deleteSchool } = useSuperAdmin();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">You need super admin privileges.</p>
          <Button variant="outline" onClick={onBack} className="mt-4">
            <ArrowLeft size={16} className="mr-1" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    setError('');
    
    const result = schoolSchema.safeParse({ name, code: code.toUpperCase(), address });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);
    const school = await createSchool(name, code, address || undefined);
    setIsSubmitting(false);

    if (school) {
      setName('');
      setCode('');
      setAddress('');
      setShowForm(false);
    }
  };

  const handleCopyCode = (schoolCode: string) => {
    navigator.clipboard.writeText(schoolCode);
    setCopiedCode(schoolCode);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleDelete = async (schoolId: string, schoolName: string) => {
    if (confirm(`Delete "${schoolName}"? This will remove all users and data from this school.`)) {
      await deleteSchool(schoolId);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={16} className="mr-1" />
            Back
          </Button>
        </div>

        <div className="text-center mb-6 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold mb-1 gradient-text">Manage Schools</h1>
          <p className="text-muted-foreground text-sm">Create and manage schools in the system</p>
        </div>

        {/* Add School Button/Form */}
        {!showForm ? (
          <Button 
            className="w-full mb-6 gap-2" 
            onClick={() => setShowForm(true)}
          >
            <Plus size={16} />
            Add New School
          </Button>
        ) : (
          <div className="glass-effect rounded-2xl p-5 mb-6 animate-fade-in">
            <h3 className="font-semibold mb-4">Create New School</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="School name"
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                maxLength={100}
              />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="School code (e.g., SCHOOL123)"
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/50"
                maxLength={20}
              />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Address (optional)"
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                maxLength={200}
              />

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowForm(false);
                    setName('');
                    setCode('');
                    setAddress('');
                    setError('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleSubmit}
                  disabled={!name.trim() || !code.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Create
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Schools List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : schools.length === 0 ? (
          <div className="glass-effect rounded-2xl p-8 text-center">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">No schools yet</h3>
            <p className="text-sm text-muted-foreground">Create your first school to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {schools.map((school) => (
              <div key={school.id} className={cn(
                "glass-effect rounded-xl p-4 group",
                school.is_test_data && "border border-amber-500/30 bg-amber-500/5"
              )}>
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0",
                    school.is_test_data 
                      ? "bg-gradient-to-br from-amber-500 to-orange-600"
                      : "bg-gradient-to-br from-primary to-accent"
                  )}>
                    {school.is_test_data ? <FlaskConical size={18} /> : <Building2 size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{school.name}</h3>
                      {school.is_test_data && (
                        <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-600 rounded-full font-medium">
                          Test Data
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">
                        {school.code}
                      </code>
                      <button
                        onClick={() => handleCopyCode(school.code)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copiedCode === school.code ? (
                          <CheckCircle size={14} className="text-emerald-500" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                    {school.address && (
                      <p className="text-xs text-muted-foreground mt-1">{school.address}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(school.id, school.name)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
