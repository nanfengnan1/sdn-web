# Vben upstream

This UI forks Vue Vben Admin **v5.7.0**, commit
`63a38dce49ba109f61607994e21ba921d8e970e9` from
https://github.com/vbenjs/vue-vben-admin . Its MIT license remains in `LICENSE`.
The real Vben BasicLayout, preferences, menu, stores, styles, localization and build
tooling are used. Other applications, mock backend, docs and demo pages are removed.

SDN authentication and API calls replace the demonstration implementation. Tokens
are kept only in a dedicated in-memory session, never in the persisted Vben access
store. Node 24.14.0 / pnpm 10.33.4 are the tested toolchain; pnpm-lock.yaml pins this
fork's dependencies. G6 renders topology; no fabricated metrics are included.
