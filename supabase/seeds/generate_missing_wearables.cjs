const fs = require('fs');
const path = require('path');

const csvFile = path.join(__dirname, 'Digital Twin - Smart Health Parameter to Variable mapping.csv');
const outputFile = path.join(__dirname, '..', 'migrations', '20260228000003_seed_missing_wearables.sql');

const content = fs.readFileSync(csvFile, 'utf-8');
const lines = content.split('\n');

const missingParams = [];
for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV (comma separated)
    const parts = line.split(',');
    if (parts.length < 3) continue;

    const name = parts[2].trim();
    if (!name) continue;

    missingParams.push(name);
}

let sqlDef = `-- Migration: Seed Missing Wearable Parameters from CSV\n`;
sqlDef += `INSERT INTO public.health_parameter_definitions (id, name, category, unit, axis_impact_weights) VALUES\n`;

let sqlRanges = `INSERT INTO public.health_parameter_ranges (parameter_id, gender, min_age, max_age, normal_min, optimal_min, optimal_max, normal_max, critical_max) VALUES\n`;

const defVals = [];
const rangeVals = [];

const processedIds = new Set();

missingParams.forEach(name => {
    // Clean ID
    let cleanId = name.replace(/'/g, "''");

    if (processedIds.has(cleanId)) return;
    processedIds.add(cleanId);

    // Rough categorization based on name
    let category = 'Wearable';
    let unit = "'count'"; // default for indicators

    const lowerName = name.toLowerCase();

    if (lowerName.includes('indicator') || lowerName.includes('record')) {
        category = 'symptoms';
        unit = "'boolean'";
    } else if (lowerName.includes('sleep')) {
        category = 'sleep';
        if (lowerName.includes('duration') || lowerName.includes('time')) unit = "'min'";
        if (lowerName.includes('score') || lowerName.includes('quality') || lowerName.includes('%')) unit = "'%'";
        if (lowerName.includes('rate')) unit = "'bpm'";
        if (lowerName.includes('temperature')) unit = "'°C'";
    } else if (lowerName.includes('exercise') || lowerName.includes('distance') || lowerName.includes('calories') || lowerName.includes('step')) {
        category = 'activity';
        if (lowerName.includes('distance') || lowerName.includes('length')) unit = "'km'";
        if (lowerName.includes('calories') || lowerName.includes('energy')) unit = "'kcal'";
        if (lowerName.includes('duration') || lowerName.includes('minutes')) unit = "'min'";
        if (lowerName.includes('percentage') || lowerName.includes('%')) unit = "'%'";
    } else if (lowerName.includes('heart') || lowerName.includes('blood') || lowerName.includes('respiratory') || lowerName.includes('spo2')) {
        category = 'vitals';
        if (lowerName.includes('rate')) unit = "'bpm'";
        if (lowerName.includes('pressure')) unit = "'mmHg'";
        if (lowerName.includes('percentage') || lowerName.includes('%')) unit = "'%'";
    }

    // Rough weighting
    const weights = { energy: 0, strength: 0, mind: 0, resilience: 0, heart: 0, hormone: 0, environment: 0 };
    if (category === 'symptoms') weights.resilience = 2;
    if (category === 'sleep') { weights.mind = 2; weights.resilience = 1; weights.energy = 1; }
    if (category === 'activity') { weights.energy = 2; weights.strength = 1; weights.heart = 1; }
    if (category === 'vitals') { weights.heart = 2; weights.resilience = 1; }

    defVals.push(`('${cleanId}', '${cleanId}', 'Wearable - ${category}', ${unit}, '${JSON.stringify(weights)}'::jsonb)`);

    // Default range for all
    // Provide a full open range for these so they don't break normalization until actual data calibrates
    rangeVals.push(`('${cleanId}', 'ALL', 0, 120, NULL, NULL, NULL, NULL, NULL)`);
});

sqlDef += defVals.join(',\n') + `\nON CONFLICT DO NOTHING;\n\n`;
sqlDef += sqlRanges + rangeVals.join(',\n') + `\n;\n`;

fs.writeFileSync(outputFile, sqlDef);
console.log(`Successfully generated SQL for ${defVals.length} missing wearable parameters at ${outputFile}`);
