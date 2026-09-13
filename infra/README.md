# OpenTofu / Terraform Infrastructure

This folder contains infrastructure-as-code for the Azure Function App backend.

## What it creates

- Azure resource group
- Storage account for the Function App
- Application Insights
- Linux Function App (Consumption by default, Premium optional)
- Private blob container (`pledge-submissions`) in the Function storage account — every raw submission is archived here before processing
- Audit table (`pledgeaudit`) recording blob name, parent name, submission date, processing status, email outcome and any errors
- Microsoft Entra app registration for Graph email sending
- Service principal and admin consent for `Mail.Send`

## Remote state (Azure Storage)

Terraform state holds the storage account key and the Entra client secret, so it must not live on a laptop. It is stored in a dedicated, private Azure Storage account and read with your Azure CLI identity — no storage key is stored anywhere.

Create the state account **once** (per environment). Pick a globally unique storage account name (3–24 lowercase letters and numbers) and use it consistently below:

```sh
LOCATION="australiaeast"
RG="rg-example-tfstate"
ST="examplestateacct0000"   # <-- change to a globally unique name

az group create -n "$RG" -l "$LOC"
az storage account create -n "$ST" -g "$RG" -l "$LOC" \
  --sku Standard_LRS --min-tls-version TLS1_2 \
  --allow-blob-public-access false --allow-shared-key-access false

# Give your own login data-plane access to the state (Azure AD, no key)
az role assignment create \
  --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --role "Storage Blob Data Contributor" \
  --scope "$(az storage account show -n "$ST" -g "$RG" --query id -o tsv)"

# Wait a minute for the role assignment to propagate, then create the container
az storage container create -n tfstate --account-name "$ST" --auth-mode login
```

Then point the backend at it and initialise:

```sh
cd infra
cp backend.tfbackend.example backend.tfbackend   # edit storage_account_name to $ST
tofu init -backend-config=backend.tfbackend
```

`backend.tfbackend` is gitignored and contains no secret (auth is via `use_azuread_auth = true`). Every `tofu init` needs `-backend-config=backend.tfbackend`; `plan`/`apply` do not. State is kept in Azure from the first `apply`, so nothing secret is written to the local filesystem.

## Prerequisites

- [OpenTofu](https://opentofu.org/docs/intro/install/) or Terraform installed
- Azure CLI logged in (`az login`)
- Permissions to create resources in the target Azure subscription
- Permissions to create app registrations and grant admin consent in Microsoft Entra

## Usage

1. Copy the example variables file:

```sh
cp terraform.tfvars.example terraform.tfvars
```

2. Edit `terraform.tfvars` with your values.

3. Initialize OpenTofu:

```sh
tofu init
```

4. Plan and apply:

```sh
tofu plan -out=tfplan
tofu apply tfplan
```

5. Note the outputs:

```sh
tofu output api_endpoint
```

Use the `api_endpoint` value as the form submission URL.

## Deploy the function code

OpenTofu creates the infrastructure. It does not deploy the code. After applying, deploy the code with:

```sh
cd ../functions
func azure functionapp publish $(tofu -chdir=../infra output -raw function_app_name)
```

## Important security notes

- `terraform.tfvars` and `.tfstate` files can contain secrets. Do not commit them.
- The client secret is stored in Terraform state. Store state in a secure backend such as Azure Storage with encryption.
- Admin consent is granted automatically by this configuration. The account running `tofu apply` must have the `Global Administrator` or `Privileged Role Administrator` role, or ownership of the service principal.
