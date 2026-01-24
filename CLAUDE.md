# ReleaseRadar - Claude Code Instructions

## Publish Command

When the user says **"publish"**, **"release"**, or **"publish it"**:

1. **Bump version** in `package.json` (patch increment, e.g., 1.1.6 → 1.1.7)
2. **Run tests**: `npm test`
3. **Commit**: `git add -A && git commit -m "chore: release vX.X.X"`
4. **Push to GitHub**: `git push`
5. **Publish to npm**: `npm publish --access public`
6. **Create GitHub release**: `gh release create vX.X.X --title "vX.X.X" --notes "<changelog>"`

If the user specifies a version type (major, minor, patch), use that instead of patch.

### Changelog Notes

- If there are meaningful changes since the last release, summarize them
- If it's just a version bump for testing, use "Test release" or similar

### Example

```
User: "publish"

Claude: [bumps 1.1.6 → 1.1.7, runs tests, commits, pushes, publishes to npm, creates GitHub release]
```
