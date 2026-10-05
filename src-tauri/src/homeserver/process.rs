//! A program the server runs beside the app. Its pid is written down, so one
//! left behind by a Statim that crashed is stopped before the next start
//! needs its port.

use std::fs::File;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

pub struct Process {
    child: Child,
    pidfile: PathBuf,
}

impl Process {
    /// Runs `program` in `dir`, logging to `<name>.log` there.
    pub fn spawn(
        name: &str,
        program: &Path,
        dir: &Path,
        env: &[(&str, &Path)],
        args: &[&str],
    ) -> Result<Self, String> {
        let pidfile = dir.join(format!("{name}.pid"));
        stop_left_behind(&pidfile, program);
        let log = File::create(dir.join(format!("{name}.log"))).map_err(|e| e.to_string())?;
        let mut command = Command::new(program);
        command
            .args(args)
            .current_dir(dir)
            .stdin(Stdio::null())
            .stdout(log.try_clone().map_err(|e| e.to_string())?)
            .stderr(log);
        for (key, value) in env {
            command.env(key, value);
        }
        let child = command
            .spawn()
            .map_err(|e| format!("Could not start {name}: {e}"))?;
        std::fs::write(&pidfile, child.id().to_string()).map_err(|e| e.to_string())?;
        Ok(Self { child, pidfile })
    }

    /// Whether it has stopped on its own, and how.
    pub fn exited(&mut self) -> Option<String> {
        self.child
            .try_wait()
            .ok()
            .flatten()
            .map(|status| status.to_string())
    }

    pub fn stop(mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.pidfile);
    }
}

/// Stops the process a pidfile names, but only if it still runs `program`:
/// a pid can be reused by something else once its process is gone.
#[cfg(unix)]
fn stop_left_behind(pidfile: &Path, program: &Path) {
    let Some(pid) = std::fs::read_to_string(pidfile)
        .ok()
        .and_then(|text| text.trim().parse::<i32>().ok())
    else {
        return;
    };
    let name = program.file_name().unwrap_or_default().to_string_lossy();
    let running = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .trim()
                .ends_with(name.as_ref())
        })
        .unwrap_or(false);
    if running {
        unsafe {
            libc::kill(pid, libc::SIGTERM);
        }
        for _ in 0..50 {
            if unsafe { libc::kill(pid, 0) } != 0 {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }
    let _ = std::fs::remove_file(pidfile);
}

#[cfg(not(unix))]
fn stop_left_behind(pidfile: &Path, _program: &Path) {
    let _ = std::fs::remove_file(pidfile);
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn stops_what_a_crashed_run_left_behind_and_nothing_else() {
        let dir = std::env::temp_dir().join("statim-process-test");
        std::fs::create_dir_all(&dir).unwrap();
        let sleep = Path::new("/bin/sleep");
        let mut orphan = Command::new(sleep).arg("30").spawn().unwrap();
        let pidfile = dir.join("sleep.pid");
        std::fs::write(&pidfile, orphan.id().to_string()).unwrap();

        stop_left_behind(&pidfile, Path::new("/usr/bin/tuwunel"));
        assert!(
            orphan.try_wait().unwrap().is_none(),
            "stopped a process running another program"
        );

        std::fs::write(&pidfile, orphan.id().to_string()).unwrap();
        stop_left_behind(&pidfile, sleep);
        assert!(orphan.wait().is_ok());
        assert!(!pidfile.exists());
    }
}
