# Te Ra Pledge Functions

Azure Functions backend for the Te Ra pledge form.

## Local development

Install dependencies and start the Functions runtime:

```sh
cd functions
npm install
npm start
```

The HTTP endpoint is available at:

```text
http://localhost:7071/api/pledges
```

Test it with curl:

```sh
curl -X POST http://localhost:7071/api/pledges \
  -H "Content-Type: application/json" \
  -d '{
    "parentName": "Test Parent",
    "email": "test@example.com",
    "schoolChildCount": 1,
    "kindergartenChildCount": 0,
    "signature": "Test Signature",
    "signatureDate": "2026-08-03",
    "timeOnPageMs": 30000
  }'
```

The endpoint treats submissions without `timeOnPageMs` (or with a value under 5 seconds) as likely spam: it accepts them with a 200 response but does not send the notification email or run downstream actions.

## Deployment

1. Create a Function App in the Azure portal (Node.js 20, Consumption plan).
2. Deploy with the Azure Functions extension for VS Code or the CLI:

```sh
cd functions
func azure functionapp publish <your-function-app-name>
```

3. Configure the required app settings in the Azure portal (do not commit real secrets):

| Setting | Description |
|---|---|
| `EMAIL_ENABLED` | `true` to send emails, `false` to skip |
| `EMAIL_SENDER` | Email address to send from (must be a licensed mailbox) |
| `EMAIL_ADMIN` | Optional school office address to CC on every pledge email |
| `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration client secret |
| `EXCEL_ENABLED` | `true` to append pledges to an Excel workbook, `false` to skip |
| `EXCEL_WORKBOOK_PATH` | Drive-relative Graph path to the workbook (see below) |
| `EXCEL_TABLE_NAME` | Name of the Excel table to append rows to (default `Pledges`) |

`local.settings.json` is included in the repo as a template with placeholder values. Update it for local development, but fill real secrets through the Azure portal or a CI/CD secret store when deploying.

## Email via Microsoft Graph

The optional email sender uses the Microsoft Graph API with an app registration. To keep things simple, leave `EMAIL_ENABLED=false` until you are ready to set up the App Registration.

### Setup steps

1. **Create an App Registration** in Microsoft Entra ID (Azure portal → Microsoft Entra ID → App registrations → New registration).
   - Name: `Te Ra Pledge Email Sender`
   - Supported account types: single tenant
   - Redirect URI: none needed

2. **Note the values** from the Overview page:
   - **Application (client) ID** → `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_TENANT_ID`

3. **Add a client secret** (Certificates & secrets → New client secret). Copy the secret value immediately — it will be hidden later. This becomes `AZURE_CLIENT_SECRET`.

4. **Add API permissions**:
   - Microsoft Graph → Application permissions → `Mail.Send`
   - Click **Grant admin consent for [tenant]**

5. **Create or pick a sender mailbox**. The email address must have an active Microsoft 365 / Exchange Online license and a mailbox in the same tenant. This becomes `EMAIL_SENDER`.

6. **Set the app settings** in your Azure Function App (Configuration → Application settings):

   | Setting | Value |
   |---|---|
   | `EMAIL_ENABLED` | `true` |
   | `EMAIL_SENDER` | the sender email address |
   | `EMAIL_ADMIN` | optional school office address to CC |
   | `AZURE_TENANT_ID` | your tenant ID |
   | `AZURE_CLIENT_ID` | your app registration client ID |
   | `AZURE_CLIENT_SECRET` | your client secret |

7. **Restart the Function App** and submit a test pledge.

The Function will send an email to the parent/guardian address from the form payload, using the configured sender mailbox. A **PDF of the pledge is generated and attached** to every email (`src/pledgePdf.js`, pdfkit) — the school sees the full form including all children, amounts, custody arrangements, and signature.

## Payload format

The real form (`src/main.js`) submits `{ "form": {...}, "submittedAt": "...", "timeOnPageMs": 12345, "startDate": "..." }`. The function also accepts flat payloads (form fields at top level) for simple curl testing. Submissions without `timeOnPageMs` or under 5 seconds, or with the honeypot field filled, are accepted with 200 but suppressed (no email/Excel).

## Excel logging via Microsoft Graph

The optional Excel logger appends every submission as a row to a real `.xlsx` workbook stored in OneDrive for Business or SharePoint (requires a work/school tenant — the Graph Excel API does not support personal OneDrive).

### Setup steps

1. **Add the `Files.ReadWrite.All` (application) permission** to the same app registration and grant admin consent (if using the Terraform config, it is included automatically).

2. **Create the workbook**: in Excel Online/desktop, create a file with these column headers in this exact order (81 columns — the canonical list is defined in `src/graphExcel.js` as `EXCEL_COLUMNS`):

   ```
   Parent / guardian name | Email address | Submitted at | Start date | School children count | Kindergarten / Nursery children count | Total pledge | Disbursement total | Supplementary donation | Payment plan | Signature | Signature date | School child 1 name | School child 1 class | School child 1 amount | School child 1 disbursement | School child 2 name | School child 2 class | School child 2 amount | School child 2 disbursement | School child 3 name | School child 3 class | School child 3 amount | School child 3 disbursement | School child 4 name | School child 4 class | School child 4 amount | School child 4 disbursement | School child 5 name | School child 5 class | School child 5 amount | School child 5 disbursement | Kindergarten child 1 name | Kindergarten child 1 age | Kindergarten child 1 days/week | Kindergarten child 1 amount | Kindergarten child 1 disbursement | Kindergarten child 2 name | Kindergarten child 2 age | Kindergarten child 2 days/week | Kindergarten child 2 amount | Kindergarten child 2 disbursement | Kindergarten child 3 name | Kindergarten child 3 age | Kindergarten child 3 days/week | Kindergarten child 3 amount | Kindergarten child 3 disbursement | Kindergarten child 4 name | Kindergarten child 4 age | Kindergarten child 4 days/week | Kindergarten child 4 amount | Kindergarten child 4 disbursement | Kindergarten child 5 name | Kindergarten child 5 age | Kindergarten child 5 days/week | Kindergarten child 5 amount | Kindergarten child 5 disbursement | Emergency contact 1 name | Emergency contact 1 phone | Emergency contact 1 relationship | Emergency contact 2 name | Emergency contact 2 phone | Emergency contact 2 relationship | Medical consent 1 | Medical consent 2 | Medical consent 3 | Medical consent 4 | Conduct consent 1 | Conduct consent 2 | Conduct consent 3 | Conduct consent 4 | EOTC consent 1 | EOTC consent 2 | EOTC consent 3 | EOTC consent 4 | Photos consent 1 | Photos consent 2 | Photos consent 3 | Photos consent 4 | Custody arrangements apply | Custody details
   ```

   Select the header row + data area → **Insert → Table** → name it `Pledges` (or your `EXCEL_TABLE_NAME`). Save the file to OneDrive/SharePoint. Cells for children not added to the form are written as blanks.

3. **Find the workbook path**: in Graph Explorer, run
   `GET https://graph.microsoft.com/v1.0/sites/{tenant}.sharepoint.com:/sites/{site}:/drive/root:/Documents/pledges.xlsx`
   and copy `parentReference.driveId` and `id` from the response → `EXCEL_WORKBOOK_PATH` is
   `drives/{driveId}/items/{id}`.

4. **Set `EXCEL_ENABLED=true`** (plus `EXCEL_WORKBOOK_PATH` and `EXCEL_TABLE_NAME`), restart the Function App, and submit a test pledge.

If the workbook write fails, the endpoint returns 502 and the error is logged to Application Insights.

## Cold starts

On the Consumption plan, the Function will cold-start after idle periods. If the submission delay is noticeable, either:

- Use a Premium plan for always-ready workers.
- Add a timer-triggered Function that pings `/api/pledges` every 5 minutes.
- Use an App Service plan with Always on enabled.
