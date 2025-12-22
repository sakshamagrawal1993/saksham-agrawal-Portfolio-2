
import { createClient } from '@supabase/supabase-js';


const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const article = {
  title: 'The Agentic Shift: A Comprehensive Framework for AI Product Life Cycle Management',
  date: 'December 2025',
  excerpt: 'The discipline of Product Life Cycle Management (PLM) is currently undergoing its most significant transformation since the advent of Agile methodology.',
  image: '/journal/ai-lifecycle.png',
  content: `
    <p class="mb-6 text-[#5D5A53]">The discipline of Product Life Cycle Management (PLM) is currently undergoing its most significant transformation since the advent of Agile methodology. For decades, software development has been predicated on deterministic logic: defined inputs producing predictable outputs through explicitly coded pathways. However, the integration of Large Language Models (LLMs) and the rise of Agentic AI have introduced a fundamental phase transition. We are moving from a regime of explicit instruction to one of probabilistic intent, where software does not merely execute commands but perceives, reasons, and acts to achieve high-level goals.</p>

    <p class="mb-8 text-[#5D5A53]">This shift necessitates a complete reimagining of the product lifecycle. In this new paradigm, the product is no longer a static artifact but a dynamic system of cognitive architectures. Below is a comprehensive framework for managing this lifecycle.</p>

    <h3 class="text-2xl font-serif text-[#2C2A26] mb-4 mt-8">1. Architectural Conceptualization: The Contractor Model</h3>
    <p class="mb-6 text-[#5D5A53]">This phase introduces the "Contractor Model" where users act as clients and AI agents as contractors. Unlike traditional SaaS where users operate tools, here users define goals and agents execute them. Key agentic patterns include:</p>
    <ul class="list-disc pl-6 mb-6 text-[#5D5A53]">
        <li><strong>Chaining:</strong> Sequential execution of tasks.</li>
        <li><strong>Routing:</strong> Directing tasks to specialized sub-agents.</li>
        <li><strong>Parallelization:</strong> Executing independent tasks concurrently for speed.</li>
    </ul>

    <h3 class="text-2xl font-serif text-[#2C2A26] mb-4 mt-8">2. Cognitive Engineering</h3>
    <p class="mb-6 text-[#5D5A53]">The focus shifts from code to cognition. Engineers effectively "program" the model's behavior through:</p>
    <ul class="list-disc pl-6 mb-6 text-[#5D5A53]">
        <li><strong>Prompt Engineering:</strong> Adjusting parameters like Temperature and Nucleus Sampling to control creativity vs. determinism.</li>
        <li><strong>Structured Prompting:</strong> Using techniques like Few-Shot Learning and Chain-of-Thought (CoT) to guide reasoning.</li>
        <li><strong>Automated Optimization:</strong> Leveraging tools like DSPy and TextGrad to programmatically optimize prompts.</li>
    </ul>

    <h3 class="text-2xl font-serif text-[#2C2A26] mb-4 mt-8">3. Operational Connectivity</h3>
    <p class="mb-6 text-[#5D5A53]">Agents require context and tools. This phase details:</p>
    <ul class="list-disc pl-6 mb-6 text-[#5D5A53]">
        <li><strong>Model Context Protocol (MCP):</strong> A standard for connecting AI models to data sources.</li>
        <li><strong>Inter-Agent Communication:</strong> Protocols for agents to hand off tasks and share information.</li>
        <li><strong>Memory Management:</strong> Systems for long-term recall and context retention.</li>
    </ul>

    <h3 class="text-2xl font-serif text-[#2C2A26] mb-4 mt-8">4. Alignment and Optimization</h3>
    <p class="mb-6 text-[#5D5A53]">Ensuring the AI behaves as intended. Techniques include:</p>
    <ul class="list-disc pl-6 mb-6 text-[#5D5A53]">
        <li><strong>Supervised Fine-Tuning (SFT):</strong> Training on high-quality examples.</li>
        <li><strong>Preference Optimization:</strong> Techniques like DPO (Direct Preference Optimization), ORPO, and KTO to align model outputs with human values.</li>
    </ul>

    <h3 class="text-2xl font-serif text-[#2C2A26] mb-4 mt-8">5. Governance and Safety</h3>
    <p class="mb-6 text-[#5D5A53]">The final and critical layer. It involves:</p>
    <ul class="list-disc pl-6 mb-6 text-[#5D5A53]">
        <li><strong>Guardrails:</strong> Input/output filtering to prevent harmful content.</li>
        <li><strong>Evaluation Frameworks:</strong> Using tools like RAGAS to measure faithfulness and relevance.</li>
        <li><strong>Post-Deployment Monitoring:</strong> Continuous observation of agent behavior in the wild.</li>
    </ul>

    <p class="mb-6 text-[#5D5A53] italic">This transition from deterministic to probabilistic engineering requires not just new tools, but a new mindset. We are no longer just coding instructions; we are curating cognition.</p>
  `
};

async function seed() {
  const { data, error } = await supabase
    .from('journal_articles')
    .insert(article)
    .select();

  if (error) {
    console.error('Error inserting article:', error);
  } else {
    console.log('Article inserted successfully:', data);
  }
}

seed();
