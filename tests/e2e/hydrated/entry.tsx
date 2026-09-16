import { createRoot } from "react-dom/client";

import { EventIdentityPanel } from "@/app/events/[id]/create/EventIdentityPanel";
import type { IdentityView } from "@/lib/generation/identity-view";

/**
 * Mounts the production panel, hydrated, with whatever initial view the page embedded.
 *
 * Test-only and never shipped: it is bundled by the browser suite itself and exists nowhere in the
 * application's route tree, so no page is added to production merely to be tested.
 */
const node = document.getElementById("panel")!;
const initial = JSON.parse(document.getElementById("initial")!.textContent!) as IdentityView;
createRoot(node).render(<EventIdentityPanel eventId="harness-event" initial={initial} />);
