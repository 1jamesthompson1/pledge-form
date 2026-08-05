# Te Ra Pledge Form

An embeddable 2026 digital pledge form for Te Ra School and Te Rawhiti Kindergarten.

Current development version: `0.0.1`.

## Local development

```sh
npm install
cp .env.example .env   # optional; sets local endpoint, contact email and dev mode
npm run dev
```

The `.env` file supplies the dev-only runtime config — `VITE_SUBMIT_URL`, `VITE_CONTACT_EMAIL` and `VITE_DEV=true` — which the dev server injects as `window.PLEDGE_CONFIG`. With `VITE_DEV=true` a discreet **Load test data** button appears next to the save status; one press fills the whole form with sample answers (same data as the `?dev=1` query string, which still works for testing the submission endpoint).

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

## Backend

The backend is a power automate workflow.

## Pricing rules

The editable pledge pricing rules are in `src/pledge-config.js`. This includes the year, school recommendations, kindergarten day rates, the per-child disbursement amount, four terms per year, and 52 weeks per calendar year. The form calculates annual, per-term, and calendar-year weekly totals from those values. The payment plan is indicative only, with optional details.

## Mid-year start URLs

Add a `startDate` query parameter to the form URL for families joining partway through the school year. Recommended amounts are then pro-rated to the remaining weeks of the school year, calculated from the Ministry of Education term dates in `src/pledge-config.js` (term dates rounded up to whole weeks):

```text
https://example.org/te-ra-pledge-form.html?startDate=2027-07-19
```

When a start date is set, a note appears in the pledge section ("These recommended amounts are based on a start date of ...") and the start date is included in the submission payload.

## Releases

Commits follow Conventional Commits, for example:

```text
feat: add photo permission section
fix: preserve radio button drafts
docs: clarify embedding setup
```

Pushes to `main` run lint and build, then semantic-release creates a semantic GitHub Release and attaches the bundled `te-ra-pledge-form.html`. A `feat` produces a minor release, `fix` produces a patch release, and `BREAKING CHANGE:` produces a major release.

## GitHub Pages

When a release is published, the `Deploy to GitHub Pages` workflow builds the form and deploys it as a static site at `https://tera-pledge-form.sjhl.nz`. The static site is the same single-file form, so configure it the same way (e.g. with the `endpoint` query string or a `window.PLEDGE_CONFIG` snippet in the head).
