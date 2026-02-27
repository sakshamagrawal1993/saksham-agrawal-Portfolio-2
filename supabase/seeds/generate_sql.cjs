const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'Common Lab Test with Loinc_2026 - Common Lab Test.csv');
const outputFile = path.join(__dirname, '..', 'migrations', '20260228000001_seed_health_parameters.sql');

if (!fs.existsSync(inputFile)) {
    console.error("CSV file not found:", inputFile);
    process.exit(1);
}

const content = fs.readFileSync(inputFile, 'utf-8');
const lines = content.split('\n');

let sql = `-- Migration: Seed Health Parameter Definitions\n`;
sql += `-- Auto-generated from raw lab tabular data and wearable parameters\n\n`;
sql += `INSERT INTO public.health_parameter_definitions (id, name, category, unit, axis_impact_weights) VALUES\n`;

const values = [];

// Helper to determine axis weights roughly based on keywords
function getWeights(name, component) {
    const text = (name + " " + component).toLowerCase();
    const weights = { energy: 0, strength: 0, mind: 0, resilience: 0, heart: 0, hormone: 0, environment: 0 };

    if (text.includes('cholesterol') || text.includes('triglyceride') || text.includes('lipid') || text.includes('hdl') || text.includes('ldl') || text.includes('apolipoprotein')) {
        weights.heart = 3; weights.resilience = 1;
    } else if (text.includes('glucose') || text.includes('hba1c') || text.includes('insulin') || text.includes('c-peptide')) {
        weights.energy = 3; weights.heart = 1; weights.resilience = 1;
    } else if (text.includes('testosterone') || text.includes('thyroid') || text.includes('tsh') || text.includes('t3') || text.includes('t4') || text.includes('cortisol') || text.includes('progesterone') || text.includes('estradiol') || text.includes('dhea') || text.includes('lh') || text.includes('fsh')) {
        weights.hormone = 3; weights.energy = 1; weights.mind = 1;
    } else if (text.includes('bilirubin') || text.includes('sgot') || text.includes('sgpt') || text.includes('ast') || text.includes('alt') || text.includes('crp') || text.includes('ggt') || text.includes('wbc') || text.includes('leukocyte') || text.includes('neutrophil')) {
        weights.resilience = 3; weights.energy = 1;
    } else if (text.includes('calcium') || text.includes('protein') || text.includes('albumin') || text.includes('globulin') || text.includes('creatinine') || text.includes('uric') || text.includes('bun')) {
        weights.strength = 2; weights.resilience = 1;
    } else if (text.includes('iron') || text.includes('ferritin') || text.includes('b12') || text.includes('folate') || text.includes('vitamin d') || text.includes('magnesium')) {
        weights.mind = 2; weights.energy = 2; weights.strength = 1;
    } else if (text.includes('lead') || text.includes('mercury') || text.includes('arsenic') || text.includes('cadmium')) {
        weights.environment = 3; weights.resilience = 2;
    } else {
        weights.resilience = 1; // Default
    }

    return JSON.stringify(weights);
}

// 1. Process CSV Lab Parameters
// We need a proper CSV parser because values might have commas inside quotes.
function parseCSVRow(row) {
    const parts = [];
    let currentPart = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"' && row[i + 1] === '"') {
            currentPart += '"';
            i++; // skip escaped quote
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

// Skip header (row 0)
for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = parseCSVRow(line);
    if (parts.length < 7) continue;

    const idNum = parts[0];
    const name = parts[1].replace(/'/g, "''").trim();
    const longName = parts[2] ? parts[2].trim() : '';
    const shortName = parts[4] ? parts[4].trim() : `custom-${idNum}`;
    const loinc = parts[5] ? parts[5].trim() : '';
    const component = parts[6] ? parts[6].replace(/'/g, "''").trim() : '';

    // Skip empty lines
    if (!name && !component) continue;

    // Use LOINC if available, fallback to shortname
    let id = (loinc && loinc !== '-' && loinc.length > 2) ? loinc : shortName;
    if (!id || id === '-') id = `param_${i}`;
    const cleanId = id.replace(/'/g, "''");

    // Basic unit detection from long name e.g. [Mass/volume]
    let unit = 'NULL';
    if (longName.includes('Cnc]')) unit = "'concentration'";
    if (longName.includes('[Mass/volume]')) {
        if (textIncludes(longName, 'mg/dL')) unit = "'mg/dL'";
        else if (textIncludes(longName, 'g/dL')) unit = "'g/dL'";
    } else if (longName.includes('[Moles/volume]')) {
        unit = "'mmol/L'";
    } else if (longName.includes('[Enzymatic activity/volume]')) {
        unit = "'U/L'";
    } else if (name.includes('%')) {
        unit = "'%'";
    }

    function textIncludes(str, snippet) {
        return str.toLowerCase().includes(snippet.toLowerCase());
    }

    const weights = getWeights(name, component);

    // Add to values if not a duplicate
    const row = `('${cleanId}', '${name}', '${component}', ${unit}, '${weights}'::jsonb)`;
    if (!values.find(v => v.startsWith(`('${cleanId}'`))) {
        values.push(row);
    }
}

// 2. Process Known Wearable Parameters
const wearableParams = [
    { id: 'Step Count', category: 'activity', unit: "'steps'" },
    { id: 'Active Calories Burnt', category: 'activity', unit: "'kcal'" },
    { id: 'Active Minutes', category: 'activity', unit: "'min'" },
    { id: 'Horizontal Distance Covered', category: 'activity', unit: "'km'" },
    { id: 'Vertical Elevation Gained', category: 'activity', unit: "'m'" },
    { id: 'Total Daily Calories Burned', category: 'activity', unit: "'kcal'" },
    { id: 'Daily Step Goal', category: 'activity', unit: "'steps'" },
    { id: 'Basal Metabolic Rate', category: 'activity', unit: "'kcal'" },
    { id: 'Heart Rate', category: 'vitals', unit: "'bpm'", heartWg: 3, energyWg: 1 },
    { id: 'Resting Heart Rate', category: 'vitals', unit: "'bpm'", heartWg: 3, resilienceWg: 2 },
    { id: 'Walking Heart Rate', category: 'vitals', unit: "'bpm'", heartWg: 2, energyWg: 2 },
    { id: 'Heart Rate Recovery', category: 'vitals', unit: "'bpm'", heartWg: 3, strengthWg: 2 },
    { id: 'Blood Pressure Systolic', category: 'vitals', unit: "'mmHg'", heartWg: 3, stressWg: 1 },
    { id: 'Blood Pressure Diastolic', category: 'vitals', unit: "'mmHg'", heartWg: 3, stressWg: 1 },
    { id: 'Body Temperature', category: 'vitals', unit: "'°C'", resilienceWg: 3 },
    { id: 'SPO2 Percentage', category: 'vitals', unit: "'%'", energyWg: 3, heartWg: 2 },
    { id: 'Respiratory Rate', category: 'vitals', unit: "'breaths/min'", energyWg: 2, resilienceWg: 1 },
    { id: 'Atrial Fibrillation Burden', category: 'vitals', unit: "'%'", heartWg: 3, resilienceWg: 2 },
    { id: 'Blood Glucose Record', category: 'vitals', unit: "'mg/dL'", energyWg: 3 },
    { id: 'Exercise Duration', category: 'exercise', unit: "'min'" },
    { id: 'Exercise Calories', category: 'exercise', unit: "'kcal'" },
    { id: 'Exercise Length', category: 'exercise', unit: "'km'" },
    { id: 'Exercise % Time in HR Zone 1', category: 'exercise', unit: "'%'" },
    { id: 'Exercise % Time in HR Zone 2', category: 'exercise', unit: "'%'" },
    { id: 'Exercise % Time in HR Zone 3', category: 'exercise', unit: "'%'" },
    { id: 'Exercise % Time in HR Zone 4', category: 'exercise', unit: "'%'" },
    { id: 'Exercise % Time in HR Zone 5', category: 'exercise', unit: "'%'" },
    { id: 'VO2 Max', category: 'exercise', unit: "'mL/kg/min'", energyWg: 3, strengthWg: 3, heartWg: 1 },
    { id: 'Sleep Duration', category: 'sleep', unit: "'hours'", mindWg: 3, resilienceWg: 2, energyWg: 2 },
    { id: 'Sleep Quality', category: 'sleep', unit: "'%'", mindWg: 3, resilienceWg: 2 },
    { id: 'Sleep Score', category: 'sleep', unit: "'score'", mindWg: 3, resilienceWg: 2 },
    { id: 'Sleep Average Heart Rate', category: 'sleep', unit: "'bpm'" },
    { id: 'Sleep Average Respiratory Rate', category: 'sleep', unit: "'breaths/min'" },
    { id: 'Sleep Skin Temperature Max', category: 'sleep', unit: "'°C'" },
    { id: 'Sleep Skin Temperature Min', category: 'sleep', unit: "'°C'" },
    { id: 'Sleep Average SPO2', category: 'sleep', unit: "'%'" },
    { id: 'Sleep Min SPO2', category: 'sleep', unit: "'%'" },
    { id: 'Sleep Minutes Low Oxygen', category: 'sleep', unit: "'min'" },
    { id: 'Sleep Total Snoring Time', category: 'sleep', unit: "'min'" }
];

for (const p of wearableParams) {
    // Wearables usually map to strength, energy, mind, and resilience depending on tracking
    const weights = {
        energy: p.energyWg || 2,
        strength: p.strengthWg || 1,
        mind: p.mindWg || 0,
        resilience: p.resilienceWg || 1,
        heart: p.heartWg || 0,
        hormone: 0,
        environment: 0
    };

    const row = `('${p.id}', '${p.id}', 'Wearable - ${p.category}', ${p.unit}, '${JSON.stringify(weights)}'::jsonb)`;
    values.push(row);
}

sql += values.join(',\n');
sql += `\nON CONFLICT (id) DO UPDATE SET \n`;
sql += `    name = EXCLUDED.name,\n`;
sql += `    category = EXCLUDED.category,\n`;
sql += `    unit = EXCLUDED.unit,\n`;
sql += `    axis_impact_weights = EXCLUDED.axis_impact_weights;\n`;

fs.writeFileSync(outputFile, sql);
console.log(`Successfully generated SQL with ${values.length} records at ${outputFile}`);
