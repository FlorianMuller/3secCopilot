
##@ Dev

.PHONY: run
run: ## Start the app in developement (work with expo go)
	npm start

.PHONY: update-migration
update-migration: ## Update the drizzle migration file. Should be run if drizzle schemas are changed
	npx drizzle-kit generate

##@ Dev Build

IOS_DEVICE ?= "iPhone de Florian"

.PHONY: ios-build-dev
ios-build-dev: export EXPO_BUILD_MODE ?= dev
ios-build-dev: ## Build the iOS app and insall it on IOS_DEVICE
	npx expo run:ios --device ${IOS_DEVICE}

##@ Dogfood Build

.PHONY: ios-build-df-xcode
ios-build-df-xcode: export EXPO_BUILD_MODE ?= dogfood
ios-build-df-xcode: ## Build xcode project for production
	npx expo prebuild --clean

##@ Build utils

.PHOMY: xcode-open-workspace
xcode-open-workspace: ## Open the iOS project in Xcode
	open ios/3secsCopilot.xcworkspace

.PHONY: ios-list-devices
xcode-list-devices: ## List available devices in Xcode
	xcrun xctrace list devices

##@ Other

.PHONY: help
help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf " \033[36m%-35s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	