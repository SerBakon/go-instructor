const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const backendDir = path.join(__dirname, "..", "backend");
const venvDir = path.join(backendDir, "venv");
const isWindows = process.platform === "win32";

const pipPath = isWindows
	? path.join(venvDir, "Scripts", "pip.exe")
	: path.join(venvDir, "bin", "pip");

const pythonExePath = isWindows
	? path.join(venvDir, "Scripts", "python.exe")
	: path.join(venvDir, "bin", "python");

const pythonCmd = isWindows ? "python" : "python3";

if (!fs.existsSync(venvDir)) {
	console.log("Creating Python virtual environment...");
	execSync(`${pythonCmd} -m venv "${venvDir}"`, { stdio: "inherit" });

	console.log("Upgrading pip...");
	execSync(`"${pythonExePath}" -m pip install --upgrade pip`, {
		stdio: "inherit",
	});
}

console.log("Installing backend dependencies...");
execSync(
	`"${pipPath}" install -r "${path.join(backendDir, "requirements.txt")}"`,
	{
		stdio: "inherit",
		cwd: backendDir,
	},
);

console.log("Backend setup complete.");
