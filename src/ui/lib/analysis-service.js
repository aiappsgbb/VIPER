import axios from "axios";
import http from "node:http";
import https from "node:https";

let analysisServiceClient;

function createAnalysisServiceClient() {
  const agentOptions = {
    keepAlive: true,
    timeout: 0,
  };

  return axios.create({
    timeout: 0,
    headers: { "Content-Type": "application/json" },
    httpAgent: new http.Agent(agentOptions),
    httpsAgent: new https.Agent(agentOptions),
  });
}

export function getAnalysisServiceClient() {
  if (!analysisServiceClient) {
    analysisServiceClient = createAnalysisServiceClient();
  }
  return analysisServiceClient;
}

export async function postToAnalysisService(url, payload) {
  const client = getAnalysisServiceClient();

  try {
    const response = await client.post(url, payload);
    return {
      ok: true,
      status: response.status,
      data: response.data ?? null,
    };
  } catch (error) {
    if (error?.response) {
      return {
        ok: false,
        status: error.response.status,
        data: error.response.data ?? null,
      };
    }
    throw error;
  }
}
