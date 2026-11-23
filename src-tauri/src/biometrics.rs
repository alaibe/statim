use serde::Serialize;

#[derive(Serialize)]
pub struct Capability {
    available: bool,
    enrolled: bool,
}

/// Errors use expo-local-authentication's names, so the page reads phone and desktop alike.
#[derive(Serialize)]
pub struct Outcome {
    success: bool,
    error: Option<&'static str>,
}

#[cfg(target_os = "macos")]
mod platform {
    use std::sync::mpsc;

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSError, NSString};
    use objc2_local_authentication::{LAContext, LAError, LAPolicy};

    use super::{Capability, Outcome};

    fn error_name(code: isize) -> &'static str {
        match LAError(code) {
            LAError::AuthenticationFailed => "authentication_failed",
            LAError::UserCancel => "user_cancel",
            LAError::UserFallback => "user_fallback",
            LAError::SystemCancel => "system_cancel",
            LAError::PasscodeNotSet => "passcode_not_set",
            LAError::BiometryNotAvailable | LAError::BiometryNotPaired | LAError::BiometryDisconnected => {
                "not_available"
            }
            LAError::BiometryNotEnrolled => "not_enrolled",
            LAError::BiometryLockout => "lockout",
            LAError::AppCancel => "app_cancel",
            LAError::InvalidContext => "invalid_context",
            _ => "unknown",
        }
    }

    pub fn capability() -> Capability {
        let context = unsafe { LAContext::new() };
        let checked = unsafe { context.canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthenticationWithBiometrics) };
        match checked.map_err(|error| LAError(error.code())) {
            Ok(()) | Err(LAError::BiometryLockout) => Capability {
                available: true,
                enrolled: true,
            },
            Err(LAError::BiometryNotEnrolled) => Capability {
                available: true,
                enrolled: false,
            },
            Err(_) => Capability {
                available: false,
                enrolled: false,
            },
        }
    }

    /// With an app PIN only Touch ID is accepted, so the Mac's password cannot open the app.
    pub fn authenticate(reason: String, pin_fallback: bool) -> Result<Outcome, String> {
        let context = unsafe { LAContext::new() };
        let policy = if pin_fallback {
            unsafe { context.setLocalizedFallbackTitle(Some(&NSString::from_str("Use PIN"))) };
            LAPolicy::DeviceOwnerAuthenticationWithBiometrics
        } else {
            LAPolicy::DeviceOwnerAuthentication
        };

        let (tx, rx) = mpsc::channel();
        let reply = RcBlock::new(move |passed: Bool, error: *mut NSError| {
            let code = unsafe { error.as_ref() }.map(|error| error.code());
            let _ = tx.send((passed.as_bool(), code));
        });
        unsafe { context.evaluatePolicy_localizedReason_reply(policy, &NSString::from_str(&reason), &reply) };

        let (success, code) = rx.recv().map_err(|e| e.to_string())?;
        Ok(Outcome {
            success,
            error: if success {
                None
            } else {
                Some(code.map_or("unknown", error_name))
            },
        })
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::{Capability, Outcome};

    pub fn capability() -> Capability {
        Capability {
            available: false,
            enrolled: false,
        }
    }

    pub fn authenticate(_reason: String, _pin_fallback: bool) -> Result<Outcome, String> {
        Ok(Outcome {
            success: false,
            error: Some("not_available"),
        })
    }
}

#[tauri::command]
pub fn biometric_capability() -> Capability {
    platform::capability()
}

#[tauri::command]
pub async fn biometric_authenticate(reason: String, pin_fallback: bool) -> Result<Outcome, String> {
    tauri::async_runtime::spawn_blocking(move || platform::authenticate(reason, pin_fallback))
        .await
        .map_err(|e| e.to_string())?
}
