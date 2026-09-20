import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import serverless from "serverless-http";
import { buildAppContext, createHttpApp } from "./http-app.js";

let cached: ReturnType<typeof serverless> | undefined;

async function getServer() {
  if (!cached) {
    const ctx = await buildAppContext();
    cached = serverless(createHttpApp(ctx));
  }
  return cached;
}

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  const server = await getServer();
  return server(event, context);
};
