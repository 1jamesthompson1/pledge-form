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
