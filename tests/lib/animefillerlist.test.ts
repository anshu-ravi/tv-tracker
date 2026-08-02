import { afterEach, describe, expect, it, vi } from "vitest";
import { getAnimeFillerData, parseEpisodeTable, parseShowIndex } from "@/lib/animefillerlist";

describe("parseShowIndex", () => {
  it("parses show anchors into slug/name pairs", () => {
    const html = `
      <ul>
        <li><a href="/shows/bleach">Bleach</a></li>
        <li><a href="/shows/code-geass">Code Geass: Lelouch of the Rebellion</a></li>
      </ul>
    `;

    expect(parseShowIndex(html)).toEqual([
      { slug: "bleach", name: "Bleach" },
      { slug: "code-geass", name: "Code Geass: Lelouch of the Rebellion" },
    ]);
  });
});

describe("parseEpisodeTable", () => {
  it("maps episode number to name + filler type, decoding HTML entities", () => {
    const html = `
      <table>
        <tr class="manga_canon odd" id="eps-1"><td class="Number">1</td><td class="Title"><a href="/shows/bleach/episodes/1">The Day I Became a Shinigami</a></td><td class="Type"><span>Manga Canon</span></td><td class="Date">2004-10-05</td></tr>
        <tr class="anime_canon even" id="eps-2"><td class="Number">2</td><td class="Title"><a href="#">Growing Pains &#039;n Trouble</a></td><td class="Type"><span>Anime Canon</span></td><td class="Date">2004-10-12</td></tr>
        <tr class="filler odd" id="eps-3"><td class="Number">3</td><td class="Title"><a href="#">Rock &amp; Roll</a></td><td class="Type"><span>Filler</span></td><td class="Date">2004-10-19</td></tr>
        <tr class="mixed_canon/filler even" id="eps-4"><td class="Number">4</td><td class="Title"><a href="#">Mixed Bag</a></td><td class="Type"><span>Mixed Canon/Filler</span></td><td class="Date">2004-10-26</td></tr>
      </table>
    `;

    const result = parseEpisodeTable(html);

    expect(result.size).toBe(4);
    expect(result.get(1)).toEqual({
      name: "The Day I Became a Shinigami",
      type: "canon",
    });
    expect(result.get(2)).toEqual({
      name: "Growing Pains 'n Trouble",
      type: "canon",
    });
    expect(result.get(3)).toEqual({ name: "Rock & Roll", type: "filler" });
    expect(result.get(4)).toEqual({ name: "Mixed Bag", type: "mixed" });
  });

  it("ignores rows missing a recognized type", () => {
    const html = `<tr id="eps-1"><td class="Number">1</td><td class="Title"><a href="#">Untyped</a></td><td class="Type"><span>Unknown</span></td></tr>`;

    expect(parseEpisodeTable(html).size).toBe(0);
  });
});

describe("parseShowIndex pairing", () => {
  // On the real animefillerlist.com index, some entries carry a legacy slug
  // that no longer matches the show's current display name (e.g. "Bleach
  // OVAs" is served at /shows/food-wars-fourth-plate — verified live by
  // fetching that URL and checking its <title>, which really is "Bleach
  // OVAs Filler List"). That looks alarming next to another entry but is
  // the site's own historical URL, not a parser bug: the regex captures
  // href and text from a single <a>...</a> match, so it cannot cross-pair
  // with a neighboring anchor. This test pins that guarantee.
  it("keeps each entry's href paired with its own anchor text, never a neighbor's", () => {
    const html = `
      <li><a href="/shows/food-wars-fifth-plate">Black Clover OVAs</a></li>
      <li><a href="/shows/bleach">Bleach</a></li>
      <li><a href="/shows/food-wars-fourth-plate">Bleach OVAs</a></li>
      <li><a href="/shows/bleach-thousand-year-blood-war">Bleach: Thousand-Year Blood War</a></li>
    `;

    expect(parseShowIndex(html)).toEqual([
      { slug: "food-wars-fifth-plate", name: "Black Clover OVAs" },
      { slug: "bleach", name: "Bleach" },
      { slug: "food-wars-fourth-plate", name: "Bleach OVAs" },
      { slug: "bleach-thousand-year-blood-war", name: "Bleach: Thousand-Year Blood War" },
    ]);
  });
});

describe("getAnimeFillerData with a multi-page title override", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges a franchise split across pages onto our absolute_number space via offset", async () => {
    // Mirrors the real Bleach case: main page covers local (= our) 1-366,
    // the TYBW page covers its own local 1-40 which maps to our 367-406.
    const bleachHtml = `
      <tr id="eps-1"><td class="Number">1</td><td class="Title"><a href="#">Shinigami</a></td><td class="Type"><span>Manga Canon</span></td></tr>
      <tr id="eps-366"><td class="Number">366</td><td class="Title"><a href="#">Last of Sereitei Arc</a></td><td class="Type"><span>Filler</span></td></tr>
    `;
    const tybwHtml = `
      <tr id="eps-1"><td class="Number">1</td><td class="Title"><a href="#">THE BLOOD WARFARE</a></td><td class="Type"><span>Manga Canon</span></td></tr>
      <tr id="eps-40"><td class="Number">40</td><td class="Title"><a href="#">MY LAST WORDS</a></td><td class="Type"><span>Manga Canon</span></td></tr>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/shows/bleach")) {
          return new Response(bleachHtml, { status: 200 });
        }
        if (url.endsWith("/shows/bleach-thousand-year-blood-war")) {
          return new Response(tybwHtml, { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const result = await getAnimeFillerData("Bleach");

    expect(result).not.toBeNull();
    expect(result?.get(1)).toEqual({ name: "Shinigami", type: "canon" });
    expect(result?.get(366)).toEqual({ name: "Last of Sereitei Arc", type: "filler" });
    // TYBW local 1 -> our 367 (offset -366: our = local - offset = 1 - (-366)).
    expect(result?.get(367)).toEqual({ name: "THE BLOOD WARFARE", type: "canon" });
    // TYBW local 40 -> our 406.
    expect(result?.get(406)).toEqual({ name: "MY LAST WORDS", type: "canon" });
    // Nothing published upstream yet for our 407-416 (S2's remaining
    // episodes) — must be absent, not fabricated.
    expect(result?.has(407)).toBe(false);
    expect(result?.has(416)).toBe(false);
  });

  it("still returns data from the other range when one range's page fails", async () => {
    const bleachHtml = `
      <tr id="eps-1"><td class="Number">1</td><td class="Title"><a href="#">Shinigami</a></td><td class="Type"><span>Manga Canon</span></td></tr>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/shows/bleach")) {
          return new Response(bleachHtml, { status: 200 });
        }
        if (url.endsWith("/shows/bleach-thousand-year-blood-war")) {
          return new Response("not found", { status: 500 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const result = await getAnimeFillerData("Bleach");

    expect(result?.get(1)).toEqual({ name: "Shinigami", type: "canon" });
    expect(result?.has(367)).toBe(false);
  });

  it("drops a range's episodes that fall outside its declared absolute bounds", async () => {
    // If a range page ever reports more local episodes than the arc it was
    // pinned for, minAbsolute/maxAbsolute must fence it off rather than
    // silently bleeding into an adjacent season's numbers.
    const bleachHtml = `
      <tr id="eps-1"><td class="Number">1</td><td class="Title"><a href="#">Shinigami</a></td><td class="Type"><span>Manga Canon</span></td></tr>
      <tr id="eps-367"><td class="Number">367</td><td class="Title"><a href="#">Should be excluded</a></td><td class="Type"><span>Filler</span></td></tr>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/shows/bleach")) {
          return new Response(bleachHtml, { status: 200 });
        }
        if (url.endsWith("/shows/bleach-thousand-year-blood-war")) {
          return new Response("", { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const result = await getAnimeFillerData("Bleach");

    expect(result?.get(1)).toEqual({ name: "Shinigami", type: "canon" });
    expect(result?.has(367)).toBe(false);
  });

  it("falls back to fuzzy index matching for titles with no explicit override", async () => {
    const indexHtml = `<li><a href="/shows/dandadan">DAN DA DAN</a></li>`;
    const dandadanHtml = `
      <tr id="eps-1"><td class="Number">1</td><td class="Title"><a href="#">Ep 1</a></td><td class="Type"><span>Manga Canon</span></td></tr>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/shows")) {
          return new Response(indexHtml, { status: 200 });
        }
        if (url.endsWith("/shows/dandadan")) {
          return new Response(dandadanHtml, { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const result = await getAnimeFillerData("Dan Da Dan");

    expect(result?.get(1)).toEqual({ name: "Ep 1", type: "canon" });
  });

  it("degrades to null (never throws) when the network is broken", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(getAnimeFillerData("Bleach")).resolves.toBeNull();
  });
});
