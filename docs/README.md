# Tome of Secrets Documentation

This directory contains technical documentation for the Tome of Secrets project.

## Architecture Decision Records (ADRs)

Architecture Decision Records document significant architectural decisions made in the project, including context, options considered, and rationale.

- **[ADR-001: Character Sheet Architecture Refactoring](./ADR-001-character-sheet-refactoring.md)**  
  Documents the major refactoring of the character sheet from a monolithic structure to a modular, service-oriented architecture. Covers UI/UX improvements (tabbed interface) and code architecture changes (RewardCalculator service, Quest Handlers, Model classes).

## Technical Documentation

- **[Refactoring Recommendations](./REFACTORING-RECOMMENDATIONS.md)**  
  A living document with recommendations for future refactoring work. Includes prioritized suggestions for improving code quality, maintainability, and extensibility. Updated as new opportunities are identified.

## For Developers

### Quick Links

- **New to the project?** Start with [ADR-001](./ADR-001-character-sheet-refactoring.md) to understand the current architecture
- **Planning improvements?** Check [Refactoring Recommendations](./REFACTORING-RECOMMENDATIONS.md) for ideas
- **Adding new content?** See the [Adding Content Guide](#) _(to be created)_

### Document Index

| Document | Purpose | When to Read |
|----------|---------|--------------|
| ADR-001 | Understand current architecture | Starting development, onboarding |
| Refactoring Recommendations | Identify improvement opportunities | Planning refactoring work, before major features |

## Contributing to Documentation

When making significant architectural decisions:

1. Create a new ADR using the template below
2. Number it sequentially (ADR-002, ADR-003, etc.)
3. Update this README with a link to the new ADR

### ADR Template

```markdown
# ADR-XXX: [Title]

**Status:** [Proposed | Accepted | Deprecated | Superseded]  
**Date:** YYYY-MM-DD  
**Deciders:** [List decision makers]

## Context and Problem Statement
[Describe the context and problem]

## Decision Drivers
* [driver 1]
* [driver 2]

## Considered Options
* Option 1
* Option 2
* Option 3

## Decision Outcome
Chosen option: "[option]", because [justification].

### Positive Consequences
* [e.g., improvement of quality attribute]

### Negative Consequences
* [e.g., compromising quality attribute]

## Links
* [Link to related documents]
```

## Maintenance

- Review refactoring recommendations quarterly
- Update ADRs if decisions are superseded
- Archive outdated documentation

