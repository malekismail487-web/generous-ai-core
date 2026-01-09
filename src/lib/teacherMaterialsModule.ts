// teacherMaterialsModule.ts
// Handles all teacher-uploaded materials in the Subject tab

type TeacherMaterial = {
    id: string;
    subject: string;
    title: string;
    content: string; // Could be text or link to PDF/DOCX
    uploadedAt: Date;
};

type MaterialProgress = {
    [studentId: string]: { [materialId: string]: boolean }; // true if student viewed
};

let teacherMaterials: TeacherMaterial[] = [];
let materialProgress: MaterialProgress = {};

// ----- Teacher Functions -----
export function uploadMaterial(subject: string, title: string, content: string) {
    const id = `mat_${Date.now()}`;
    const material: TeacherMaterial = { id, subject, title, content, uploadedAt: new Date() };
    teacherMaterials.push(material);
    return material;
}

export function getMaterialsBySubject(subject: string) {
    return teacherMaterials.filter(m => m.subject === subject);
}

export function updateMaterial(materialId: string, title?: string, content?: string) {
    const material = teacherMaterials.find(m => m.id === materialId);
    if (!material) return null;
    if (title) material.title = title;
    if (content) material.content = content;
    return material;
}

export function deleteMaterial(materialId: string) {
    const index = teacherMaterials.findIndex(m => m.id === materialId);
    if (index !== -1) teacherMaterials.splice(index, 1);
}

// ----- Student Progress Tracking -----
export function markMaterialViewed(studentId: string, materialId: string) {
    if (!materialProgress[studentId]) materialProgress[studentId] = {};
    materialProgress[studentId][materialId] = true;
}

export function isMaterialViewed(studentId: string, materialId: string) {
    return materialProgress[studentId]?.[materialId] || false;
}

// ----- Optional Banner Placement -----
export function getTeacherMaterialBannerPlacement() {
    return "Static banner at bottom of teacher materials view";
}
