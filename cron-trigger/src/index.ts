// GitHub Actions' own `schedule` trigger is best-effort and under load can
// silently run hours late or skip a tick entirely -- confirmed in this repo
// by comparing configured cadence against actual run timestamps via
// `gh run list`, which showed gaps of 3-12+ hours. Cloudflare's Cron
// Triggers are reliable to the minute, so this Worker owns the schedule
// instead: GitHub's own `schedule:` blocks have been removed from the three
// sync workflows (see .github/workflows/*.yml), and this is now the only
// thing that fires them, via the REST workflow_dispatch API.
//
// This map's keys must stay byte-for-byte identical to the `crons` array in
// wrangler.toml -- `event.cron` below is whatever cron string the Cron
// Trigger that fired was registered with, so changing the schedule in only
// one place (the dashboard, or only here) silently breaks the mapping:
// either a tick matches nothing (logged, no-op) or -- worse -- a changed
// cron string happens to collide with a different tier's old key and
// dispatches the wrong workflow.
const WORKFLOW_BY_CRON: Record<string, string> = {
  "*/10 * * * *": "sync-fast-tier.yml",
  "*/30 * * * *": "sync-slow-tier.yml",
  "0 */6 * * *": "sync-digest.yml",
};

interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO: string; // "owner/repo"
}

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const workflow = WORKFLOW_BY_CRON[event.cron];
    if (!workflow) {
      console.error(`No workflow mapped for cron "${event.cron}"`);
      return;
    }

    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "morning-hockey-cron-trigger",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    });

    if (!response.ok) {
      console.error(`Dispatching ${workflow} failed: ${response.status} ${await response.text()}`);
    }
  },
};
