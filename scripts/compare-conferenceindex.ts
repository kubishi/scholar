#!/usr/bin/env npx tsx
/**
 * Scrapes conferenceindex.org for computer-science and artificial-intelligence
 * conferences, then compares against the remote D1 database by acronym.
 *
 * Usage:
 *   npx tsx scripts/compare-conferenceindex.ts
 *   npx tsx scripts/compare-conferenceindex.ts --missing-only   # only show gaps
 *
 * Output: scripts/conferenceindex-comparison.csv
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DB_NAME = "kubishi-scholar-db";
const MISSING_ONLY = process.argv.includes("--missing-only");
const CONCURRENCY = 10;

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

const COUNTRY_CODES: Record<string, string> = {
  AE: "United Arab Emirates", AR: "Argentina", AT: "Austria", AU: "Australia",
  AZ: "Azerbaijan", BE: "Belgium", BR: "Brazil", CA: "Canada", CH: "Switzerland",
  CL: "Chile", CN: "China", CO: "Colombia", CU: "Cuba", CY: "Cyprus",
  CZ: "Czech Republic", DE: "Germany", DK: "Denmark", DZ: "Algeria",
  EE: "Estonia", EG: "Egypt", ES: "Spain", FI: "Finland", FR: "France",
  GB: "United Kingdom", GE: "Georgia", GR: "Greece", HK: "Hong Kong",
  HR: "Croatia", HU: "Hungary", ID: "Indonesia", IE: "Ireland", IL: "Israel",
  IN: "India", IS: "Iceland", IT: "Italy", JP: "Japan", KH: "Cambodia",
  KR: "South Korea", KW: "Kuwait", LA: "Laos", LK: "Sri Lanka", MA: "Morocco",
  MG: "Madagascar", MM: "Myanmar", MU: "Mauritius", MV: "Maldives", MX: "Mexico",
  MY: "Malaysia", NG: "Nigeria", NL: "Netherlands", NO: "Norway", NP: "Nepal",
  NZ: "New Zealand", OM: "Oman", PE: "Peru", PH: "Philippines", PK: "Pakistan",
  PL: "Poland", PT: "Portugal", QA: "Qatar", RO: "Romania", RS: "Serbia",
  RU: "Russia", SA: "Saudi Arabia", SE: "Sweden", SG: "Singapore", TH: "Thailand",
  TN: "Tunisia", TR: "Turkey", TW: "Taiwan", TZ: "Tanzania", UA: "Ukraine",
  US: "United States", UY: "Uruguay", VN: "Vietnam", ZA: "South Africa",
};

const DISCIPLINES = [
  { slug: "computer-science", label: "Computer Science" },
  { slug: "artificial-intelligence", label: "Artificial Intelligence" },
];

interface ConferenceEntry {
  acronym: string;
  name: string;
  start_date: string;
  end_date: string;
  city: string;
  country: string;
  ci_url: string;   // conferenceindex.org event page (used internally to fetch details)
  website_url: string;
  contact_url: string;
  topics: string;
  deadline: string;
  notification: string;
  discipline: string;
}

function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractAcronymFromTitle(title: string): string {
  const m = title.match(/\(([A-Z0-9][A-Z0-9+\-]{1,14})\)\s*$/);
  return m ? m[1] : "";
}

function parseSlug(slug: string): { year: string; month: string; city: string; country: string } {
  const parts = slug.split("-");
  const yearIdx = parts.findIndex(p => /^20(2[0-9]|3[0-5])$/.test(p));
  if (yearIdx === -1) return { year: "", month: "", city: "", country: "" };

  const year = parts[yearIdx];
  const month = parts[yearIdx + 1] ?? "";
  const afterMonth = parts.slice(yearIdx + 2);
  while (afterMonth.length && /^\d+$/.test(afterMonth[afterMonth.length - 1])) afterMonth.pop();
  const code = (afterMonth.pop() ?? "").toUpperCase();
  const city = afterMonth.map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
  const country = COUNTRY_CODES[code] ?? code;

  return { year, month, city, country };
}

function toIsoDate(day: string, month: string, year: string): string {
  // day = "Jun 17", month from slug = "june", year = "2026"
  const [mon, d] = day.trim().split(/\s+/);
  const mm = MONTHS[mon] ?? MONTHS[month.slice(0, 1).toUpperCase() + month.slice(1, 3)] ?? "01";
  return `${year}-${mm}-${d.padStart(2, "0")}`;
}

function stripUtm(raw: string): string {
  try {
    const u = new URL(raw.replace(/&amp;/g, "&"));
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    return u.toString();
  } catch {
    return raw.replace(/[?&]utm_[^&]*/g, "").replace(/\?$/, "");
  }
}

// Each <li> in the listing has: "Jun 17\n<a href="URL" title="...">"
const LI_REGEX = /<li>\s*([A-Z][a-z]{2}\s+\d{1,2})\s*[\s\S]*?href="(https:\/\/conferenceindex\.org\/event\/([^"]+))"\s+title="([^"]+)"/g;

async function scrapeDiscipline(slug: string, label: string): Promise<ConferenceEntry[]> {
  const seen = new Set<string>();
  const results: ConferenceEntry[] = [];

  for (let page = 1; page <= 50; page++) {
    const url = `https://conferenceindex.org/conferences/${slug}?page=${page}`;
    process.stdout.write(`  ${label} page ${page}...`);

    const res = await fetch(url);
    if (!res.ok) { console.log(` HTTP ${res.status}, stopping.`); break; }
    const html = await res.text();

    let newOnPage = 0;
    let match: RegExpExecArray | null;
    LI_REGEX.lastIndex = 0;

    while ((match = LI_REGEX.exec(html)) !== null) {
      const [, dayStr, href, slugPart, rawTitle] = match;
      if (seen.has(href)) continue;
      seen.add(href);
      newOnPage++;

      const title = unescapeHtml(rawTitle);
      const acronym = extractAcronymFromTitle(title) ||
        slugPart.split("-").find(p => /^[a-z]{2,15}$/.test(p) && !["conference","international","workshop","symposium","annual","congress"].includes(p))?.toUpperCase() || "";
      const name = title.replace(/\s*\([A-Z0-9+\-]+\)\s*$/, "").trim();
      const { year, month, city, country } = parseSlug(slugPart);
      const start_date = year ? toIsoDate(dayStr, month, year) : "";

      results.push({
        acronym, name, start_date, end_date: "",
        city, country,
        ci_url: href, website_url: "", contact_url: "", topics: "",
        deadline: "", notification: "",
        discipline: label,
      });
    }

    console.log(` ${newOnPage} new entries (${results.length} total)`);
    if (newOnPage === 0) break;

    await new Promise(r => setTimeout(r, 300));
  }

  return results;
}

const LONG_MONTHS: Record<string, string> = {
  january:"01", february:"02", march:"03", april:"04", may:"05", june:"06",
  july:"07", august:"08", september:"09", october:"10", november:"11", december:"12",
};

function parseLongDate(raw: string): string {
  // "August 01, 2026" → "2026-08-01"
  const m = raw.trim().match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return "";
  const mm = LONG_MONTHS[m[1].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[2].padStart(2, "0")}` : "";
}

function extractLabeledDate(html: string, label: string): string {
  const re = new RegExp(`<li>${label}:\\s*<strong>([^<]+)</strong>`, "i");
  const m = html.match(re);
  return m ? parseLongDate(m[1]) : "";
}

// Extract a labeled URL from detail page HTML, e.g. "Website URL:" or "Contact URL:"
function extractLabeledUrl(html: string, label: string): string {
  // Pattern: <li>Label: <strong><a href="URL" ... rel="nofollow external">
  const re = new RegExp(`${label}[\\s\\S]*?href="([^"]+)"[^>]*rel="nofollow external"`, "i");
  const m = html.match(re);
  return m ? stripUtm(m[1]) : "";
}

function extractTopics(html: string): string {
  const idx = html.indexOf("Conference Tags:");
  if (idx === -1) return "";
  const section = html.slice(idx, idx + 2000);
  const tags = [...section.matchAll(/class="pr-2">([^<]+)<\/a>/g)].map(m => m[1].trim());
  return tags.join(", ");
}

async function fetchDetailPage(ciUrl: string): Promise<{
  start_date: string;
  end_date: string;
  website_url: string;
  contact_url: string;
  topics: string;
  deadline: string;
  notification: string;
}> {
  const empty = { start_date: "", end_date: "", website_url: "", contact_url: "", topics: "", deadline: "", notification: "" };
  try {
    const res = await fetch(ciUrl);
    if (!res.ok) return empty;
    const html = await res.text();
    const startM = html.match(/"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    const endM = html.match(/"endDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    return {
      start_date: startM?.[1] ?? "",
      end_date: endM?.[1] ?? "",
      website_url: extractLabeledUrl(html, "Website URL:"),
      contact_url: extractLabeledUrl(html, "Contact URL:"),
      topics: extractTopics(html),
      deadline: extractLabeledDate(html, "Final Submission"),
      notification: extractLabeledDate(html, "Notification"),
    };
  } catch {
    return empty;
  }
}

async function enrichEntries(entries: (ConferenceEntry & { in_db: boolean })[]): Promise<void> {
  console.log(`\nFetching detail pages (${entries.length} conferences, concurrency=${CONCURRENCY})...`);
  let done = 0;
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const details = await Promise.all(batch.map(e => fetchDetailPage(e.ci_url)));
    for (let j = 0; j < batch.length; j++) {
      const d = details[j];
      if (d.start_date) batch[j].start_date = d.start_date;
      if (d.end_date) batch[j].end_date = d.end_date;
      if (d.website_url) batch[j].website_url = d.website_url;
      if (d.contact_url) batch[j].contact_url = d.contact_url;
      if (d.topics) batch[j].topics = d.topics;
      if (d.deadline) batch[j].deadline = d.deadline;
      if (d.notification) batch[j].notification = d.notification;
    }
    done += batch.length;
    process.stdout.write(`\r  ${done}/${entries.length}`);
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(" done.");
}

interface DbConference {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  deadline: string | null;
  notification: string | null;
  start_date: string | null;
  end_date: string | null;
  topics: string | null;
  url: string | null;
}

function fetchDbConferences(): Map<string, DbConference> {
  console.log("\nFetching conferences from D1...");
  const out = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --command "SELECT id, title, city, country, deadline, notification, start_date, end_date, topics, url FROM conferences" --json`,
    { cwd: resolve(__dirname, "..") }
  ).toString();
  const parsed = JSON.parse(out);
  const rows: DbConference[] = parsed[0]?.results ?? [];
  console.log(`  ${rows.length} conferences in DB`);
  const map = new Map<string, DbConference>();
  for (const r of rows) map.set(r.id.toUpperCase(), r);
  return map;
}

function isoDateOnly(v: string | null | undefined): string {
  if (!v) return "";
  return v.slice(0, 10); // "2026-08-01T..." → "2026-08-01"
}

function computeDiff(csv: ConferenceEntry, db: DbConference): string {
  const diffs: string[] = [];
  const check = (field: string, csvVal: string, dbVal: string | null) => {
    const a = csvVal.trim();
    const b = isoDateOnly(dbVal);
    if (a && b && a !== b) diffs.push(field);
    else if (a && !b) diffs.push(`${field}(new)`);
  };
  check("start_date", csv.start_date, db.start_date);
  check("end_date", csv.end_date, db.end_date);
  check("deadline", csv.deadline, db.deadline);
  check("notification", csv.notification, db.notification);
  // url: compare csv website_url vs db url
  if (csv.website_url && db.url && csv.website_url !== db.url) diffs.push("url");
  if (csv.website_url && !db.url) diffs.push("url(new)");
  if (csv.city && db.city && csv.city.toLowerCase() !== db.city.toLowerCase()) diffs.push("city");
  if (csv.country && db.country && csv.country.toLowerCase() !== db.country.toLowerCase()) diffs.push("country");
  return diffs.join(", ");
}

function escCsv(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

async function main() {
  const all: ConferenceEntry[] = [];

  for (const { slug, label } of DISCIPLINES) {
    console.log(`\nScraping ${label}...`);
    const entries = await scrapeDiscipline(slug, label);
    all.push(...entries);
  }

  // Deduplicate by ci_url first (merges discipline labels for cross-listed entries)
  const byUrl = new Map<string, ConferenceEntry>();
  for (const e of all) {
    if (!byUrl.has(e.ci_url)) byUrl.set(e.ci_url, e);
    else {
      const existing = byUrl.get(e.ci_url)!;
      if (!existing.discipline.includes(e.discipline)) {
        existing.discipline = `${existing.discipline} / ${e.discipline}`;
      }
    }
  }

  // Secondary dedup by (name, city, start_date) — removes true duplicates that
  // share a name/location/date but have slightly different ci_urls
  const byKey = new Map<string, ConferenceEntry>();
  for (const e of byUrl.values()) {
    const key = `${e.name.toLowerCase()}|${e.city.toLowerCase()}|${e.start_date}`;
    if (!byKey.has(key)) byKey.set(key, e);
    else {
      const existing = byKey.get(key)!;
      if (!existing.discipline.includes(e.discipline)) {
        existing.discipline = `${existing.discipline} / ${e.discipline}`;
      }
    }
  }
  const entries = [...byKey.values()];

  const dbConferences = fetchDbConferences();

  let inDb = 0, missing = 0, noAcronym = 0;
  const rows = entries.map(e => {
    const normalized = e.acronym.toUpperCase();
    const dbRecord = normalized ? dbConferences.get(normalized) : undefined;
    const found = !!dbRecord;
    if (!e.acronym) noAcronym++;
    else if (found) inDb++;
    else missing++;
    return { ...e, in_db: found, db_diff: "" };
  });

  const toWrite = MISSING_ONLY ? rows.filter(r => !r.in_db && r.acronym) : rows;

  // Sort: missing-with-acronym first, then missing-no-acronym, then found
  toWrite.sort((a, b) => {
    if (!a.in_db && a.acronym && (b.in_db || !b.acronym)) return -1;
    if (!b.in_db && b.acronym && (a.in_db || !a.acronym)) return 1;
    return a.discipline.localeCompare(b.discipline) || a.name.localeCompare(b.name);
  });

  await enrichEntries(toWrite);

  // Compute db_diff now that website_url, deadline, etc. are populated
  for (const row of toWrite) {
    const db = dbConferences.get(row.acronym.toUpperCase());
    row.db_diff = db ? computeDiff(row, db) : "";
  }

  // ci_url is excluded from the CSV — website_url and contact_url are the real URLs
  const headers = ["acronym", "name", "start_date", "end_date", "deadline", "notification", "city", "country", "discipline", "in_db", "db_diff", "website_url", "contact_url", "topics"];
  const csvLines = [
    headers.join(","),
    ...toWrite.map(r =>
      headers.map(h => escCsv(String((r as Record<string, unknown>)[h] ?? ""))).join(",")
    ),
  ];

  const outPath = resolve(__dirname, "conferenceindex-comparison.csv");
  writeFileSync(outPath, csvLines.join("\n") + "\n", "utf8");

  console.log(`
Summary
-------
Total scraped (deduplicated): ${entries.length}
  In DB:              ${inDb}
  Missing from DB:    ${missing}
  No acronym found:   ${noAcronym}

Output: ${outPath}
Rows written: ${toWrite.length}
  `);
}

main().catch(err => { console.error(err); process.exit(1); });
