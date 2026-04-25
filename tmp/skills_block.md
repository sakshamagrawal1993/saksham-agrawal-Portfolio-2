### 6.5 Agent Skills: From Monolithic Prompts to Modular Knowledge

The system prompt is a single document — and as agent capabilities grow, that single document becomes a liability. A diagnostic agent that handles cardiology, neurology, pharmacology, and patient triage might require a system prompt of 8,000+ tokens just for instructions. Every request pays the token cost of every instruction, even when only one specialty is relevant.

**Agent Skills** solve this by decomposing the monolithic prompt into **modular, portable, progressively-disclosed packages** of domain expertise. Originally developed by Anthropic and released as an open standard in late 2025 (maintained at `agentskills.io`), Agent Skills have rapidly become the industry-standard way to package procedural knowledge for AI agents.

#### What Is a Skill?

A Skill is a filesystem-based package — a directory containing a mandatory `SKILL.md` file and optional supporting resources:

```
clinical-differential-diagnosis/
├── SKILL.md              # Required: YAML metadata + Markdown instructions
├── scripts/              # Optional: executable code (Python, Bash)
│   ├── symptom_parser.py
│   └── confidence_calculator.py
├── references/           # Optional: detailed docs, schemas, protocols
│   ├── clinical-reasoning-framework.md
│   └── red-flag-symptoms.md
└── assets/               # Optional: templates, forms, static resources
    └── differential-output-template.json
```

The `SKILL.md` file uses **YAML frontmatter** for machine-readable metadata and **Markdown body** for human-and-machine-readable instructions:

```yaml
---
name: clinical-differential-diagnosis
description: >
  Generate ranked differential diagnoses from patient presentations. 
  Use when the user provides a clinical case, symptom list, or asks 
  for diagnostic reasoning. Do NOT use for drug interaction checks 
  (use drug-interaction-checker skill instead) or treatment 
  recommendations.
version: "2.1.0"
license: Proprietary-Healthcare-Use-Only
compatibility: Requires access to medical-knowledge MCP server
metadata:
  author: jivi-clinical-ops
  domain: healthcare
  validated-by: dr-clinical-review-board
  last-review: "2026-03-15"
allowed-tools: guideline_search drug_lookup symptom_extractor
---

# Clinical Differential Diagnosis

## When to Use This Skill
- Patient presents with symptoms requiring diagnostic reasoning
- Clinician requests a differential diagnosis or diagnostic workup
- Case involves symptom pattern analysis across body systems

## When NOT to Use This Skill
- Drug interaction queries → use `drug-interaction-checker`
- Treatment or prescription recommendations → NEVER supported
- Administrative or billing queries → use `clinical-documentation`

## Reasoning Protocol
1. **Extract clinical features**: Parse demographics, presenting complaints, 
   examination findings, history, and risk factors into structured format
2. **Classify urgency**: If any red-flag symptoms detected 
   (see references/red-flag-symptoms.md), immediately flag as urgent
3. **Query knowledge base**: Use `guideline_search` tool for relevant 
   clinical guidelines. Query by primary symptom AND by body system
4. **Generate differential**: Apply Bayesian reasoning:
   - Start with base rates for presenting symptom combinations
   - Adjust based on demographics and risk factors
   - Rank by posterior probability
   - Always include "must-not-miss" diagnoses even if lower probability
5. **Calculate confidence**: See scripts/confidence_calculator.py
6. **Format output**: Use assets/differential-output-template.json

## Safety Constraints (NON-NEGOTIABLE)
- NEVER recommend specific treatments or medications
- ALWAYS include medical disclaimer
- If confidence < 0.7, explicitly recommend specialist consultation
- Emergency presentations: advise immediate care BEFORE analysis
```

#### The Three-Tier Progressive Disclosure Model

The key innovation of Agent Skills is **progressive disclosure** — the agent doesn't load every skill's full instructions into every context window. Instead, skill content is loaded in three tiers based on need:

| Tier | What Loads | When | Token Cost |
|:---|:---|:---|:---|
| **1. Discovery** | YAML frontmatter only (`name` + `description`) | Agent startup — for ALL available skills | ~30–50 tokens per skill |
| **2. Activation** | Full `SKILL.md` body (instructions, protocols, constraints) | When the agent determines the skill is relevant to the current task | ~500–5,000 tokens (recommended < 5,000) |
| **3. Execution** | Referenced files (`scripts/`, `references/`, `assets/`) | Only when explicitly needed during task execution | Variable |

```
Startup: Load 20 skills × ~40 tokens each = ~800 tokens overhead
             ↓
User Query: "Patient with chest pain and dyspnea..."
             ↓
Tier 1: Agent scans skill descriptions → matches "clinical-differential-diagnosis"
             ↓
Tier 2: Full SKILL.md body loaded into context (~2,500 tokens)
             ↓
Tier 3: Agent follows instructions, loads references/red-flag-symptoms.md 
        only when red-flag check is triggered (~400 tokens)
             ↓
Total context cost: ~3,700 tokens (vs. ~12,000+ if all skills were always loaded)
```

This is context engineering in its most disciplined form — the agent has access to 20 skills' worth of knowledge but only pays the token cost for the one it needs, and even within that skill, only loads reference documents on demand.

#### Agent Skills vs. MCP: The Knowledge–Action Distinction

A common confusion is the relationship between Agent Skills and MCP. They are complementary, not competitive:

| Dimension | Agent Skills | MCP |
|:---|:---|:---|
| **What they encode** | *Procedural knowledge* — how to think about a task | *Operational capabilities* — how to interact with external systems |
| **Content** | Instructions, workflows, reasoning protocols, constraints | Tool definitions, API connections, data access |
| **Format** | Markdown files (human-authored, human-readable) | JSON-RPC protocol (machine-to-machine) |
| **Loading** | Progressively disclosed into the context window | Registered as callable functions |
| **Analogy** | A textbook chapter + checklist | A wrench, a stethoscope, a lab machine |

In practice, skills and tools work together. A skill's instructions tell the agent *when and how* to use specific tools:

```
SKILL.md says: "When patient presents with cardiac symptoms, 
                use the guideline_search tool with query pattern 
                'cardiac + [primary symptom]' and always cross-reference 
                with drug_lookup for active medications."

MCP provides:  The guideline_search and drug_lookup tools themselves.
```

The skill is the **playbook**; the tools are the **equipment**. The `allowed-tools` frontmatter field explicitly declares which MCP tools a skill expects to use, enabling the harness to pre-validate tool availability before activating the skill.

#### Skill Composition Patterns

As skill libraries grow, composition patterns emerge:

**Skill chaining**: One skill's output becomes the trigger for another. The `clinical-differential-diagnosis` skill generates a differential, which triggers the `lab-order-recommendation` skill to suggest confirmatory tests.

**Skill layering**: Domain-general skills provide a foundation that domain-specific skills extend. A `clinical-reasoning-base` skill encodes general medical reasoning, while `cardiology-specialist` adds cardiology-specific reasoning on top.

**Skill versioning**: Skills carry semantic version numbers. When clinical guidelines are updated, the skill author releases a new version (`2.1.0` → `2.2.0`), and the agent runtime can enforce version constraints — ensuring the agent always uses the latest validated clinical protocols.

#### Security Considerations

Agent Skills introduce a new attack surface. Because skills are essentially instructions injected into the agent's context, a malicious skill could contain:
- **Prompt injection**: Instructions that attempt to override the agent's safety guidelines
- **Credential exfiltration**: Subtle instructions to extract API keys or patient data through tool calls
- **Behavioral manipulation**: Instructions that appear benign but subtly bias the agent's reasoning

Production systems must implement **skill validation**:
1. **Provenance verification**: Only load skills from trusted, signed sources
2. **Content scanning**: Automated checks for known injection patterns before loading
3. **Sandboxed execution**: Skills' scripts run in isolated environments with no access to credentials or sensitive data
4. **Review workflow**: New or updated skills require human review before deployment, particularly in clinical settings where flawed instructions could lead to patient harm

The `agentskills.io` reference library provides a `skills-ref validate` CLI tool for structural validation, but content safety review remains a human responsibility in regulated domains.

---
