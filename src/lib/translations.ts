// Centralized translations for subjects and grades used across multiple components

export function getSubjectName(id: string, language: string): string {
  const names: Record<string, { en: string; ar: string }> = {
    biology: { en: 'Biology', ar: 'الأحياء' },
    physics: { en: 'Physics', ar: 'الفيزياء' },
    mathematics: { en: 'Mathematics', ar: 'الرياضيات' },
    chemistry: { en: 'Chemistry', ar: 'الكيمياء' },
    english: { en: 'English', ar: 'اللغة الإنجليزية' },
    social_studies: { en: 'Social Studies', ar: 'الدراسات الاجتماعية' },
    technology: { en: 'Technology', ar: 'التقنية' },
    arabic: { en: 'اللغة العربية', ar: 'اللغة العربية' },
    islamic_studies: { en: 'Islamic Studies', ar: 'الدراسات الإسلامية' },
    ksa_history: { en: 'KSA History', ar: 'تاريخ المملكة' },
    art_design: { en: 'Art and Design', ar: 'الفنون والتصميم' },
    art_and_design: { en: 'Art and Design', ar: 'الفنون والتصميم' },
    entrepreneurship: { en: 'Entrepreneurship', ar: 'ريادة الأعمال' },
    sat_math: { en: 'SAT Math', ar: 'رياضيات SAT' },
    sat_reading: { en: 'SAT Reading', ar: 'قراءة SAT' },
    sat_writing: { en: 'SAT Writing', ar: 'كتابة SAT' },
  };
  const entry = names[id];
  if (!entry) return id;
  return language === 'ar' ? entry.ar : entry.en;
}

export function getGradeName(grade: string, language: string): string {
  if (language !== 'ar') return grade;
  if (grade === 'KG1') return 'تمهيدي ١';
  if (grade === 'KG2') return 'تمهيدي ٢';
  const match = grade.match(/Grade (\d+)/);
  if (match) {
    const arabicNums = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩','١٠','١١','١٢'];
    const num = parseInt(match[1]);
    return `الصف ${arabicNums[num] || num}`;
  }
  return grade;
}

// Common UI translations
export const translations = {
  back: { en: 'Back', ar: 'رجوع' },
  next: { en: 'Next', ar: 'التالي' },
  save: { en: 'Save', ar: 'حفظ' },
  cancel: { en: 'Cancel', ar: 'إلغاء' },
  delete: { en: 'Delete', ar: 'حذف' },
  loading: { en: 'Loading...', ar: 'جارٍ التحميل...' },
  error: { en: 'Error', ar: 'خطأ' },
  success: { en: 'Success', ar: 'نجاح' },
  selectGrade: { en: 'Select Your Grade Level', ar: 'اختر المستوى الدراسي' },
  generateLecture: { en: 'Generate Lecture', ar: 'إنشاء درس' },
  generatingLecture: { en: 'Generating lecture...', ar: 'جارٍ إنشاء الدرس...' },
  newMaterial: { en: 'New Material', ar: 'مادة جديدة' },
  viewSavedMaterials: { en: 'View Saved Materials', ar: 'عرض المواد المحفوظة' },
  materialDeleted: { en: 'Material deleted', ar: 'تم حذف المادة' },
  whatTopic: { en: 'What are you taking or having problems with in this subject?', ar: 'ما الموضوع الذي تدرسه أو تواجه صعوبة فيه في هذه المادة؟' },
  topicPlaceholder: { en: 'e.g., Cell respiration, Newton\'s laws, Quadratic equations...', ar: 'مثال: التنفس الخلوي، قوانين نيوتن، المعادلات التربيعية...' },
  subjects: { en: 'Subjects', ar: 'المواد' },
  aiLectures: { en: 'AI Lectures', ar: 'دروس الذكاء الاصطناعي' },
  aiLecturesDesc: { en: 'Generate personalized lectures with AI', ar: 'إنشاء دروس مخصصة بالذكاء الاصطناعي' },
  courseMaterials: { en: 'Course Materials', ar: 'المواد الدراسية' },
  courseMaterialsDesc: { en: 'View materials shared by your teachers', ar: 'عرض المواد التي شاركها معلموك' },
  chooseHowToLearn: { en: 'Choose how you want to learn', ar: 'اختر الطريقة التي تريد التعلم بها' },
  flashcards: { en: 'Flashcards', ar: 'البطاقات التعليمية' },
  clickSubject: { en: 'Click a subject or SAT section', ar: 'اختر مادة أو قسم SAT' },
  generateFlashcards: { en: 'Generate Flashcards', ar: 'إنشاء بطاقات تعليمية' },
  generatingFlashcards: { en: 'Generating flashcards...', ar: 'جارٍ إنشاء البطاقات...' },
  flashcardTopic: { en: 'What topic do you want flashcards for?', ar: 'ما الموضوع الذي تريد بطاقات تعليمية له؟' },
  flashcardPlaceholder: { en: 'e.g., Cell structure, Vocabulary, Chemical formulas...', ar: 'مثال: تركيب الخلية، المفردات، الصيغ الكيميائية...' },
  fromSavedMaterials: { en: 'From Saved Materials', ar: 'من المواد المحفوظة' },
  fromSavedMaterialsDesc: { en: 'Generate flashcards from your saved material(s)', ar: 'إنشاء بطاقات من موادك المحفوظة' },
  customTopic: { en: 'Custom Topic', ar: 'موضوع مخصص' },
  customTopicDesc: { en: 'Enter a specific topic for flashcard generation', ar: 'أدخل موضوعاً محدداً لإنشاء البطاقات' },
  question: { en: 'Question', ar: 'السؤال' },
  answer: { en: 'Answer', ar: 'الإجابة' },
  tapToFlip: { en: 'Tap to flip', ar: 'اضغط للقلب' },
  tapToFlipBack: { en: 'Tap to flip back', ar: 'اضغط للرجوع' },
  new: { en: 'New', ar: 'جديد' },
  notes: { en: 'Notes', ar: 'الملاحظات' },
  notesDesc: { en: 'Click a subject to create AI-generated notes', ar: 'اختر مادة لإنشاء ملاحظات بالذكاء الاصطناعي' },
  generateNotes: { en: 'Generate Notes', ar: 'إنشاء ملاحظات' },
  generatingNotes: { en: 'Generating notes...', ar: 'جارٍ إنشاء الملاحظات...' },
  notesTopicQuestion: { en: 'What topic do you want notes for?', ar: 'ما الموضوع الذي تريد ملاحظات عنه؟' },
  notesPlaceholder: { en: 'e.g., Photosynthesis, World War II, Algebra basics...', ar: 'مثال: التمثيل الضوئي، الحرب العالمية الثانية، أساسيات الجبر...' },
  satPrep: { en: 'SAT Prep', ar: 'تحضير SAT' },
  satSelectSection: { en: 'Select a section to begin', ar: 'اختر قسماً للبدء' },
  exams: { en: 'Exams', ar: 'الاختبارات' },
  selectDifficulty: { en: 'Select difficulty', ar: 'اختر مستوى الصعوبة' },
  beginner: { en: 'Beginner', ar: 'مبتدئ' },
  intermediate: { en: 'Intermediate', ar: 'متوسط' },
  hard: { en: 'Hard', ar: 'صعب' },
  startExam: { en: 'Start Exam', ar: 'ابدأ الاختبار' },
  weeklyPlan: { en: 'Weekly Plan', ar: 'الخطة الأسبوعية' },
  noWeeklyPlans: { en: 'No weekly plans available', ar: 'لا توجد خطط أسبوعية متاحة' },
  assignments: { en: 'Assignments', ar: 'الواجبات' },
  noAssignments: { en: 'No assignments yet', ar: 'لا توجد واجبات بعد' },
  reportCards: { en: 'Report Cards', ar: 'كشوف الدرجات' },
  signIn: { en: 'Sign In', ar: 'تسجيل الدخول' },
  signUp: { en: 'Sign Up', ar: 'إنشاء حساب' },
  joinSchool: { en: 'Join School', ar: 'الانضمام لمدرسة' },
  email: { en: 'Email', ar: 'البريد الإلكتروني' },
  password: { en: 'Password', ar: 'كلمة المرور' },
  confirmPassword: { en: 'Confirm Password', ar: 'تأكيد كلمة المرور' },
  fullName: { en: 'Full Name', ar: 'الاسم الكامل' },
  inviteCode: { en: 'Invite Code', ar: 'رمز الدعوة' },
  signInToAccount: { en: 'Sign in to your account', ar: 'تسجيل الدخول إلى حسابك' },
  createAccount: { en: 'Create a new account', ar: 'إنشاء حساب جديد' },
  dontHaveAccount: { en: "Don't have an account?", ar: 'ليس لديك حساب؟' },
  alreadyHaveAccount: { en: 'Already have an account?', ar: 'لديك حساب بالفعل؟' },
  joinSchoolDesc: { en: 'Use your school invite code to join', ar: 'استخدم رمز الدعوة للانضمام إلى مدرستك' },
  profile: { en: 'Profile', ar: 'الملف الشخصي' },
  appearance: { en: 'Appearance', ar: 'المظهر' },
  light: { en: 'Light', ar: 'فاتح' },
  dark: { en: 'Dark', ar: 'داكن' },
  language: { en: 'Language', ar: 'اللغة' },
  signOut: { en: 'Sign Out', ar: 'تسجيل الخروج' },
  yourDetails: { en: 'Your Details', ar: 'بياناتك' },
  role: { en: 'Role', ar: 'الدور' },
  grade: { en: 'Grade', ar: 'الصف' },
  department: { en: 'Department', ar: 'القسم' },
  schoolCode: { en: 'School Code', ar: 'رمز المدرسة' },
  adminAccessCode: { en: 'Admin Access Code', ar: 'رمز دخول المسؤول' },
  enterAdminCode: { en: 'Enter code to regain admin access', ar: 'أدخل الرمز لاستعادة صلاحيات المسؤول' },
  verify: { en: 'Verify', ar: 'تحقق' },
  schoolAdmin: { en: 'School Admin', ar: 'مسؤول المدرسة' },
  manageRegistrations: { en: 'Manage user registrations', ar: 'إدارة تسجيلات المستخدمين' },
  manageSchools: { en: 'Manage Schools', ar: 'إدارة المدارس' },
  createManageSchools: { en: 'Create and manage schools', ar: 'إنشاء وإدارة المدارس' },
  pendingApproval: { en: 'Pending Approval', ar: 'في انتظار الموافقة' },
  pendingApprovalDesc: { en: 'Your request is being reviewed by the school administrator.', ar: 'طلبك قيد المراجعة من قبل مسؤول المدرسة.' },
  openMaterial: { en: 'Open Material', ar: 'فتح المادة' },
  weekOf: { en: 'Week of', ar: 'أسبوع' },
  saved: { en: 'saved', ar: 'محفوظ' },
} as const;

export function tr(key: keyof typeof translations, language: string): string {
  const entry = translations[key];
  return language === 'ar' ? entry.ar : entry.en;
}
