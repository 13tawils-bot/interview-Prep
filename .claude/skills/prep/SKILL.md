---
name: prep
description: Interview and job-search prep for the owner of this repo. Use when the user types /prep, optionally followed by a company, job ID, job URL, or "jobs". With a target, builds a full interview prep pack; with "jobs" or nothing, summarises the best new roles from the Role Pipeline dashboard.
---

# /prep

The user's personal details (CV, role brief, interview notes) are NOT in this repository, which is public. They live in the private Role Pipeline dashboard database:

- Dashboard: https://claude.ai/artifact/245FZrXBcAbuJtihKm1gSr
- Read with the ArtifactData tool (load via ToolSearch `select:ArtifactData`):
  - `config/profile`: `resume`, `preferences` (the roles, sectors, stages, locations and pay they want), `interview_notes` (how to frame their last exit, strongest stories, likely probes, voice)
  - `jobs/<id>`: saved roles with fit, reason, gap, status and notes
  - `meta/status`: last automatic scan and remaining API quota

Never copy anything from those documents into files committed to this repo.

## `/prep` or `/prep jobs`

1. Query `jobs` for status `new` or `shortlisted` with fit `strong` or `stretch`.
2. Reply with a short list, best first: title, company, location, one-line reason, gap. Mention when the last scan ran (`meta/status`).
3. Offer to prep any of them, and remind the user they can change a role's stage on the dashboard.

## `/prep <company | job id | job URL>`

1. **Find the role.** A job id: read `jobs/<id>`. A URL or company: check `jobs` for a match, else use what the user gave you. If there's no job description, ask for it or research the company's open roles.
2. **Load the user.** Read `config/profile`.
3. **Research.** Web search the company (product, customers, funding, recent news, competitors) and any named interviewer. Cite sources. If sites are blocked in this environment, say so and use search results.
4. **Build the prep pack as a doc** (use the docs skill/connector): at a glance (interview, interviewer, goal, 3 things to land); company in 60 seconds; what the role really needs mapped to their proof points; 60-second intro tailored to this role; 4-5 stories with numbers from `interview_notes`; likely questions with answer angles (including their exit framing from `interview_notes`); smart questions to ask, tailored to the interviewer's role; watch-outs; a pre-call checklist.
5. **Mark the role.** If it's in `jobs`, set its status to `shortlisted` (pin `if_version`) unless it's already further along.
6. **Offer a mock.** `prep init` can take the job description, then `prep mock --mode mixed --persona hiring_manager`.

## Style

Write in plain British English, as the user would say it. They dislike text that reads as AI-written: no em-dash asides, no "not X but Y", no filler. Be specific and honest about gaps.

## Rules for application answers

Some employers (Anthropic, for example) ask candidates to write the first draft of application answers themselves and only use AI to refine. Check the employer's policy; if it applies, help the user brainstorm and refine their own draft instead of writing it for them.
