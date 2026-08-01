export const algorithmUpdatesDocs = `
# Google Algorithm Updates Reference

The \`analytics_drop_attribution\` tool correlates traffic drops with major known Google Algorithm Updates. The following updates are currently tracked (source: [Search Engine Journal](https://www.searchenginejournal.com/google-algorithm-history/)):

## 2026

| Date | Update Name | Impact Area |
|------|-------------|-------------|
| 2026-06-24 | June 2026 Spam Update | Spam / Content Quality |
| 2026-06-15 | Back Button Hijacking (Spam Policy Update) | UX / Deceptive Redirects |
| 2026-05-21 | May 2026 Core Update | General Ranking |
| 2026-04-10 | Generative AI Manipulation (Spam Policy Update) | AI Search / Overviews |
| 2026-03-27 | March 2026 Core Update | General Ranking |
| 2026-03-24 | March 2026 Spam Update | Spam / Content Quality |
| 2026-02-05 | February 2026 Discover Core Update | Discover Feed |

## 2025

| Date | Update Name | Impact Area |
|------|-------------|-------------|
| 2025-12-11 | December 2025 Core Update | General Ranking |
| 2025-08-26 | August 2025 Spam Update | Spam / Content Quality |
| 2025-06-30 | June 2025 Core Update | General Ranking |
| 2025-03-13 | March 2025 Core Update | General Ranking |

## 2024

| Date | Update Name | Impact Area |
|------|-------------|-------------|
| 2024-12-19 | December 2024 Spam Update | Spam / Content Quality |
| 2024-12-12 | December 2024 Core Update | General Ranking |
| 2024-11-11 | November 2024 Core Update | General Ranking |
| 2024-08-15 | August 2024 Core Update | General Ranking / Quality |
| 2024-06-20 | June 2024 Spam Update | Content Quality / Spam |
| 2024-05-14 | AI Overviews Rollout | Search Features / SERP |
| 2024-05-06 | Site Reputation Abuse (Manual Actions) | Parasite SEO / Spam |
| 2024-03-05 | March 2024 Core Update | General Ranking / Quality |

## 2023

| Date | Update Name | Impact Area |
|------|-------------|-------------|
| 2023-11-08 | November 2023 Reviews Update | Review Content |
| 2023-11-02 | November 2023 Core Update | General Ranking |
| 2023-10-05 | October 2023 Core Update | General Ranking |
| 2023-10-04 | October 2023 Spam Update | Spam / Multi-language |
| 2023-09-14 | September 2023 Helpful Content Update | Quality / Value |
| 2023-08-22 | August 2023 Core Update | General Ranking |
| 2023-04-12 | April 2023 Reviews Update | Review Content |
| 2023-03-15 | March 2023 Core Update | General Ranking |
| 2023-02-21 | February 2023 Product Reviews Update | Product Reviews |

## 2022

| Date | Update Name | Impact Area |
|------|-------------|-------------|
| 2022-12-14 | December 2022 Link Spam Update | Link Spam / SpamBrain |
| 2022-12-05 | December 2022 Helpful Content Update | Quality / Value |
| 2022-10-19 | October 2022 Spam Update | Spam |
| 2022-09-20 | September 2022 Product Review Update | Product Reviews |
| 2022-09-12 | September 2022 Core Update | General Ranking |

## How Attribution Works
When a traffic drop is detected, the system checks if it occurred within **+/- 3 days** of any of these dates. If it matches, the update is flagged as a potential primary cause of the drop.
`;

export default algorithmUpdatesDocs;
