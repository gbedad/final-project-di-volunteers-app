// Builds the form of the family convention ("Convention d'engagement
// réciproque … bénéficiaire") from the team's .docx: LibreOffice turns it into
// a PDF, the coloured placeholders and printed boxes are hidden, named fields
// are added at their places (positions measured on the 2026-2027 text: a new
// text means measuring again).
//   node scripts/build-family-convention-form.mjs "<file>.docx|.odt"
//   -> assets/convention-beneficiaire.pdf
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const here = path.dirname(fileURLToPath(import.meta.url));
const docx = process.argv[2];
if (!docx) throw new Error('Usage: node scripts/build-family-convention-form.mjs <file>.docx');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'convention-'));
const source = path.join(tmp, `conv${path.extname(docx) || '.docx'}`);
fs.copyFileSync(docx, source);
execFileSync('soffice', ['--headless', '--convert-to', 'pdf:writer_pdf_Export:{"ExportFormFields":{"type":"boolean","value":"false"}}', '--outdir', tmp, source]);
const pdf = await PDFDocument.load(fs.readFileSync(path.join(tmp, 'conv.pdf')));
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const form = pdf.getForm();
const pages = pdf.getPages();
const H = pages[0].getHeight();
const white = (p, x1, top, x2, bottom) => pages[p].drawRectangle({ x: x1, y: H - bottom, width: x2 - x1, height: bottom - top, color: rgb(1, 1, 1) });
// Text field over a zone given top-left/bottom-right (pdftotext coordinates)
const text = (name, p, x1, top, x2, bottom, { multiline = false, hide = true } = {}) => {
  if (hide) white(p, x1 - 1, top - 0.5, x2 + 1, bottom + 0.5);
  const f = form.createTextField(name);
  if (multiline) f.enableMultiline();
  f.addToPage(pages[p], { x: x1, y: H - bottom, width: x2 - x1, height: bottom - top, font, borderWidth: 0, borderColor: rgb(1, 1, 1), backgroundColor: rgb(1, 1, 1) });
  f.setFontSize(multiline ? 9 : 10);
};
const box = (name, p, x, top) => {
  white(p, x - 0.8, top - 0.8, x + 10.3, top + 10.3);
  const c = form.createCheckBox(name);
  c.addToPage(pages[p], { x, y: H - top - 9.5, width: 9.5, height: 9.5, borderWidth: 0.8, borderColor: rgb(0, 0, 0) });
};
// ---- Page 1: the family ----
text('nom_responsable', 0, 70.9, 270.5, 244, 284.5);
text('adresse', 0, 298, 272.0, 525, 284.0);
text('telephone', 0, 283.3, 286.4, 525, 300.0);
text('email', 0, 283.3, 301.9, 525, 315.5);
text('nom_eleve', 0, 283.3, 317.4, 525, 331.0);
text('classe', 0, 138.0, 334.0, 280, 346.0);
text('etablissement', 0, 377.0, 334.0, 525, 346.0);
text('quotient_familial', 0, 283.3, 348.4, 430, 362.0);
// What the association looks for
box('presentiel', 0, 108.0, 405.0);
box('distanciel', 0, 108.0, 420.0);
box('autre_coche', 0, 108.0, 435.5);
text('autre_texte', 0, 162.0, 432.8, 525, 446.4, { hide: false });
// Specific obligations (the dotted lines)
text('obligations', 0, 77.0, 496.9, 521, 556.2, { multiline: true });
text('lieu', 0, 216.0, 573.7, 525, 585.0, { hide: false });
text('horaire', 0, 230.0, 586.8, 525, 598.0, { hide: false });
// Consents and payments
box('consentement_utilisation', 0, 78.5, 611.5);
box('consentement_conservation', 0, 78.5, 637.0);
box('cotisation', 0, 78.5, 650.5);
box('participation', 0, 78.5, 676.0);
box('participation_annee', 0, 107.5, 690.5);
text('montant_annee', 0, 133.5, 689.7, 169.5, 700.9);
box('participation_trimestre', 0, 107.5, 706.0);
text('montant_trimestre', 0, 133.5, 705.2, 169.5, 716.4);
box('caution', 0, 78.5, 720.5);
text('caution_montant', 0, 201.0, 719.4, 300, 730.6, { hide: false });
box('caution_especes', 0, 107.5, 734.5);
box('caution_cheque', 0, 107.5, 750.0);
box('venir_seul', 0, 78.5, 777.5);
box('venir_seul_oui', 0, 107.5, 792.0);
box('venir_seul_non', 0, 107.5, 807.5);
// ---- Page 2: leaving, signatures ----
box('partir', 1, 78.5, 37.0);
box('partir_seul', 1, 107.5, 51.5);
box('partir_accompagne', 1, 107.5, 67.0);
// "Accompagné par" kept, the names in the field
white(1, 206, 64.5, 380, 78.5);
text('accompagnants', 1, 207.0, 64.7, 525, 78.3, { hide: false });
box('partir_cherche', 1, 107.5, 82.5);
box('commissariat', 1, 78.5, 97.0);
text('fait_a', 1, 346.0, 136.2, 372.5, 147.4);
text('date_signature', 1, 387.0, 136.2, 525, 147.4);
// Signatures (drawn by the server under these labels)
const p2 = pages[1];
p2.drawText('Le représentant légal :', { x: 80, y: H - 180, size: 10, font: bold });
p2.drawText('Pour l’association, la Présidente :'.replace('’', "'"), { x: 330, y: H - 180, size: 10, font: bold });
const out = path.join(here, '../assets/convention-beneficiaire.pdf');
fs.writeFileSync(out, await pdf.save());
console.log(`${form.getFields().length} champs -> ${out}`);
