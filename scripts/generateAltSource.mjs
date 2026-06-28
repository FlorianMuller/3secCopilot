#!/usr/bin/env node
// Generates an AltStore/SideStore "source" JSON from the repo's GitHub Releases.
//
// Each release that has an `.ipa` asset becomes one entry in the app's
// `versions` array (newest first). SideStore polls the published source, shows
// an update when a new version appears, and re-signs the unsigned IPA on-device
// with the user's free Apple ID at install time.
//
// Usage: node scripts/generateAltSource.mjs [outFile]
//   GITHUB_REPOSITORY  owner/repo (defaults to FlorianMuller/3secCopilot)
//   GH_TOKEN/GITHUB_TOKEN  used by `gh` for API auth (set automatically in CI)

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const REPO = process.env.GITHUB_REPOSITORY ?? "FlorianMuller/3secCopilot";
const OUT_FILE = process.argv[2] ?? "public/source.json";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/master`;

// per_page=100 is far more than this project will ever have; avoids pagination
// (which `gh --paginate` would emit as concatenated, invalid JSON arrays).
const raw = execFileSync(
  "gh",
  ["api", `repos/${REPO}/releases?per_page=100`],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
);

const releases = JSON.parse(raw);

const versions = releases
  .filter((release) => !release.draft)
  .map((release) => {
    const ipa = release.assets.find((asset) => asset.name.endsWith(".ipa"));
    if (!ipa) return null;
    return {
      version: release.tag_name,
      date: (release.published_at ?? release.created_at).slice(0, 10),
      localizedDescription: release.body?.trim() || `Release ${release.tag_name}`,
      downloadURL: ipa.browser_download_url,
      size: ipa.size,
      minOSVersion: "15.1",
    };
  })
  .filter(Boolean);

if (versions.length === 0) {
  throw new Error("No releases with an .ipa asset were found; refusing to write an empty source.");
}

const source = {
  name: "3secs Copilot (Sideload)",
  identifier: "com.fmuller.3secs.source",
  apps: [
    {
      name: "3secs Copilot",
      bundleIdentifier: "com.fmuller.3secs",
      developerName: "Florian Muller",
      localizedDescription:
        "Select and trim one video per day from your camera roll to build a 3-second daily montage.",
      iconURL: `${RAW_BASE}/assets/icon.png`,
      tintColor: "BC8FF2",
      versions,
    },
  ],
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(source, null, 2) + "\n");
console.log(`Wrote ${OUT_FILE} with ${versions.length} version(s): ${versions.map((v) => v.version).join(", ")}`);
