const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", "backend", ".env");
const envContent = fs.readFileSync(envPath, "utf-8");

const dbUrlLine = envContent
	.split("\n")
	.find((l) => l.startsWith("DATABASE_URL="));
const dbUrl = new URL(dbUrlLine.split("=")[1].trim());

const password = dbUrl.password;
const dbName = dbUrl.pathname.replace("/", "");

try {
	execSync("docker start go-postgres", { stdio: "inherit" });
} catch {
	execSync(
		`docker run --name go-postgres -e POSTGRES_PASSWORD=${password} -e POSTGRES_DB=${dbName} -p 5432:5432 -d postgres`,
		{ stdio: "inherit" },
	);
}
