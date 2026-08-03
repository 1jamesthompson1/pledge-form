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

Copy the GitHub Raw link for `embed/pledge-form.html` and paste it into a Squarespace Code Block:

Copy from this [url](https://raw.githubusercontent.com/1jamesthompson1/pledge-form/refs/heads/main/embed/pledge-form.html)

The `Release` workflow checks and publishes semantic releases. `npm run build` generates the tracked `embed/pledge-form.html` bundle locally. Changes are intentionally not committed or pushed automatically during development.

## Runtime configuration

No endpoint or contact email is hardcoded. Before the bundled script runs, set both values on `window.PLEDGE_CONFIG`:

```html
<script>
  window.PLEDGE_CONFIG = {
    submitUrl: 'https://api.example.org/pledges',
    contactEmail: 'office@tera.school.nz'
  };
</script>
```

You can also configure the submission endpoint via the `endpoint` query string:

```text
https://example.org/te-ra-pledge-form.html?endpoint=https%3A%2F%2Fapi.example.org%2Fpledges
```

The endpoint URL is not a secret. Never put an API key or credential in the HTML, query string, or browser JavaScript. Put authentication and validation on the server.

## Testing and development

Add `?dev=1` to the URL to pre-fill the form with sample data. This is useful for testing the submission endpoint without typing every field:

```text
https://example.org/te-ra-pledge-form.html?dev=1&endpoint=https%3A%2F%2Fapi.example.org%2Fpledges
```

The custodial-arrangements section (section 06) supports multiple arrangements. Check "My children live across more than one household..." to reveal the first arrangement, then click **Add another custodial arrangement** for each additional household or agreement. Each arrangement records which children it applies to, living arrangements, legal restrictions, financial arrangements, and any further details.

## Backend

The optional Azure Functions backend lives in `functions/`. It receives the submitted pledge at `POST /api/pledges`, validates it, and optionally sends a notification email via Microsoft Graph. See `functions/README.md` for local development and deployment instructions.

## Infrastructure

The `infra/` folder contains OpenTofu (Terraform-compatible) configuration to provision the Azure Function App, storage, Application Insights, and the Microsoft Entra app registration for Graph email. See `infra/README.md` for usage.

## Pricing rules

The editable pledge pricing rules are in `src/pledge-config.js`. This includes the year, school recommendations, kindergarten day rates, the per-child disbursement amount, four terms per year, and 52 weeks per calendar year. The form calculates annual, per-term, and calendar-year weekly totals from those values. The payment plan is indicative only, with optional details.

## Releases

Commits follow Conventional Commits, for example:

```text
feat: add photo permission section
fix: preserve radio button drafts
docs: clarify embedding setup
```

Pushes to `main` run lint and build, then semantic-release creates a semantic GitHub Release and attaches the bundled `te-ra-pledge-form.html`. A `feat` produces a minor release, `fix` produces a patch release, and `BREAKING CHANGE:` produces a major release.
