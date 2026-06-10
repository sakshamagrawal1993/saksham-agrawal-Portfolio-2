const fs = require('fs');
let content = fs.readFileSync('supabase/functions/ai-care-proxy/index.ts', 'utf-8');
content = content.replace(/confScore >= 90/, 'confScore >= 95');
fs.writeFileSync('supabase/functions/ai-care-proxy/index.ts', content);
