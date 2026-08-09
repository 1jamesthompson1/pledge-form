resource "azuread_application" "pledge_email" {
  count        = var.create_app_registration ? 1 : 0
  display_name = "${local.name_prefix}-email-sender"

  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

    resource_access {
      id   = "b633e1c5-b582-4048-a93e-9f11b44c7e96" # Mail.Send (application)
      type = "Role"
    }

    resource_access {
      id   = "75359482-378d-4052-8f01-80520e7db3cd" # Files.ReadWrite.All (application)
      type = "Role"
    }
  }
}

resource "azuread_service_principal" "pledge_email" {
  count     = var.create_app_registration ? 1 : 0
  client_id = azuread_application.pledge_email[0].client_id
}

resource "time_sleep" "app_role_propagation" {
  count           = var.create_app_registration ? 1 : 0
  create_duration = "60s"
  depends_on      = [azuread_service_principal.pledge_email]
}

resource "azuread_application_password" "pledge_email" {
  count          = var.create_app_registration ? 1 : 0
  application_id = azuread_application.pledge_email[0].id
  display_name   = "Function app email sender"
}

resource "azuread_app_role_assignment" "graph_mail_send" {
  count               = var.create_app_registration ? 1 : 0
  app_role_id         = "b633e1c5-b582-4048-a93e-9f11b44c7e96" # Mail.Send
  principal_object_id = azuread_service_principal.pledge_email[0].object_id
  resource_object_id  = data.azuread_service_principal.microsoft_graph.object_id
  depends_on          = [time_sleep.app_role_propagation]
}

resource "azuread_app_role_assignment" "graph_files_readwrite" {
  count               = var.create_app_registration ? 1 : 0
  app_role_id         = "75359482-378d-4052-8f01-80520e7db3cd" # Files.ReadWrite.All
  principal_object_id = azuread_service_principal.pledge_email[0].object_id
  resource_object_id  = data.azuread_service_principal.microsoft_graph.object_id
  depends_on          = [time_sleep.app_role_propagation]
}

data "azuread_service_principal" "microsoft_graph" {
  client_id = "00000003-0000-0000-c000-000000000000"
}
