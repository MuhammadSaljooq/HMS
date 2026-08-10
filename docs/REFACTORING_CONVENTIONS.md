# Refactoring Conventions

This guide defines the default boundaries and patterns to keep HMS maintainable as we refactor.

## Frontend conventions

- Keep route files thin; move orchestration and data logic into hooks/services.
- Use shared metadata for navigation and RBAC. Avoid duplicating route/role rules across components.
- Standardize API error parsing via `frontend/lib/api-errors.ts`.
- Use a server-state layer (React Query) for API-backed data and avoid ad-hoc repeated `useEffect` fetch logic.
- Prefer operation-specific loading/error state over one shared mutable flag for multiple async actions.

## Backend conventions

- Routers should orchestrate request/response only; domain logic belongs in `backend/app/services/*`.
- Authorization decisions should be centralized in policy helpers (`authorization_service`) rather than repeated role conditionals.
- Time/date handling for appointments should flow through shared appointment service helpers.
- Keep transactional correctness in service logic (locks/conflict checks), not spread across handlers.

## Reliability and observability

- Every HTTP response should include `x-request-id`; preserve incoming IDs when present.
- Health endpoints should expose dependency-level checks (`database`, `redis`).
- Add tests for behavior and policy boundaries whenever refactoring business logic.

## CI and quality gates

- CI must validate:
  - backend dependency integrity + source compilation + tests
  - frontend lint + build
- Expand CI checks only after codebase alignment to avoid flaky gates.

## Pull request expectations

- Prefer smaller PRs per domain (frontend policy, backend services, observability, CI).
- Include:
  - scope summary
  - behavior changes
  - validation steps run locally
  - any migration/runtime impact
