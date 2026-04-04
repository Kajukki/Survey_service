# Survey Service — Agent Instructions

This project ships a **focused agent and workflow layer**: specialized agent prompts under `agents/`, reusable workflow knowledge under `skills/`, and always-on conventions under `rules/`.

**Inventory:** 5 agents · 6 skills · 21 rule files (common + web + typescript + python)

## Core Principles

1. **Agent-First** — Delegate to specialized agents for planning, architecture, review, and TDD guidance.
2. **Test-Driven** — Write tests before implementation; aim for strong coverage on critical paths.
3. **Security-First** — Never compromise on security; validate all inputs (see `rules/common/security.md` and stack-specific rules).
4. **Immutability** — Prefer creating new objects over mutating shared state unless the codebase explicitly uses another pattern.
5. **Plan Before Execute** — Plan complex features before writing code.

## Available Agents

| Agent | File | Purpose | When to Use |
|-------|------|---------|-------------|
| planner | `agents/planner.md` | Implementation planning | Complex features, refactoring, phased delivery |
| architect | `agents/architect.md` | System design and tradeoffs | Architecture decisions, scalability, boundaries |
| tdd-guide | `agents/tdd-guide.md` | Test-driven development | New features, bug fixes, red-green-refactor |
| code-reviewer | `agents/code-reviewer.md` | Code quality and maintainability | After writing or modifying code |
| typescript-reviewer | `agents/typescript-reviewer.md` | TypeScript/JavaScript review | TS/JS-specific review and idioms |

## Available Skills

Skills live under `skills/<name>/SKILL.md`. Read the relevant skill when the task matches its scope.

| Skill (folder) | YAML name | Purpose |
|----------------|-----------|---------|
| `frontend-patterns` | `angular-modern` | Angular v21+ (signals, standalone, `httpResource`, control flow, `inject()`) |
| `backend-patterns` | `backend-patterns` | Node/Express/Next API routes, layering, caching, middleware |
| `api-design` | `api-design` | REST design: resources, errors, pagination, versioning, rate limiting |
| `postgres-patterns` | `postgres-patterns` | PostgreSQL/Supabase: schema, indexes, queries, RLS, pooling |
| `coding-standards` | `coding-standards` | Cross-cutting TS/JS/React/Node conventions |
| `git-workflow` | `git-workflow` | Branching, commits, PRs, collaboration |

**Workflow surface:** `skills/` is the canonical place for workflow and domain guidance. Prefer adding or updating skills here before introducing ad-hoc long instructions elsewhere.

## Rules

Rules are layered; apply **common** first, then the stack that matches the work (**web**, **typescript**, or **python**).

| Layer | Path | Topics |
|-------|------|--------|
| Common | `rules/common/` | `development-workflow`, `git-workflow`, `patterns`, `security`, `testing`, `performance`, `code-review` |
| Web | `rules/web/` | `coding-style`, `design-quality`, `patterns`, `security`, `testing`, `performance` |
| TypeScript | `rules/typescript/` | `coding-style`, `patterns`, `security`, `testing` |
| Python | `rules/python/` | `coding-style`, `patterns`, `security`, `testing` |

Use the narrowest applicable layer together with common rules (for example, TypeScript work → `rules/common/*` + `rules/typescript/*`, and web UI concerns → `rules/web/*` as needed).

## Agent Orchestration

Use agents proactively when the task fits:

- Complex feature or refactor → **planner**
- System shape, boundaries, or scalability → **architect**
- Tests-first workflow → **tdd-guide**
- General quality pass after edits → **code-reviewer**
- TypeScript/JavaScript-specific review → **typescript-reviewer**

Run independent checks in parallel when it saves time (for example, planner plus architect on a large change).

## Security Guidelines

**Before ANY commit:**

- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized HTML)
- CSRF protection enabled where applicable
- Authentication/authorization verified
- Rate limiting on public endpoints
- Error messages do not leak sensitive data

**Secret management:** Never hardcode secrets. Use environment variables or a secret manager. Validate required secrets at startup. Rotate any exposed secrets immediately.

**If you find a security issue:** Stop and fix critical issues first, rotate exposed secrets, then scan for the same pattern elsewhere. Use `rules/common/security.md` and the relevant stack security rules as the checklist.

## Coding Style

Align with **`rules/common/patterns.md`** and the applicable **`coding-style`** rules for your stack.

**File organization:** Prefer smaller, cohesive files; organize by feature or domain where the codebase does.

**Error handling:** Handle errors at appropriate boundaries; log useful context server-side; avoid silent failures.

**Input validation:** Validate at system boundaries with schemas or equivalent; fail fast with clear messages.

## Testing Requirements

See **`rules/common/testing.md`** and stack-specific testing rules (`rules/web/testing.md`, `rules/typescript/testing.md`, or `rules/python/testing.md`).

**TDD-style workflow (when using the tdd-guide agent):**

1. Write a failing test (RED).
2. Implement the minimum to pass (GREEN).
3. Refactor and keep coverage meaningful on critical paths (IMPROVE).

## Development Workflow

1. **Plan** — For large or ambiguous work, use **planner**; note dependencies and risks.
2. **TDD** — Use **tdd-guide** when driving changes with tests.
3. **Review** — Use **code-reviewer** (and **typescript-reviewer** for TS/JS-heavy changes).
4. **Knowledge** — Put durable project knowledge in the repo’s existing docs or ADRs; avoid duplicating what is already in code or skills.
5. **Commit** — Conventional commits; PRs with a clear summary and test notes.

## Git Workflow

**Commit format:** `<type>: <description>` — Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Use **`skills/git-workflow`** and **`rules/common/git-workflow.md`** for branching and collaboration details.

## Architecture Patterns

**API responses:** Prefer a consistent envelope (success, data, errors, pagination) when the API layer uses that pattern.

**Data access:** Repository-style boundaries (find/create/update/delete behind interfaces) when the codebase uses them.

## Performance

**Context:** Reserve capacity for large refactors; batch tool reads when exploring big areas.

**Build or type errors:** Fix incrementally; re-run checks after each focused change. There is no dedicated build-resolver agent in this repo—use logs and stack-appropriate rules.

## Project Structure

```
agents/   — Agent prompt definitions (*.md)
skills/   — Workflow and domain skills (SKILL.md per skill)
rules/    — Layered always-follow guidelines (common, web, typescript, python)
AGENTS.md — This file
```

## Success Metrics

- Tests and checks relevant to the change pass
- No known security regressions; secrets stay out of source control
- Code remains readable and consistent with project rules and skills
- User and product requirements are met
