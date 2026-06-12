// Generates assets/metrics-light.svg and assets/metrics-dark.svg in the
// Apple design language (getdesign.md/apple tokens): parchment/near-black
// surfaces, SF Pro system stack, single blue accent, hairline dividers.
import { writeFileSync, mkdirSync } from "node:fs";

const TOKEN = process.env.GH_TOKEN;
const LOGIN = process.env.GH_LOGIN || "PangMo5";
if (!TOKEN) {
  console.error("GH_TOKEN is required");
  process.exit(1);
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', Arial, sans-serif";

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const QUERY = `query ($login: String!, $cursor: String) {
  user(login: $login) {
    followers { totalCount }
    pullRequests { totalCount }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
  }
}`;

async function fetchStats() {
  let cursor = null;
  let user = null;
  const repos = [];
  do {
    const data = await gql(QUERY, { login: LOGIN, cursor });
    user = data.user;
    repos.push(...user.repositories.nodes);
    const page = user.repositories.pageInfo;
    cursor = page.hasNextPage ? page.endCursor : null;
  } while (cursor);

  const stars = repos.reduce((sum, r) => sum + r.stargazerCount, 0);

  const langBytes = new Map();
  for (const repo of repos)
    for (const edge of repo.languages.edges)
      langBytes.set(edge.node.name, (langBytes.get(edge.node.name) || 0) + edge.size);
  const totalBytes = [...langBytes.values()].reduce((a, b) => a + b, 0) || 1;
  const languages = [...langBytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({ name, pct: (bytes / totalBytes) * 100 }));

  const days = user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  return {
    stars,
    contributions: user.contributionsCollection.contributionCalendar.totalContributions,
    followers: user.followers.totalCount,
    pullRequests: user.pullRequests.totalCount,
    languages,
    days,
  };
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n) => n.toLocaleString("en-US");

function render(stats, theme) {
  const big = [
    [num(stats.stars), "stars earned"],
    [num(stats.contributions), "contributions, past year"],
    [num(stats.followers), "followers"],
    [num(stats.pullRequests), "pull requests"],
  ];
  const bigCols = big
    .map(([value, caption], i) => {
      const x = 135 + i * 270;
      return `
    <text x="${x}" y="196" font-size="52" font-weight="600" letter-spacing="-1" fill="${theme.ink}" text-anchor="middle">${value}</text>
    <text x="${x}" y="230" font-size="15" font-weight="400" letter-spacing="-0.2" fill="${theme.sub}" text-anchor="middle">${caption}</text>`;
    })
    .join("");

  const langRows = stats.languages
    .map((lang, i) => {
      const y = 384 + i * 34;
      const width = Math.max(4, (lang.pct / 100) * 240);
      return `
    <text x="80" y="${y}" font-size="15" font-weight="400" letter-spacing="-0.2" fill="${theme.ink}">${esc(lang.name)}</text>
    <rect x="200" y="${y - 10}" width="240" height="6" rx="3" fill="${theme.track}"/>
    <rect x="200" y="${y - 10}" width="${width.toFixed(1)}" height="6" rx="3" fill="${theme.accent}"/>
    <text x="452" y="${y}" font-size="13" font-weight="400" fill="${theme.muted}">${lang.pct.toFixed(1)}%</text>`;
    })
    .join("");

  const maxCount = Math.max(1, ...stats.days.map((d) => d.contributionCount));
  const bars = stats.days
    .map((day, i) => {
      const x = 585 + i * 30;
      const h = Math.max(4, (day.contributionCount / maxCount) * 120);
      const fill = day.contributionCount > 0 ? theme.accent : theme.track;
      return `
    <rect x="${x}" y="${(510 - h).toFixed(1)}" width="20" height="${h.toFixed(1)}" rx="6" fill="${fill}"/>`;
    })
    .join("");
  const recent = stats.days.reduce((sum, d) => sum + d.contributionCount, 0);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="620" viewBox="0 0 1080 620">
  <rect width="1080" height="620" fill="${theme.bg}"/>
  <g font-family="${FONT}">
    <text x="540" y="92" font-size="34" font-weight="600" letter-spacing="-0.4" fill="${theme.ink}" text-anchor="middle">By the numbers.</text>${bigCols}
    <line x1="80" y1="278" x2="1000" y2="278" stroke="${theme.hairline}" stroke-width="1"/>
    <text x="80" y="338" font-size="21" font-weight="600" letter-spacing="0.2" fill="${theme.ink}">Languages.</text>${langRows}
    <text x="580" y="338" font-size="21" font-weight="600" letter-spacing="0.2" fill="${theme.ink}">Last 14 days.</text>${bars}
    <text x="580" y="544" font-size="13" font-weight="400" fill="${theme.muted}">${num(recent)} contributions</text>
    <text x="540" y="592" font-size="12" font-weight="400" letter-spacing="-0.1" fill="${theme.muted}" text-anchor="middle">Refreshed hourly by GitHub Actions.</text>
  </g>
</svg>
`;
}

const LIGHT = {
  bg: "#f5f5f7",
  ink: "#1d1d1f",
  sub: "#6e6e73",
  muted: "#86868b",
  hairline: "#e0e0e0",
  track: "#e0e0e0",
  accent: "#0066cc",
};
const DARK = {
  bg: "#1d1d1f",
  ink: "#f5f5f7",
  sub: "#cccccc",
  muted: "#86868b",
  hairline: "#3a3a3c",
  track: "#3a3a3c",
  accent: "#2997ff",
};

const stats = await fetchStats();
mkdirSync("assets", { recursive: true });
writeFileSync("assets/metrics-light.svg", render(stats, LIGHT));
writeFileSync("assets/metrics-dark.svg", render(stats, DARK));
console.log(
  `metrics rendered: ${num(stats.stars)} stars, ${num(stats.contributions)} contributions, ` +
    `${stats.languages.map((l) => l.name).join("/")}`,
);
