/**
 * Bumped whenever the vector-tile payload changes shape or the postal-code
 * dataset is reimported.
 *
 * Tiles are cached for a day at the edge and in the browser, so without a
 * version in the URL a client keeps serving the old ones until that expires —
 * which is how a tile still carrying the previous property names survived a
 * deploy during development.
 */
export const TILES_VERSION = "2";
