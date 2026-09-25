const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const backendDir = path.resolve(__dirname, "..", "backend");
const venvDir = path.join(backendDir, ".venv");

const isWindows = process.platform === "win32";

const pythonExePath = isWindows
	? path.join(venvDir, "Scripts", "python.exe")
	: path.join(venvDir, "bin", "python");

const pythonCommands = isWindows
	? ["python", "py"]
	: ["python3", "python"];

function run(command, args, options = {}) {
	execFileSync(command, args, {
		stdio: "inherit",
		...options,
	});
}

function findPython() {
	for (const command of pythonCommands) {
		try {
			execFileSync(command, ["--version"], { stdio: "ignore" });
			return command;
		} catch {}
	}

	throw new Error(
		"Python was not found. Please install Python 3 and make sure it is available in your PATH.",
	);
}

if (!fs.existsSync(pythonExePath)) {
	const pythonCmd = findPython();

	console.log("Creating Python virtual environment...");
	run(pythonCmd, ["-m", "venv", venvDir]);

	console.log("Upgrading pip...");
	run(pythonExePath, ["-m", "pip", "install", "--upgrade", "pip"]);
}

console.log("Installing backend dependencies...");
run(
	pythonExePath,
	["-m", "pip", "install", "-r", path.join(backendDir, "requirements.txt")],
	{ cwd: backendDir },
);

console.log("Backend setup complete.");