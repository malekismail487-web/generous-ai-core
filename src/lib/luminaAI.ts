// luminaAI.ts
// Pure AI module with real GPT-5 integration (general chat + math)
// Max tokens set to 3000

// fetch is available natively in browser environments

type GPTRequest = {
    message: string;
    mode: "general" | "math";
};

type GPTResponse = {
    text: string;
    mathOutput?: string;
};

// ----- GPT-5 API Handler -----
async function sendToGPT5(params: GPTRequest): Promise<GPTResponse> {
    const endpoint = "https://api.openai.com/v1/completions"; // Use GPT-5 endpoint
    const apiKey = process.env.GPT5_API_KEY; // Set your GPT-5 API key in environment variables

    if (!apiKey) {
        throw new Error("GPT-5 API key not found in environment variables.");
    }

    // Prepare prompt
    const prompt =
        params.mode === "math"
            ? `Solve this math problem and provide LaTeX output if possible:\n${params.message}`
            : `Respond conversationally to the following:\n${params.message}`;

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-5", // GPT-5 model
                prompt: prompt,
                max_tokens: 3000,
            }),
        });

        const data = await response.json();
        const text = data.choices?.[0]?.text?.trim() ?? "No response from GPT-5";

        // Extract LaTeX if math
        const mathOutput = params.mode === "math" ? text.match(/\$\$.*\$\$/)?.[0] : undefined;

        return { text, mathOutput };
    } catch (error) {
        console.error("GPT-5 API error:", error);
        return { text: "AI is temporarily unavailable." };
    }
}

// ----- LaTeX Renderer -----
export function renderLatex(mathString: string): string {
    return mathString ? `$$${mathString}$$` : "";
}

// ----- General Chat -----
export async function generalChat(userMessage: string): Promise<string> {
    const response = await sendToGPT5({ message: userMessage, mode: "general" });
    return response.text;
}

// ----- Math Chat -----
export async function mathChat(userMessage: string): Promise<{ text: string; latex: string }> {
    const response = await sendToGPT5({ message: userMessage, mode: "math" });
    return { text: response.text, latex: renderLatex(response.mathOutput || "") };
}

// ----- Generate Lecture -----
export async function generateLecture(topic: string, level: "beginner" | "intermediate" | "advanced"): Promise<string> {
    const prompt = `Generate a detailed ${level}-level lecture on: ${topic}`;
    const response = await sendToGPT5({ message: prompt, mode: "general" });
    return response.text;
}

// ----- Summarize Lecture -----
export async function summarizeLecture(content: string): Promise<string> {
    const prompt = `Summarize the following lecture content concisely:\n${content}`;
    const response = await sendToGPT5({ message: prompt, mode: "general" });
    return response.text;
}

// ----- Usage Example -----
// Uncomment to test
/*
async function runExample() {
    const chatResp = await generalChat("Explain black holes in simple terms.");
    console.log("Chat Response:", chatResp);

    const mathResp = await mathChat("Integrate x^2 dx");
    console.log("Math Response:", mathResp.text);
    console.log("LaTeX Output:", mathResp.latex);
}

runExample();
*/
