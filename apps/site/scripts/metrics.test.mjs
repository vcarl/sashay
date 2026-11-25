import assert from "node:assert/strict";
import test from "node:test";
import { demoName, linkClick, pageview } from "../src/scripts/metrics.ts";

test("URLs lose their query and hash, except the three utm parameters", () => {
  assert.equal(pageview("https://vcarl.com/sashay/?layout=69#x", "")[1].$current_url, "https://vcarl.com/sashay/");
  assert.deepEqual(
    pageview(
      "https://vcarl.com/sashay/?layout=69&utm_source=hn&utm_term=secret&q=me#top",
      "https://user:pw@news.example.com/item?id=1",
    ),
    [
      "$pageview",
      {
        $current_url: "https://vcarl.com/sashay/?utm_source=hn",
        $referring_domain: "news.example.com",
        utm_source: "hn",
      },
    ],
  );
  assert.equal(pageview("https://vcarl.com/", "")[1].$referring_domain, "$direct");
});

test("links report an outbound host or a label, never a path", () => {
  const here = "vcarl.com";
  assert.deepEqual(linkClick("https://github.com/vcarl/sashay?x=1", here), [
    "sashay_link_clicked",
    { host: "github.com", cta: undefined },
  ]);
  assert.deepEqual(linkClick("https://vcarl.com/sashay/guide/#a", here, "docs"), [
    "sashay_link_clicked",
    { host: undefined, cta: "docs" },
  ]);
  assert.equal(linkClick("https://vcarl.com/sashay/guide/#a", here), undefined);
  assert.equal(linkClick("mailto:a@b.c", here), undefined);
});

test("demos map to fixed names", () => {
  const is = (s) => (x) => x === s;
  assert.equal(demoName(is("#hero"), "/sashay/"), "hero");
  assert.equal(demoName(is("#cell-spine"), "/"), "cell_spine");
  assert.equal(demoName(is("#themed"), "/sashay/themes/"), "themed");
  assert.equal(demoName(is(".plants"), "/sashay/demos/"), "plants");
  assert.equal(demoName(is(".house"), "/sashay/guide/"), "guide_house");
  assert.equal(
    demoName(() => false, "/reference/"),
    "example",
  );
});
