import fs from 'fs';
import path from 'path';

const stepsDir = '/Users/sakshamagrawal/Documents/Projects/saksham-agrawal-Portfolio-2/components/UnityCard/Steps';
const files = [
  'OfferStep.tsx',
  'EmploymentStep.tsx',
  'BillingStep.tsx',
  'AadhaarStep.tsx',
  'AddressStep.tsx',
  'VideoKycStep.tsx',
  'CustomizationStep.tsx',
];

for (const file of files) {
  const filePath = path.join(stepsDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Add import if missing
  if (!content.includes('StepIllustration')) {
    content = content.replace(/(import .*?;)/g, (match, p1) => {
      return p1;
    });
    const lastImportIndex = content.lastIndexOf('import ');
    const endOfLastImport = content.indexOf(';', lastImportIndex) + 1;
    content = content.substring(0, endOfLastImport) + "\nimport StepIllustration from '../StepIllustration';" + content.substring(endOfLastImport);
  }

  // Common replacements
  content = content.replace(/max-w-md/g, 'max-w-sm');
  content = content.replace(/text-3xl font-black mb-2 text-\[#2C2A26\]/g, 'text-2xl font-bold mb-1 text-[#2C2A26] font-serif');
  content = content.replace(/text-\[#2C2A26\]\/70 font-medium/g, 'text-gray-500 font-medium text-sm');
  
  // Replace inputs & labels
  content = content.replace(/block text-sm font-bold text-\[#2C2A26\]\/70 mb-2/g, 'block text-sm font-medium text-gray-500 mb-1.5');
  content = content.replace(/pl-12 pr-4 py-4 border-2 border-\[#D6D1C7\] rounded-2xl bg-\[#F5F2EB\] text-\[#2C2A26\] placeholder-\[#2C2A26\]\/40 focus:outline-none focus:ring-2 focus:ring-\[#0070F3\] focus:border-transparent transition-all font-medium text-lg/g, 'pl-10 pr-4 py-3.5 border border-[#E5E0D8] rounded-xl bg-[#F8F6F0] text-[#2C2A26] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3] transition-all font-medium text-base');
  
  // Replace button
  content = content.replace(/w-full bg-\[#2C2A26\] text-\[#F5F2EB\] font-bold py-4 rounded-xl hover:bg-black transition-all transform hover:-translate-y-1 shadow-md mt-8/g, 'w-full bg-[#2C2A26] text-white font-semibold py-4 rounded-xl hover:bg-black transition-all mt-6 shadow-sm');
  
  fs.writeFileSync(filePath, content);
  console.log('Updated ' + file);
}
