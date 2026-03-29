import fs from "fs";
import path from "path";

export function getFixtures() {
  const fixturesDir = path.join(__dirname, "../fixtures");

  return fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .sort() // Ensure consistent order
    .map((file) => {
      const filePath = path.join(fixturesDir, file);
      const fixture = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      // Extract classification from filename: automation_*.json -> automation
      const classification = file.split("_")[0] || "unknown";
      // Use the readable login from fixture data: user.login = "johnsmith"
      const username = fixture.user?.login || "unknown";
      return [fixture, `${classification}/${username}`];
    });
}
