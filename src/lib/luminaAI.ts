// luminaAI.ts
// Pure AI module with GPT-5 integration (general chat + math)
// Max tokens increased to 3000

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
    try {
        const endpoint = "https://api.openai.com/v1/gpt-5/completions"; // Replace with real GPT-5 endpoint
        const apiKey = process.env.GPT5_API_KEY; // Store your API key in env variables

        const prompt =
            params.mode === "math"
                ? `Solve the following math problem and provide LaTeX output if possible:\n${params.message}`
                : `Respond conversationally to the following:\n${params.message}`;

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-5",
                prompt: prompt,
                max_tokens: 3000, // Increased token limit for detailed responses
            }),
        });

        const data = await response.json();
        const text = data.choices?.[0]?.text?.trim() || "No response from GPT-5";

        // If math mode, attempt to extract LaTeX from the text (assumes GPT-5 outputs $$...$$)
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

// ----- Usage Example -----
// Uncomment and run in Node to test
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
