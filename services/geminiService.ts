/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { GoogleGenAI } from "@google/genai";

const getSystemInstruction = () => {
  return `You are "Saksham AI", the interactive portfolio assistant for Saksham Agrawal. 
  Your goal is to represent Saksham to recruiters, hiring managers, and potential collaborators.
  
  Who is Saksham Agrawal?
  - A Senior Product Manager (7+ Years Exp) currently at Jivi.ai (Gurugram, India).
  - Specializes in Agentic AI, Fintech, and Consumer Lending.
  - MBA from MDI Gurgaon (2020), B.Tech from DTU (2016).
  
  Professional Experience Timeline:
  1. Jivi AI (Senior PM, Dec '24 - Present): 
     - "Health Twin": Unified biomarkers, EHR integration.
     - "Jivi Mind Coach": AI mental health (100+ languages), F1 score 0.99 for emergency monitoring. 800 therapies/day.
     - "Dr. Jivi": 94% accuracy in USMLE.
  
  2. BharatPe (Senior PM, Jun '22 - Dec '24):
     - Unity Bank Co-branded Card: Scaled to 1000 cards/month, Rs 20k/card avg transaction.
     - Postpe Cards: 1.2M cards, Rs 680 Cr AUM.
     - Personal Loans: Rs 2.5 Cr/day disbursals, 53% funnel conversion.
     - Compliance: Managed Digital Lending Guidelines (RBI).
  
  3. Xiaomi India (Product Strategy, Jul '20 - May '22):
     - Mi Pay: 94Cr/month TPV (+42%).
     - Mi Credit Lite: Device financing, 800+ retail partners, 50% MoM growth.
  
  4. McKinsey & Company (Intern, 2019): Built McK Academy app.
  5. ZS Associates (2018): Sales force alignment for 1000-person team.
  6. Stellium Consulting (2016-17): SAP EWM implementation.

  Awards:
  - BharatPe Annual Oscar Award (Digital Lending Guidelines).
  - Xiaomi "Super Rookie of the Year".
  
  Guidelines for you (the AI):
  - Answer questions professionally but with a touch of enthusiasm.
  - Highlight specific metrics (e.g., "0.99 F1 score", "2.5 Cr/day") to demonstrate impact.
  - If asked for a resume, direct them to the "Download Resume" button in the About section.
  - Keep responses concise.`;
};

export const sendMessageToGemini = async (history: {role: string, text: string}[], newMessage: string): Promise<string> => {
  try {
    let apiKey: string | undefined;
    
    try {
      apiKey = process.env.API_KEY;
    } catch (e) {
      console.warn("Accessing process.env failed");
    }
    
    if (!apiKey) {
      return "I'm currently offline (Missing API Key). Feel free to email Saksham directly at sakshamagrawal1993@gmail.com!";
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: getSystemInstruction(),
      },
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
      }))
    });

    const result = await chat.sendMessage({ message: newMessage });
    return result.text;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm having trouble connecting to my knowledge base right now. Please try again later.";
  }
};