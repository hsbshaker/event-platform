/** Types for `wawoff2` (Google's woff2 compiled to WebAssembly), which ships none. */
declare module "wawoff2" {
  /** Decode WOFF2 bytes to SFNT (TrueType/OpenType). Rejects when the input is not valid WOFF2. */
  export function decompress(woff2: Uint8Array): Promise<Uint8Array>;
  /** Encode SFNT bytes as WOFF2. */
  export function compress(sfnt: Uint8Array): Promise<Uint8Array>;
}
