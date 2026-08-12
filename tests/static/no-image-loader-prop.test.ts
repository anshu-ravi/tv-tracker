import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression guard for the incident that motivated buildTmdbImageUrl
// (src/lib/tmdbImage.ts): a `loader={someFunction}` prop on next/image's
// <Image> tries to serialize that function across the server->client
// boundary (<Image> is a Client Component), which throws at *request*
// time -- "Functions cannot be passed directly to Client Components" --
// not at type-check or build time. Most of this app's poster/backdrop
// <Image> usages live in Server Components, so this class of bug is
// invisible to `tsc`/`next build` and to unit tests of the loader function
// in isolation (it's correct on its own; the crash is purely about how
// it's wired into JSX). The fix was to compute a plain string `src` at the
// call site instead of passing a `loader` function -- this test statically
// scans the source tree and fails if a `loader=` prop ever reappears on an
// <Image> tag, so a future edit can't silently reintroduce it.
const SRC_ROOT = fileURLToPath(new URL("../../src", import.meta.url));

function collectTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      files.push(full);
    }
  }
  return files;
}

// Extracts the full text of every `<Image ...>`/`<Image .../>` opening tag
// in `source`, tolerating multi-line attributes and `{...}` expression
// values (tracked by brace depth) so a tag isn't cut short by a `>`
// appearing inside a JSX expression attribute.
function extractImageTags(source: string): string[] {
  const tags: string[] = [];
  const starts = [...source.matchAll(/<Image[\s/>]/g)].map((m) => m.index);

  for (const start of starts) {
    let i = start;
    let braceDepth = 0;
    let end = -1;
    while (i < source.length) {
      const ch = source[i];
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
      else if (ch === ">" && braceDepth === 0) {
        end = i;
        break;
      }
      i++;
    }
    if (end !== -1) {
      tags.push(source.slice(start, end + 1));
    }
  }
  return tags;
}

describe("no-image-loader-prop (static guard)", () => {
  it("never passes a loader prop to next/image's <Image>", () => {
    const files = collectTsxFiles(SRC_ROOT);
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      if (!source.includes("<Image")) continue;

      for (const tag of extractImageTags(source)) {
        if (/\bloader\s*=/.test(tag)) {
          violations.push(file);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("sanity-checks the tag extractor against a known-bad fixture", () => {
    // Guards the guard: if extractImageTags stops matching multi-line tags
    // or tags with {...} expression attributes, the test above would
    // silently pass no matter what -- so assert it actually catches this
    // shape first.
    const fixture = `
      <Image
        src={someUrl}
        alt=""
        fill
        className={cond ? "a" : "b"}
        loader={someFunction}
      />
    `;
    const tags = extractImageTags(fixture);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatch(/loader\s*=/);
  });
});
