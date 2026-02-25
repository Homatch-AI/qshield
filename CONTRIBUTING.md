# Contributing to QShield

Thank you for your interest in QShield! We welcome contributions.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/qshield.git`
3. Install dependencies: `pnpm install`
4. Build: `pnpm build`
5. Run tests: `pnpm test`

## Development Setup

- **Node.js** >= 20
- **pnpm** >= 9
- **macOS** or **Windows** (for Electron development)

## Project Structure

| Package | Description |
|---------|-------------|
| `packages/qshield-core` | Shared library: trust scoring, crypto, evidence, policy |
| `packages/qshield-desktop` | Electron desktop application |
| `packages/qshield-gateway` | REST API + WebSocket server |

## Pull Request Process

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Ensure `pnpm build` and `pnpm test` pass
4. Submit a PR with a clear description

## Code Style

- TypeScript strict mode
- ESLint + Prettier (run `pnpm lint`)
- Descriptive commit messages (conventional commits preferred)

## Reporting Issues

Use [GitHub Issues](https://github.com/Homatch-AI/qshield/issues). For security issues, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the same terms as the project. See [LICENSE](LICENSE).
