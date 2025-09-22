import { Agent } from "undici";

let analysisServiceDispatcher;

export function getAnalysisServiceDispatcher() {
  if (!analysisServiceDispatcher) {
    analysisServiceDispatcher = new Agent({
      connect: { timeout: 0 },
      headersTimeout: 0,
      bodyTimeout: 0,
    });
  }
  return analysisServiceDispatcher;
}
