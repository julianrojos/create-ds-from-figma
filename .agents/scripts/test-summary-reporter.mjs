export default async function* summaryReporter(events) {
  for await (const event of events) {
    if (event.type !== 'test:summary' || event.data.file !== undefined) continue;
    const { success, counts, duration_ms } = event.data;
    yield JSON.stringify({ schemaVersion: 1, success, counts, durationMs: duration_ms }) + '\n';
  }
}
