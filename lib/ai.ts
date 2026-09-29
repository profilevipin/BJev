import "server-only";

export class MissingKeyError extends Error {
  constructor(service: "OpenRouter" | "OpenAI") {
    const variable = service === "OpenRouter" ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY";
    super(`${service} is not configured. Add ${variable} to .env.local and restart Folio.`);
    this.name = "MissingKeyError";
  }
}

export type JevClassification = {
  category: string;
  format: string;
  priority: string;
  actionable: boolean;
  evergreen: boolean;
  confidence: number;
  probabilities: Record<string, number>;
};

type JsonObject = Record<string, unknown>;

const JEV_MODEL = "typesafe/jev-1.13";
const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

export async function classifyWithJev(
  bookmark: { text: string; author: string; url: string },
  taxonomy: { name: string; description: string }[],
): Promise<JevClassification> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new MissingKeyError("OpenRouter");
  const endpoint = process.env.OPENROUTER_JEV_ENDPOINT || OPENROUTER_DECISIONS_URL;
  const state = `Author: ${bookmark.author}\nURL: ${bookmark.url}\n\n${bookmark.text || "(No text available)"}`;
  const categories = Object.fromEntries(taxonomy.map((item) => [item.name, item.description]));
  if (!taxonomy.some((item) => item.name.toLowerCase() === "other")) categories.Other = "None of the other categories apply.";
  const decisionQuestions = {
    category: {
      type: "choice",
      instructions: "Which category best describes this bookmark?",
      criteria: categories,
    },
    format: {
      type: "choice",
      instructions: "What is the bookmark's primary content format?",
      criteria: {
        thread: "A multi-post thread.",
        link: "A link to an article or webpage.",
        tool: "A product, library, or practical resource.",
        opinion: "Commentary or a personal viewpoint.",
        announcement: "News, a launch, or an update.",
        media: "Image, video, audio, or other media.",
        other: "None of the other formats apply.",
      },
    },
    priority: {
      type: "choice",
      instructions: "How much reading attention does this bookmark deserve?",
      criteria: {
        skip: "Not useful enough to revisit.",
        skim: "Worth a quick scan.",
        read: "Worth reading carefully.",
        study: "Worth sustained study or reference.",
      },
    },
    actionable: {
      type: "noul",
      instructions: "Does this bookmark contain something concrete the reader can do?",
    },
    evergreen: {
      type: "noul",
      instructions: "Will this bookmark remain useful over time rather than being time-sensitive?",
    },
  };
  const systemOne = endpoint.endsWith("/systemone");
  const questions = systemOne
    ? Object.entries(decisionQuestions).map(([id, question]) => ({
        id,
        type: question.type,
        ...(question.type === "noul"
          ? { proposition: question.instructions }
          : { choices: Object.entries(question.criteria).map(([name, description]) => `${name}: ${description}`) }),
      }))
    : decisionQuestions;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: JEV_MODEL,
      state,
      questions,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`OpenRouter Jev returned ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const body = await response.json() as JsonObject;
  const answers = (body.answers ?? body.results ?? body.output ?? body) as JsonObject;
  const answer = (id: string) => (answers[id] ?? {}) as JsonObject;
  const selected = (id: string) => String(answer(id).choice ?? answer(id).value ?? answer(id).answer ?? "other").split(":")[0].trim();
  const categoryAnswer = answer("category");
  const probabilities = (categoryAnswer.distribution ?? categoryAnswer.probabilities ?? {}) as Record<string, number>;
  const confidence = Number(categoryAnswer.confidence ?? categoryAnswer.score ?? Math.max(0, ...Object.values(probabilities).map(Number))) || 0;
  const booleanAnswer = (id: string) => {
    const found = answer(id);
    const raw = found.noul ?? found.value ?? found.answer ?? found.yes ?? false;
    return raw === true || raw === "yes" || Number(raw) >= 0.5;
  };
  return {
    category: selected("category"),
    format: selected("format").toLowerCase(),
    priority: selected("priority").toLowerCase(),
    actionable: booleanAnswer("actionable"),
    evergreen: booleanAnswer("evergreen"),
    confidence,
    probabilities,
  };
}

async function openAI(path: string, body: JsonObject) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new MissingKeyError("OpenAI");
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}: ${(await response.text()).slice(0, 240)}`);
  return response.json() as Promise<JsonObject>;
}

export async function enrichWithOpenAI(bookmark: { text: string; author: string; url: string }) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const input = `${bookmark.text}\nAuthor: ${bookmark.author}\nURL: ${bookmark.url}`;
  const result = await openAI("chat/completions", {
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: 'Return JSON: {"summary":"one sentence","tags":["3","to","6","tags"]}. Be factual and concise.' },
      { role: "user", content: input },
    ],
  });
  const content = String((((result.choices as JsonObject[])?.[0]?.message as JsonObject)?.content) ?? "{}");
  const parsed = JSON.parse(content) as { summary?: string; tags?: string[] };
  const embeddingResult = await openAI("embeddings", {
    model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    input: `${parsed.summary || ""}\n${input}`,
  });
  const embedding = (((embeddingResult.data as JsonObject[])?.[0]?.embedding) ?? []) as number[];
  return { summary: parsed.summary || "", tags: parsed.tags || [], embedding };
}

export async function suggestTaxonomy(texts: string[]) {
  const result = await openAI("chat/completions", {
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: 'Suggest 12–24 durable categories. Return JSON {"categories":[{"name":"","description":""}]}. Names must be distinct and include Other.' },
      { role: "user", content: texts.slice(0, 100).join("\n---\n").slice(0, 50_000) },
    ],
  });
  const content = String(((((result.choices as JsonObject[])?.[0]?.message as JsonObject)?.content) ?? "{}"));
  return (JSON.parse(content) as { categories: { name: string; description: string }[] }).categories;
}

export async function embedQuery(query: string) {
  const result = await openAI("embeddings", {
    model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    input: query,
  });
  return ((((result.data as JsonObject[])?.[0]?.embedding) ?? []) as number[]);
}

export function cosine(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    aa += a[index] ** 2;
    bb += b[index] ** 2;
  }
  return dot / (Math.sqrt(aa) * Math.sqrt(bb) || 1);
}
