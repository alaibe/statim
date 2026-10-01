# Export compliance

Apple asks on every build: *does your app use encryption?* For most apps the
answer is a quick no. For this one it is yes, and a wrong answer here is a legal
problem rather than a review note.

Nothing below is legal advice. The point is to put the facts in front of
whoever gives it.

## What the app actually contains

| Encryption | Where | Exempt? |
| --- | --- | --- |
| MLS group messaging (XMTP) | `@xmtp/react-native-sdk` | **No**, confidentiality of user content |
| NIP-44 / NIP-17 sealed DMs (Nostr) | `src/protocols/nostr` | **No**, same |
| Status chat protocol: ECIES, AES-GCM, X3DH and Double Ratchet | `src/protocols/status` | **No**, same |
| Olm / Megolm (Matrix) | `@unomed/react-native-matrix-sdk`, `matrix-sdk` | **No**, same |
| SQLCipher local databases | `expo-sqlite`, the XMTP, TDLib and Matrix SDKs | **No**, confidentiality of stored user content |
| AES-256-GCM desktop vault | `src-tauri/src/vault.rs` | **No**, same |
| secp256k1, ed25519 signing | `@noble/curves`, `@scure/*` | Yes, authentication and signing are exempt |
| Keychain and Face ID | iOS platform | Yes, provided by the platform |

The first six put this outside the "only exempt encryption" answer. End-to-end
encrypted messaging is the app's purpose, not an incidental feature.

## What is set

Nothing, for now. `app.json` leaves `ITSAppUsesNonExemptEncryption` out of the
`Info.plist`. App Store Connect rejects an upload that sets it to `true` without
`ITSEncryptionExportComplianceCode`, and it issues that code only after the
questions are answered on an uploaded build. Without the key, each build shows
"Missing Compliance" until someone answers.

The answers for this app are yes, it uses encryption; no, it does not qualify
for an exemption; it uses standard algorithms beyond the ones in the operating
system; and it is available in France. Answering "no" to the first question
would declare that the app uses only exempt encryption. It does not.

Once Apple approves the documentation and issues a code, add both keys to
`expo.ios.infoPlist` in `app.json`:

```json
"ITSAppUsesNonExemptEncryption": true,
"ITSEncryptionExportComplianceCode": "<the code>"
```

Builds that carry both pass compliance without the questions.

## The documentation

App Store Connect asks for one of:

- a **CCATS** classification from the US Bureau of Industry and Security, or
- a **self-classification report** under License Exception ENC (5D002),
  submitted annually to BIS and the NSA, which yields an ERN to enter.

Mass-market encryption software of this kind is normally eligible for
self-classification, the lighter path. Eligibility depends on who publishes and
from where, which is why a person has to answer this and a config file cannot.

The report is a form, not a review. It lists the product, the encryption it uses
(the table above is that content) and the publisher, and it is filed once a
year.

**France** separately requires a declaration for apps distributed there that use
cryptography. App Store Connect asks about this on its own, and the answer for
this app is yes.

## Google Play

Play has no equivalent question at upload, but US export law applies regardless
of the store. The same self-classification covers both distributions.
