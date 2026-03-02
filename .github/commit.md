# .copilot-commit-message-instructions

This file guides GitHub Copilot to generate consistent, clear, and helpful commit messages.

## Purpose

Provide a simple standard so Copilot produces commit messages that make the repository history easy to understand.

## Message Style

- Use clear and direct language.
- The commit title should be up to 72 characters.
- The body should explain _why_ the change was made, not only _what_ was changed.
- Avoid vague descriptions.

## Suggested Format

```
<type>: <short summary of the change>

Optional context explaining the motivation, impact, or relevant details.
Use short lists if multiple related changes were made.
```

## Recommended Types

- **feat**: new feature
- **fix**: bug fix
- **refactor**: code improvement without behavior changes
- **docs**: documentation updates
- **test**: adding or improving tests
- **chore**: auxiliary tasks (build, configs, etc.)

## Example

```
feat: add token-based login support

Implements a token-based authentication flow to allow passwordless access
for automated clients. Includes validation logic and tests.
```

## Notes for Copilot

- Generate concise but informative messages.
- Always try to explain the motivation behind changes.
- Never produce generic commit messages like "update" or "changes".