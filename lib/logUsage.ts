export async function logUsage({
  project,
  model,
  inputTokens,
  outputTokens,
}: {
  project: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const url = process.env.USAGE_DASHBOARD_URL;
  if (!url) return;
  try {
    await fetch(`${url}/api/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, model, input_tokens: inputTokens, output_tokens: outputTokens }),
    });
  } catch { /* サイレントに無視 */ }
}
