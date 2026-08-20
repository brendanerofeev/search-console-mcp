---
title: "Backlinks and link gap"
description: "Off-page link profiles, competitor comparison, and the link-building shortlist."
---

Two tools covering the half of SEO that on-page work cannot reach. Both are
backed by DataForSEO, which is **prepaid and metered**: every call records its
cost into `api_spend`, because a prepaid balance drains silently and the only
other signal is a later call failing.

## Why off-page matters here

On-page and indexing work lifts a page into contention. The last few positions
against an established competitor are usually decided by authority, and without
link data the sentence *"we match them on every on-page signal and still cannot
rank"* has no answer.

It is not purely authority-driven, and the tools say so when the data supports
it. One Brisbane plumbing competitor outranks a site with a single referring
domain, so a well-built, indexed, focused page can still win.

---

## `backlink_report`

A site's link profile alongside its recorded competitors.

| Input | Required | Notes |
|---|---|---|
| `siteUrl` | yes | The site property URL |
| `competitors` | no | Extra domains on top of those on the site profile |

Returns referring domains, referring main domains, backlink count, broken
backlinks and a PageRank-modelled rank score for the site and each competitor,
plus `domainGap` against the strongest competitor and a plain-English verdict.

**Cost:** roughly `$0.024` per target, so one site plus three competitors is
about `$0.10`.

**It snapshots on every call.** Results are written to `backlink_daily` keyed by
`(site_url, target, date)`. A single reading of a link profile answers nothing;
the useful questions are "better than last month?" and "closing on them or
not?", and neither can be answered later if nothing was recorded at the time.

**Competitors come from the site profile** rather than a live SERP, so the
comparison set is a recorded decision rather than whatever ranked that day. With
no competitors recorded, the verdict says so instead of implying the profile is
healthy.

---

## `link_gap`

Domains linking to your competitors but not to you.

| Input | Required | Notes |
|---|---|---|
| `siteUrl` | yes | The site property URL |
| `competitors` | no | Defaults to those recorded on the site profile |
| `limit` | no | Max domains to return, default 40 |

Ordered by rank, with `competitorsLinked` per domain. Domains linking to several
competitors are the warmest prospects, because they demonstrably link to
businesses like this one.

**Cost:** roughly `$0.024` per call.

**No competitors means no request.** If none are supplied and none are recorded
on the profile, the tool returns a note and never reaches the network. An empty
list from a real query and an empty list from a missing comparison set look
identical, and only one of them should cost money.

**An empty result is a finding.** Brisbane plumbing returned zero shared
referring domains across four competitors. That does not mean the query failed;
it means the niche has no common link ecosystem to mine, so link building there
is manual outreach rather than list extraction. The `note` field says which case
you are looking at.

---

## Reading the two together

`backlink_report` sizes the problem. `link_gap` gives you somewhere to start.

A gap of more than about 20 referring domains is not closable by on-page work,
and the verdict says so directly rather than leaving you to infer it. Below
that, on-page and indexing work is usually the better spend.

## Prerequisites

- `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` in the environment. In an
  interactive session these are not loaded from sops automatically; run `/sync`
  or set them in `.env`.
- A reachable `DATABASE_URL`, since both tools meter spend and `backlink_report`
  snapshots history.
- Competitors on the site profile, set with `site_profile`.
