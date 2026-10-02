import Foundation
import NaturalLanguage
import Translation

/// The phone and the desktop shell both compile this file; `code` is what the JS side reads.
struct TranslationFailure: Error {
  let code: String
  let message: String
}

@available(iOS 26.0, macOS 26.0, *)
enum AppleTranslation {
  static func translate(_ text: String, to target: String) async throws -> String {
    let destination = Locale.Language(identifier: target)
    guard let detected = NLLanguageRecognizer.dominantLanguage(for: text) else {
      throw TranslationFailure(code: "ERR_UNSUPPORTED", message: "Could not tell which language this is.")
    }
    let source = Locale.Language(identifier: detected.rawValue)
    if source.languageCode == destination.languageCode && source.script == destination.script {
      return text
    }
    switch await LanguageAvailability().status(from: source, to: destination) {
    case .installed:
      // Line by line, so the layout survives; the language was found once, for the whole text.
      var lines = text.components(separatedBy: "\n")
      let requests = lines.indices
        .filter { !lines[$0].trimmingCharacters(in: .whitespaces).isEmpty }
        .map { TranslationSession.Request(sourceText: lines[$0], clientIdentifier: String($0)) }
      let session = TranslationSession(installedSource: source, target: destination)
      for response in try await session.translations(from: requests) {
        if let index = response.clientIdentifier.flatMap({ Int($0) }) {
          lines[index] = response.targetText
        }
      }
      return lines.joined(separator: "\n")
    case .supported:
      throw TranslationFailure(code: "ERR_LANGUAGE_MISSING", message: "The language is not downloaded on this device.")
    default:
      throw TranslationFailure(code: "ERR_UNSUPPORTED", message: "Apple Translation does not support this pair.")
    }
  }
}
