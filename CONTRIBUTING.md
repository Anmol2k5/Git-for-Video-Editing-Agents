# Contributing to EditVCS

First off, thank you for considering contributing to EditVCS!

## Setup

1. Clone the repository
2. Run `npm ci`
3. Run `npm run editvcs:build` to build all workspaces

## Testing

EditVCS uses Vitest for testing. To run the test suite:

```bash
npm run editvcs:test
```

Please ensure all tests pass before submitting a Pull Request.

## Pull Request Process

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. Update the README.md with details of changes to the interface, if applicable.
4. Issue that pull request!

## Code Style

- Use TypeScript for all new code.
- Follow the existing linting rules (`npm run editvcs:lint`).
- Ensure no raw filesystem errors or stack traces are leaked to the client.
