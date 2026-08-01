import { describe, expect, it } from "vitest";
import { parseEpisodeTable, parseShowIndex } from "@/lib/animefillerlist";

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
