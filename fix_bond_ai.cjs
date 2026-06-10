const fs = require('fs');
const path = 'supabase/functions/ai-care-proxy/index.ts';
let code = fs.readFileSync(path, 'utf8');

const patch = `
        let parsedOutput = diagData;
        if (typeof diagData.output === 'string') {
           try {
              parsedOutput = JSON.parse(diagData.output);
           } catch(e) {
              const match = diagData.output.match(/\\\`\\\`\\\`json\\n([\\s\\S]*?)\\n\\\`\\\`\\\`/);
              if (match) {
                 try { parsedOutput = JSON.parse(match[1]); } catch(e2) {}
              }
           }
        } else if (diagData.output && typeof diagData.output === 'object') {
           parsedOutput = diagData.output;
        }
        
        diagData = parsedOutput;

        let confScore = 0;`;

code = code.replace('let confScore = 0;', patch);
fs.writeFileSync(path, code);
