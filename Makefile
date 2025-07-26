
.PHONY: run
run: ## Start the app in developement (work with expo go)
	npm start

.PHONY: update-migration
update-migration: ## Update the drizzle migration file. Should be run if drizzle schemas are changed
	npx drizzle-kit generate

#@ Build

.PHONY: ios-build
ios-build: ## Build the iOS app
	npx expo run:ios

.PHOMY: open-xcode
open-xcode: ## Open the iOS project in Xcode
	open ios/3secCopilot.xcworkspace

#@ Other

.PHONY: help
help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf " \033[36m%-35s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	