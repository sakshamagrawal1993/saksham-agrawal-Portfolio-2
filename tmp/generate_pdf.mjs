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
  const bannerHeight = 80;
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

  const SECTION_SPACING_PT = 18;

  // 3. SESSION SUMMARY
  y += SECTION_SPACING_PT;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#1E3A8A');
  pdf.text('Session Summary', margin, y);
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
  pdf.text('Influenza / Flu (High Confidence). Secondary: COVID-19, Acute Viral Bronchitis.', margin + 110, y);
  y += 14;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Further Investigations:', margin + 6, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Rapid Influenza & COVID-19 Antigen Test; Complete Blood Count (CBC).', margin + 120, y);
  y += 6;

  // 4. PATIENT SUMMARY
  y += SECTION_SPACING_PT;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#1E3A8A');
  pdf.text('Patient Summary', margin, y);
  y += 14;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor('#334155');
  const patLines = pdf.splitTextToSize('The patient is a 34-year-old male presenting with a 2-day history of acute onset high fever (102 F), non-productive cough, intense generalized myalgias, severe fatigue, and sore throat. Reports recent close contact with an ill coworker. Denies shortness of breath, chest tightness, or neck stiffness.', maxWidth);
  pdf.text(patLines, margin, y);
  y += patLines.length * 13 + 6;

  // 5. DIFFERENTIAL DIAGNOSIS (NO numeric score against confidence!)
  y += SECTION_SPACING_PT;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#1E3A8A');
  pdf.text('Differential Diagnosis', margin, y);
  y += 14;

  const dxItems = [
    { title: '1. Influenza (Flu)', confidence: 'High Confidence', desc: 'Acute viral infection with characteristic triad of sudden fever, severe myalgias, and dry cough.' },
    { title: '2. COVID-19 (SARS-CoV-2)', confidence: 'Medium Confidence', desc: 'Viral respiratory syndrome presenting with overlapping fever, sore throat, and cough.' },
    { title: '3. Acute Viral Bronchitis', confidence: 'Low Confidence', desc: 'Lower respiratory tract inflammation causing prominent cough and low-grade systemic symptoms.' },
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

  // 6. RECOMMENDED ACTION PLAN
  y += SECTION_SPACING_PT;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#1E3A8A');
  pdf.text('Recommended Action Plan', margin, y);
  y += 14;

  const planBullets = [
    '• Arrange an evaluation with a licensed clinician',
    '• Do a test for Covid 19',
    '• Avoid contact with ppl outside',
    '• Stay at home',
  ];

  for (const bullet of planBullets) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor('#0F172A');
    pdf.text(bullet, margin + 6, y);
    y += 14;
  }

  // 7. RED FLAGS
  y += SECTION_SPACING_PT;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#991B1B');
  pdf.text('Red Flags', margin, y);
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

  // 8. SOAP NOTE
  y += SECTION_SPACING_PT;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor('#1E3A8A');
  pdf.text('SOAP Note', margin, y);
  y += 14;

  const soapLines = [
    'Subjective: 34M with 2-day fever (102F), dry cough, myalgias, sore throat. Exposure to sick coworker.',
    'Objective: T 102F, RR 18, SpO2 98% room air. No respiratory distress.',
    'Assessment: Likely Influenza A/B vs COVID-19 infection.',
    'Plan: Clinical evaluation, COVID-19 antigen test, supportive self-care, isolation.',
  ];

  for (const sLine of soapLines) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor('#334155');
    const wrapped = pdf.splitTextToSize(sLine, maxWidth - 10);
    pdf.text(wrapped, margin + 6, y);
    y += wrapped.length * 12 + 4;
  }

  // 9. FOOTER DISCLAIMER AT BOTTOM OF PAGE
  pdf.setDrawColor('#CBD5E1');
  pdf.setLineWidth(0.5);
  pdf.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor('#64748B');
  pdf.text('AI-generated clinical summary — not a diagnosis · For licensed clinician review', margin, pageHeight - 16);
  pdf.text('Page 1', pageWidth - margin, pageHeight - 16, { align: 'right' });

  // Save PDF
  const pdfPath = path.join(artifactDir, 'sample_fever_cough_report.pdf');
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log(`PDF saved successfully to: ${pdfPath}`);
}

generateSamplePdf().catch(console.error);
