// Fixture test for the shared contact-field validation
// (run: npx tsx scripts/test-contact-validation.ts).
// Same style as scripts/test-pairing.ts: plain checks, non-zero exit on failure.
import { isPossibleEmail } from "../src/lib/validation";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

console.log("email shape — accepted");
check("plain address", isPossibleEmail("JohnDoe@gmail.com"));
check("own domain + subdomain", isPossibleEmail("john.doe+desk@mail.tradeos.app"));
check("surrounding spaces are trimmed", isPossibleEmail("  john@example.com  "));

console.log("email shape — rejected");
check("no domain at all", !isPossibleEmail("johndoe"));
check("missing dot-ending TLD", !isPossibleEmail("john@localhost"));
check("nothing before the @", !isPossibleEmail("@gmail.com"));
check("a space inside", !isPossibleEmail("john doe@gmail.com"));
check("empty", !isPossibleEmail("   "));
check("absurdly long", !isPossibleEmail(`${"a".repeat(250)}@gmail.com`));

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll contact-field checks passed.");
