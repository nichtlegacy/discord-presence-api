## What this changes

<!-- One or two sentences. If it fixes an issue, write "Fixes #123". -->

## Why

<!-- The problem, not the diff. -->

## How it was tested

- [ ] `npm test` is green
- [ ] `npm run typecheck` is clean
- [ ] If it touches rendering, I looked at an actual card

## Checklist

- [ ] One logical change; no unrelated reformatting
- [ ] Existing embed URLs keep working (new card parameters default to the
      current behaviour)
- [ ] New or changed environment variables are documented in `.env.example`
      and the README
- [ ] New or changed card parameters are documented in the README table
- [ ] New non-trivial logic has a test in `tests/`
- [ ] Nothing new reaches the network outside the `lib/http.ts` allowlist
