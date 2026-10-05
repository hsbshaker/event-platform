import { describe, expect, it } from "vitest";

import { cleanName, deriveDisplayName, type NamedGuest } from "./display-name";

/** The name on a party's invitation when the host leaves it blank (`spec.md §12.3`). */

const adult = (name: string): NamedGuest => ({ name, type: "adult" });
const child = (name: string): NamedGuest => ({ name, type: "child" });

describe("deriveDisplayName", () => {
  it("is the one guest's name", () => {
    expect(deriveDisplayName([adult("  Ana   Garcia ")])).toBe("Ana Garcia");
    expect(deriveDisplayName([adult("Cher")])).toBe("Cher");
  });

  it("joins two guests, sharing a family name when they have one", () => {
    expect(deriveDisplayName([adult("Ana Garcia"), adult("Luis Garcia")])).toBe(
      "Ana & Luis Garcia",
    );
    // Compared ignoring case; the second guest's spelling is used.
    expect(deriveDisplayName([adult("Ana garcia"), adult("Luis Garcia")])).toBe(
      "Ana & Luis Garcia",
    );
    expect(deriveDisplayName([adult("Mary Ann Lee"), child("Sam Lee")])).toBe("Mary Ann & Sam Lee");
    expect(deriveDisplayName([adult("Ana Garcia"), adult("Luis Diaz")])).toBe(
      "Ana Garcia & Luis Diaz",
    );
    // One-word names have no family name to share.
    expect(deriveDisplayName([adult("Ana"), adult("Luis")])).toBe("Ana & Luis");
    expect(deriveDisplayName([adult("Garcia"), adult("Luis Garcia")])).toBe("Garcia & Luis Garcia");
  });

  it("names a family of three or more when every adult shares the main contact's family name", () => {
    expect(deriveDisplayName([adult("Ana Garcia"), adult("Luis Garcia"), child("Mia Diaz")])).toBe(
      "The Garcia family",
    );
    expect(deriveDisplayName([adult("Ana Garcia"), child("Mia"), child("Leo")])).toBe(
      "The Garcia family",
    );
  });

  it("is the main contact and guests otherwise", () => {
    expect(deriveDisplayName([adult("Ana Garcia"), adult("Luis Diaz"), child("Mia Garcia")])).toBe(
      "Ana Garcia & guests",
    );
    expect(deriveDisplayName([adult("Ana"), adult("Luis"), adult("Mia")])).toBe("Ana & guests");
  });

  it("never passes the invitation-name limit", () => {
    const long = "A".repeat(70);
    const name = deriveDisplayName([adult(`${long} Smith`), adult(`${long} Jones`)]);
    expect(name).toBe(`${long} Smith & guests`);
    expect(name.length).toBeLessThanOrEqual(120);
  });

  it("ignores blank names and is empty with none", () => {
    expect(deriveDisplayName([])).toBe("");
    expect(deriveDisplayName([adult("  "), adult("Luis Garcia")])).toBe("Luis Garcia");
  });
});

describe("cleanName", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanName("  Ana \t  Maria\nGarcia ")).toBe("Ana Maria Garcia");
  });
});
