variable "resource_group_name" {
  description = "Name of the Azure resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "New Zealand North"
}

variable "location_code" {
  description = "Short Azure region code, e.g. newzealandnorth"
  type        = string
  default     = "newzealandnorth"
}

variable "app_name" {
  description = "Short name used for resources"
  type        = string
  default     = "te-ra-pledge"
}

variable "environment" {
  description = "Environment suffix, e.g. prod or dev"
  type        = string
  default     = "prod"
}

variable "function_plan_tier" {
  description = "Consumption or PremiumV2/PremiumV3 for the Function App"
  type        = string
  default     = "Consumption"
  validation {
    condition     = contains(["Consumption", "PremiumV2", "PremiumV3"], var.function_plan_tier)
    error_message = "function_plan_tier must be Consumption, PremiumV2, or PremiumV3."
  }
}

variable "email_sender" {
  description = "Licensed mailbox to send emails from"
  type        = string
}

variable "email_admin" {
  description = "Optional school office address to CC"
  type        = string
  default     = ""
}

variable "create_app_registration" {
  description = "Create a Microsoft Entra app registration for Graph email sending"
  type        = bool
  default     = true
}

variable "excel_workbook_path" {
  description = "Drive-relative Graph path to the Excel workbook, e.g. drives/b!abc123/items/01XYZ (empty disables Excel logging)"
  type        = string
  default     = ""
}

variable "excel_table_name" {
  description = "Name of the Excel table to append rows to (e.g. Pledges)"
  type        = string
  default     = "Pledges"
}
