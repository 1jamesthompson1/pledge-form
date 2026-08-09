# Te Ra Pledge Form

An embeddable 2027 digital pledge form for Te Ra School and Te Rawhiti Kindergarten.

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

The generated `embed/pledge-form.html` contains the HTML, CSS and JavaScript in one self-contained file, ready to embed or publish.

The pre-commit hook (Husky, installed by `npm install`) runs `npm run build` automatically and blocks the commit if `embed/pledge-form.html` is stale, so the tracked bundle never drifts from `src/`. The Release workflow runs the same check on every push to `main`.

## Embedding in Squarespace

Copy the GitHub Raw link for `embed/pledge-form.html` and paste it into a Squarespace Code Block:

Copy from this [url](https://raw.githubusercontent.com/1jamesthompson1/pledge-form/refs/heads/main/embed/pledge-form.html)

### Always up to date: no more copy and paste

Alternatively, paste this Code Block **once**. It fetches the latest
`embed/pledge-form.html` from the jsDelivr CDN at runtime and injects it
directly into the page — no iframe, and future releases update automatically:

```html
<div id="te-ra-pledge-form"></div>
<script>
  window.PLEDGE_CONFIG = { submitUrl: 'https://api.example.org/pledges', contactEmail: 'office@tera.school.nz' };
  (async function () {
    const container = document.getElementById('te-ra-pledge-form');
    const res = await fetch('https://cdn.jsdelivr.net/gh/1jamesthompson1/pledge-form@main/embed/pledge-form.html');
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    container.innerHTML = doc.body.innerHTML;
    document.head.appendChild(doc.querySelector('style'));
    const script = doc.querySelector('script');
    await import(URL.createObjectURL(new Blob([script.textContent], { type: 'text/javascript' })));
  })();
</script>
```

Notes:

- `cdn.jsdelivr.net/gh/...` serves GitHub files with CORS enabled, so the
  `fetch` works from any site. `@main` tracks the latest release; pin a tag
  (e.g. `@1.2.0`) for a fixed version.
- `window.PLEDGE_CONFIG` is read by the bundle after the markup is injected,
  so the endpoint and contact email can still be set here on the page.
- Same behaviour as the copy-and-paste approach: styles are injected
  page-globally and draft saving uses the site's own `localStorage`.

The `Release` workflow checks and publishes semantic releases. `npm run build` generates the tracked `embed/pledge-form.html` bundle locally. Changes are intentionally not committed or pushed automatically during development.

## Runtime configuration

No endpoint or contact email is hardcoded. Before the bundled script runs, set both values on `window.PLEDGE_CONFIG`. The contact email is optional — without it the "Questions? Contact the office" footer link is omitted. The `submitUrl` is required for submissions to work:

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

## Testing and development

Add `?dev=1` to the URL to pre-fill the form with sample data. This is useful for testing the submission endpoint without typing every field:

```text
https://example.org/te-ra-pledge-form.html?dev=1&endpoint=https%3A%2F%2Fapi.example.org%2Fpledges
```

The sample data is committed as `src/example-data.json` — it *is* the dev test data: the **Load test data** button and `?dev=1` fill the form from this file, so there is no separate hardcoded copy to keep in sync. The same file doubles as an example of the submission payload: the `form` object is exactly what the browser serializes and POSTs, and `submittedAt` / `timeOnPageMs` show the metadata added alongside it. The backend receives `{ form, submittedAt, timeOnPageMs, startDate? }` — see `functions/src/functions/pledgeReceiver.js` for how it is validated and stored.

## Backend

The optional Azure Functions backend lives in `functions/`. It receives the submitted pledge at `POST /api/pledges`, validates it, and optionally sends a notification email via Microsoft Graph. The attached PDF is generated by rendering the form itself in headless Chromium and printing it to A4, so the PDF always looks exactly like the live form (see `functions/README.md` for the lazy browser lifecycle and sync details).

## Infrastructure

The `infra/` folder contains OpenTofu (Terraform-compatible) configuration to provision the Azure Function App, storage, Application Insights, and the Microsoft Entra app registration for Graph email. See `infra/README.md` for usage.

Alternatively, a lightweight Power Automate workflow can serve as the backend.

## Pricing rules

The editable pledge pricing rules are in `src/pledge-config.js`. This includes the year, school recommendations, kindergarten day rates, the per-child disbursement amount, four terms per year, and the school-year term dates. The form calculates annual, per-term, and per-week totals from those values — per week uses the whole weeks spanning the school year (first term start to last term end, e.g. 46 weeks for 2027) rather than 52 calendar weeks. The payment plan is indicative only, showing the per-period price for each option (weekly, fortnightly, monthly, termly or lump sum) based on the current total.

## Form definition

The form's structure lives in `src/form-definition.js` — the nine sections with their titles (whanau details, the four consent sections, contribution, emergency contacts, custody and declaration), all consent and permission wording, and every field label. The form reads it directly, and the functions backend generates its copy (`functions/src/formDefinition.js`) from it via `npm run sync:config`. The backend PDF is verified against the current form by `npm test` (builds a PDF from `src/example-data.json`), and the release workflow runs that check on every push, so the PDF cannot drift from the form's content.

## Mid-year start URLs

Add a `startDate` query parameter to the form URL for families joining partway through the school year. Recommended amounts are then pro-rated to the remaining weeks of the school year, calculated from the Ministry of Education term dates in `src/pledge-config.js` (term dates rounded up to whole weeks):

```text
https://example.org/te-ra-pledge-form.html?startDate=2027-07-19
```

When a start date is set, a note appears in the pledge section ("These recommended amounts are based on a start date of ...") and the start date is included in the submission payload. The date is editable in the form — changing it re-calculates the recommended amounts immediately. The date must be in strict `YYYY-MM-DD` format; an unreadable date shows a warning instead of silently ignoring the parameter.

## Releases

Commits follow Conventional Commits, for example:

```text
feat: add photo permission section
fix: preserve radio button drafts
docs: clarify embedding setup
```

Pushes to `main` run lint and build, then semantic-release creates a semantic GitHub Release and attaches the bundled `te-ra-pledge-form.html`. The built `embed/pledge-form.html` is committed to the repo rather than uploaded as a release asset. A `feat` produces a minor release, `fix` produces a patch release, and `BREAKING CHANGE:` produces a major release.

## GitHub Pages

When a release is published, the `Deploy to GitHub Pages` workflow builds the form and deploys it as a static site at `https://tera-pledge-form.sjhl.nz`. The static site is the same single-file form, so configure it the same way (e.g. with the `endpoint` query string or a `window.PLEDGE_CONFIG` snippet in the head).
