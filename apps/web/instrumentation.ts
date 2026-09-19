export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { keys } = await import("./lib/identity");
    await keys();
  }
}
