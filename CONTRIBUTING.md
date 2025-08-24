# Contributing Guidelines

Thank you for your interest in contributing to SessionBase CLI. Whether it's a bug report, new feature, correction, or additional documentation, we greatly value feedback and contributions from our community.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary information to effectively respond to your bug report or contribution.

## Before You Start

### Reporting Bugs/Feature Requests
We welcome you to use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check existing open, or recently closed, issues to make sure somebody else hasn't already reported the issue. Please try to include as much information as you can. Details like these are incredibly useful:

- A reproducible test case or series of steps
- The version of the CLI being used
- Any modifications you've made relevant to the bug
- Anything unusual about your environment or deployment

## Contribution Guidelines

### Commits & Testing
- **Smaller commits are preferred** - easier to review and understand
- **Please provide information on how changes were tested** in your PR description
- **Please disclose AI contributions** - if you used AI tools, link your SessionBase sessions!

### Documentation
- **Please submit a PR to update documentation** in [sessionbase/docs](https://github.com/sessionbase/docs) if you are updating command behavior or arguments

## Priority Areas

### High Priority
- **Integration with new platforms**: OpenAI Codex, Amp, Cursor (IDE and CLI), Cline, Windsurf, OpenCode
- **`sb pull` command**: Pull down and resume a session, either your own or from another user

### Medium Priority
- **TUI for browsing/uploading sessions**: Should pull in local and remote sessions, provide ability to push/see what is already pushed, etc.

Looking at the existing issues is a great way to find something to contribute on. Look for any 'help wanted' issues as a great place to start.

## Contributing via Pull Requests

Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

- You are working against the latest source on the main branch
- You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already
- You open an issue to discuss any significant work - we would hate for your time to be wasted

To send us a pull request, please:

1. Fork the repository
2. Create a feature branch from `main`. 
2. Modify the source, including relevant test and documentation changes; please focus on the specific change you are contributing.
3. Ensure local tests pass
4. Commit to your fork using clear commit messages
5. Open a pull request against the `main` branch of `sessionbase/cli`. 

## Platform Development

When adding support for new AI platforms:

- **All platforms implement the `SessionProvider` interface** and extend the `BaseSessionProvider`
- **Platforms are available to commands via the `PlatformRegistry` class**
- **Build against these abstractions** - try to avoid leaking platform-specific details to the CLI commands
- **Update the MCP Server** to support the new platform
- **Each platform has its own quirks** in how data is stored and referenced locally. This may require new abstractions to support additional platforms
- **Update the documentation in [sessionbase/docs](https://github.com/sessionbase/docs)** to include details about the new platform

## Security Issue Notifications

If you discover a potential security issue in this project we ask that you notify us via our [security reporting page](https://sessionbase.ai/security). Please do not create a public GitHub issue for security vulnerabilities.

## Questions?

- **Issues**: Use GitHub issues for bugs and feature requests
- **Email**: reach out to support@sessionbase.ai

## Licensing

By contributing, you agree that your contributions will be licensed under the MIT License.
