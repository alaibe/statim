use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        apple_translation();
        if env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("aarch64") {
            // fm-rs links these hard; weak links keep the app opening on macOS 15.
            for framework in ["FoundationModels", "Vision", "CoreSpotlight"] {
                println!("cargo:rustc-link-arg=-Wl,-weak_framework,{framework}");
            }
        }
    }
    tauri_build::build()
}

fn xcrun(args: &[&str]) -> String {
    let output = Command::new("xcrun")
        .args(args)
        .output()
        .expect("xcrun runs");
    assert!(output.status.success(), "xcrun {args:?} failed");
    String::from_utf8(output.stdout)
        .expect("utf-8")
        .trim()
        .to_owned()
}

fn apple_translation() {
    let source = "swift/translation.swift";
    println!("cargo:rerun-if-changed={source}");
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        _ => "x86_64",
    };
    let out = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let sdk = xcrun(&["--sdk", "macosx", "--show-sdk-path"]);
    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-emit-library",
            "-static",
            "-parse-as-library",
            "-O",
        ])
        .args(["-module-name", "statim_translation"])
        .args(["-target", &format!("{arch}-apple-macosx15.0")])
        .args(["-sdk", &sdk, source, "-o"])
        .arg(out.join("libstatim_translation.a"))
        .status()
        .expect("swiftc runs");
    assert!(status.success(), "swiftc failed on {source}");

    let swift = xcrun(&["--find", "swift"]);
    let toolchain = Path::new(&swift)
        .parent()
        .and_then(Path::parent)
        .expect("toolchain");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-search=native={sdk}/usr/lib/swift");
    println!(
        "cargo:rustc-link-search=native={}/lib/swift/macosx",
        toolchain.display()
    );
    println!("cargo:rustc-link-lib=static=statim_translation");
    println!("cargo:rustc-link-lib=framework=Translation");
    println!("cargo:rustc-link-lib=framework=NaturalLanguage");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
}
