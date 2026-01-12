import { useState } from 'react';
import { School, GraduationCap, User, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSchool, School as SchoolType } from '@/hooks/useSchool';
import { cn } from '@/lib/utils';
import { z } from 'zod';

const grades = [
  'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

const departments = [
  'Mathematics', 'Science', 'English', 'Social Studies', 
  'Technology', 'Art', 'Physical Education', 'Administration'
];

const registrationSchema = z.object({
  schoolCode: z.string().min(1, 'School code is required'),
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  studentTeacherId: z.string().max(50).optional(),
  gradeLevel: z.string().optional(),
  department: z.string().optional(),
});

export function SchoolRegistration() {
  const [step, setStep] = useState<'code' | 'type' | 'details'>('code');
  const [schoolCode, setSchoolCode] = useState('');
  const [validatedSchool, setValidatedSchool] = useState<SchoolType | null>(null);
  const [userType, setUserType] = useState<'student' | 'teacher' | null>(null);
  const [fullName, setFullName] = useState('');
  const [studentTeacherId, setStudentTeacherId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [department, setDepartment] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { validateSchoolCode, createProfile } = useSchool();

  const handleValidateCode = async () => {
    setError('');
    setIsValidating(true);
    
    const school = await validateSchoolCode(schoolCode.trim());
    
    if (school) {
      setValidatedSchool(school);
      setStep('type');
    } else {
      setError('Invalid school code. Please check and try again.');
    }
    setIsValidating(false);
  };

  const handleSelectType = (type: 'student' | 'teacher') => {
    setUserType(type);
    setStep('details');
  };

  const handleSubmit = async () => {
    setError('');
    
    // Validate
    const result = registrationSchema.safeParse({
      schoolCode,
      fullName,
      studentTeacherId,
      gradeLevel,
      department
    });

    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    if (!userType) return;

    setIsSubmitting(true);
    const profile = await createProfile(
      schoolCode,
      fullName,
      userType,
      studentTeacherId || undefined,
      gradeLevel || undefined,
      department || undefined
    );
    setIsSubmitting(false);

    if (!profile) {
      setError('Failed to submit registration. Please try again.');
    }
  };

  // Step 1: Enter school code
  if (step === 'code') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="ambient-glow" />
        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-gradient-to-br from-primary to-accent">
              <School className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Join Your School</h1>
            <p className="text-muted-foreground">Enter your school's unique code to get started</p>
          </div>

          <div className="glass-effect rounded-2xl p-6 animate-fade-in">
            <input
              type="text"
              value={schoolCode}
              onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
              placeholder="Enter school code"
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-center text-lg font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
              maxLength={20}
            />

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm mb-4">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <Button
              className="w-full gap-2"
              onClick={handleValidateCode}
              disabled={!schoolCode.trim() || isValidating}
            >
              {isValidating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle size={16} />
              )}
              Verify Code
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Select user type
  if (step === 'type') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="ambient-glow" />
        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-gradient-to-br from-emerald-500 to-green-600">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{validatedSchool?.name}</h1>
            <p className="text-muted-foreground">Are you a student or teacher?</p>
          </div>

          <div className="space-y-3 animate-fade-in">
            <button
              onClick={() => handleSelectType('student')}
              className="w-full glass-effect rounded-2xl p-6 text-left hover:shadow-lg transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-blue-500 to-cyan-600 text-white">
                  <GraduationCap className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Student</h3>
                  <p className="text-sm text-muted-foreground">I'm here to learn</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleSelectType('teacher')}
              className="w-full glass-effect rounded-2xl p-6 text-left hover:shadow-lg transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                  <User className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Teacher</h3>
                  <p className="text-sm text-muted-foreground">I'm here to teach</p>
                </div>
              </div>
            </button>
          </div>

          <Button
            variant="ghost"
            className="w-full mt-4"
            onClick={() => {
              setStep('code');
              setValidatedSchool(null);
            }}
          >
            ← Use different school code
          </Button>
        </div>
      </div>
    );
  }

  // Step 3: Enter details
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="ambient-glow" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-6 animate-fade-in">
          <div className={cn(
            "inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4",
            userType === 'student' 
              ? "bg-gradient-to-br from-blue-500 to-cyan-600" 
              : "bg-gradient-to-br from-violet-500 to-purple-600"
          )}>
            {userType === 'student' ? (
              <GraduationCap className="w-8 h-8 text-white" />
            ) : (
              <User className="w-8 h-8 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold mb-1">Complete Your Profile</h1>
          <p className="text-sm text-muted-foreground">{validatedSchool?.name}</p>
        </div>

        <div className="glass-effect rounded-2xl p-6 animate-fade-in space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Full Name *</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {userType === 'student' ? 'Student ID' : 'Teacher ID'} (optional)
            </label>
            <input
              type="text"
              value={studentTeacherId}
              onChange={(e) => setStudentTeacherId(e.target.value)}
              placeholder="Enter your school ID"
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              maxLength={50}
            />
          </div>

          {userType === 'student' && (
            <div>
              <label className="block text-sm font-medium mb-2">Grade Level</label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select grade</option>
                {grades.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
            </div>
          )}

          {userType === 'teacher' && (
            <div>
              <label className="block text-sm font-medium mb-2">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select department</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <Button
            className="w-full gap-2"
            onClick={handleSubmit}
            disabled={!fullName.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle size={16} />
            )}
            Submit Registration
          </Button>
        </div>

        <Button
          variant="ghost"
          className="w-full mt-4"
          onClick={() => setStep('type')}
        >
          ← Go back
        </Button>
      </div>
    </div>
  );
}
