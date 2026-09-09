import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { supabase, unwrap } from '../db/client.js';
import { saveFile } from './storage.js';

const downloads = 'C:/Users/ABHINAV TEJA/Downloads';

export const suppliedProgrammeMaterials = [
  ['Summer Internship Course Guidelines.docx', 'Summer Internship Course Guidelines', 'guideline', 'all'],
  ['Project Report Format (1).docx', 'Project Report Format', 'format', 'all'],
  ['JOINING REPORT SIP 2026.docx', 'Joining Report — SIP 2026', 'sample', 'all'],
  ['Internship Completion Certificate (1).docx', 'Internship Completion Certificate', 'sample', 'all'],
  ['Weekly Diary report for CSC students.docx', 'Weekly Diary Report', 'format', 'all'],
  ['Synopsis Format.docx', 'Synopsis Format', 'format', 'all'],
  ['Mid Sem PPT Help.pptx', 'Mid-semester Presentation Help', 'sample', 'all'],
  ['Rubrics for final assessment.docx', 'Rubrics for Final Assessment', 'rubric', 'all'],
];

const suppliedReportRequirements = [
  ['Joining Report', 'Joining Report — SIP 2026', 0, 'Submit within one week of joining, with the required industry and faculty mentor certificates.'],
  ['Weekly Diary Report', 'Weekly Diary Report', 0, 'Submit the weekly diary report to the faculty mentor and copy the industry mentor.'],
  ['Synopsis', 'Synopsis Format', 0, 'Submit the synopsis in the prescribed format: objective, background, methodology, findings, analysis and conclusion.'],
  ['Mid-semester Presentation', 'Mid-semester Presentation Help', 0, 'Submit the prescribed mid-semester presentation covering the project context, progress, methodology and results.'],
  ['Final Project Report', 'Project Report Format', 20, 'Submit the final project report in the prescribed format. This component is assessed out of 20.'],
  ['End-semester Presentation & Viva', 'Rubrics for Final Assessment', 50, 'Complete the final presentation and viva. This component is assessed out of 50.'],
  ['Internship Completion Certificate', 'Internship Completion Certificate', 0, 'Submit the completed internship certificate in the prescribed format.'],
];

export async function publishSuppliedProgrammeMaterials(adminId) {
  const results = [];
  for (const [fileName, title, category, audience] of suppliedProgrammeMaterials) {
    const existing = unwrap(await supabase.from('programme_documents').select('id').eq('title', title).maybeSingle());
    if (existing) { results.push({ title, status: 'already_published', id: existing.id }); continue; }
    const buffer = await readFile(path.join(downloads, fileName));
    const { filePath } = await saveFile({ buffer, originalName: fileName, ownerId: adminId });
    const [document] = unwrap(await supabase.from('programme_documents').insert({
      title, category, audience, file_path: filePath, file_name: fileName, uploaded_by: adminId,
    }).select());
    results.push({ title, status: 'published', id: document.id });
  }
  return results;
}

export async function ensureSuppliedReportRequirements(adminId) {
  const documents = unwrap(await supabase.from('programme_documents').select('id,title').in('title', suppliedReportRequirements.map(([, title]) => title)));
  const documentByTitle = new Map(documents.map((document) => [document.title, document.id]));
  const existing = unwrap(await supabase.from('report_requirements').select('title,sort_order'));
  const existingTitles = new Set(existing.map((requirement) => requirement.title));
  let sortOrder = Math.max(-1, ...existing.map((requirement) => Number(requirement.sort_order) || 0)) + 1;
  const results = [];
  for (const [title, guidanceTitle, maxMarks, description] of suppliedReportRequirements) {
    if (existingTitles.has(title)) { results.push({ title, status: 'already_created' }); continue; }
    const guidanceDocumentId = documentByTitle.get(guidanceTitle);
    if (!guidanceDocumentId) throw new Error(`The guidance document for “${title}” is not published.`);
    const [template] = unwrap(await supabase.from('report_templates').insert({
      name: title, track: null, is_default: false, created_by: adminId,
    }).select());
    const [requirement] = unwrap(await supabase.from('report_requirements').insert({
      report_template_id: template.id, title, track: null, description, max_marks: maxMarks,
      is_required: true, guidance_document_id: guidanceDocumentId, sort_order: sortOrder++, created_by: adminId,
    }).select());
    results.push({ title, status: 'created', id: requirement.id });
  }
  return results;
}
