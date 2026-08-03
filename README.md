# Te Ra Pledge Form

An embeddable 2026 digital pledge form for Te Ra School and Te Rawhiti Kindergarten.

Current development version: `0.0.1`.

## Local development

```sh
npm install
npm run dev
```

Open the HTTPS URL printed by Vite. The development server uses a local certificate so it behaves more like the HTTPS Squarespace deployment. Your browser may show a certificate warning the first time.

Build the self-contained file with:

```sh
npm run build
```

The generated `embed/pledge-form.html` contains the HTML, CSS and JavaScript in one self-contained file and is attached to the GitHub Release.

## Embedding in Squarespace

The release workflow attaches the bundled HTML file to each GitHub Release. The tracked bundle can also be served through jsDelivr directly from GitHub:

```html
<iframe
  src="https://cdn.jsdelivr.net/gh/1jamesthompson1/pledge-form@main/embed/pledge-form.html"
  title="Special Character Pledge Form 2026"
  style="display:block;width:100%;min-height:2600px;border:0"
></iframe>
```

GitHub Raw is not used because it may serve HTML as plain text. jsDelivr serves the GitHub file as web content and supports the iframe use case. Pin a release tag instead of `main` for a stable production URL, for example `@v0.0.1`.

The `Release` workflow checks and publishes semantic releases. `npm run build` generates the tracked `embed/pledge-form.html` bundle locally. Changes are intentionally not committed or pushed automatically during development.

## Runtime configuration

No endpoint is hardcoded. Configure the submission endpoint with either:

```text
https://example.org/te-ra-pledge-form.html?endpoint=https%3A%2F%2Fapi.example.org%2Fpledges
```

or, before the bundled script runs:

```html
<script>window.PLEDGE_CONFIG = { submitUrl: 'https://api.example.org/pledges' };</script>
```

The endpoint URL is not a secret. Never put an API key or credential in the HTML, query string, or browser JavaScript. Put authentication and validation on the server.

## Pricing rules

The editable 2026 pricing rules are in `src/pledge-config.js`. This includes school recommendations, kindergarten day rates, the per-child disbursement amount, four terms per year, and ten weeks per term. The form calculates annual, per-term, and estimated weekly totals from those values.

## Data and security decisions

- `localStorage` works in the iframe, but is scoped to the iframe's origin, not the Squarespace parent page. It can be cleared by the user, private browsing, storage restrictions, or an origin change. It is a convenience draft, not a backup.
- HTTPS encrypts data in transit. `localStorage` is not encrypted at rest, so this MVP should not be used for sensitive medical details until the school approves the storage and privacy model.
- For production, prefer an Azure Function or a small Azure API over posting directly to Power Automate. The API can validate the payload, apply rate limiting, log safely, and call a Power Automate flow or Microsoft Graph using server-side credentials.
- Power Automate HTTP triggers can receive the JSON and insert it into an approved Microsoft 365 destination, but the trigger URL is effectively a bearer credential. Treat it as sensitive operational configuration, restrict the flow, and rotate it if exposed.
- Before collecting health information, confirm New Zealand Privacy Act obligations, retention, access, and deletion processes with the school. Consider keeping medical information in the existing school system rather than this form.

## Releases

Commits follow Conventional Commits, for example:

```text
feat: add photo permission section
fix: preserve radio button drafts
docs: clarify embedding setup
```

Pushes to `main` run lint and build, then semantic-release creates a semantic GitHub Release and attaches the bundled `te-ra-pledge-form.html`. A `feat` produces a minor release, `fix` produces a patch release, and `BREAKING CHANGE:` produces a major release.
