// subjectModule.ts
// Subject category module integrated with Lumina AI

import { generateLecture, summarizeLecture } from "./luminaAI"; // Make sure AI module exports generateLecture if needed

type Lecture = {
    id: string;
    title: string;
    subject: string;
    content: string;
    summary?: string;
    teacherUploaded?: boolean;
};

type TeacherMaterial = {
    id: string;
    subject: string;
    title: string;
    content: string; // Could be text or URL to file (PDF, DOCX, etc.)
};

type StudentProgress = {
    [studentId: string]: { [lectureId: string]: boolean }; // true if completed
};

let lectures: Lecture[] = [];
let teacherMaterials: TeacherMaterial[] = [];
let studentProgress: StudentProgress = {};

// ----- Lecture Functions -----
export async function createAILecture(title: string, subject: string, level: "beginner" | "intermediate" | "advanced") {
    const content = await generateLecture(`${subject}: ${title}`, level);
    const summary = await summarizeLecture(content);
    const id = `lec_${Date.now()}`;
    const lecture: Lecture = { id, title, subject, content, summary };
    lectures.push(lecture);
    return lecture;
}

export function getLecturesBySubject(subject: string) {
    return lectures.filter(l => l.subject === subject);
}

// ----- Teacher Material Functions -----
export function uploadMaterial(subject: string, title: string, content: string) {
    const id = `mat_${Date.now()}`;
    const material: TeacherMaterial = { id, subject, title, content };
    teacherMaterials.push(material);
    return material;
}

export function getMaterialsBySubject(subject: string) {
    return teacherMaterials.filter(m => m.subject === subject);
}

// ----- Student Progress Functions -----
export function markLectureComplete(studentId: string, lectureId: string) {
    if (!studentProgress[studentId]) studentProgress[studentId] = {};
    studentProgress[studentId][lectureId] = true;
}

export function isLectureCompleted(studentId: string, lectureId: string) {
    return studentProgress[studentId]?.[lectureId] || false;
}

// ----- Optional Banner Helper -----
export function getLectureBannerPlacement() {
    return "Static banner at bottom of lecture";
}
