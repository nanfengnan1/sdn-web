ARG GO_IMAGE=golang:1.25-alpine3.22
ARG NODE_IMAGE=node:24-alpine3.22
ARG ALPINE_IMAGE=alpine:3.22
FROM ${GO_IMAGE} AS gateway-build
WORKDIR /src
COPY sdn-agent/go.mod sdn-agent/go.sum ./sdn-agent/
COPY sdn-agent/api ./sdn-agent/api
COPY sdn-controller/go.mod sdn-controller/go.sum ./sdn-controller/
COPY sdn-controller/api ./sdn-controller/api
COPY sdn-web/gateway/go.mod sdn-web/gateway/go.sum ./sdn-web/gateway/
WORKDIR /src/sdn-web/gateway
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY sdn-web/gateway ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -o /out/sdn-web-gateway ./cmd/sdn-web-gateway

FROM ${NODE_IMAGE} AS ui-build
ENV CI=true PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install -g pnpm@10.33.4
WORKDIR /src/ui
COPY sdn-web/ui ./
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
RUN pnpm test && pnpm typecheck && pnpm build

FROM ${ALPINE_IMAGE} AS gateway
RUN apk add --no-cache ca-certificates tini && addgroup -S sdn && adduser -S -G sdn sdn
COPY --from=gateway-build /out/sdn-web-gateway /usr/local/bin/
USER sdn
EXPOSE 18080
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 CMD wget -q -O /dev/null http://127.0.0.1:18080/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/sdn-web-gateway"]
CMD ["-listen", ":18080"]

FROM ${ALPINE_IMAGE} AS ui
RUN apk add --no-cache nginx && mkdir -p /usr/share/nginx/html
COPY --from=ui-build /src/ui/apps/web-ele/dist /usr/share/nginx/html/
COPY sdn-web/docker/nginx.conf /etc/nginx/nginx.conf
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]

# Default bundled deployment: independently built UI and Gateway, two processes.
# The gateway/ui targets above remain available for separate deployment.
FROM ${ALPINE_IMAGE} AS web
RUN apk add --no-cache ca-certificates nginx python3 tini && mkdir -p /usr/share/nginx/html
COPY --from=gateway-build /out/sdn-web-gateway /usr/local/bin/
COPY --from=ui-build /src/ui/apps/web-ele/dist /usr/share/nginx/html/
COPY sdn-web/docker/nginx.conf /etc/nginx/nginx.conf
RUN sed -i 's@http://gateway:18080@http://127.0.0.1:18080@' /etc/nginx/nginx.conf
COPY sdn-web/docker/supervisor.py /usr/local/lib/sdn-web/supervisor.py
USER nginx
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 CMD ["python3", "/usr/local/lib/sdn-web/supervisor.py", "--healthcheck"]
ENTRYPOINT ["/sbin/tini", "--", "python3", "/usr/local/lib/sdn-web/supervisor.py"]
CMD ["-controller", "controller:19090", "-insecure"]
