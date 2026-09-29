import "server-only";

export class MissingKeyError extends Error {
  constructor(service: "Jev" | "OpenAI") {
    super(`${service} is not configured. Add its server key to .env.local and restart Folio.`);
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

export async function classifyWithJev(
  bookmark: { text: string; author: string; url: string },
  taxonomy: { name: string; description: string }[],
): Promise<JevClassification> {
  const key = process.env.JEV_API_KEY;
  if (!key) throw new MissingKeyError("Jev");
  const base = (process.env.JEV_BASE_URL || "https://api.typesafe.ai").replace(/\/$/, "");
  const state = `Author: ${bookmark.author}\nURL: ${bookmark.url}\n\n${bookmark.text || "(No text available)"}`;
  const categories = taxonomy.map((item) => `${item.name}: ${item.description}`);
  if (!taxonomy.some((item) => item.name.toLowerCase() === "other")) categories.push("Other: none of the above");
  const response = await fetch(`${base}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-API-Key": key },
    body: JSON.stringify({
      model: "jev-latest",
      state,
      questions: [
        { id: "category", type: "choice", choices: categories },
        { id: "format", type: "choice", choices: ["thread", "link", "tool", "opinion", "announcement", "media", "other"] },
        { id: "priority", type: "score", scores: ["skip", "skim", "read", "study"] },
        { id: "actionable", type: "noul", proposition: "This bookmark contains something concrete the reader can do." },
        { id: "evergreen", type: "noul", proposition: "This bookmark remains useful over time rather than being time-sensitive." },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Jev returned ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const body = await response.json() as JsonObject;
  const answers = (body.answers ?? body.results ?? body.output ?? body) as JsonObject;
  const answer = (id: string) => (answers[id] ?? {}) as JsonObject;
  const selected = (id: string) => String(answer(id).choice ?? answer(id).value ?? answer(id).answer ?? "other").split(":")[0].trim();
  const categoryAnswer = answer("category");
  const probabilities = (categoryAnswer.distribution ?? categoryAnswer.probabilities ?? {}) as Record<string, number>;
  const confidence = Number(categoryAnswer.confidence ?? categoryAnswer.score ?? Math.max(0, ...Object.values(probabilities).map(Number))) || 0;
  const booleanAnswer = (id: string) => {
    const found = answer(id);
    const raw = found.value ?? found.answer ?? found.yes ?? false;
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
