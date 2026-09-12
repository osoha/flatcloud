import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { propertyAddressLabel, propertyMapEmbedUrl, propertyMapSearchUrl } from "../lib/property-map";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) {
  run();
  checks += 1;
  console.log(`✓ ${checks}. ${name}`);
}

check("address label is normalized without inventing missing parts", () => {
  assert.equal(propertyAddressLabel({ address: " Vinohradská 12 ", postalCode: "120 00", city: " Praha " }), "Vinohradská 12, 120 00 Praha");
  assert.equal(propertyAddressLabel({ address: "Vinohradská 12", city: "Praha" }), "Vinohradská 12, Praha");
  assert.equal(propertyAddressLabel({ address: "", postalCode: "120 00", city: "Praha" }), "120 00 Praha");
});

check("map URLs encode the exact confirmed address", () => {
  const address = { address: "Karla Aksamita 4", postalCode: "415 01", city: "Teplice" };
  assert.equal(propertyMapSearchUrl(address), "https://www.google.com/maps/search/?api=1&query=Karla%20Aksamita%204%2C%20415%2001%20Teplice");
  assert.equal(propertyMapEmbedUrl(address), "https://www.google.com/maps?q=Karla%20Aksamita%204%2C%20415%2001%20Teplice&output=embed");
});

check("new-property flow embeds an accessible preview after address fields", () => {
  const page = read("app/nemovitosti/nova/page.tsx");
  const address = page.indexOf('name="address"');
  const city = page.indexOf('name="city"');
  const preview = page.indexOf("<PropertyAddressPreview/>");
  const ownership = page.indexOf('label="Hlavní vlastník / SVJ"');
  assert.ok(address >= 0 && city > address && preview > city && ownership > preview);
  const component = read("components/properties/PropertyAddressPreview.tsx");
  for (const marker of ["Doplňte ulici a město", "Ověřte, že PIN odpovídá", "Mapa nemovitosti", "Otevřít větší mapu", "pageshow"]) assert.match(component, new RegExp(marker));
  assert.doesNotMatch(component, /navigator\.geolocation|latitude|longitude/);
});

check("methodology, pipeline, browser smoke and CI cover R9A", () => {
  assert.match(read("lib/methodology.ts"), /zkontrolujte orientační PIN v mapovém náhledu/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R9A implementováno bez migrace/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /průvodce nemovitostí ověří zadanou adresu/);
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r9a/);
});

console.log(`UX remodel R9A ověřen: ${checks} kontrol.`);
