import "server-only";

export class MissingKeyError extends Error {
  constructor(service: "OpenRouter" | "OpenAI") {
    const variable = service === "OpenRouter" ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY";
    super(`${service} is not configured. Add ${variable} as an environment secret and restart Folio.`);
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

const PRIORITY_LEVELS = ["skip", "skim", "read", "study"] as const;
const FORMAT_OPTIONS = {
  thread: "A multi-post thread or reply chain",
  link: "Primarily sharing an external article or URL",
  tool: "A product, library, CLI, or workflow tool",
  opinion: "Commentary, take, or analysis",
  announcement: "Launch, release, hiring, or news announcement",
  media: "Image, video, or other media-first post",
  other: "Does not clearly match the other formats",
} as const;

/** OpenRouter secret for Jev. Accepts OPENROUTER_API_KEY or the dashboard name OpenRouter. */
export function openRouterApiKey() {
  return process.env.OPENROUTER_API_KEY || process.env.OpenRouter || "";
}

export function hasOpenRouter() {
  return Boolean(openRouterApiKey());
}

function slug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "other";
}

export async function classifyWithJev(
  bookmark: { text: string; author: string; url: string },
  taxonomy: { name: string; description: string }[],
): Promise<JevClassification> {
  const key = openRouterApiKey();
  if (!key) throw new MissingKeyError("OpenRouter");

  const criteria: Record<string, string> = {};
  const labelBySlug = new Map<string, string>();
  for (const item of taxonomy) {
    const id = slug(item.name);
    criteria[id] = item.description || item.name;
    labelBySlug.set(id, item.name);
  }
  if (!Object.keys(criteria).some((id) => id === "other")) {
    criteria.other = "None of the other categories clearly fit";
    labelBySlug.set("other", "Other");
  }

  const state = {
    author: bookmark.author,
    url: bookmark.url,
    text: bookmark.text || "(No text available)",
  };

  const response = await fetch("https://openrouter.ai/api/v1/systemone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://folio.local",
      "X-OpenRouter-Title": "Folio",
    },
    body: JSON.stringify({
      model: "jev-latest",
      state,
      questions: {
        category: {
          type: "choice",
          instructions: "Which category best fits this X bookmark for a personal reading library?",
          criteria,
        },
        format: {
          type: "choice",
          instructions: "What format best describes this bookmark?",
          criteria: FORMAT_OPTIONS,
        },
        priority: {
          type: "score",
          instructions: "How much reading attention does this bookmark deserve?",
          criteria: [...PRIORITY_LEVELS],
        },
        actionable: {
          type: "noul",
          instructions: "Does this bookmark contain something concrete the reader can do?",
          criteria: {
            true: "There is a clear action, tool to try, or next step",
            false: "It is mainly reference, commentary, or atmosphere",
          },
        },
        evergreen: {
          type: "noul",
          instructions: "Is this bookmark likely to remain useful over time?",
          criteria: {
            true: "Durable reference, principle, or tool",
            false: "Time-sensitive news or short-lived announcement",
          },
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter/Jev returned ${response.status}: ${(await response.text()).slice(0, 240)}`);
  }

  const body = (await response.json()) as JsonObject;
  const answers = (body.answers ?? {}) as JsonObject;
  const answer = (id: string) => (answers[id] ?? {}) as JsonObject;

  const categoryAnswer = answer("category");
  const categorySlug = String(categoryAnswer.choice ?? "other");
  const rawProbabilities = (categoryAnswer.probabilities ?? {}) as Record<string, number>;
  const probabilities: Record<string, number> = {};
  for (const [id, value] of Object.entries(rawProbabilities)) {
    probabilities[labelBySlug.get(id) || id] = Number(value) || 0;
  }

  const score = Number(answer("priority").score ?? 1);
  const priorityIndex = Math.min(
    PRIORITY_LEVELS.length - 1,
    Math.max(0, Math.round(Number.isFinite(score) ? score : 1)),
  );

  return {
    category: labelBySlug.get(categorySlug) || categorySlug,
    format: String(answer("format").choice ?? "other").toLowerCase(),
    priority: PRIORITY_LEVELS[priorityIndex],
    actionable: Number(answer("actionable").noul ?? 0) >= 0.5,
    evergreen: Number(answer("evergreen").noul ?? 0) >= 0.5,
    confidence: Number(categoryAnswer.confidence ?? 0) || 0,
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
