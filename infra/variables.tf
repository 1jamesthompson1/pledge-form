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
  description = "School office address that receives every pledge notification email"
  type        = string
  default     = ""
}

variable "email_dev" {
  description = "Optional address that receives test (?dev) submissions instead of the school office; leave empty to fall back to email_admin"
  type        = string
  default     = ""
}

variable "allowed_origins" {
  description = "Browser origins allowed to call the pledge API. Restrict to the exact site(s) embedding the form."
  type        = list(string)
  default     = ["https://www.tera.school.nz", "https://tera.school.nz", "https://localhost:5173"]
}

variable "retention_days" {
  description = "How long pledge submissions and audit records are kept before deletion (privacy retention period)"
  type        = number
  default     = 730
}

variable "create_app_registration" {
  description = "Create a Microsoft Entra app registration for Graph email sending"
  type        = bool
  default     = true
}
