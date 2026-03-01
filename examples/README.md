# Examples: Real Agent Commerce

End-to-end test scenario demonstrating autonomous agent-to-agent commerce using x402 escrow.

## Architecture

```
Terminal 1: Facilitator (:3000)     — handles orders, on-chain settlement
Terminal 2: Seller API (:4000)      — paid text analysis endpoint
Terminal 3: LLM Agent (interactive) — Claude/OpenAI agent with paid tool
```

```
User → LLM Agent → POST /analyze (Seller API) → POST /orders + /pay (Facilitator) → Chain
                    ← 402 → sign ERC-3009 →       settles on-chain
                    ← 200 + analysis results
```

## Prerequisites

1. **Facilitator running** with a funded operator wallet (see root `.env.example`)
2. **Seller wallet** — any address that will receive payouts
3. **Agent wallet** — funded with USDC and ETH on Base Sepolia
4. **LLM API key** — Anthropic (`ANTHROPIC_API_KEY`) or OpenAI (`OPENAI_API_KEY`)

### Install AI SDK dependencies

```bash
# From project root
bun add -d @anthropic-ai/sdk   # Required
bun add -d openai               # Optional (for OpenAI provider)
```

## Quick Start

### Terminal 1: Facilitator

```bash
bun run dev
```

### Terminal 2: Seller API

```bash
FACILITATOR_URL=http://localhost:3000 \
SELLER_ADDRESS=0xYourSellerAddress \
bun examples/seller-api/server.ts
```

### Terminal 3: LLM Agent

```bash
ANTHROPIC_API_KEY=sk-ant-... \
AGENT_PRIVATE_KEY=0xYourAgentPrivateKey \
bun examples/agent/run.ts
```

Then type:

```
You: Analyze the readability of this paragraph: "The quick brown fox jumps over the lazy dog. This sentence contains every letter of the English alphabet."
```

## What Happens

1. LLM decides to call `analyze_text` tool
2. Agent sends `POST /analyze` to Seller API (no payment header)
3. Seller API creates an order on the facilitator, gets 402 back, proxies it to the agent
4. `autoPayAndVerify()` in the agent SDK signs an ERC-3009 authorization (gasless USDC transfer)
5. Agent retries with `PAYMENT-SIGNATURE` header
6. Seller API forwards payment to facilitator, which settles on-chain
7. Seller API returns the analysis results
8. LLM summarizes the results to the user

## Environment Variables

### Seller API

| Variable | Default | Description |
|----------|---------|-------------|
| `FACILITATOR_URL` | `http://localhost:3000` | Facilitator server URL |
| `SELLER_ADDRESS` | — (required) | Wallet address for payouts |
| `SELLER_API_KEY` | — | API key for facilitator (if API_KEYS is set) |
| `SELLER_PORT` | `4000` | Server port |
| `PRICE_USDC` | `0.01` | Price per analysis in USDC |

### Agent

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_PRIVATE_KEY` | — (required) | Agent wallet private key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (default provider) |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `LLM_PROVIDER` | `anthropic` | `anthropic` or `openai` |
| `SELLER_API_URL` | `http://localhost:4000` | Seller API URL |
| `BASE_SEPOLIA_RPC` | `https://sepolia.base.org` | RPC endpoint |
