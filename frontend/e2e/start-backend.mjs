// سرور جنگو برای آزمون مرورگر: پایگاه داده‌ی تازه در پوشه‌ی موقت، داده‌ی نمونه، سپس اجرا.
// داده‌ی نصب واقعی (backend/data) هرگز لمس نمی‌شود.
import { spawn, spawnSync } from "node:child_process"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const backend = path.resolve(import.meta.dirname, "../../backend")
const python = path.resolve(backend, "..", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
const dataDir = path.join(tmpdir(), "nikyar-e2e")
const port = process.env.E2E_API_PORT ?? "8100"
// اجراکننده‌ی کارهای پس‌زمینه هر ثانیه صف را بررسی می‌کند (در نصب واقعی هر ۱۵ ثانیه).
const env = {
  ...process.env, NIKYAR_DATA_DIR: dataDir, NIKYAR_DEBUG: "1", NIKYAR_WORKER_INTERVAL: "1",
  // پیامک و ایمیل به‌جای ارسال واقعی در فایل نوشته می‌شوند.
  NIKYAR_FAKE_DELIVERY: path.join(dataDir, "outbox"),
}

rmSync(dataDir, { recursive: true, force: true })
// آزمون‌های هم‌زمان بارها وارد می‌شوند و فرم ثبت می‌کنند؛ سقف‌های «سامانه و امنیت» برای این سرور بالا برده می‌شود.
const limits = `from core.settings.models import SettingsValue; SettingsValue.objects.create(section="system", values={"login_rate": 1000, "submit_rate": 1000})`
for (const args of [["migrate", "-v", "0"], ["seed_demo"], ["shell", "-c", limits]]) {
  const r = spawnSync(python, ["manage.py", ...args], { cwd: backend, env, stdio: "inherit" })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
const server = spawn(python, ["manage.py", "runserver", `127.0.0.1:${port}`, "--noreload"], { cwd: backend, env, stdio: "inherit" })
const worker = spawn(python, ["manage.py", "run_worker"], { cwd: backend, env, stdio: "inherit" })
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    worker.kill(signal)
    server.kill(signal)
  })
server.on("exit", (code) => process.exit(code ?? 0))
