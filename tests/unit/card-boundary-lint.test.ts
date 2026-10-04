import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CARD_BOUNDARY_FILES } from "../../eslint.config.mjs";

/**
 * The app / card / page boundary (`docs/design-system.md §23.7`): app chrome and the pages render
 * the card through `InvitationCard` only and never import card styling or the renderer's
 * internals. Lints synthetic modules at real paths, so the rule is proven to fire where it must,
 * and not where it must not.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: ROOT });

async function restrictedImports(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
}

const FORBIDDEN = [
  'import "@/styles/card-fonts.css";',
  'import "../../styles/card-fonts.css";',
  'import { x } from "@/components/card/internal";',
  'import { x } from "../../components/card/internal";',
];
/** App chrome reaches the renderer as a sibling directory. */
const FORBIDDEN_FROM_APP_CHROME = 'import { x } from "../card/internal";';
const ALLOWED =
  'import { InvitationCard } from "@/components/card/InvitationCard";\nvoid InvitationCard;';

describe("the card styling boundary", () => {
  it("covers app chrome and the pages", () => {
    expect(CARD_BOUNDARY_FILES).toEqual(["src/app/**", "src/components/app/**"]);
  });

  it.each([
    "src/components/app/Example.tsx",
    "src/app/e/[slug]/page.tsx",
    // A service-role caller keeps the card boundary.
    "src/app/auth/callback/route.ts",
  ])(
    "forbids card fonts and renderer internals in %s",
    async (file) => {
      for (const code of FORBIDDEN) {
        const messages = await restrictedImports(file, code);
        expect(messages, code).toHaveLength(1);
        expect(messages[0]).toMatch(/§23\.7/);
      }
      expect(await restrictedImports(file, ALLOWED)).toEqual([]);
    },
    60_000,
  );

  it("forbids the renderer's internals as a sibling of app chrome", async () => {
    const file = "src/components/app/Example.tsx";
    expect(await restrictedImports(file, FORBIDDEN_FROM_APP_CHROME)).toHaveLength(1);
    expect(
      await restrictedImports(file, 'import { InvitationCard } from "../card/InvitationCard";'),
    ).toEqual([]);
  }, 60_000);

  it("forbids the renderer's internals from folders nested inside app chrome", async () => {
    for (const [file, code] of [
      ["src/components/app/editor/Toolbar.tsx", 'import { x } from "../../card/internal";'],
      ["src/components/app/editor/panels/Fonts.tsx", 'import { x } from "../../../card/internal";'],
    ]) {
      expect(await restrictedImports(file, code), file).toHaveLength(1);
    }
    expect(
      await restrictedImports(
        "src/components/app/editor/Toolbar.tsx",
        'import { InvitationCard } from "../../card/InvitationCard";\nvoid InvitationCard;',
      ),
    ).toEqual([]);
  }, 60_000);

  it("keeps app components and app styling out of the card renderer", async () => {
    for (const code of [
      'import { AppButton } from "@/components/app/AppButton";\nvoid AppButton;',
      'import { AppButton } from "../app/AppButton";\nvoid AppButton;',
      'import "@/styles/app-tokens.css";',
      'import "../../app/globals.css";',
    ]) {
      const messages = await restrictedImports("src/components/card/Other.tsx", code);
      expect(messages, code).toHaveLength(1);
      expect(messages[0]).toMatch(/§23\.7/);
    }
  }, 60_000);

  it("leaves the card renderer itself free to load its fonts", async () => {
    expect(
      await restrictedImports("src/components/card/Other.tsx", 'import "@/styles/card-fonts.css";'),
    ).toEqual([]);
  }, 60_000);

  it("keeps the service-role boundary in the pages", async () => {
    const messages = await restrictedImports(
      "src/app/e/[slug]/page.tsx",
      'import { createAdminClient } from "@/lib/supabase/admin";\nvoid createAdminClient;',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/service-role/);
  }, 60_000);
});
