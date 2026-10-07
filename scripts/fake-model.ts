/**
 * A fake OpenAI-compatible chat model on loopback: answers each completion request "ok" and keeps its body.
 * Anything else (a port scanner probing loopback, say) gets a 404 and is not recorded, so it can neither count as
 * a model request nor be inspected as one.
 */
import * as http from "node:http";

export const PROVIDER = "example-provider";
export const MODEL = "example-model";
/** The one route the fake answers: the base URL's `/v1` plus the chat completions path. */
export const COMPLETIONS_PATH = "/v1/chat/completions";

export interface FakeModel {
  server: http.Server;
  port: number;
  /** The parsed body of every request, oldest first. */
  requests: { messages?: { role?: string }[] }[];
}

function streamAnswer(res: http.ServerResponse, content: string): void {
  const chunk = (fields: object) => `data: ${JSON.stringify({ id: "smoke", object: "chat.completion.chunk", model: MODEL, ...fields })}\n\n`;
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.write(chunk({ choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] }));
  res.write(chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 1, total_tokens: 101 } }));
  res.end("data: [DONE]\n\n");
}

export function startFakeModel(): Promise<FakeModel> {
  const requests: FakeModel["requests"] = [];
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== COMPLETIONS_PATH) {
      req.resume();
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => { body += chunk; });
    req.on("end", () => {
      try {
        requests.push(JSON.parse(body) as FakeModel["requests"][number]);
      } catch {
        requests.push({}); // recorded anyway, so a malformed request still counts and fails the check that reads it
      }
      streamAnswer(res, "ok");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port, requests }));
  });
}
