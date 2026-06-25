/**
 * Lightweight end-to-end example: query -> select -> call OpenAI.
 *
 * model-selector is match-only: you give it the models you have access to plus a
 * query, and it hands back the selected model id + match metadata. It never
 * creates a client. This script shows the full loop a host wires up:
 *
 *     define models  ->  rankModels(query)  ->  host calls OpenAI with the id
 *
 * Run it:
 *
 *     npm install
 *     npx tsx examples/openai-demo.ts                 # selection only, zero extra deps
 *     npx tsx examples/openai-demo.ts "smart, fast"   # try your own query
 *
 * To actually call OpenAI (the loop closure at the end):
 *
 *     npm install openai
 *     export OPENAI_API_KEY=sk-...    # PowerShell: $env:OPENAI_API_KEY = "sk-..."
 *     npm run example
 *
 * Without a key (or without the openai package) the OpenAI call is skipped and
 * the script still demonstrates selection.
 */

import { rankModels } from '../src/index.js';
import type { Config } from '../src/index.js';

// The host owns its models. Here each model key *is* the OpenAI model name, so
// the selected `modelId` drops straight into the API call with no id->name map.
// Attributes are on a rough 1-10 scale (cost/speed/quality); pick whatever your
// host cares to query on. Aliases turn host vocabulary into query conditions.
const config: Config = {
  aliases: {
    cheap: 'cost <= 3',
    fast: 'speed >= 7',
    smart: 'quality >= 8',
    reasoning: 'reasoning',
  },
  models: {
    'gpt-4o': {
      provider: 'openai',
      enabled: true,
      attributes: {
        cost: 8,
        speed: 6,
        quality: 9,
        context_window: 128000,
        functions: true,
        reasoning: false,
        local: false,
      },
    },
    'gpt-4o-mini': {
      provider: 'openai',
      enabled: true,
      attributes: {
        cost: 2,
        speed: 9,
        quality: 6,
        context_window: 128000,
        functions: true,
        reasoning: false,
        local: false,
      },
    },
    'o3-mini': {
      provider: 'openai',
      enabled: true,
      attributes: {
        cost: 5,
        speed: 4,
        quality: 9,
        context_window: 200000,
        functions: true,
        reasoning: true,
        local: false,
      },
    },
  },
};

// Queries are comma-separated AND conditions; earlier conditions weigh more.
const DEMO_QUERIES = ['cheap, fast', 'smart, fast', 'reasoning, smart'];

async function main(): Promise<void> {
  // Show how a few queries rank the same model set.
  console.log('Ranking demo queries against 3 OpenAI models:\n');
  for (const query of DEMO_QUERIES) {
    console.log(`  query: ${JSON.stringify(query)}`);
    for (const res of rankModels(query, config)) {
      const tag = res.exactMatch ? '  (exact)' : '';
      console.log(
        `    ${res.modelId.padEnd(14)} score=${res.score.toFixed(2)}${tag}`,
      );
    }
    console.log();
  }

  // Pick the model to actually use. Default query, or one passed on the CLI.
  const query = process.argv[2] ?? 'cheap, fast, functions';
  const selected = rankModels(query, config)[0];
  if (!selected) {
    console.log(`No model available for ${JSON.stringify(query)}.`);
    return;
  }

  console.log(
    `Selected for ${JSON.stringify(query)}: ${selected.modelId} ` +
      `(score=${selected.score.toFixed(2)})`,
  );

  // --- Loop closure: the host instantiates the client with the chosen id. ---
  await callOpenAI(selected.modelId);
}

/** Call OpenAI with the selected model, or explain why it was skipped. */
async function callOpenAI(modelId: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.log('OpenAI call skipped (no OPENAI_API_KEY set).');
    return;
  }

  let OpenAI;
  try {
    ({ default: OpenAI } = await import('openai'));
  } catch {
    console.log('OpenAI call skipped (openai not installed — `npm install openai`).');
    return;
  }

  const client = new OpenAI();
  const response = await client.chat.completions.create({
    model: modelId,
    messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
  });
  console.log(`\n${modelId} says: ${response.choices[0]?.message?.content ?? ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
