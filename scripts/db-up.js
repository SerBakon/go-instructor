const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", "backend", ".env");

if (!fs.existsSync(envPath)) {
	console.error("Error: backend/.env file not found.");
	process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf-8");

const dbUrlLine = envContent
	.split("\n")
	.map((l) => l.trim())
	.find((l) => l.startsWith("DATABASE_URL="));

if (!dbUrlLine) {
	console.error("Error: DATABASE_URL not found in backend/.env");
	process.exit(1);
}

// Strip variable name and leading/trailing quotes or whitespace
const rawUrl = dbUrlLine.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
let dbUrl;
try {
	dbUrl = new URL(rawUrl);
} catch (err) {
	console.error("Error parsing DATABASE_URL:", err.message);
	process.exit(1);
}

const user = dbUrl.username || "postgres";
const password = dbUrl.password;
const dbName = dbUrl.pathname.replace(/^\//, "");
const hostPort = dbUrl.port || "5432";

try {
	execSync("docker start go-postgres", { stdio: "inherit" });
} catch {
	execSync(
		`docker run --name go-postgres -e POSTGRES_USER=${user} -e POSTGRES_PASSWORD=${password} -e POSTGRES_DB=${dbName} -p ${hostPort}:5432 -d postgres`,
		{ stdio: "inherit" },
	);
}

