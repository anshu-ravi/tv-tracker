# Thin wrappers over the npm scripts in package.json.

.DEFAULT_GOAL := help
.PHONY: help install serve build start lint test

help: ## List available targets
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies from the lockfile
	npm ci

serve: ## Run the dev server on http://localhost:3000
	npm run dev

build: ## Production build
	npm run build

start: ## Serve the production build (run `make build` first)
	npm run start

lint: ## eslint
	npm run lint

test: ## vitest, full suite
	npm test
