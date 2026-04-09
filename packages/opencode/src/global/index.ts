import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"
import { Filesystem } from "../util/filesystem"

const app = "kilo" // kilocode_change

// xdg-basedir returns undefined on Windows/macOS when XDG env vars not set
// Fallback to platform-appropriate directories
const home = os.homedir()
const data = xdgData ? path.join(xdgData, app) : path.join(home, ".local", "share", app)
const cache = xdgCache ? path.join(xdgCache, app) : path.join(home, ".cache", app)
const config = xdgConfig ? path.join(xdgConfig, app) : path.join(home, ".config", app)
const state = xdgState ? path.join(xdgState, app) : path.join(home, ".local", "state", app)

export namespace Global {
  export const Path = {
    // Allow override via KILO_TEST_HOME for test isolation
    get home() {
      return process.env.KILO_TEST_HOME || os.homedir() // kilocode_change
    },
    data,
    bin: path.join(data, "bin"),
    log: path.join(data, "log"),
    cache,
    config,
    state,
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
])

const CACHE_VERSION = "21"

const version = await Filesystem.readText(path.join(Global.Path.cache, "version")).catch(() => "0")

if (version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Global.Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Global.Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch (e) {}
  await Filesystem.write(path.join(Global.Path.cache, "version"), CACHE_VERSION)
}
