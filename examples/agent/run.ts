/**
 * LLM Agent with a paid tool — demonstrates autonomous agent-to-agent commerce.
 *
 * The agent has a `analyze_text` tool that calls a paid API (Seller API)
 * using x402 escrow. The LLM decides when to use the tool; payment happens
 * transparently via autoPayAndVerify().
 *
 * Supports both Claude (Anthropic) and OpenAI via LLM_PROVIDER env var.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... \
 *   AGENT_PRIVATE_KEY=0x... \
 *   bun examples/agent/run.ts
 */
import "dotenv/config";
import * as readline from "readline";
import { createWalletClient, http, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { autoPayAndVerify } from "../../src/client/agent.js";

// ──────────────────────── Config ────────────────────────

const SELLER_URL = (
  process.env.SELLER_API_URL || "http://localhost:4000"
).replace(/\/$/, "");
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as Hex;
const LLM_PROVIDER = process.env.LLM_PROVIDER || "anthropic";

if (!AGENT_PRIVATE_KEY) {
  console.error("AGENT_PRIVATE_KEY is required");
  process.exit(1);
}

// ──────────────────────── Wallet ────────────────────────

const account = privateKeyToAccount(AGENT_PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org"),
});

// ──────────────────────── Tool Definitions ────────────────────────

const TOOLS = [
  {
    name: "analyze_text",
    description:
      "Analyze text using a paid API service. Returns word count, sentence count, paragraph count, reading time, average words per sentence, top keywords, and a readability score (0-100). Costs 0.01 USDC per call.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string" as const,
          description: "The text to analyze",
        },
      },
      required: ["text"],
    },
  },
];

// ──────────────────────── Tool Execution ────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  if (name === "analyze_text") {
    console.log("\n  [Calling analyze_text — paying via x402 escrow...]");
    try {
      const result = await autoPayAndVerify(
        `${SELLER_URL}/analyze`,
        {
          method: "POST",
          body: JSON.stringify({ text: input.text }),
          headers: { "Content-Type": "application/json" },
        },
        { walletClient }
      );

      const txInfo = result.txHash
        ? `\n  [Payment TX: ${result.txHash}]`
        : "";
      const escrowInfo = result.escrowId
        ? ` | Escrow ID: ${result.escrowId}`
        : "";
      if (txInfo) console.log(`${txInfo}${escrowInfo}`);

      return JSON.stringify(result.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [Tool error: ${msg}]`);
      return JSON.stringify({ error: msg });
    }
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ──────────────────────── LLM Abstraction ────────────────────────

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface LLMResponse {
  text?: string;
  toolCalls?: ToolCall[];
}

type SendMessageFn = (
  messages: Array<{ role: string; content: unknown }>,
  tools: typeof TOOLS
) => Promise<LLMResponse>;

/** Create an Anthropic (Claude) message sender */
async function createAnthropicSender(): Promise<SendMessageFn> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is required for anthropic provider");
    process.exit(1);
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  return async (messages, tools) => {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system:
        "You are a helpful assistant with access to a paid text analysis tool. When the user asks you to analyze text, use the analyze_text tool. Summarize results in a readable way.",
      messages: messages as Anthropic.MessageParam[],
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool["input_schema"],
      })),
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({
        id: b.id,
        name: b.name,
        input: b.input as Record<string, unknown>,
      }));

    return {
      text: text || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  };
}

/** Create an OpenAI message sender */
async function createOpenAISender(): Promise<SendMessageFn> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required for openai provider");
    process.exit(1);
  }

  let OpenAI: typeof import("openai").default;
  try {
    ({ default: OpenAI } = await import("openai"));
  } catch {
    console.error(
      'OpenAI provider requires the "openai" package. Run: bun add -d openai'
    );
    process.exit(1);
  }
  const client = new OpenAI({ apiKey });

  return async (messages, tools) => {
    const openaiMessages = [
      {
        role: "system" as const,
        content:
          "You are a helpful assistant with access to a paid text analysis tool. When the user asks you to analyze text, use the analyze_text tool. Summarize results in a readable way.",
      },
      ...(messages as OpenAI.ChatCompletionMessageParam[]),
    ];

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      tools: tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
    });

    const choice = response.choices[0];
    const text = choice.message.content ?? undefined;
    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      text,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    };
  };
}

// ──────────────────────── Conversation Loop ────────────────────────

async function main() {
  console.log("=== x402 Agent Commerce ===\n");
  console.log(`Agent address: ${account.address}`);
  console.log(`LLM provider:  ${LLM_PROVIDER}`);
  console.log(`Seller API:    ${SELLER_URL}`);
  console.log(`\nType a message to chat. The agent can use a paid text analysis tool.`);
  console.log(`Type "exit" or Ctrl+C to quit.\n`);

  const sendMessage: SendMessageFn =
    LLM_PROVIDER === "openai"
      ? await createOpenAISender()
      : await createAnthropicSender();

  const messages: Array<{ role: string; content: unknown }> = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === "exit") {
        console.log("\nGoodbye!");
        rl.close();
        process.exit(0);
      }

      messages.push({ role: "user", content: trimmed });

      try {
        // Conversation loop: keep going while LLM wants to use tools
        let response: LLMResponse;
        do {
          response = await sendMessage(messages, TOOLS);

          if (response.toolCalls) {
            // Build assistant message with tool use
            if (LLM_PROVIDER === "openai") {
              messages.push({
                role: "assistant",
                content: response.text ?? null,
                // @ts-ignore — OpenAI format
                tool_calls: response.toolCalls.map((tc) => ({
                  id: tc.id,
                  type: "function",
                  function: {
                    name: tc.name,
                    arguments: JSON.stringify(tc.input),
                  },
                })),
              });
            } else {
              // Anthropic format
              const contentBlocks: unknown[] = [];
              if (response.text) {
                contentBlocks.push({ type: "text", text: response.text });
              }
              for (const tc of response.toolCalls) {
                contentBlocks.push({
                  type: "tool_use",
                  id: tc.id,
                  name: tc.name,
                  input: tc.input,
                });
              }
              messages.push({ role: "assistant", content: contentBlocks });
            }

            // Execute each tool call
            for (const tc of response.toolCalls) {
              const result = await executeTool(tc.name, tc.input);

              if (LLM_PROVIDER === "openai") {
                messages.push({
                  role: "tool",
                  content: result,
                  // @ts-ignore — OpenAI format
                  tool_call_id: tc.id,
                });
              } else {
                messages.push({
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: tc.id,
                      content: result,
                    },
                  ],
                });
              }
            }
          }
        } while (response.toolCalls);

        // Print final text response
        if (response.text) {
          console.log(`\nAgent: ${response.text}\n`);
          // Add final assistant text to conversation
          messages.push({ role: "assistant", content: response.text });
        }
      } catch (err) {
        console.error(
          "\nError:",
          err instanceof Error ? err.message : String(err),
          "\n"
        );
      }

      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
