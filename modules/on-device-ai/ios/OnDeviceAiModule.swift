import ExpoModulesCore
import FoundationModels
import NaturalLanguage
import Translation

private func failure(_ code: String, _ description: String) -> Exception {
  Exception(name: "OnDeviceAiError", description: description, code: code)
}

private let needsNewerSystem = failure("ERR_UNAVAILABLE", "This needs iOS 26 or later.")

public class OnDeviceAiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OnDeviceAi")

    AsyncFunction("modelState") { () -> String in
      guard #available(iOS 26.0, *) else { return "unsupported" }
      switch SystemLanguageModel.default.availability {
      case .available: return "ready"
      case .unavailable(.appleIntelligenceNotEnabled): return "off"
      case .unavailable(.modelNotReady): return "downloading"
      case .unavailable: return "unsupported"
      }
    }

    AsyncFunction("complete") {
      (instructions: String, prompt: String, maxTokens: Int) async throws -> String in
      guard #available(iOS 26.0, *) else { throw needsNewerSystem }
      return try await Model.complete(instructions: instructions, prompt: prompt, maxTokens: maxTokens)
    }

    AsyncFunction("translate") { (text: String, target: String) async throws -> String in
      guard #available(iOS 26.0, *) else { throw needsNewerSystem }
      return try await Translator.translate(text, to: target)
    }
  }
}

@available(iOS 26.0, *)
enum Model {
  static func complete(instructions: String, prompt: String, maxTokens: Int) async throws -> String {
    // The default guardrails refuse ordinary messages, "pick up the kids at 5" among them.
    let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)
    guard model.isAvailable else {
      throw failure("ERR_UNAVAILABLE", "Apple Intelligence is not ready on this device.")
    }
    let session = LanguageModelSession(model: model, instructions: instructions)
    do {
      let options = GenerationOptions(maximumResponseTokens: maxTokens)
      return try await session.respond(to: prompt, options: options).content
    } catch let error as LanguageModelSession.GenerationError {
      switch error {
      case .guardrailViolation, .refusal:
        throw failure("ERR_REFUSED", "Apple Intelligence declined this text.")
      case .exceededContextWindowSize:
        throw failure("ERR_TOO_LONG", "That is more text than Apple Intelligence takes at once.")
      case .unsupportedLanguageOrLocale:
        throw failure("ERR_REFUSED", "Apple Intelligence does not speak this language yet.")
      default:
        throw failure("ERR_GENERATION", "Apple Intelligence could not answer. \(describe(error))")
      }
    } catch {
      throw failure("ERR_GENERATION", "Apple Intelligence could not answer. \(describe(error))")
    }
  }

  /// The framework sometimes throws a bare NSError whose cause sits in its underlying errors.
  private static func describe(_ error: Error) -> String {
    let ns = error as NSError
    let cause = (ns.userInfo[NSMultipleUnderlyingErrorsKey] as? [NSError])?.first
      ?? ns.userInfo[NSUnderlyingErrorKey] as? NSError
    let root = cause ?? ns
    return "(\(root.domain.split(separator: ".").last ?? "") \(root.code))"
  }
}

@available(iOS 26.0, *)
enum Translator {
  static func translate(_ text: String, to target: String) async throws -> String {
    let destination = Locale.Language(identifier: target)
    guard let detected = NLLanguageRecognizer.dominantLanguage(for: text) else {
      throw failure("ERR_LANGUAGE_UNSUPPORTED", "Could not tell which language this is.")
    }
    let source = Locale.Language(identifier: detected.rawValue)
    if source.languageCode == destination.languageCode && source.script == destination.script {
      return text
    }
    switch await LanguageAvailability().status(from: source, to: destination) {
    case .installed:
      let session = TranslationSession(installedSource: source, target: destination)
      var lines: [String] = []
      for line in text.components(separatedBy: "\n") {
        let blank = line.trimmingCharacters(in: .whitespaces).isEmpty
        lines.append(blank ? line : try await session.translate(line).targetText)
      }
      return lines.joined(separator: "\n")
    case .supported:
      throw failure("ERR_LANGUAGE_MISSING", "The language is not downloaded on this device.")
    case .unsupported:
      throw failure("ERR_LANGUAGE_UNSUPPORTED", "Apple Translation does not support this pair.")
    @unknown default:
      throw failure("ERR_LANGUAGE_UNSUPPORTED", "Apple Translation does not support this pair.")
    }
  }
}
