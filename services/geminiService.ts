
export const sendMessageToGemini = async (history: { role: string, text: string }[], newMessage: string): Promise<string> => {
  try {
    const response = await fetch('/api/ask-ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        history,
        message: newMessage,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ask AI API returned ${response.status}`);
    }

    const data = await response.json();
    return data.text || '';

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm having trouble connecting to my knowledge base right now. Please try again later.";
  }
};
