#!/usr/bin/env node
/**
 * Every sendbeam.io link in every discussion must still resolve, and an
 * anchor must still exist on its page. The community points at the docs
 * rather than copying them; this is what keeps a renamed page or heading
 * from leaving dead pointers behind. Needs GITHUB_TOKEN (read is enough).
 */
const token = process.env.GITHUB_TOKEN;
const OWNER = 'sendbeam-io', REPO = 'community';
async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'sendbeam-community-links' }, body: JSON.stringify({ query, variables }) });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(JSON.stringify(body.errors ?? body).slice(0, 300));
  return body.data;
}
const links = new Map(); // url → [discussion urls]
let after = null;
for (;;) {
  const d = await gql(`query($after:String){ repository(owner:"${OWNER}",name:"${REPO}"){ discussions(first:50, after:$after){ nodes{ url body comments(first:50){ nodes{ body } } } pageInfo{ hasNextPage endCursor } } } }`, { after });
  for (const n of d.repository.discussions.nodes) {
    const text = [n.body, ...n.comments.nodes.map((c) => c.body)].join('\n');
    for (const m of text.matchAll(/https:\/\/sendbeam\.io[^\s)\]>"'`]*/g)) {
      const url = m[0].replace(/[.,;:]+$/, '');
      links.set(url, [...(links.get(url) ?? []), n.url]);
    }
  }
  if (!d.repository.discussions.pageInfo.hasNextPage) break;
  after = d.repository.discussions.pageInfo.endCursor;
}
const pages = new Map();
let bad = 0;
for (const [url, where] of links) {
  const [page, anchor] = url.split('#');
  if (!pages.has(page)) {
    const res = await fetch(page, { headers: { 'User-Agent': 'sendbeam-community-links' }, redirect: 'follow' }).catch(() => null);
    pages.set(page, res && res.ok ? await res.text() : null);
  }
  const html = pages.get(page);
  if (html === null) { bad++; console.log(`::error::${url} does not answer 200 — linked from ${[...new Set(where)].join(', ')}`); continue; }
  if (anchor && !new RegExp(`id=["']${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(html)) {
    bad++; console.log(`::error::${url} — no element with id "${anchor}" on the page — linked from ${[...new Set(where)].join(', ')}`);
  }
}
console.log(`${links.size} distinct sendbeam.io links checked across the discussions; ${bad} broken.`);
process.exit(bad ? 1 : 0);
