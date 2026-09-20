import { buildAppContext, createHttpApp } from "./http-app.js";

const port = Number(process.env.UATU_API_PORT ?? 8787);

async function main() {
  const ctx = await buildAppContext();
  const app = createHttpApp(ctx);
  app.listen(port, () => {
    console.log(`UATU API listening on http://localhost:${port}`);
    console.log(`Fixture sandbox: ${ctx.fixturePath}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
