import { createMistral } from "@ai-sdk/mistral";
import { streamText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import protocolsData from "@/lib/protocols.json";

// Define interfaces for type safety
interface Protocol {
  name: string;
  content: string;
  source_file: string;
}

interface ProtocolData {
  [key: string]: Protocol;
}

// Load protocols data
const protocols: ProtocolData = protocolsData;

// IMPORTANT: Replace with your actual Mistral API key
// Best practice: Use environment variables (process.env.MISTRAL_API_KEY)
const mistralApiKey = "yq9j1nFMijszhDfTqFxT4tzPiCKtzomj"; // Replace with user's key for now

if (!mistralApiKey) {
  console.error("Mistral API key is missing!");
  // Optionally throw an error or handle appropriately
}

// Initialize Mistral client using Vercel AI SDK
let mistral: ReturnType<typeof createMistral>;
try {
  mistral = createMistral({
    apiKey: mistralApiKey,
  });
  console.log("Mistral client initialized successfully.");
} catch (initError) {
  console.error("Failed to initialize Mistral client:", initError);
}

// Function to find relevant protocols (scoring based on keyword matches) - unchanged
function findRelevantProtocols(query: string): Protocol[] {
    const lowerCaseQuery = query.toLowerCase();
    const queryKeywords = lowerCaseQuery.split(/\s+/).filter(kw => kw.length > 2 && !["is", "the", "for", "and", "a", "of", "to", "in"].includes(kw));
    if (queryKeywords.length === 0) return [];
    const scoredProtocols = Object.values(protocols).map((protocol) => {
        const protocolNameLower = protocol.name.toLowerCase();
        const protocolContentLower = protocol.content.toLowerCase();
        let score = 0;
        queryKeywords.forEach(kw => {
            if (protocolNameLower.includes(kw)) score += 2;
            if (protocolContentLower.includes(kw)) score += 1;
        });
        const nameMatchCount = queryKeywords.filter(kw => protocolNameLower.includes(kw)).length;
        const contentMatchCount = queryKeywords.filter(kw => protocolContentLower.includes(kw)).length;
        if (nameMatchCount > 1) score += nameMatchCount * 2;
        if (contentMatchCount > 1) score += contentMatchCount;
        return { protocol, score };
    });
    const sortedResults = scoredProtocols.filter(item => item.score > 0).sort((a, b) => b.score - a.score);
    return sortedResults.slice(0, 5).map(item => item.protocol);
}

// Define the POST handler for the chat API route
export async function POST(request: NextRequest) {
  console.log("Received POST request to /api/chat (Mistral)");

  if (!mistral) {
    console.error("Mistral client is not initialized.");
    return NextResponse.json({ error: "AI service initialization failed" }, { status: 500 });
  }

  try {
    // --- Request Body Parsing and Validation --- (using the fix from before)
    const body: unknown = await request.json();
    console.log("Received body:", JSON.stringify(body));
    if (
      typeof body !== 'object' ||
      body === null ||
      !('messages' in body) ||
      !Array.isArray((body as any).messages)
    ) {
      console.error("Invalid request body structure or missing 'messages' array:", body);
      return NextResponse.json({ error: "Invalid request body: 'messages' array not found or invalid" }, { status: 400 });
    }
    const messages = (body as { messages: { role: 'user' | 'assistant' | 'system'; content: string }[] }).messages;
    if (messages.length === 0) {
      console.error("Invalid request body received: messages array is empty");
      return NextResponse.json({ error: "Invalid request body: messages array is empty" }, { status: 400 });
    }

    // --- Prepare Prompt for Mistral --- 
    const userQuery = messages[messages.length - 1]?.content;
    if (!userQuery) {
        console.error("No user query found in messages");
        return NextResponse.json({ error: "No user query found" }, { status: 400 });
    }
    console.log("User query:", userQuery);

    const relevantProtocols = findRelevantProtocols(userQuery);
    console.log(`Found ${relevantProtocols.length} relevant protocols.`);
    relevantProtocols.forEach((p, index) => console.log(`  ${index + 1}. ${p.name} (Source: ${p.source_file})`));

    const protocolContext = relevantProtocols.map(p => `Protocol ${p.name} (Source: ${p.source_file}):\n${p.content}`).join("\n\n---\n\n");    const systemPrompt = `You are an AI assistant specialized in the Oakland County EMS protocols. Your knowledge base consists ONLY of the following protocols provided below. Your primary goal is to help the user find the most relevant protocol based on their query.\n\nUnderstand the user's intent even if their wording doesn't exactly match the protocol titles or content. Consider synonyms, related medical concepts, and the overall context.\n\nBased *strictly* on the provided protocols, answer the user's question or identify the most relevant protocol(s). If an exact match isn't found, identify and present the protocol(s) that are semantically closest or most likely related to the user's query. If no relevant protocols can be found even considering related concepts, state that clearly. Do not invent information or use external knowledge. Be concise and helpful.\n\nRelevant Protocols:\n${protocolContext || "No specific protocols found matching the query."}`;
    // --- Call Mistral API using Vercel AI SDK --- 
    console.log("Sending request to Mistral via Vercel AI SDK...");
    const result = await streamText({
      model: mistral("mistral-small-latest"), // Or choose another Mistral model
      system: systemPrompt,
      messages: messages.slice(-5), // Send last 5 messages for context
      temperature: 0.5,
      maxTokens: 1000,
    });
    console.log("Received stream response from Mistral.");

    // --- Return Streaming Response --- 
    // The Vercel AI SDK's `streamText` returns a StreamingTextResponse
    // which Next.js can directly return to the client.
    return result.toDataStreamResponse();

  } catch (error) {
    console.error("Detailed Error processing chat request with Mistral:", error);
    let errorMessage = "Internal Server Error";
    if (error instanceof Error) {
        errorMessage = error.message;
        // Add specific Mistral error handling if needed, e.g., based on error codes/names
        if (error.name === 'MistralAPIError') { // Example, check actual error types
            // Handle specific Mistral errors
        }
    }
    console.error("Error Details:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

