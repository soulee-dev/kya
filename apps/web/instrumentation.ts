export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { signer } = await import("./lib/identity");
    await signer();
  }
}
