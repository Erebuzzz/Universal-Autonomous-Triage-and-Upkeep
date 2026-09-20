import { loadLocalEnv } from "./load-local-env.js";

loadLocalEnv();

import { buildAppContext, createHttpApp } from "./http-app.js";
import { startLocalRescanPolling } from "./rescan.js";

const port = Number(process.env.UATU_API_PORT ?? 8787);

async function main() {
  const ctx = await buildAppContext();
  const app = createHttpApp(ctx);
  const stopPoll = startLocalRescanPolling({
    store: ctx.store,
    orchestrator: ctx.orchestrator,
    audit: ctx.audit,
  });
  app.listen(port, () => {
    console.log(`UATU API listening on http://localhost:${port}`);
    console.log(`Fixture sandbox: ${ctx.fixturePath}`);
  });
  process.on("SIGINT", () => {
    stopPoll();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
