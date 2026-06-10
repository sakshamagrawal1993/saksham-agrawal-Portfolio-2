const fs = require('fs');

const workflow = {
  "name": "AI Care QA Generation Workflow",
  "active": true,
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "ai-care-qa-generation",
        "responseMode": "lastNode",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [ 0, 0 ]
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "Generate the next question based on the history: {{ JSON.stringify($json.body.history) }}\n\nAnd intermediate diagnoses (if any): {{ JSON.stringify($json.body.history.filter(m => m.role === 'system')) }}",
        "hasOutputParser": true,
        "options": {
          "systemMessage": "You are a medical triage assistant. Based on the conversation history, ask ONE concise follow-up question to the patient to narrow down the diagnosis."
        }
      },
      "name": "Question Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 3.1,
      "position": [ 200, 0 ]
    },
    {
      "parameters": {
        "model": { "__rl": true, "value": "gpt-4.1-2025-04-14", "mode": "list", "cachedResultName": "gpt-4.1-2025-04-14" },
        "options": { "temperature": 0.1 }
      },
      "name": "OpenAI Primary",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "typeVersion": 1.3,
      "position": [ 200, 200 ],
      "credentials": { "openAiApi": { "id": "F8K5WXRWzmnY0vcZ", "name": "Saksham OpenAI Account" } }
    },
    {
      "parameters": {
        "schemaType": "manual",
        "inputSchema": JSON.stringify({
          type: "object",
          properties: { question: { type: "string", description: "The next question to ask the patient." } },
          required: ["question"]
        })
      },
      "name": "Question Parser",
      "type": "@n8n/n8n-nodes-langchain.outputParserStructured",
      "typeVersion": 1.3,
      "position": [ 300, 200 ]
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "The next question is: {{ $json.output.question }}. Generate exactly 4 short options for the user to select.",
        "hasOutputParser": true,
        "options": {
          "systemMessage": "You are an assistant that generates exactly 4 short, highly relevant multiple-choice options for a given medical question to make it easier for the patient to answer."
        }
      },
      "name": "Options Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 3.1,
      "position": [ 500, 0 ]
    },
    {
      "parameters": {
        "model": { "__rl": true, "value": "gpt-4.1-mini-2025-04-14", "mode": "list", "cachedResultName": "gpt-4.1-mini-2025-04-14" },
        "options": { "temperature": 0.1 }
      },
      "name": "OpenAI Mini",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "typeVersion": 1.3,
      "position": [ 500, 200 ],
      "credentials": { "openAiApi": { "id": "F8K5WXRWzmnY0vcZ", "name": "Saksham OpenAI Account" } }
    },
    {
      "parameters": {
        "schemaType": "manual",
        "inputSchema": JSON.stringify({
          type: "object",
          properties: { options: { type: "array", items: { type: "string" }, description: "Exactly 4 short options." } },
          required: ["options"]
        })
      },
      "name": "Options Parser",
      "type": "@n8n/n8n-nodes-langchain.outputParserStructured",
      "typeVersion": 1.3,
      "position": [ 600, 200 ]
    },
    {
      "parameters": {
        "jsCode": "return [{ json: { question: $node['Question Agent'].json.output.question, options: $node['Options Agent'].json.output.options } }];"
      },
      "name": "Merge Code",
      "type": "n8n-nodes-base.code",
      "typeVersion": 1,
      "position": [ 750, 0 ]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ $json }}",
        "options": {}
      },
      "name": "Respond to Webhook",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [ 950, 0 ]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [ [ { "node": "Question Agent", "type": "main", "index": 0 } ] ]
    },
    "OpenAI Primary": {
      "ai_languageModel": [ [ { "node": "Question Agent", "type": "ai_languageModel", "index": 0 } ] ]
    },
    "Question Parser": {
      "ai_outputParser": [ [ { "node": "Question Agent", "type": "ai_outputParser", "index": 0 } ] ]
    },
    "Question Agent": {
      "main": [ [ { "node": "Options Agent", "type": "main", "index": 0 } ] ]
    },
    "OpenAI Mini": {
      "ai_languageModel": [ [ { "node": "Options Agent", "type": "ai_languageModel", "index": 0 } ] ]
    },
    "Options Parser": {
      "ai_outputParser": [ [ { "node": "Options Agent", "type": "ai_outputParser", "index": 0 } ] ]
    },
    "Options Agent": {
      "main": [ [ { "node": "Merge Code", "type": "main", "index": 0 } ] ]
    },
    "Merge Code": {
      "main": [ [ { "node": "Respond to Webhook", "type": "main", "index": 0 } ] ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
};

fs.writeFileSync('/Users/sakshamagrawal/Documents/Projects/n8n-workflows/definitions/ai-care-qa-generation.json', JSON.stringify(workflow, null, 2));
console.log('Done!');
