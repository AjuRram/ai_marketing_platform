/**
 * Pulse Node SDK — a typed-ish thin client over the public API.
 *
 * Zero dependencies, ESM, uses global `fetch` (Node 18+). Deliberately small:
 * every method maps to exactly one endpoint, and the endpoint is a wrapper over
 * the same resource function the dashboard and the agent use. There is no
 * client-side business logic to drift out of sync with the server.
 *
 *   import { Pulse } from "./packages/sdk-node/index.mjs";
 *   const pulse = new Pulse({ apiKey: process.env.PULSE_API_KEY });
 *   await pulse.whoami();
 */

export class PulseError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "PulseError";
    this.status = status;
    this.body = body;
  }
}

export class Pulse {
  #apiKey;
  #baseUrl;

  constructor(options = {}) {
    const apiKey = options.apiKey ?? process.env.PULSE_API_KEY ?? "";
    if (!apiKey) {
      throw new Error("A Pulse API key is required (options.apiKey or PULSE_API_KEY).");
    }
    // Refusing a publishable key here is a real guard, not pedantry: a `pk_`
    // key silently lacks every read scope, so using one server-side fails later
    // with a confusing 403 on an unrelated call rather than at construction.
    if (apiKey.startsWith("pk_")) {
      throw new Error(
        "That is a publishable key. Server-side calls need a secret key (sk_…).",
      );
    }
    this.#apiKey = apiKey;
    this.#baseUrl = (options.baseUrl ?? process.env.PULSE_BASE_URL ?? "http://localhost:3200")
      .replace(/\/$/, "");
  }

  async #request(method, path, { query, body } = {}) {
    const url = new URL(`${this.#baseUrl}/api/v1/${path}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new PulseError(payload.error ?? response.statusText, response.status, payload);
    }
    return payload;
  }

  /* ---------------------------------------------------------------- identity */

  whoami() {
    return this.#request("GET", "whoami");
  }

  /* ---------------------------------------------------------------- audience */

  people(options = {}) {
    return this.#request("GET", "audience/people", {
      query: { search: options.search, list: options.list, page: options.page, limit: options.limit },
    });
  }

  companies(options = {}) {
    return this.#request("GET", "audience/companies", {
      query: { search: options.search, page: options.page, limit: options.limit },
    });
  }

  upsertPerson(person) {
    return this.#request("POST", "audience/people/upsert", { body: person });
  }

  lists() {
    return this.#request("GET", "audience/lists");
  }

  createList(list) {
    return this.#request("POST", "audience/lists", { body: list });
  }

  addToList(list, emails) {
    return this.#request("POST", "audience/lists/members", { body: { list, emails } });
  }

  /* ------------------------------------------------------------------ events */

  track(name, { email, props } = {}) {
    return this.#request("POST", "events", { body: { name, email, props } });
  }

  /* ----------------------------------------------------------------- content */

  content(options = {}) {
    return this.#request("GET", "content", {
      query: { kind: options.kind, status: options.status, limit: options.limit },
    });
  }

  /* ------------------------------------------------------------------ memory */

  memory(path) {
    return this.#request("GET", "memory", { query: { path } });
  }

  listMemory(prefix = "/", deep = false) {
    return this.#request("GET", "memory", { query: { prefix, deep } });
  }

  searchMemory(q, tag) {
    return this.#request("GET", "memory/search", { query: { q, tag } });
  }

  writeMemory(doc) {
    return this.#request("POST", "memory", { body: doc });
  }

  /* ------------------------------------------------------------------- flows */

  flows() {
    return this.#request("GET", "flows");
  }

  triggerFlow(flowId, email) {
    return this.#request("POST", "flows/trigger", { body: { flow_id: flowId, email } });
  }
}

export default Pulse;
