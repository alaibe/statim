//! A program the server runs beside the app. Its pid is written down, so one
//! left behind by a Statim that crashed is stopped before the next start
//! needs its port.

use std::fs::File;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

const GRACE: Duration = if cfg!(unix) {
    Duration::from_secs(10)
} else {
    Duration::ZERO
};

pub struct Process {
    child: Child,
    pidfile: PathBuf,
}

impl Process {
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

    pub fn exited(&mut self) -> Option<String> {
        self.child
            .try_wait()
            .ok()
            .flatten()
            .map(|status| status.to_string())
    }

    pub fn stop(self) {
        stop_all(vec![self]);
    }
}

pub fn stop_all(processes: Vec<Process>) {
    stop_within(processes, GRACE);
}

fn stop_within(mut processes: Vec<Process>, grace: Duration) {
    for process in &mut processes {
        if process.exited().is_none() {
            terminate(process.child.id());
        }
    }
    let deadline = Instant::now() + grace;
    while Instant::now() < deadline && processes.iter_mut().any(|p| p.exited().is_none()) {
        std::thread::sleep(Duration::from_millis(100));
    }
    for mut process in processes {
        let _ = process.child.kill();
        let _ = process.child.wait();
        let _ = std::fs::remove_file(&process.pidfile);
    }
}

#[cfg(unix)]
fn terminate(pid: u32) {
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }
}

#[cfg(not(unix))]
fn terminate(_pid: u32) {}

/// Stops the process a pidfile names, but only if it still runs `program`:
/// a pid can be reused by something else once its process is gone.
#[cfg(unix)]
pub fn stop_left_behind(pidfile: &Path, program: &Path) {
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
        terminate(pid as u32);
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
pub fn stop_left_behind(pidfile: &Path, _program: &Path) {
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

    #[test]
    fn asks_each_process_to_stop_and_kills_the_ones_that_do_not() {
        let dir = std::env::temp_dir().join("statim-process-stop-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let shell = Path::new("/bin/sh");
        let polite = Process::spawn(
            "polite",
            shell,
            &dir,
            &[],
            &["-c", "trap 'touch stopped; exit 0' TERM; touch polite.ready; while :; do sleep 0.1; done"],
        )
        .unwrap();
        let stubborn = Process::spawn(
            "stubborn",
            shell,
            &dir,
            &[],
            &["-c", "trap '' TERM; touch stubborn.ready; exec sleep 30"],
        )
        .unwrap();
        let ready = Instant::now() + Duration::from_secs(5);
        while !(dir.join("polite.ready").exists() && dir.join("stubborn.ready").exists()) {
            assert!(Instant::now() < ready, "the test processes never started");
            std::thread::sleep(Duration::from_millis(20));
        }

        let started = Instant::now();
        stop_within(vec![polite, stubborn], Duration::from_millis(500));

        assert!(dir.join("stopped").exists(), "never asked to stop");
        assert!(started.elapsed() < Duration::from_secs(5), "never killed");
        assert!(!dir.join("polite.pid").exists());
        assert!(!dir.join("stubborn.pid").exists());
    }
}
