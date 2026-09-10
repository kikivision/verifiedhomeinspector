## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Verifying changes

Run `npm run verify` before opening a pull request. It builds the site and runs
`scripts/smoke-test.mjs` against the built HTML. CI runs the same thing on every
pull request.

Check the built output, not the source. Every assertion in the smoke test exists
because something looked correct in the diff and was wrong in the output:

- A `description` prop was passed to a layout that never declared or rendered
  it, so every page shipped with no meta description. Astro drops unknown props
  silently.
- `trackEvent` ran before the layout had initialised gtag, because Astro bundles
  each page's script separately and guarantees no order between them. The event
  threw into a catch and was lost. The init call was present in the bundle; it
  simply ran too late.
- An explanatory comment written inside `.map()` was emitted once per listing:
  123KB of a 253KB page.
- `supabase.upsert()` replaces every column in the object it is given, so an
  import carrying `tier: 'unclaimed'` would have reverted paying customers. The
  comment above it asserted the opposite.

When a path cannot be tested — no credentials, no data yet — say so rather than
writing a comment that implies it was checked. A comment claiming behaviour
nobody verified is worse than no comment, because it stops the next person
looking.
