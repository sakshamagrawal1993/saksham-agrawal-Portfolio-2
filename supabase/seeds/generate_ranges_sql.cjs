const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'Common Lab Test with Loinc_2026 - Common Lab Test.csv');
const outputFile = path.join(__dirname, '..', 'migrations', '20260228000002_seed_health_ranges.sql');

if (!fs.existsSync(inputFile)) {
    console.error("CSV file not found:", inputFile);
    process.exit(1);
}

const content = fs.readFileSync(inputFile, 'utf-8');
const lines = content.split('\n');

let sql = `-- Migration: Seed Health Parameter Ranges\n`;
sql += `-- Auto-generated ranges grouped by age and gender\n\n`;
sql += `INSERT INTO public.health_parameter_ranges (parameter_id, gender, min_age, max_age, normal_min, optimal_min, optimal_max, normal_max, critical_max) VALUES\n`;

const values = [];

function parseCSVRow(row) {
    const parts = [];
    let currentPart = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"' && row[i + 1] === '"') {
            currentPart += '"';
            i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            parts.push(currentPart);
            currentPart = '';
        } else {
            currentPart += char;
        }
    }
    parts.push(currentPart);
    return parts;
}

// Age brackets
const AGE_BRACKETS = [
    { min: 0, max: 17, name: 'Child' },
    { min: 18, max: 59, name: 'Adult' },
    { min: 60, max: 120, name: 'Senior' }
];

// Determine parameter specific ranges roughly based on common medical knowledge
// If we don't know the exact range, we provide a default generic one so the engine doesn't break
function getRanges(id, name, ageBracket, gender) {
    const text = (name).toLowerCase();

    // Default fallback
    let normMin = 0;
    let optMin = 20;
    let optMax = 80;
    let normMax = 100;
    let critMax = 150;

    // HbA1c (%)
    if (text.includes('hba1c') || text.includes('glycated')) {
        normMin = 'NULL'; optMin = 4.0; optMax = 5.4; normMax = 5.7; critMax = 6.4;
    }
    // Fasting Glucose (mg/dL)
    else if (text.includes('glucose') && text.includes('fast')) {
        normMin = 70; optMin = 75; optMax = 85; normMax = 99; critMax = 125;
    }
    // Random Glucose
    else if (text.includes('glucose')) {
        normMin = 70; optMin = 75; optMax = 110; normMax = 140; critMax = 199;
    }
    // LDL
    else if (text.includes('ldl') && !text.includes('ratio')) {
        normMin = 'NULL'; optMin = 'NULL'; optMax = 100; normMax = 130; critMax = 160;
    }
    // HDL
    else if (text.includes('hdl') && !text.includes('ratio') && !text.includes('non')) {
        if (gender === 'M') {
            normMin = 40; optMin = 50; optMax = 'NULL'; normMax = 'NULL'; critMax = 'NULL';
        } else if (gender === 'F') {
            normMin = 50; optMin = 60; optMax = 'NULL'; normMax = 'NULL'; critMax = 'NULL';
        } else {
            normMin = 45; optMin = 55; optMax = 'NULL'; normMax = 'NULL'; critMax = 'NULL';
        }
    }
    // Total Cholesterol
    else if (text.includes('cholesterol') && !text.includes('hdl') && !text.includes('ldl')) {
        normMin = 'NULL'; optMin = 150; optMax = 200; normMax = 200; critMax = 240;
    }
    // Triglycerides
    else if (text.includes('triglyceride')) {
        normMin = 'NULL'; optMin = 'NULL'; optMax = 100; normMax = 150; critMax = 200;
    }
    // Testosterone (ng/dL) - Highly age/gender dependent
    else if (text.includes('testosterone')) {
        if (gender === 'M') {
            if (ageBracket.name === 'Adult') {
                normMin = 300; optMin = 500; optMax = 900; normMax = 1000; critMax = 'NULL';
            } else if (ageBracket.name === 'Senior') {
                normMin = 200; optMin = 400; optMax = 800; normMax = 900; critMax = 'NULL';
            } else {
                normMin = 30; optMin = 50; optMax = 200; normMax = 400; critMax = 'NULL';
            }
        } else if (gender === 'F') {
            normMin = 15; optMin = 30; optMax = 60; normMax = 70; critMax = 100;
        } else {
            normMin = 15; optMin = 50; optMax = 400; normMax = 500; critMax = 'NULL';
        }
    }
    // TSH
    else if (text.includes('tsh') || text.includes('thyrotropin')) {
        normMin = 0.4; optMin = 1.0; optMax = 2.5; normMax = 4.0; critMax = 10.0;
    }
    // Cortisol (morning)
    else if (text.includes('cortisol')) {
        normMin = 10; optMin = 12; optMax = 18; normMax = 20; critMax = 25;
    }
    // CRP (mg/L)
    else if (text.includes('crp') || text.includes('c-reactive')) {
        normMin = 'NULL'; optMin = 'NULL'; optMax = 1.0; normMax = 3.0; critMax = 10.0;
    }
    // Vitamin D
    else if (text.includes('vitamin d')) {
        normMin = 30; optMin = 50; optMax = 80; normMax = 100; critMax = 150;
    }
    // Hemoglobin
    else if (text === 'hemoglobin' || text.includes('hemoglobin (hb)')) {
        if (gender === 'M') {
            normMin = 13.8; optMin = 14.5; optMax = 16.5; normMax = 17.2; critMax = 18;
        } else if (gender === 'F') {
            normMin = 12.1; optMin = 13.0; optMax = 14.5; normMax = 15.1; critMax = 16;
        } else {
            normMin = 12.5; optMin = 13.5; optMax = 15.5; normMax = 16.5; critMax = 17;
        }
    }
    // AST / ALT
    else if (text.includes('ast') || text.includes('alt') || text.includes('sgot') || text.includes('sgpt')) {
        normMin = 'NULL'; optMin = 10; optMax = 25; normMax = 40; critMax = 80;
    }

    return { normMin, optMin, optMax, normMax, critMax };
}

// Keep track to avoid unique constraint on CSV duplicates
const processedIds = new Set();

for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = parseCSVRow(line);
    if (parts.length < 7) continue;

    const idNum = parts[0];
    const name = parts[1].replace(/'/g, "''").trim();
    const shortName = parts[4] ? parts[4].trim() : `custom-${idNum}`;
    const loinc = parts[5] ? parts[5].trim() : '';

    // Skip empty lines
    if (!name) continue;

    let id = (loinc && loinc !== '-' && loinc.length > 2) ? loinc : shortName;
    if (!id || id === '-') id = `param_${i}`;
    const cleanId = id.replace(/'/g, "''");

    if (processedIds.has(cleanId)) continue;
    processedIds.add(cleanId);

    // Is this gender specific?
    const isGenderSpecific = name.toLowerCase().includes('testosterone') || name.toLowerCase().includes('hdl') || name.toLowerCase().includes('hemoglobin');

    for (const ageBracket of AGE_BRACKETS) {
        if (isGenderSpecific) {
            // Generate for M and F
            ['M', 'F'].forEach(gender => {
                const ranges = getRanges(cleanId, name, ageBracket, gender);
                values.push(`('${cleanId}', '${gender}', ${ageBracket.min}, ${ageBracket.max}, ${ranges.normMin}, ${ranges.optMin}, ${ranges.optMax}, ${ranges.normMax}, ${ranges.critMax})`);
            });
        } else {
            // Generate for ALL
            const ranges = getRanges(cleanId, name, ageBracket, 'ALL');
            values.push(`('${cleanId}', 'ALL', ${ageBracket.min}, ${ageBracket.max}, ${ranges.normMin}, ${ranges.optMin}, ${ranges.optMax}, ${ranges.normMax}, ${ranges.critMax})`);
        }
    }
}

// 2. Add Wearable parameter ranges
const wearableRanges = [
    { id: 'Step Count', minAge: 0, maxAge: 120, gender: 'ALL', normMin: 5000, optMin: 8000, optMax: 15000, normMax: 'NULL', critMax: 'NULL' },
    { id: 'Active Minutes', minAge: 0, maxAge: 120, gender: 'ALL', normMin: 20, optMin: 45, optMax: 120, normMax: 'NULL', critMax: 'NULL' },
    { id: 'Resting Heart Rate', minAge: 18, maxAge: 120, gender: 'ALL', normMin: 50, optMin: 50, optMax: 65, normMax: 80, critMax: 100 },
    { id: 'Sleep Duration', minAge: 18, maxAge: 120, gender: 'ALL', normMin: 6.0, optMin: 7.5, optMax: 9.0, normMax: 10.0, critMax: 'NULL' },
    { id: 'Sleep Quality', minAge: 0, maxAge: 120, gender: 'ALL', normMin: 70, optMin: 85, optMax: 100, normMax: 100, critMax: 'NULL' },
    { id: 'Sleep Score', minAge: 0, maxAge: 120, gender: 'ALL', normMin: 70, optMin: 85, optMax: 100, normMax: 100, critMax: 'NULL' },
    { id: 'VO2 Max', minAge: 18, maxAge: 59, gender: 'M', normMin: 35, optMin: 45, optMax: 60, normMax: 65, critMax: 'NULL' },
    { id: 'VO2 Max', minAge: 18, maxAge: 59, gender: 'F', normMin: 27, optMin: 36, optMax: 50, normMax: 55, critMax: 'NULL' },
    { id: 'VO2 Max', minAge: 60, maxAge: 120, gender: 'M', normMin: 25, optMin: 35, optMax: 45, normMax: 50, critMax: 'NULL' },
    { id: 'VO2 Max', minAge: 60, maxAge: 120, gender: 'F', normMin: 20, optMin: 28, optMax: 40, normMax: 45, critMax: 'NULL' },
];

for (const p of wearableRanges) {
    values.push(`('${p.id}', '${p.gender}', ${p.minAge}, ${p.maxAge}, ${p.normMin}, ${p.optMin}, ${p.optMax}, ${p.normMax}, ${p.critMax})`);
}

sql += values.join(',\n');
sql += `\n;\n`;

fs.writeFileSync(outputFile, sql);
console.log(`Successfully generated SQL with ${values.length} records at ${outputFile}`);
