import { lazy } from "@/util/lazy"
import { KiloIndexing } from "@/kilocode/indexing"
import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"

// kilocode_change start
export const IndexingRoutes = lazy(() =>
  new Hono().get(
    "/status",
    describeRoute({
      summary: "Get indexing status",
      description: "Retrieve the current code indexing status for the active project.",
      operationId: "indexing.status",
      responses: {
        200: {
          description: "Indexing status",
          content: {
            "application/json": {
              schema: resolver(KiloIndexing.Status),
            },
          },
        },
      },
    }),
    async (c) => c.json(await KiloIndexing.current()),
  ),
)
// kilocode_change end
