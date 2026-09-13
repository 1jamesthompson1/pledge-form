terraform {
  required_version = ">= 1.5.0"

  # Remote state lives in Azure Storage. The connection details are supplied at
  # init time from a gitignored backend.tfbackend file (copy the .example):
  #   tofu init -backend-config=backend.tfbackend -migrate-state
  # `use_azuread_auth = true` means no storage key is needed or stored locally.
  backend "azurerm" {}

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.53"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
  }
}

provider "azurerm" {
  features {}
}

provider "azuread" {}
