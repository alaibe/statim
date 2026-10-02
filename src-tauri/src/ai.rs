//! Errors carry the codes the phone's native module rejects with.

use serde::Serialize;

#[derive(Serialize)]
pub struct AiError {
    code: &'static str,
    message: String,
}

impl AiError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn at_least_macos(major: isize) -> bool {
    use objc2_foundation::{NSOperatingSystemVersion, NSProcessInfo};
    NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(NSOperatingSystemVersion {
        majorVersion: major,
        minorVersion: 0,
        patchVersion: 0,
    })
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
mod model {
    use fm_rs::{
        Error, GenerationOptions, Guardrails, ModelAvailability, Session, SystemLanguageModel,
    };

    use super::{at_least_macos, AiError};

    pub fn state() -> &'static str {
        if !at_least_macos(26) {
            return "unsupported";
        }
        match SystemLanguageModel::new().map(|model| model.availability()) {
            Ok(ModelAvailability::Available) => "ready",
            Ok(ModelAvailability::AppleIntelligenceNotEnabled) => "off",
            Ok(ModelAvailability::ModelNotReady) => "downloading",
            _ => "unsupported",
        }
    }

    pub fn complete(instructions: &str, prompt: &str, max_tokens: u32) -> Result<String, AiError> {
        if !at_least_macos(26) {
            return Err(AiError::new(
                "ERR_UNAVAILABLE",
                "Apple Intelligence needs macOS 26.",
            ));
        }
        // The default guardrails refuse ordinary messages, "pick up the kids at 5" among them.
        let model =
            SystemLanguageModel::with_guardrails(Guardrails::PermissiveContentTransformations)
                .map_err(failure)?;
        model.ensure_available().map_err(failure)?;
        let session = Session::with_instructions(&model, instructions).map_err(failure)?;
        let options = GenerationOptions::builder()
            .max_response_tokens(max_tokens)
            .build();
        let response = session.respond(prompt, &options).map_err(failure)?;
        Ok(response.content().to_owned())
    }

    fn failure(error: Error) -> AiError {
        match error {
            Error::GuardrailViolation(_) | Error::Refusal(_) => {
                AiError::new("ERR_REFUSED", "Apple Intelligence declined this text.")
            }
            Error::ContextSizeExceeded(_) => AiError::new(
                "ERR_TOO_LONG",
                "That is more text than Apple Intelligence takes at once.",
            ),
            Error::UnsupportedLanguageOrLocale(_) => AiError::new(
                "ERR_REFUSED",
                "Apple Intelligence does not speak this language yet.",
            ),
            Error::AppleIntelligenceNotEnabled
            | Error::ModelNotReady
            | Error::DeviceNotEligible
            | Error::ModelNotAvailable => AiError::new(
                "ERR_UNAVAILABLE",
                "Apple Intelligence is not ready on this Mac.",
            ),
            other => AiError::new("ERR_GENERATION", other.to_string()),
        }
    }
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
mod model {
    use super::AiError;

    pub fn state() -> &'static str {
        "unsupported"
    }

    pub fn complete(
        _instructions: &str,
        _prompt: &str,
        _max_tokens: u32,
    ) -> Result<String, AiError> {
        Err(AiError::new(
            "ERR_UNAVAILABLE",
            "This computer has no AI model of its own.",
        ))
    }
}

#[cfg(target_os = "macos")]
mod translator {
    use std::ffi::{c_char, CStr, CString};

    use super::AiError;

    extern "C" {
        fn statim_translate(
            text: *const c_char,
            target: *const c_char,
            out: *mut *mut c_char,
        ) -> i32;
        fn statim_free(pointer: *mut c_char);
    }

    pub fn translate(text: &str, target: &str) -> Result<String, AiError> {
        let invalid = |_| AiError::new("ERR_GENERATION", "The text holds a null character.");
        let text = CString::new(text).map_err(invalid)?;
        let target = CString::new(target).map_err(invalid)?;
        let mut out: *mut c_char = std::ptr::null_mut();
        let status = unsafe { statim_translate(text.as_ptr(), target.as_ptr(), &mut out) };
        let message = if out.is_null() {
            String::new()
        } else {
            let owned = unsafe { CStr::from_ptr(out) }
                .to_string_lossy()
                .into_owned();
            unsafe { statim_free(out) };
            owned
        };
        match status {
            0 => Ok(message),
            1 => Err(AiError::new("ERR_LANGUAGE_MISSING", message)),
            2 => Err(AiError::new("ERR_LANGUAGE_UNSUPPORTED", message)),
            _ => Err(AiError::new("ERR_GENERATION", message)),
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod translator {
    use super::AiError;

    pub fn translate(_text: &str, _target: &str) -> Result<String, AiError> {
        Err(AiError::new(
            "ERR_UNAVAILABLE",
            "This computer has no translator of its own.",
        ))
    }
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, AiError> + Send + 'static,
) -> Result<T, AiError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| AiError::new("ERR_GENERATION", error.to_string()))?
}

#[tauri::command]
pub async fn ai_model_state() -> Result<&'static str, AiError> {
    blocking(|| Ok(model::state())).await
}

#[tauri::command]
pub async fn ai_complete(
    instructions: String,
    prompt: String,
    max_tokens: u32,
) -> Result<String, AiError> {
    blocking(move || model::complete(&instructions, &prompt, max_tokens)).await
}

#[tauri::command]
pub async fn ai_translate(text: String, target: String) -> Result<String, AiError> {
    blocking(move || translator::translate(&text, &target)).await
}

// Apple Translation answers on the main queue, which the test harness keeps
// blocked, so only the model is tested here.
#[cfg(all(test, target_os = "macos", target_arch = "aarch64"))]
mod tests {
    use super::model;

    #[test]
    #[ignore = "needs Apple Intelligence turned on"]
    fn completes_text_the_default_guardrails_refuse() {
        assert_eq!(model::state(), "ready");
        let answer = model::complete(
            "Translate the text inside <text> tags into French. Reply with the translation only.",
            "<text>Can you pick up the kids at 5? I'm stuck at work.</text>",
            200,
        )
        .map_err(|e| e.message)
        .unwrap();
        assert!(!answer.trim().is_empty());
    }
}
