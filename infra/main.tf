locals {
  name_prefix = "${var.app_name}-${var.environment}"
}

resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_storage_account" "functions" {
  name                     = "${lower(var.app_name)}func${var.environment}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${local.name_prefix}-logs"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_application_insights" "main" {
  name                = "${local.name_prefix}-insights"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  application_type    = "Node.JS"
  workspace_id        = azurerm_log_analytics_workspace.main.id
}

resource "azurerm_service_plan" "main" {
  name                = "${local.name_prefix}-plan"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  sku_name            = var.function_plan_tier == "Consumption" ? "Y1" : var.function_plan_tier == "PremiumV2" ? "P1v2" : "P1v3"
}

resource "azurerm_linux_function_app" "main" {
  name                = "${local.name_prefix}-${var.location_code}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  service_plan_id     = azurerm_service_plan.main.id

  storage_account_name       = azurerm_storage_account.functions.name
  storage_account_access_key = azurerm_storage_account.functions.primary_access_key

  site_config {
    application_insights_key               = azurerm_application_insights.main.instrumentation_key
    application_insights_connection_string = azurerm_application_insights.main.connection_string
    application_stack {
      node_version = "20"
    }
    cors {
      allowed_origins = ["*"]
    }
  }

  app_settings = {
    "FUNCTIONS_WORKER_RUNTIME" = "node"
    "NODE_ENV"                 = "production"
    "EMAIL_ENABLED"            = "true"
    "EMAIL_SENDER"             = var.email_sender
    "EMAIL_ADMIN"              = var.email_admin
    "AZURE_TENANT_ID"          = data.azuread_client_config.current.tenant_id
    "AZURE_CLIENT_ID"          = var.create_app_registration ? azuread_application.pledge_email[0].client_id : ""
    "AZURE_CLIENT_SECRET"      = var.create_app_registration ? azuread_application_password.pledge_email[0].value : ""
    "EXCEL_ENABLED"            = var.excel_workbook_path != "" ? "true" : "false"
    "EXCEL_WORKBOOK_PATH"      = var.excel_workbook_path
    "EXCEL_TABLE_NAME"         = var.excel_table_name
  }
}

data "azuread_client_config" "current" {}
