/** A fake OpenAI-compatible chat model on loopback: answers every request "ok" and keeps each request body. */
import * as http from "node:http";

export const PROVIDER = "example-provider";
export const MODEL = "example-model";

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
