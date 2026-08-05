output "function_app_name" {
  description = "Name of the Azure Function App"
  value       = azurerm_linux_function_app.main.name
}

output "function_app_default_hostname" {
  description = "Default hostname of the Function App"
  value       = azurerm_linux_function_app.main.default_hostname
}

output "api_endpoint" {
  description = "URL to use for the form submission endpoint"
  value       = "https://${azurerm_linux_function_app.main.default_hostname}/api/pledges"
}

output "email_client_id" {
  description = "Client ID of the email app registration"
  value       = var.create_app_registration ? azuread_application.pledge_email[0].client_id : null
}

output "email_client_secret" {
  description = "Client secret for the email app registration"
  value       = var.create_app_registration ? azuread_application_password.pledge_email[0].value : null
  sensitive   = true
}

output "email_tenant_id" {
  description = "Tenant ID used for the email app registration"
  value       = data.azuread_client_config.current.tenant_id
}
