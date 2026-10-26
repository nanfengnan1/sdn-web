GO ?= go
PNPM ?= pnpm
.PHONY: build gateway ui test
build: gateway ui
gateway:
	cd gateway && CGO_ENABLED=0 $(GO) build -o ../bin/sdn-web-gateway ./cmd/sdn-web-gateway
ui:
	cd ui && $(PNPM) build
test:
	cd gateway && $(GO) test -race ./...
	cd gateway && $(GO) vet ./...
	cd ui && $(PNPM) test
	cd ui && $(PNPM) typecheck
