import { lazy } from "@/util/lazy"
import { KiloIndexing } from "@/kilocode/indexing"
import { createIndexingRoutes } from "@kilocode/kilo-indexing/server" // kilocode_change

// kilocode_change start
export const IndexingRoutes = lazy(() =>
  createIndexingRoutes({
    current: () => KiloIndexing.current(),
  }),
)
// kilocode_change end
