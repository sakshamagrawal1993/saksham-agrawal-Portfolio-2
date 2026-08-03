import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';

const artifactDir = '/Users/sakshamagrawal/.gemini/antigravity-ide/brain/50562776-5294-498e-9bc4-10a70349dfe4';
const logoPath = '/Users/sakshamagrawal/Documents/Projects/saksham-agrawal-Portfolio-2/public/images/libertymd-logo-mark.png';

async function generateSamplePdf() {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  // 1. Solid Blue Header Banner (#3B71CA = RGB 59, 113, 202)
  const bannerHeight = 82;
  pdf.setFillColor(59, 113, 202);
  pdf.rect(margin, y, maxWidth, bannerHeight, 'F');

  // Top Left: Liberty MD & LibertyMD.ai
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Liberty MD', margin + 16, y + 28);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(230, 242, 255);
  pdf.text('LibertyMD.ai', margin + 16, y + 42);

  // Top Right: Emblem Logo
  if (fs.existsSync(logoPath)) {
    const logoBuffer = fs.readFileSync(logoPath);
    const logoBase64 = logoBuffer.toString('base64');
    pdf.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', pageWidth - margin - 48, y + 10, 36, 42);
  }

  // Bottom Center: Physician Ready Report Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Physician Ready Report', margin + maxWidth / 2, y + 66, { align: 'center' });

  y += bannerHeight + 12;

  // 2. Patient Metadata Section
  pdf.setDrawColor('#CBD5E1');
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 14;

  // Row 1: Name & Date
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor('#475569');
  pdf.text('PATIENT NAME:', margin + 4, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor('#111827');
  pdf.text('John Doe', margin + 92, y);

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor('#475569');
  pdf.text('DATE:  2026-08-03', pageWidth - margin - 4, y, { align: 'right' });
  y += 14;

  // Row 2: Gender & Age & Ref No
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor('#475569');
  pdf.text('GENDER:', margin + 4, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor('#111827');
  pdf.text('Male', margin + 54, y);

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor('#475569');
  pdf.text('AGE:', margin + 130, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor('#111827');
  pdf.text('34', margin + 158, y);

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor('#475569');
  pdf.text('REF NO.:  [4c48a99f]', pageWidth - margin - 4, y, { align: 'right' });
  y += 12;

  // Hairline bottom rule
  pdf.setDrawColor('#CBD5E1');
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 16;

  // Legal / Disclaimer Banner
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor('#64748B');
  pdf.text('Generated: 2026-08-03 · AI-generated clinical summary — not a diagnosis · No licensed clinician review', margin + 4, y);
  y += 16;

  // 3. SESSION SUMMARY
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#1E3A8A');
  pdf.text('SESSION SUMMARY', margin, y);
  y += 14;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor('#111827');
  pdf.text('Patient Symptoms:', margin + 6, y);
  pdf.setFont('helvetica', 'normal');
  const symLines = pdf.splitTextToSize('High fever (102 F), severe body aches, dry cough, sore throat, and extreme fatigue for 2 days.', maxWidth - 110);
  pdf.text(symLines, margin + 105, y);
  y += symLines.length * 12 + 2;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Primary Differential:', margin + 6, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Influenza / Flu (high confidence). Secondary: COVID-19, Acute Viral Bronchitis.', margin + 110, y);
  y += 14;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Further Investigations:', margin + 6, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Rapid Influenza & COVID-19 Antigen Test; Complete Blood Count (CBC).', margin + 120, y);
  y += 20;

  // 4. PATIENT SUMMARY
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#1E3A8A');
  pdf.text('PATIENT SUMMARY', margin, y);
  y += 14;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor('#334155');
  const patLines = pdf.splitTextToSize('The patient is a 34-year-old male presenting with a 2-day history of acute onset high fever (102 F), non-productive cough, intense generalized myalgias, severe fatigue, and sore throat. Reports recent close contact with an ill coworker. Denies shortness of breath, chest tightness, or neck stiffness.', maxWidth);
  pdf.text(patLines, margin, y);
  y += patLines.length * 13 + 14;

  // 5. DIFFERENTIAL DIAGNOSIS
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#1E3A8A');
  pdf.text('DIFFERENTIAL DIAGNOSIS', margin, y);
  y += 14;

  const dxItems = [
    { title: '1. Influenza (Flu)', confidence: 'High Confidence (85%)', desc: 'Acute viral infection with characteristic triad of sudden fever, severe myalgias, and dry cough.' },
    { title: '2. COVID-19 (SARS-CoV-2)', confidence: 'Medium Confidence (65%)', desc: 'Viral respiratory syndrome presenting with overlapping fever, sore throat, and cough.' },
    { title: '3. Acute Viral Bronchitis', confidence: 'Low Confidence (45%)', desc: 'Lower respiratory tract inflammation causing prominent cough and low-grade systemic symptoms.' },
  ];

  for (const dx of dxItems) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor('#1E293B');
    pdf.text(`${dx.title} — ${dx.confidence}`, margin, y);
    y += 12;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor('#475569');
    const dLines = pdf.splitTextToSize(dx.desc, maxWidth - 10);
    pdf.text(dLines, margin + 10, y);
    y += dLines.length * 12 + 6;
  }
  y += 10;

  // 6. RECOMMENDED ACTION PLAN
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#1E3A8A');
  pdf.text('RECOMMENDED ACTION PLAN', margin, y);
  y += 14;

  const planBullets = [
    '1. Arrange an evaluation with a licensed clinician',
    '2. Do a test for Covid 19',
    '3. Avoid contact with ppl outside',
    '4. Stay at home',
  ];

  for (const bullet of planBullets) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor('#0F172A');
    pdf.text(bullet, margin + 6, y);
    y += 14;
  }
  y += 10;

  // 7. RED FLAGS TO WATCH
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#991B1B');
  pdf.text('RED FLAGS — WHEN TO SEEK IMMEDIATE CARE', margin, y);
  y += 14;

  const redFlags = [
    '• Shortness of breath or difficulty breathing at rest',
    '• Persistent chest pain or pressure',
    '• Confusion, extreme lethargy, or inability to stay awake',
    '• High fever (>103 F) unresponsive to antipyretics',
  ];

  for (const rf of redFlags) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor('#7F1D1D');
    pdf.text(rf, margin + 6, y);
    y += 13;
  }

  // Save PDF to artifact directory
  const pdfPath = path.join(artifactDir, 'sample_fever_cough_report.pdf');
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log(`PDF saved successfully to: ${pdfPath}`);
}

generateSamplePdf().catch(console.error);
