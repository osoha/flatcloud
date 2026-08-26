import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { firstFutureAnniversary, periodKeyForDate } from "../lib/charge-automation";

const now = new Date("2026-08-25T10:00:00Z");
assert.equal(periodKeyForDate(now), "2026-08");
assert.equal(firstFutureAnniversary(new Date("2026-08-25T12:00:00Z"), now).toISOString().slice(0,10), "2027-08-25");
assert.equal(firstFutureAnniversary(new Date("2020-10-01T12:00:00Z"), now).toISOString().slice(0,10), "2026-10-01");

const render = readFileSync("render.yaml", "utf8");
assert.equal((render.match(/type: cron/g) || []).length, 1, "V21.1 má používat jediný Render cron.");
assert.match(render, /flatcloud-rent-scheduler/);
assert.match(render, /npm run scheduler:cron/);
assert.doesNotMatch(render, /flatcloud-rent-payment-email/);
assert.doesNotMatch(render, /flatcloud-rent-notifications\n/);

const shell = readFileSync("components/Shell.tsx", "utf8");
assert.match(shell, /Nový úkol/);
assert.match(shell, /flatcloud-logo(?:-white)?\.png/);
const task = readFileSync("app\/ukoly\/[id]\/page.tsx", "utf8");
assert.match(task, /discussion-thread/);
assert.match(task, /Aktuální dluh po splatnosti/);

console.log("FlatCloud V21.1 UX and automation verification OK");
